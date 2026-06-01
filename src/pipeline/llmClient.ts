import { CharacterState, EventInput, LlmConfig, LlmOutput, LlmRequest, ResponseDecision } from "../core/types";

interface SimulateInput {
  event: EventInput;
  state: CharacterState;
  decision: ResponseDecision;
}

export async function runLlm(
  request: LlmRequest,
  config: LlmConfig,
  simulateInput: SimulateInput,
): Promise<LlmOutput> {
  if (config.provider === "external" && config.endpoint.trim()) {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        prompt: request.prompt,
        outputContract: request.outputContract,
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM endpoint failed: ${response.status}`);
    }

    return (await response.json()) as LlmOutput;
  }

  return simulateLlmOutput(simulateInput);
}

function simulateLlmOutput({ event, state, decision }: SimulateInput): LlmOutput {
  const activeConcern = state.concerns.find((concern) => concern.status === "active" && concern.triggers.some((trigger) => event.content.includes(trigger)));
  const targetId = event.speakerId ?? "user_b";

  if (!decision.shouldRespond || decision.responseMode === "silence") {
    return {
      reply: "",
      concernUpdates: [],
      relationshipUpdates: [],
      newConcerns: [],
      internalStateNote: "她看见了这句话，但没有找到必须开口的理由。",
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
    concernUpdates: activeConcern
      ? [
          {
            concernId: activeConcern.id,
            intensityDelta: activeConcern.valence < 0 ? 0.05 : 0.02,
            arousalDelta: 0.06,
            note: `事件「${event.content}」触发了「${activeConcern.title}」。`,
          },
        ]
      : [],
    relationshipUpdates: [
      {
        targetId,
        familiarityDelta: 0.01,
        tensionDelta: decision.responseMode === "short_avoidance" ? 0.02 : -0.01,
        note: "本轮互动被记录为一次轻微关系变化。",
      },
    ],
    newConcerns: [],
    internalStateNote: activeConcern
      ? `她没有把「${activeConcern.title}」完整说出口，只是在心里停了一下。`
      : "这次对话没有明显戳中她的心事。",
  };
}
