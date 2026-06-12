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
const roleTurnPrompts = [];

globalThis.fetch = async (_url, init) => {
  const body = JSON.parse(String(init.body));
  fetchedModules.push(body.moduleName);
  if (body.moduleName === "role_turn") roleTurnPrompts.push(body.prompt);
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
const roomAwareState = {
  ...seedState,
  shortTermMemory: [
    {
      id: "room-qoo-message",
      timestamp: new Date(Date.now() - 60 * 1000).toISOString(),
      speakerId: "user:qoo",
      speakerName: "Qoo",
      content: "我刚才也在这个房间里问过孙小雅。",
      eventId: "event_qoo_room_context",
    },
  ],
};
const multiTurnResult = await runConversationPipeline({
  content: "周末一起去爬山吗？",
  state: roomAwareState,
  llmConfig: { provider: "external", endpoint: "http://fake.local/deepseek", model: "deepseek-v4-flash" },
  speaker: { id: "user_b", name: "当前对话者" },
  channel: "wechat",
  onProgress: (progress) => multiTurnProgress.push(progress),
});

const preSpeechFrames = multiTurnProgress.map((progress) => progress.mindFlow).filter((frame) => frame?.phase === "pre_speech");
if (preSpeechFrames.length < 4) {
  throw new Error(`Expected at least 4 pre-speech mind-flow frames, got ${preSpeechFrames.length}.`);
}
if (!preSpeechFrames.some((frame) => frame.kind === "scene") || !preSpeechFrames.some((frame) => frame.kind === "action")) {
  throw new Error("Expected pre-speech mind-flow to include scene and action/impulse frames.");
}
if (!roleTurnPrompts[0]?.includes("房间里的Qoo说过")) {
  throw new Error("Expected role_turn prompt to include recent room messages from other users.");
}
if (!roleTurnPrompts[0]?.includes("渠道：微信") || !roleTurnPrompts[0]?.includes("手机微信消息")) {
  throw new Error("Expected role_turn prompt to include device-mediated channel context.");
}
if (!multiTurnResult.nextState.shortTermMemory.some((memory) => memory.content.includes("【微信】周末一起去爬山吗？"))) {
  throw new Error("Expected State Update short-term memory to record message channel.");
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
const foldedPreSpeech = chatMessages.find((message) => message.messageType === "mind_flow" && message.mindFlow?.phase === "pre_speech" && message.collapsed);
if (!foldedPreSpeech || !Array.isArray(foldedPreSpeech.details) || foldedPreSpeech.details.length < 2) {
  throw new Error("Expected pre-speech mind-flow to fold into an expandable summary after the first spoken reply.");
}
if (chatMessages.some((message) => message.messageType === "mind_flow" && message.mindFlow?.phase === "pre_speech" && message.transient)) {
  throw new Error("Expected transient pre-speech mind-flow messages to be replaced by the folded summary.");
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
chatMessages = foldTransientMindFlowMessages(chatMessages, "post_speech");
const foldedPostSpeech = chatMessages.find((message) => message.messageType === "mind_flow" && message.mindFlow?.phase === "post_speech" && message.collapsed);
if (!foldedPostSpeech || !Array.isArray(foldedPostSpeech.details) || foldedPostSpeech.details.length < 2) {
  throw new Error("Expected post-speech mind-flow to fold into an expandable summary.");
}

const followUpSegments = multiTurnResult.trace.llmOutput.segments.slice(1);
if (followUpSegments.length < 1) {
  throw new Error("Expected multi-turn fixture to provide follow-up speech segments.");
}
if (fetchedModules.includes("runtime_signal_evaluation")) {
  throw new Error("Expected runtime signal evaluation to use a local snapshot instead of an external LLM call.");
}
if (!fetchedModules.includes("role_turn")) {
  throw new Error("Expected unified role_turn LLM call to drive the pre-speech path.");
}
if (fetchedModules.some((moduleName) => ["appraisal", "memory_retrieval", "response_decision", "reply_generation"].includes(moduleName))) {
  throw new Error(`Expected split cognitive/reply modules to stay out of the main pipeline, got ${fetchedModules.join(", ")}`);
}
if (fetchedModules.includes("role_turn_probe")) {
  throw new Error("Expected role_turn_probe to stay disabled by default.");
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

const faceToFaceHomePromptIndex = roleTurnPrompts.length;
await runConversationPipeline({
  content: "我在你旁边。",
  state: {
    ...seedState,
    scene: {
      ...seedState.scene,
      title: "家里卧室",
      description: "她已经回到家，屋里安静，女儿在另一个房间写作业。",
    },
    location: {
      ...seedState.location,
      label: "家里",
      address: "郑州市家中住处",
      region: "郑州市",
    },
  },
  llmConfig: { provider: "external", endpoint: "http://fake.local/deepseek", model: "deepseek-v4-flash" },
  speaker: { id: "user_b", name: "当前对话者" },
  channel: "face_to_face",
  onProgress: () => undefined,
});
const faceToFaceHomePrompt = roleTurnPrompts[faceToFaceHomePromptIndex] || "";
if (!faceToFaceHomePrompt.includes("渠道：面对面") || !faceToFaceHomePrompt.includes("当前场景偏私密") || !faceToFaceHomePrompt.includes("惊讶、警觉、质问来源")) {
  throw new Error("Expected face-to-face home prompt to make impossible co-presence feel strange or unsafe.");
}

const probeProgress = [];
const probeResult = await runConversationPipeline({
  content: "你是不是又把我当成标签了？",
  state: seedState,
  llmConfig: { provider: "external", endpoint: "http://fake.local/deepseek", model: "deepseek-v4-flash" },
  speaker: { id: "user_b", name: "当前对话者" },
  debug: { roleTurnProbeEnabled: true },
  onProgress: (progress) => probeProgress.push(progress),
});
if (!fetchedModules.includes("role_turn_probe")) {
  throw new Error("Expected enabled role_turn_probe to call the external audit probe.");
}
if (!probeResult.trace.roleTurnProbe) {
  throw new Error("Expected PipelineTrace to keep the roleTurnProbe audit result when enabled.");
}
if (!probeResult.trace.roleTurnProbe.output.labelLockRisk.includes("标签")) {
  throw new Error("Expected roleTurnProbe output to expose label lock risk.");
}
const stateDeltaIndex = probeProgress.findIndex((progress) => progress.step === "stateDelta" && progress.status === "completed");
const probeIndex = probeProgress.findIndex((progress) => progress.step === "roleTurnProbe" && progress.status === "running");
if (stateDeltaIndex < 0 || probeIndex < 0 || probeIndex < stateDeltaIndex) {
  throw new Error("Expected roleTurnProbe to run only after stateDelta completes.");
}

console.log("mind-flow streaming verified");

function createFixtureFinal(moduleName) {
  switch (moduleName) {
    case "role_turn":
      return decisionRhythm === "multi_turn"
        ? [
            "心理状态：她先把这句话放到关系和旧约定里过了一遍，表面还稳，心里有一点被牵动。",
            "记忆浮现：最近几句对话会浮上来，同时旧约定的长期记忆也会轻轻带起，但不需要把所有候选都搬出来。",
            "开口倾向：她会先说一句，再补一点解释。",
            "说出口：等一下。\n我不是不想回答你。\n只是这句话让我慢了一下。",
          ].join("\n")
        : [
            "心理状态：她能把这句普通问候接住，反应慢一点，但没有明显失控。",
            "记忆浮现：没有特别强的记忆浮上来。",
            "开口倾向：她能把回应收成一句。",
            "说出口：还好，就是有点慢。",
          ].join("\n");
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
    case "role_turn_probe":
      return [
        "决策路径：她先检查这句话是否在把自己简化成标签，再把不舒服收成一句能维持边界的回答。",
        "关键心理证据：主脑输出里真正生效的是关系距离、被简化的不适和仍能收住的控制感；长期候选没有明显推动台词。",
        "标签锁定风险：有轻微标签锁定风险，标签如果反复以高警觉、高边界感出现，会把她拉向固定防御。",
        "上下文噪声：关系摘要和长期候选可能重复，旧模块术语不应进入主脑心理材料。",
        "建议裁剪：保留可被角色体验到的记忆余波，裁掉重复候选和显式模块术语。",
      ].join("\n");
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
