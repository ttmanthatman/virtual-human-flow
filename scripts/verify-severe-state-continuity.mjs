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
    "src/pipeline/stateUpdater.ts",
    "src/pipeline/responseDecision.ts",
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
const { applyStateUpdates } = require(join(outDir, "pipeline/stateUpdater.js"));
const { decideResponse } = require(join(outDir, "pipeline/responseDecision.js"));
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
  const final = body.moduleName === "state_update" ? staleRelationshipPlan : neutralInviteDecision;
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

console.log("severe state continuity verified");
