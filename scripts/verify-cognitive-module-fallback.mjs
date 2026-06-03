import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const outDir = join(tmpdir(), "vhf-cognitive-module-fallback");
rmSync(outDir, { recursive: true, force: true });

execFileSync(
  "node_modules/.bin/tsc",
  [
    "src/pipeline/cognitiveModuleClient.ts",
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
const { runCognitiveModule } = require(join(outDir, "pipeline/cognitiveModuleClient.js"));
const fallbackOutput = {
  source: "sync_response",
  retrievalMode: "hybrid_relevance",
  naturalLanguageQuery: "fallback",
  shortTermContext: [],
  longTermMemories: [],
};

const brokenJson =
  '{"source":"sync_response","retrievalMode":"hybrid_relevance","naturalLanguageQuery":"王佳宁第二次消息","shortTermContext":[],"longTermMemories":[{"memoryId":"m1","summary":"这是一段没有结束的字符串';
const sse = `data: ${JSON.stringify({ delta: brokenJson })}\n\n`;
const streamed = [];

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

const trace = await runCognitiveModule(
  {
    moduleName: "memory_retrieval",
    inputMode: "structured_context",
    outputMode: "structured_json",
    prompt: "fixture",
  },
  { provider: "external", endpoint: "http://fake.local/deepseek", model: "deepseek-v4-flash" },
  fallbackOutput,
  { onStream: (output) => streamed.push(output) },
);

if (trace.output !== fallbackOutput) {
  throw new Error("Expected malformed structured output to use fallback output.");
}

if (!trace.fallbackReason?.includes("外部结构化输出无法解析")) {
  throw new Error(`Expected fallbackReason, got ${trace.fallbackReason || "empty"}.`);
}

if (!streamed.at(-1)?.includes("fallbackReason")) {
  throw new Error("Expected fallback reason to be emitted through onStream.");
}

console.log("cognitive module fallback ok");
