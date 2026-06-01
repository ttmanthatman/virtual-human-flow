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
): Promise<ReplyOutput> {
  if (config.provider === "external" && config.endpoint.trim()) {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        moduleName: "reply_generation",
        inputMode: "natural_language",
        outputMode: "natural_language",
        prompt: request.prompt,
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM endpoint failed: ${response.status}`);
    }

    const data = await response.json();
    return typeof data === "string" ? { reply: data } : (data as ReplyOutput);
  }

  return simulateLlmOutput(simulateInput);
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
