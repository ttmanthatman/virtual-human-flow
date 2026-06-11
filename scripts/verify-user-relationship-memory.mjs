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

const stateNarrative =
  "Alice这次把邀请说得比较温和，没有明显逼迫，但她仍然会在私人计划上保留边界。她说完以后没有完全放松，只是把Alice记成一个可以继续对话、但需要观察是否尊重边界的人。这件事值得写入关系记忆，不必写成重大长期创伤。";

const sse = `data: ${JSON.stringify({ final: stateNarrative })}\n\n`;
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
      replyRhythm: "single",
      shouldLoseComposure: false,
      shouldBreakPersona: false,
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
if (!relationship?.recentTone.includes("Alice") || !relationship.notes.join(" ").includes("尊重边界")) {
  throw new Error("Expected relationship memory text to influence relationship recentTone and notes.");
}

if (!result.stateDelta.memoryWrites.some((item) => item.includes("关系印象记忆"))) {
  throw new Error("Expected state delta to report relationship impression memory write.");
}

console.log("user relationship memory verified");
