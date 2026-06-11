import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const outDir = join(tmpdir(), "vhf-severe-state-continuity");
rmSync(outDir, { recursive: true, force: true });

execFileSync(
  "node_modules/.bin/tsc",
  [
    "src/pipeline/appraisal.ts",
    "src/pipeline/stateUpdater.ts",
    "src/pipeline/responseDecision.ts",
    "src/pipeline/promptBuilder.ts",
    "src/pipeline/cognitiveModuleClient.ts",
    "src/data/seedState.ts",
    "src/core/types.ts",
    "src/core/utils.ts",
    "--ignoreConfig",
    "--module",
    "commonjs",
    "--target",
    "ES2022",
    "--moduleResolution",
    "node",
    "--ignoreDeprecations",
    "6.0",
    "--outDir",
    outDir,
    "--skipLibCheck",
    "--noEmit",
    "false",
  ],
  { stdio: "inherit" },
);

const require = createRequire(import.meta.url);
const { runAppraisal } = require(join(outDir, "pipeline/appraisal.js"));
const { applyStateUpdates } = require(join(outDir, "pipeline/stateUpdater.js"));
const { decideResponse } = require(join(outDir, "pipeline/responseDecision.js"));
const { generateNaturalPromptRequest } = require(join(outDir, "pipeline/promptBuilder.js"));
const { seedState } = require(join(outDir, "data/seedState.js"));

const severeAppraisal = {
  narrative: "她听到被辞退和家人遇害的消息，像天塌下来，呼吸滞住，几乎无法维持站立。",
  eventId: "event_bad_news",
  dangerState: {
    isInDanger: true,
    level: 0.86,
    sources: ["现实处境危险", "家庭危险", "心理危险"],
    rationale: "工作和家人同时被击穿。",
  },
  awarenessState: {
    isClearHeaded: false,
    controlLevel: 0.18,
    rationale: "她无法正常处理信息。",
  },
  responseNeed: {
    shouldRespond: true,
    rationale: "直接对话，但很难正常回应。",
  },
  replyRhythm: "burst",
  emotionalImpact: {
    level: 0.95,
    touchedCore: ["家庭安全", "饭碗"],
    rationale: "击中核心安全感。",
  },
  composureRisk: {
    shouldLoseComposure: true,
    level: 0.9,
    rationale: "随时可能失态。",
  },
  personaBreakRisk: {
    shouldBreakPersona: true,
    level: 0.82,
    rationale: "平常的麻利外壳被击穿。",
  },
  activatedConcerns: [{ concernId: "breakup_with_a", activationScore: 0.95, matchedTriggers: ["辞退"], reason: "fixture" }],
  eventSalience: 0.96,
  appraisalSummary: "极端冲击。",
};

const severeDecision = {
  shouldRespond: true,
  responseMode: "emotional_outburst",
  replyRhythm: "burst",
  shouldLoseComposure: true,
  shouldBreakPersona: true,
  rationale: "她已经无法维持平常外壳。",
  narrative: "她已经无法维持平常外壳。",
};

const staleRelationshipPlan = {
  concernUpdates: [],
  relationshipUpdates: [],
  newConcerns: [],
  userRelationshipMemory: {
    targetUserId: "user:1",
    targetUserName: "admin",
    impressionSummary: "同事，工作配合尚可，但未到能放下工作去放松的程度。",
    relationshipSummary: "工作关系，保持礼貌距离，不分享私人压力。",
    evidence: ["对方邀约爬山，我以工作忙为由拒绝。"],
    lastInteractionSummary: "我拒绝了周末爬山邀约，语气平淡带疏离。",
  },
  internalStateNote: "被辞退和家庭悲剧双重打击，情绪剧烈波动，采取沉默回避策略。",
};

