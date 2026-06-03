import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const outDir = join(tmpdir(), "vhf-user-relationship-memory");
rmSync(outDir, { recursive: true, force: true });

execFileSync(
  "node_modules/.bin/tsc",
  [
    "src/pipeline/stateUpdater.ts",
    "src/data/seedState.ts",
    "src/core/types.ts",
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
const { seedState } = require(join(outDir, "data/seedState.js"));

const plan = {
  concernUpdates: [],
  relationshipUpdates: [
    {
      targetId: "user:42",
      familiarityDelta: 0.04,
      trustDelta: 0.03,
      affectionDelta: 0.02,
      tensionDelta: -0.01,
      note: "她觉得这个用户这次靠近得比较温和。",
    },
  ],
  newConcerns: [],
  userRelationshipMemory: {
    targetUserId: "user:42",
    targetUserName: "Alice",
    impressionSummary: "Alice说话直接但没有逼迫感，会把邀请说得像试探而不是命令。",
    relationshipSummary: "她对Alice愿意继续保持对话，但仍会在涉及私人计划时先观察对方是否尊重边界。",
    evidence: ["Alice问她周末是否愿意出去走走。", "她回复时没有完全拒绝，只保留了观察距离。"],
    lastInteractionSummary: "这轮互动让她觉得Alice可以继续靠近一点，但不能越过她解释情绪的边界。",
  },
  internalStateNote: "她没有把谨慎说得太重，只是在心里把这个用户单独记了一笔。",
};

const sse = `data: ${JSON.stringify({ final: plan })}\n\n`;
globalThis.fetch = async () =>
  new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sse));
        controller.close();
      },
    }),
    { status: 200, headers: { "Content-Type": "text/event-stream; charset=utf-8" } },
  );

const event = {
  id: "event_user_42",
  type: "user_message",
  timestamp: new Date().toISOString(),
  speakerId: "user:42",
  speakerName: "Alice",
  content: "周末要不要一起出去走走？",
};

const result = await applyStateUpdates(
  seedState,
  event,
  { reply: "可以先看看天气，别太早。" },
  {
    appraisal: {
      eventId: event.id,
      activatedConcerns: [],
      eventSalience: 0.4,
      appraisalSummary: "一次温和邀请，会让她在靠近和边界之间判断。",
    },
    memoryRecall: {
      source: "sync_response",
      retrievalMode: "hybrid_relevance",
      naturalLanguageQuery: event.content,
      shortTermContext: [],
      longTermMemories: [],
    },
    decision: {
      shouldRespond: true,
      responseMode: "neutral_reply",
      rationale: "她愿意回应，但会保持一点余地。",
    },
  },
  { provider: "external", endpoint: "http://fake.local/deepseek", model: "deepseek-v4-flash" },
);

const memory = result.nextState.relationshipMemory.find((item) => item.targetUserId === "user:42");
if (!memory) {
  throw new Error("Expected relationshipMemory to be written for user:42.");
}

if (memory.targetUserName !== "Alice") {
  throw new Error(`Expected target user name Alice, got ${memory.targetUserName}.`);
}

if (!memory.impressionSummary.includes("Alice") || !memory.relationshipSummary.includes("边界")) {
  throw new Error("Expected natural-language impression and relationship summaries.");
}

if (Object.values(memory).some((value) => typeof value === "number")) {
  throw new Error("RelationshipMemory must not store numeric relationship values.");
}

const relationship = result.nextState.relationships["user:42"];
if (!relationship?.recentTone.includes("Alice") || !relationship.notes.join(" ").includes("没有逼迫感")) {
  throw new Error("Expected relationship memory text to influence relationship recentTone and notes.");
}

if (!result.stateDelta.memoryWrites.some((item) => item.includes("关系印象记忆"))) {
  throw new Error("Expected state delta to report relationship impression memory write.");
}

console.log("user relationship memory verified");
