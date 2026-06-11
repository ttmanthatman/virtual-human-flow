import { CharacterState, EventInput, ExpressionLlmRequest, LlmConfig, ReplyOutput, ResponseDecision } from "../core/types";
import { stripReplyStageDirections } from "./conversationContext";
import { generateNaturalPromptRequest } from "./promptBuilder";

interface SimulateInput {
  event: EventInput;
  state: CharacterState;
  decision: ResponseDecision;
}

export async function runExpressionLlm(
  input: {
    event: EventInput;
    state: CharacterState;
    appraisalNarrative: string;
    memoryRecallNarrative: string;
    decisionNarrative: string;
    decision: ResponseDecision;
  },
  config: LlmConfig,
  onStream?: (output: string) => void,
): Promise<{ request: ExpressionLlmRequest; output: ReplyOutput }> {
  const request = generateNaturalPromptRequest(
    input.event,
    input.state,
    input.appraisalNarrative,
    input.memoryRecallNarrative,
    input.decisionNarrative,
    config.provider,
    config.model,
  );
  const output = await runLlm(request, config, { event: input.event, state: input.state, decision: input.decision }, onStream);
  return { request, output };
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
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...(config.authToken ? { Authorization: `Bearer ${config.authToken}` } : {}),
      },
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
    return normalizeReplyOutput(data, simulateInput.decision);
  }

  const output = simulateLlmOutput(simulateInput);
  onStream?.(output.reply);
  return normalizeReplyOutput(output, simulateInput.decision);
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
  let finalSegments: string[] | undefined;

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

      const parsed = JSON.parse(data) as { delta?: string; final?: { reply?: string; segments?: string[] }; error?: string };
      if (parsed.error) throw new Error(parsed.error);
      if (typeof parsed.delta === "string") {
        accumulated += parsed.delta;
        onStream?.(stripReplyStageDirections(accumulated));
      }
      if (parsed.final?.reply !== undefined) {
        finalReply = parsed.final.reply;
      }
      if (Array.isArray(parsed.final?.segments)) {
        finalSegments = parsed.final.segments.filter((segment): segment is string => typeof segment === "string");
      }
    }
  }

  return { reply: finalReply || accumulated, segments: finalSegments };
}

function normalizeReplyOutput(data: unknown, decision: ResponseDecision): ReplyOutput {
  const reply =
    typeof data === "string"
      ? data
      : isRecord(data) && typeof data.reply === "string"
        ? data.reply
        : "";
  const spokenReply = stripReplyStageDirections(reply);
  const modelSegments = isRecord(data) && Array.isArray(data.segments)
    ? data.segments.filter((item): item is string => typeof item === "string")
    : undefined;
  const segments = splitReplyIntoSegments(spokenReply, decision.replyRhythm, modelSegments?.map(stripReplyStageDirections));
  return {
    reply: spokenReply,
    segments,
  };
}

export function splitReplyIntoSegments(reply: string, rhythm: ResponseDecision["replyRhythm"], modelSegments?: string[]) {
  const explicitSegments = (modelSegments && modelSegments.length > 0 ? modelSegments : reply.split(/\n+/))
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (!reply.trim()) return [];
  if (explicitSegments.length > 1) return explicitSegments.slice(0, 6);
  if (rhythm === "single" || rhythm === "none") return explicitSegments.length > 0 ? [explicitSegments.join("\n")] : [reply.trim()];

  const sentenceSegments = (reply.match(/[^。！？!?]+[。！？!?]?/g) ?? [])
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (sentenceSegments.length <= 1) return [reply.trim()];
  if (rhythm === "burst") return sentenceSegments.slice(0, 6);

  const grouped: string[] = [];
  for (let index = 0; index < sentenceSegments.length; index += 2) {
    grouped.push(sentenceSegments.slice(index, index + 2).join(""));
  }
  return grouped.slice(0, 5);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function simulateLlmOutput({ decision }: SimulateInput): ReplyOutput {
  if (!decision.shouldRespond || decision.responseMode === "silence") {
    return {
      reply: "",
    };
  }

  if (decision.shouldBreakPersona || decision.replyRhythm === "burst") {
    return {
      reply: "你别这样说。别逼我现在还要装作没事。",
    };
  }

  if (decision.replyRhythm === "multi_turn") {
    return {
      reply: "等一下。\n我不是不想回答你。\n只是你这句话让我有点不知道该怎么接。",
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
