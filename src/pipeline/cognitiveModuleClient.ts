import { CognitiveModuleRequest, CognitiveModuleTrace, LlmConfig } from "../core/types";

interface RunCognitiveModuleOptions {
  onStream?: (output: string) => void;
}

export async function runCognitiveModule<TOutput>(
  request: CognitiveModuleRequest,
  config: LlmConfig,
  mockOutput: TOutput,
  options: RunCognitiveModuleOptions = {},
): Promise<CognitiveModuleTrace<TOutput>> {
  if (config.provider === "external" && config.endpoint.trim()) {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...(config.authToken ? { Authorization: `Bearer ${config.authToken}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        moduleName: request.moduleName,
        inputMode: request.inputMode,
        outputMode: request.outputMode,
        prompt: request.prompt,
        outputContract: request.outputContract,
        stream: true,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`${request.moduleName} module failed: ${response.status} ${detail.slice(0, 240)}`);
    }

    let output: TOutput;
    let fallbackReason: string | undefined;
    try {
      output = response.headers.get("Content-Type")?.includes("text/event-stream")
        ? ((await readEventStream(response, options.onStream)) as TOutput)
        : ((await response.json()) as TOutput);
    } catch (caught) {
      if (!shouldUseStructuredFallback(request, caught)) {
        throw caught;
      }
      fallbackReason = formatStructuredFallbackReason(caught);
      output = mockOutput;
      options.onStream?.(JSON.stringify({ fallbackReason, output: mockOutput }, null, 2));
    }

    return {
      moduleName: request.moduleName,
      request,
      output,
      transport: "external_llm",
      fallbackReason,
    };
  }

  options.onStream?.(JSON.stringify(mockOutput, null, 2));
  return {
    moduleName: request.moduleName,
    request,
    output: mockOutput,
    transport: "mock_llm",
  };
}

async function readEventStream(response: Response, onStream?: (output: string) => void) {
  if (!response.body) {
    throw new Error("外部接口没有返回可读取的流");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";
  let finalJson = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      const data = event
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");
      if (!data || data === "[DONE]") continue;

      const parsed = JSON.parse(data) as { delta?: string; final?: unknown; error?: string };
      if (parsed.error) throw new Error(parsed.error);
      if (typeof parsed.delta === "string") {
        accumulated += parsed.delta;
        onStream?.(accumulated);
      }
      if (parsed.final !== undefined) {
        finalJson = JSON.stringify(parsed.final);
      }
    }
  }

  if (finalJson) return JSON.parse(finalJson);
  if (accumulated.trim()) return JSON.parse(accumulated.trim());
  throw new Error("外部接口流结束但没有返回内容");
}

function shouldUseStructuredFallback(request: CognitiveModuleRequest, caught: unknown) {
  if (request.outputMode !== "structured_json") return false;
  if (caught instanceof SyntaxError) return true;
  if (!(caught instanceof Error)) return false;
  return /JSON|Unterminated|string|流结束|结构化/.test(caught.message);
}

function formatStructuredFallbackReason(caught: unknown) {
  const message = caught instanceof Error ? caught.message : String(caught);
  return `外部结构化输出无法解析，已使用本地候选结果继续流程：${message}`;
}