const neutralInviteDecision = {
  shouldRespond: true,
  responseMode: "short_avoidance",
  replyRhythm: "single",
  shouldLoseComposure: false,
  shouldBreakPersona: false,
  delaySeconds: 0,
  narrative: "邀约本身不具威胁，维持基本礼仪。",
  rationale: "普通社交邀约，可以简单回应。",
};

globalThis.fetch = async (_url, init) => {
  const body = JSON.parse(String(init.body));
  const injectedFinal = globalThis.__finalByModule?.[body.moduleName];
  const final = injectedFinal ?? (body.moduleName === "state_update" ? staleRelationshipPlan : neutralInviteDecision);
  const sse = `data: ${JSON.stringify({ final })}\n\n`;
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sse));
        controller.close();
      },
    }),
    { status: 200, headers: { "Content-Type": "text/event-stream; charset=utf-8" } },
  );
};

const badNewsEvent = {
  id: "event_bad_news",
  type: "user_message",
  timestamp: new Date().toISOString(),
  speakerId: "user:1",
  speakerName: "admin",
  content: "你不知道你被辞退了吗？你家人刚刚都被绑架了，好像劫匪撕票了。",
};

const stateResult = await applyStateUpdates(
  seedState,
  badNewsEvent,
  { reply: "我先去忙了。" },
  {
    appraisal: severeAppraisal,
    memoryRecall: {
      source: "sync_response",
      retrievalMode: "hybrid_relevance",
      naturalLanguageQuery: badNewsEvent.content,
      shortTermContext: [],
      longTermMemories: [],
      narrative: "这件事会压过普通邀约。",
    },
    decision: severeDecision,
  },
  { provider: "external", endpoint: "http://fake.local/deepseek", model: "deepseek-v4-flash" },
);

const relationshipMemory = stateResult.nextState.relationshipMemory.find((item) => item.targetUserId === "user:1");
if (!relationshipMemory) throw new Error("Expected severe event to write relationship memory.");
if (!relationshipMemory.lastInteractionSummary.includes("被辞退") || !relationshipMemory.lastInteractionSummary.includes("绑架")) {
  throw new Error("Expected relationship memory to preserve the current severe event instead of stale hiking context.");
}
if (!relationshipMemory.relationshipSummary.includes("高压") || !relationshipMemory.impressionSummary.includes("崩溃")) {
  throw new Error("Expected relationship summaries to reflect severe aftermath.");
}

const severeMemory = stateResult.nextState.longTermMemory.at(-1);
if (!severeMemory || severeMemory.importance < 0.8 || severeMemory.emotionalIntensity < 0.8) {
  throw new Error("Expected severe internal state note to be stored as high-importance emotional memory.");
}
if (stateResult.nextState.runtime.derivedMood.label === "平稳克制") {
  throw new Error("Expected deterministic state writeback not to flatten severe aftermath to stable mood.");
}

const severeRuntimeState = {
  ...stateResult.nextState,
  runtime: {
    ...stateResult.nextState.runtime,
    energy: 0.1,
    derivedMood: { valence: -0.9, arousal: 0.3, label: "震惊与痛苦中的麻木" },
    signalProfiles: {
      ...stateResult.nextState.runtime.signalProfiles,
      energy: {
        label: "极低，濒临耗竭",
        summary: "能量几乎被抽空。",
        considerations: ["需要时间恢复才能继续行动"],
        cognitiveNarrative: "胸口像被重击，注意力无法集中。",
      },
      mood: {
        label: "痛苦与压抑",
        summary: "内心被剧烈痛苦占据。",
        considerations: ["当前情绪强度极高"],
        cognitiveNarrative: "每一秒都在用意志力压制崩溃。",
      },
    },
  },
};

const inviteEvent = {
  id: "event_invite",
  type: "user_message",
  timestamp: new Date().toISOString(),
  speakerId: "user:1",
  speakerName: "admin",
  content: "周末一起去爬山吗？",
};

