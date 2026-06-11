import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const outDir = join(tmpdir(), "vhf-mind-flow-streaming");
rmSync(outDir, { recursive: true, force: true });

execFileSync(
  "node_modules/.bin/tsc",
  [
    "src/pipeline/conversationPipeline.ts",
    "src/pipeline/temporalScene.ts",
    "src/pipeline/appraisal.ts",
    "src/pipeline/memoryRetrieval.ts",
    "src/pipeline/responseDecision.ts",
    "src/pipeline/promptBuilder.ts",
    "src/pipeline/llmClient.ts",
    "src/pipeline/stateUpdater.ts",
    "src/pipeline/runtimeSignalEvaluator.ts",
    "src/pipeline/cognitiveModuleClient.ts",
    "src/chat/mindFlowMessages.ts",
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
const { runConversationPipeline } = require(join(outDir, "pipeline/conversationPipeline.js"));
const { seedState } = require(join(outDir, "data/seedState.js"));
const { foldTransientMindFlowMessages, upsertMindFlowChatMessage } = require(join(outDir, "chat/mindFlowMessages.js"));

let decisionRhythm = "multi_turn";
const fetchedModules = [];

globalThis.fetch = async (_url, init) => {
  const body = JSON.parse(String(init.body));
  fetchedModules.push(body.moduleName);
  const final = createFixtureFinal(body.moduleName);
  if (body.outputMode === "natural_language") {
    const naturalText = typeof final === "string" ? final : final.reply ?? JSON.stringify(final);
    return createSseResponse([
      { delta: naturalText.split("\n")[0] || "" },
      { final },
    ]);
  }
  return createSseResponse([{ final }]);
};

const multiTurnProgress = [];
const multiTurnResult = await runConversationPipeline({
  content: "周末一起去爬山吗？",
  state: seedState,
  llmConfig: { provider: "external", endpoint: "http://fake.local/deepseek", model: "deepseek-v4-flash" },
  speaker: { id: "user_b", name: "当前对话者" },
  onProgress: (progress) => multiTurnProgress.push(progress),
});

const preSpeechFrames = multiTurnProgress.map((progress) => progress.mindFlow).filter((frame) => frame?.phase === "pre_speech");
if (preSpeechFrames.length < 4) {
  throw new Error(`Expected at least 4 pre-speech mind-flow frames, got ${preSpeechFrames.length}.`);
}
if (!preSpeechFrames.some((frame) => frame.kind === "scene") || !preSpeechFrames.some((frame) => frame.kind === "action")) {
  throw new Error("Expected pre-speech mind-flow to include scene and action/impulse frames.");
}

const firstSpeechIndex = multiTurnProgress.findIndex((progress) => progress.step === "llmOutput" && progress.status === "completed");
if (firstSpeechIndex < 0) throw new Error("Expected llmOutput completed progress.");
const preSpeechAfterFirstSpeech = multiTurnProgress
  .slice(firstSpeechIndex + 1)
  .some((progress) => progress.mindFlow?.phase === "pre_speech");
if (preSpeechAfterFirstSpeech) {
  throw new Error("Expected pre-speech mind-flow to finish before the spoken reply completes.");
}

let chatMessages = [
  {
    id: "user_message",
    speaker: "user",
    speakerName: "当前对话者",
    content: "周末一起去爬山吗？",
    timestamp: new Date().toISOString(),
  },
];
for (const frame of preSpeechFrames) {
  chatMessages = upsertMindFlowChatMessage(chatMessages, frame);
}
if (!chatMessages.some((message) => message.messageType === "mind_flow" && message.mindFlow?.phase === "pre_speech")) {
  throw new Error("Expected chat helper to render pre-speech mind-flow messages.");
}

chatMessages = [
  ...foldTransientMindFlowMessages(chatMessages, "pre_speech"),
  {
    id: "first_reply",
    speaker: "persona",
    speakerName: "林安",
    content: multiTurnResult.trace.llmOutput.segments[0],
    timestamp: new Date().toISOString(),
  },
];
if (chatMessages.some((message) => message.messageType === "mind_flow" && message.mindFlow?.phase === "pre_speech")) {
  throw new Error("Expected pre-speech mind-flow to fold after the first spoken reply.");
}
if (!chatMessages.some((message) => message.speaker === "persona" && message.content.includes("等一下"))) {
  throw new Error("Expected the folded chat state to keep the final spoken reply visible.");
}

const postSpeechFrames = multiTurnProgress.map((progress) => progress.mindFlow).filter((frame) => frame?.phase === "post_speech");
if (postSpeechFrames.length < 3) {
  throw new Error(`Expected post-speech mind-flow frames, got ${postSpeechFrames.length}.`);
}
if (!postSpeechFrames.some((frame) => frame.kind === "speech")) {
  throw new Error("Expected multi-turn post-speech continuation to advertise a follow-up speech.");
}
for (const frame of postSpeechFrames) {
  chatMessages = upsertMindFlowChatMessage(chatMessages, frame);
}
if (!chatMessages.some((message) => message.messageType === "mind_flow" && message.mindFlow?.phase === "post_speech")) {
  throw new Error("Expected post-speech mind-flow to stream after first speech.");
}

const followUpSegments = multiTurnResult.trace.llmOutput.segments.slice(1);
if (followUpSegments.length < 1) {
  throw new Error("Expected multi-turn fixture to provide follow-up speech segments.");
}
if (fetchedModules.includes("runtime_signal_evaluation")) {
  throw new Error("Expected runtime signal evaluation to use a local snapshot instead of an external LLM call.");
}

decisionRhythm = "single";
const singleProgress = [];
await runConversationPipeline({
  content: "今天还好吗？",
  state: seedState,
  llmConfig: { provider: "external", endpoint: "http://fake.local/deepseek", model: "deepseek-v4-flash" },
  speaker: { id: "user_b", name: "当前对话者" },
  onProgress: (progress) => singleProgress.push(progress),
});
const settleFrames = singleProgress.map((progress) => progress.mindFlow).filter((frame) => frame?.phase === "post_speech" && frame.kind === "settle");
if (settleFrames.length < 1) {
  throw new Error("Expected single-reply post-speech continuation to settle into silence.");
}

console.log("mind-flow streaming verified");

function createFixtureFinal(moduleName) {
  switch (moduleName) {
    case "appraisal":
      return "她先把这句话放到关系和旧约定里过了一遍，表面还稳，心里有一点被牵动。她需要回应，但不能把旧约定当成普通邀约。";
    case "memory_retrieval":
      return "最近几句对话会浮上来，同时旧约定的长期记忆也会轻轻带起，但不需要把所有候选都搬出来。";
    case "response_decision":
      return decisionRhythm === "multi_turn" ? "她会先说一句，再补一点解释。" : "她能把回应收成一句。";
    case "reply_generation":
      return decisionRhythm === "multi_turn"
        ? { reply: "等一下。\n我不是不想回答你。\n只是这句话让我慢了一下。", segments: ["等一下。", "我不是不想回答你。", "只是这句话让我慢了一下。"] }
        : { reply: "还好，就是有点慢。", segments: ["还好，就是有点慢。"] };
    case "state_update":
      return "她说完之后，旧约定的余波还在，但已经能收住。这个互动值得作为关系里的轻微靠近和保留边界被记住。";
    case "runtime_signal_evaluation":
      return {
        energy: 0.52,
        derivedMood: { valence: -0.22, arousal: 0.46, label: "被牵动但收住" },
        signalProfiles: {
          energy: { label: "能量还够", summary: "能维持回应。", considerations: ["短暂停顿"], cognitiveNarrative: "她有余力把话说完。" },
          mood: { label: "被牵动但收住", summary: "旧事浮了一下。", considerations: ["周末邀约"], cognitiveNarrative: "她说完后仍在心里过一遍。" },
          valence: { label: "轻微偏负", summary: "不是全面低落。", considerations: ["旧约定"], cognitiveNarrative: "负面只贴着旧约定。" },
          arousal: { label: "稍微上扬", summary: "心跳快一点。", considerations: ["停顿"], cognitiveNarrative: "注意力先收紧再松开。" },
        },
        rationale: "说完后仍有一点余波。",
      };
    default:
      throw new Error(`Unexpected module ${moduleName}`);
  }
}

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
