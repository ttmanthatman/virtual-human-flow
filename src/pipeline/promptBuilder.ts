import { AppraisalResult, CharacterState, EventInput, ExpressionLlmRequest, MemoryRecallResult, ResponseDecision } from "../core/types";

export function generateNaturalPromptRequest(
  event: EventInput,
  state: CharacterState,
  appraisal: AppraisalResult,
  memoryRecall: MemoryRecallResult,
  decision: ResponseDecision,
  provider: "simulated" | "external",
  model: string,
): ExpressionLlmRequest {
  const activatedConcerns = appraisal.activatedConcerns
    .map((item) => {
      const concern = state.concerns.find((candidate) => candidate.id === item.concernId);
      return {
        ...item,
        title: concern?.title,
        description: concern?.description,
        intensity: concern?.intensity,
        valence: concern?.valence,
        arousal: concern?.arousal,
      };
    })
    .filter((item) => item.title);

  const concernNarrative =
    activatedConcerns.length > 0
      ? activatedConcerns
          .map((concern) => {
            const emotionalDirection = (concern.valence ?? 0) < 0 ? "偏负面" : "偏正面";
            const triggerPhrase =
              concern.matchedTriggers.length > 0
                ? `因为对方说到了「${concern.matchedTriggers.join("、")}」`
                : "因为这件事和她最近的心境擦到了边";
            return `这句话碰到了「${concern.title}」。这件事在她心里${describeIntensity(concern.intensity ?? 0)}，情绪方向${emotionalDirection}，${triggerPhrase}。`;
          })
          .join(" ")
      : "这句话没有明显戳中她最核心的心事，她可以按普通互动来处理。";

  const relationshipNarrative = appraisal.speakerRelationship
    ? `说话的人是 ${appraisal.speakerRelationship.targetName}。她和这个人有一点熟悉，信任感不算很高，最近的互动气氛是「${appraisal.speakerRelationship.recentTone}」。`
    : "说话的人没有明确关系档案，她会保持礼貌距离。";

  const memoryNarrative =
    memoryRecall.longTermMemories.length > 0
      ? memoryRecall.longTermMemories.map((memory) => `她此刻可能想起：${memory.summary}`).join(" ")
      : "没有特别强的旧记忆浮上来。";

  const recentConversationNarrative =
    memoryRecall.shortTermContext.length > 0
      ? memoryRecall.shortTermContext.map((memory) => `${memory.speakerName}刚才说过：「${memory.content}」`).join(" ")
      : "刚才没有太多直接上下文。";

  const responseModeNarrative = describeResponseMode(decision.responseMode);
  const personalityNarrative = [
    state.profile.personalitySummary,
    ...state.profile.personalityFacets.map((facet) => `她的「${facet.label}」表现为：${facet.summary}${facet.tension ? ` ${facet.tension}` : ""} ${facet.expression}`),
  ].join(" ");
  const runtimeNarrative = Object.values(state.runtime.signalProfiles)
    .map((signal) => `${signal.label}：${signal.llmContext}`)
    .join(" ");
  const sceneNarrative = state.scene
    ? `${state.scene.title}：${state.scene.llmContext} ${state.scene.sensoryProfile} ${state.scene.interactionPressure}`
    : "当前没有明确场景，按普通私聊处理。";

  const prompt = [
    `你现在只负责替 ${state.profile.name} 说出这一刻会说的话，以及她没有说出口的心理余波。`,
    `${state.profile.name} 的稳定背景是：${state.profile.background}`,
    `她的性格不是几个标签，而是这些经历和倾向综合出来的：${personalityNarrative}`,
    `她平常说话的方式是：${state.profile.speakingStyle}`,
    `她在关系里的边界是：${state.profile.boundaries.join("；")}`,
    `此刻的场景语境是：${sceneNarrative}`,
    `界面上的能量、心情、情绪方向和唤起程度只是给人看的摘要，不要把分数当作她的思考。真正驱动她的是这些自然语言状态：${runtimeNarrative}`,
    `${event.speakerName ?? "对方"}刚刚对她说：「${event.content}」`,
    concernNarrative,
    relationshipNarrative,
    memoryNarrative,
    recentConversationNarrative,
    `从她的状态看，这一轮更适合：${responseModeNarrative}。背后的原因是：${decision.rationale}`,
    "写她会自然说出口的话。不要像助手，不要解释这些背景材料，也不要把上面的分析词带进她的台词。",
  ].join("\n\n");

  return {
    provider,
    model,
    prompt,
  };
}

function describeIntensity(intensity: number) {
  if (intensity >= 0.75) return "仍然很重";
  if (intensity >= 0.45) return "有明显分量";
  if (intensity >= 0.2) return "有一点余波";
  return "只是轻轻掠过";
}

function describeResponseMode(mode: ResponseDecision["responseMode"]) {
  switch (mode) {
    case "warm_reply":
      return "可以温和接话，语气比平时更松一点";
    case "neutral_reply":
      return "简短、自然、保持一点距离";
    case "short_avoidance":
      return "短句回避，不展开解释，也不显得过分热情";
    case "topic_shift":
      return "先避开被戳中的话题，再轻轻转到别处";
    case "question_back":
      return "用反问把主动权拿回来";
    case "silence":
      return "可以沉默，不需要说出口";
    case "delayed_reply":
      return "像是想了一会儿才回复";
    case "emotional_outburst":
      return "情绪外露，但仍要符合她的人设边界";
  }
}