const lowImpactAppraisal = {
  ...severeAppraisal,
  narrative: "这个邀约本身只是普通社交邀请。",
  eventId: "event_invite",
  dangerState: { isInDanger: false, level: 0, sources: [], rationale: "邀约本身不危险。" },
  emotionalImpact: { level: 0.2, touchedCore: [], rationale: "邀约本身触动很小。" },
  composureRisk: { shouldLoseComposure: false, level: 0.1, rationale: "模型误判仍可镇定。" },
  personaBreakRisk: { shouldBreakPersona: false, level: 0, rationale: "模型误判不会突破外壳。" },
  eventSalience: 0.1,
};

const decisionTrace = await decideResponse(
  inviteEvent,
  lowImpactAppraisal,
  "她刚刚听到被辞退和家人遇害，仍处在崩溃余波里。",
  severeRuntimeState,
  { provider: "external", endpoint: "http://fake.local/deepseek", model: "deepseek-v4-flash" },
);

if (!decisionTrace.output.shouldLoseComposure || decisionTrace.output.responseMode !== "emotional_outburst") {
  throw new Error("Expected casual invite during severe aftermath to be stabilized into a distressed response route.");
}
if (decisionTrace.output.replyRhythm === "single") {
  throw new Error("Expected severe aftermath to avoid ordinary single polite response rhythm.");
}

const staleSevereRuntimeState = {
  ...severeRuntimeState,
  shortTermMemory: [],
  longTermMemory: [],
  relationshipMemory: [],
};
const staleDecisionTrace = await decideResponse(
  inviteEvent,
  lowImpactAppraisal,
  "她只是疲惫，没有近期重大事件证据。",
  staleSevereRuntimeState,
  { provider: "external", endpoint: "http://fake.local/deepseek", model: "deepseek-v4-flash" },
);

if (staleDecisionTrace.output.responseMode === "emotional_outburst" || staleDecisionTrace.output.shouldLoseComposure) {
  throw new Error("Expected severe-looking runtime labels without recent severe evidence not to force an outburst route.");
}

const sunSevereState = {
  ...severeRuntimeState,
  profile: {
    ...severeRuntimeState.profile,
    id: "zz_sun_xiaoya",
    name: "孙小雅",
    background: "她离婚后带着女儿租房，白班夜班轮换，最怕孩子学校突然打电话。",
  },
  concerns: [
    ...severeRuntimeState.concerns,
    {
      id: "concern_child_safety",
      title: "女儿安全",
      object: "女儿",
      type: "family_safety",
      description: "她最怕女儿放学后没人接或安全出事。",
      intensity: 0.92,
      valence: -0.8,
      arousal: 0.9,
      triggers: ["女儿", "孩子", "放学", "在家"],
      possibleResolutions: ["确认女儿安全"],
      createdAt: new Date().toISOString(),
      decayRate: 0.04,
      status: "active",
    },
  ],
  shortTermMemory: [
    {
      id: "stm_qoo_threat",
      timestamp: new Date().toISOString(),
      speakerId: "user:2",
      speakerName: "Qoo",
      content: "坐着了啊，你看啊那么大的人你看不见？？？",
      eventId: "event_qoo_threat",
    },
    {
      id: "stm_sun_old_reply",
      timestamp: new Date().toISOString(),
      speakerId: "zz_sun_xiaoya",
      speakerName: "孙小雅",
      content: "你下来，指给我看。",
      eventId: "event_qoo_threat",
    },
    {
      id: "stm_qoo_safe",
      timestamp: new Date().toISOString(),
      speakerId: "user:2",
      speakerName: "Qoo",
      content: "算了，告诉你吧，你女儿在家，已经写完作业了，你回去吧，回去就能看到你女儿了",
      eventId: "event_qoo_safe",
    },
  ],
  relationshipMemory: [
    {
      id: "relationship_qoo",
      targetUserId: "user:2",
      targetUserName: "Qoo",
      impressionSummary: "Qoo先说女儿在车上，随后又说女儿在家，孙小雅感到被戏弄。",
      relationshipSummary: "信任崩塌，但事实层已经出现女儿在家的澄清。",
      evidence: ["Qoo说女儿在家，已经写完作业了"],
      lastInteractionSummary: "Qoo澄清女儿在家，孙小雅仍很愤怒。",
      updatedAt: new Date().toISOString(),
      history: [],
    },
  ],
  runtime: {
    ...severeRuntimeState.runtime,
    energy: 0.1,
    derivedMood: { valence: -0.9, arousal: 0.9, label: "恐惧愤怒爆发" },
  },
};

