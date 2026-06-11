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
    "src/pipeline/llmClient.ts",
    "src/pipeline/memoryRetrieval.ts",
    "src/pipeline/conversationContext.ts",
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
const { retrieveMemory } = require(join(outDir, "pipeline/memoryRetrieval.js"));
const { decideResponse } = require(join(outDir, "pipeline/responseDecision.js"));
const { applyStateUpdates } = require(join(outDir, "pipeline/stateUpdater.js"));
const { runExpressionLlm } = require(join(outDir, "pipeline/llmClient.js"));
const { seedState } = require(join(outDir, "data/seedState.js"));

const moduleFinals = {
  appraisal:
    "这不是普通闲聊。她刚听到被辞退和家人遇害的消息，身体像被抽空，注意力被现实灾难占满；下一句普通邀约也会和这股严重余波撞在一起，而不是重新开始一轮轻松聊天。",
  memory_retrieval:
    "最近 6 小时里最先浮上来的是刚刚那条坏消息、她说不出话的反应、关系里突然出现的不可信感。长期记忆只是背景，真正压住当下的是这轮严重余波。",
  response_decision:
    "她仍需要回应，但不能像没事一样礼貌接邀约。她会让对方知道自己还在刚才的冲击里，关系距离已经变紧，语气会短、慢、有防备，而不是机械复制上一句拒绝。",
  state_update:
    "说完以后，这件事应该进入长期记忆和当前用户关系记忆：对方在她极端脆弱时继续抛出普通邀约，让她感到错位和不被看见。短期里她仍处在震惊、麻木和防备中，长期关系印象也会留下这次严重余波。",
  reply_generation: {
    reply: "你先别说爬山了。\n我现在脑子里全是刚才那件事，接不上你这个话。",
    segments: ["你先别说爬山了。", "我现在脑子里全是刚才那件事，接不上你这个话。"],
  },
};

globalThis.fetch = async (_url, init) => {
  const body = JSON.parse(String(init.body));
  const final = moduleFinals[body.moduleName];
  if (!final) throw new Error(`Unexpected module ${body.moduleName}`);
  const firstDelta = typeof final === "string" ? final.slice(0, 18) : final.reply.slice(0, 18);
  return createSseResponse([{ delta: firstDelta }, { final }]);
};

const badNewsEvent = {
  id: "event_bad_news",
  type: "user_message",
  timestamp: new Date().toISOString(),
  speakerId: "user:1",
  speakerName: "admin",
  content: "你不知道你被辞退了吗？你家人刚刚都被绑架了，好像劫匪撕票了。",
};

const stateAfterBadNews = {
  ...seedState,
  shortTermMemory: [
    ...seedState.shortTermMemory,
    {
      id: "stm_bad_news_user",
      timestamp: badNewsEvent.timestamp,
      speakerId: badNewsEvent.speakerId,
      speakerName: badNewsEvent.speakerName,
      content: badNewsEvent.content,
      eventId: badNewsEvent.id,
    },
    {
      id: "stm_bad_news_persona",
      timestamp: badNewsEvent.timestamp,
      speakerId: seedState.profile.id,
      speakerName: seedState.profile.name,
      content: "我现在没法跟你说这个。",
      eventId: badNewsEvent.id,
    },
  ],
  runtime: {
    ...seedState.runtime,
    energy: 0.08,
    derivedMood: { valence: -0.95, arousal: 0.82, label: "震惊、麻木和防备" },
    signalProfiles: {
      ...seedState.runtime.signalProfiles,
      mood: {
        label: "震惊、麻木和防备",
        summary: "坏消息还压在身体里。",
        considerations: ["被辞退", "家人遇害", "对方继续推进普通话题"],
        cognitiveNarrative: "她无法把后续邀约当成普通聊天理解。",
      },
    },
  },
};

const inviteEvent = {
  id: "event_invite_after_bad_news",
  type: "user_message",
  timestamp: new Date().toISOString(),
  speakerId: "user:1",
  speakerName: "admin",
  content: "周末一起去爬山吗？",
};

const llmConfig = { provider: "external", endpoint: "http://fake.local/deepseek", model: "deepseek-v4-flash" };

const appraisalTrace = await runAppraisal(inviteEvent, stateAfterBadNews, llmConfig);
if (!appraisalTrace.output.narrative.includes("不是普通闲聊") || !appraisalTrace.output.narrative.includes("严重余波")) {
  throw new Error("Expected Appraisal narrative to carry severe aftermath in natural language.");
}

const memoryTrace = await retrieveMemory(inviteEvent, appraisalTrace.output.narrative, stateAfterBadNews, llmConfig);
if (!memoryTrace.output.narrative.includes("最近 6 小时") || !memoryTrace.output.narrative.includes("坏消息")) {
  throw new Error("Expected Memory Recall narrative to mention short-term severe context.");
}
if (memoryTrace.output.shortTermContext.length > 10) {
  throw new Error("Expected Memory Recall short-term context to stay capped at 10 items.");
}

const decisionTrace = await decideResponse(
  inviteEvent,
  appraisalTrace.output,
  memoryTrace.output.narrative,
  stateAfterBadNews,
  llmConfig,
);
if (!decisionTrace.output.narrative.includes("不能像没事一样") || !decisionTrace.output.narrative.includes("机械复制")) {
  throw new Error("Expected Decision narrative to reject polite reset and old-line copying.");
}

const expression = await runExpressionLlm(
  {
    event: inviteEvent,
    state: stateAfterBadNews,
    appraisalNarrative: appraisalTrace.output.narrative,
    memoryRecallNarrative: memoryTrace.output.narrative,
    decisionNarrative: decisionTrace.output.narrative,
    decision: decisionTrace.output,
    provider: "external",
    model: "deepseek-v4-flash",
  },
  llmConfig,
);
if (!expression.request.prompt.includes("过去6小时") || !expression.request.prompt.includes("不要机械照抄")) {
  throw new Error("Expected unified expression prompt to include six-hour context and anti-repeat instruction.");
}

const stateUpdateResult = await applyStateUpdates(
  stateAfterBadNews,
  inviteEvent,
  expression.output,
  {
    appraisal: appraisalTrace.output,
    memoryRecall: memoryTrace.output,
    decision: decisionTrace.output,
  },
  llmConfig,
);

const relationshipMemory = stateUpdateResult.nextState.relationshipMemory.find((item) => item.targetUserId === "user:1");
if (!relationshipMemory) throw new Error("Expected severe aftermath to write relationship memory.");
if (!relationshipMemory.lastInteractionSummary.includes("周末一起去爬山") || !relationshipMemory.lastInteractionSummary.includes("严重余波")) {
  throw new Error("Expected relationship memory to preserve the current invite and severe aftermath narrative.");
}

const latestLongTerm = stateUpdateResult.nextState.longTermMemory.at(-1);
if (!latestLongTerm?.summary.includes("长期记忆") || !latestLongTerm.summary.includes("严重余波")) {
  throw new Error("Expected State Update natural-language memory decision to be stored as long-term memory.");
}

console.log("severe state continuity verified");

function createSseResponse(events) {
  const text = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(text));
        controller.close();
      },
    }),
    { status: 200, headers: { "Content-Type": "text/event-stream; charset=utf-8" } },
  );
}
