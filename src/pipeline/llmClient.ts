import { CharacterState, EventInput, ExpressionLlmRequest, LlmConfig, ReplyOutput, ResponseDecision } from "../core/types";

interface SimulateInput {
  event: EventInput;
  state: CharacterState;
  decision: ResponseDecision;
}

export async function runLlm(
  request: ExpressionLlmRequest,
  config: LlmConfig,
  simulateInput: SimulateInput,
  onStream?: (output: string) => void,
): Promise<ReplyOutput> {
  if (config.provider === "external" && config.endpoint.trim()) {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({
        model: config.model,
        moduleName: "reply_generation",
        inputMode: "natural_language",
        outputMode: "natural_language",
        prompt: request.prompt,
        stream: true,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`LLM endpoint failed: ${response.status} ${detail.slice(0, 240)}`);
    }

    const data = response.headers.get("Content-Type")?.includes("text/event-stream")
      ? await readReplyEventStream(response, onStream)
      : await response.json();
    return typeof data === "string" ? { reply: data } : (data as ReplyOutput);
  }

  const output = simulateLlmOutput(simulateInput);
  onStream?.(output.reply);
  return output;
}

async function readReplyEventStream(response: Response, onStream?: (output: string) => void) {
  if (!response.body) {
    throw new Error("外部接口没有返回可读取的流");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";
  let finalReply = "";

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

      const parsed = JSON.parse(data) as { delta?: string; final?: { reply?: string }; error?: string };
      if (parsed.error) throw new Error(parsed.error);
      if (typeof parsed.delta === "string") {
        accumulated += parsed.delta;
        onStream?.(accumulated);
      }
      if (parsed.final?.reply !== undefined) {
        finalReply = parsed.final.reply;
      }
    }
  }

  return { reply: finalReply || accumulated };
}

function simulateLlmOutput({ decision }: SimulateInput): ReplyOutput {
  if (!decision.shouldRespond || decision.responseMode === "silence") {
    return {
      reply: "",
    };
  }

  const replyByMode: Record<string, string> = {
    short_avoidance: "这周末可能有点事，下次吧。你们玩得开心。",
    topic_shift: "周末我可能不太方便。你最近那个项目怎么样了？",
    warm_reply: "可以啊，听起来不错。你们打算什么时候出发？",
    question_back: "你怎么突然想到这个？",
    delayed_reply: "我想了一下，可能还是下次吧。",
    emotional_outburst: "别再拿这个开玩笑了，我现在真的不太想聊。",
    neutral_reply: "嗯，我听到了。你继续说。",
  };

  return {
    reply: replyByMode[decision.responseMode] ?? replyByMode.neutral_reply,
  };
}