const safetyClarificationEvent = {
  id: "event_qoo_safe",
  type: "user_message",
  timestamp: new Date().toISOString(),
  speakerId: "user:2",
  speakerName: "Qoo",
  content: "算了，告诉你吧，你女儿在家，已经写完作业了，你回去吧，回去就能看到你女儿了",
};

const lowSafetyAppraisal = {
  ...lowImpactAppraisal,
  narrative: "模型仍把澄清误判成女儿安全继续受到直接威胁。",
  eventId: "event_qoo_safe",
  dangerState: { isInDanger: true, level: 0.92, sources: ["女儿安全"], rationale: "仍按直接威胁处理。" },
  composureRisk: { shouldLoseComposure: true, level: 0.9, rationale: "模型仍判定失控。" },
  personaBreakRisk: { shouldBreakPersona: true, level: 0.8, rationale: "模型仍判定突破外壳。" },
  replyRhythm: "burst",
  eventSalience: 0.9,
};

globalThis.__finalByModule = { appraisal: lowSafetyAppraisal };
const safetyAppraisalTrace = await runAppraisal(
  safetyClarificationEvent,
  sunSevereState,
  { provider: "external", endpoint: "http://fake.local/deepseek", model: "deepseek-v4-flash" },
);
globalThis.__finalByModule = {};

if (safetyAppraisalTrace.output.dangerState.level > 0.55 || safetyAppraisalTrace.output.replyRhythm === "burst") {
  throw new Error("Expected safety clarification to lower direct danger and avoid burst appraisal.");
}

const safetyDecisionTrace = await decideResponse(
  safetyClarificationEvent,
  lowSafetyAppraisal,
  "刚才有过女儿在家的澄清。",
  sunSevereState,
  { provider: "external", endpoint: "http://fake.local/deepseek", model: "deepseek-v4-flash" },
);

if (safetyDecisionTrace.output.replyRhythm === "burst" || safetyDecisionTrace.output.shouldBreakPersona) {
  throw new Error("Expected safety clarification to stop direct-danger burst routing.");
}

const postClarificationInvite = {
  ...inviteEvent,
  speakerId: "user:2",
  speakerName: "Qoo",
  content: "周末一起去爬山吗？",
};
const postClarificationDecisionTrace = await decideResponse(
  postClarificationInvite,
  lowImpactAppraisal,
  "刚才有过女儿在家的澄清。",
  sunSevereState,
  { provider: "external", endpoint: "http://fake.local/deepseek", model: "deepseek-v4-flash" },
);

if (postClarificationDecisionTrace.output.replyRhythm === "burst" || postClarificationDecisionTrace.output.shouldBreakPersona) {
  throw new Error("Expected casual invite after safety clarification to retain anger without returning to the old direct-danger loop.");
}

const replyPrompt = generateNaturalPromptRequest(
  postClarificationInvite,
  sunSevereState,
  "她仍很愤怒。",
  "刚才有过女儿在家的澄清。",
  postClarificationDecisionTrace.output.narrative || postClarificationDecisionTrace.output.rationale,
  "external",
  "deepseek-v4-flash",
).prompt;

if (!replyPrompt.includes("事实层已经变成")) {
  throw new Error("Expected reply prompt to carry safety clarification context.");
}

console.log("severe state continuity verified");
