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
  const valuesNarrative = state.profile.values.length > 0 ? state.profile.values.join("、") : "没有明确列出的价值取向";
  const boundariesNarrative = state.profile.boundaries.length > 0 ? state.profile.boundaries.join("；") : "没有明确列出的边界";
  const exampleNarrative =
    state.profile.examples.length > 0
      ? state.profile.examples.map((example) => `在「${example.situation}」里，她可能会说：「${example.expectedReply}」`).join(" ")
      : "没有可参考的表达样本。";
  const runtimeNarrative = Object.values(state.runtime.signalProfiles)
    .map((signal) => `${signal.label}：${signal.summary} ${signal.considerations.join("；")}。${signal.cognitiveNarrative}`)
    .join(" ");
  const sceneNarrative = state.scene
    ? `${state.scene.title}：${state.scene.cognitiveNarrative} ${state.scene.sensoryProfile} ${state.scene.interactionPressure}`
    : "当前没有明确场景，按普通私聊处理。";

  const prompt = [
    `现在进入 ${state.profile.name} 的表达时刻。下面是一段自然语言语境，不是规则清单。`,
    `${state.profile.name} 的稳定背景是：${state.profile.background}`,
    `先把她的性格完整过一遍：${personalityNarrative}`,
    `她看重的东西包括：${valuesNarrative}。她在关系里的边界包括：${boundariesNarrative}。`,
    `她平常的说话质感是：${state.profile.speakingStyle}`,
    `类似情境里的表达样本是：${exampleNarrative}`,
    `此刻的场景语境是：${sceneNarrative}`,
    `界面上的能量、心情、情绪方向和唤起程度只是给人看的观察摘要。她内部真正参与反应的是这些自然语言状态：${runtimeNarrative}`,
    `${event.speakerName ?? "对方"}刚刚对她说：「${event.content}」`,
    concernNarrative,
    relationshipNarrative,
    memoryNarrative,
    recentConversationNarrative,
    `综合她的性格、场景、关系、记忆和当下状态，这一轮反应更接近：${responseModeNarrative}。背后的自然语言原因是：${decision.rationale}`,
    `最终出现在屏幕上的，只是 ${state.profile.name} 此刻会自然说出口的话；分析、标签和背景说明都留在她没有说出口的内在过程里。`,
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
      return "她会温和接住对方，关系距离比平时稍微松一点";
    case "neutral_reply":
      return "她会保持自然的礼貌距离，话不会突然变多";
    case "short_avoidance":
      return "她会先把话收短，解释自己的欲望很低，热情不会突然变高";
    case "topic_shift":
      return "被戳中的部分会让她绕开正面情绪，注意力轻轻转到别处";
    case "question_back":
      return "她会把主动权拿回一点，通过反问确认对方意图";
    case "silence":
      return "沉默本身也符合她此刻的心理压力";
    case "delayed_reply":
      return "像是想了一会儿才回复";
    case "emotional_outburst":
      return "情绪比平时更外露，但仍受她长期边界感牵制";
  }
}
