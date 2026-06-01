import { AppraisalResult, CharacterState, EventInput, LlmRequest, MemoryRecallResult, ResponseDecision } from "../core/types";

const expectedJsonShape = `{
  "reply": "string",
  "concernUpdates": [{"concernId": "string", "intensityDelta": 0, "valenceDelta": 0, "arousalDelta": 0, "note": "string"}],
  "relationshipUpdates": [{"targetId": "string", "trustDelta": 0, "affectionDelta": 0, "tensionDelta": 0, "note": "string"}],
  "newConcerns": [],
  "internalStateNote": "string"
}`;

export function buildPromptRequest(
  event: EventInput,
  state: CharacterState,
  appraisal: AppraisalResult,
  memoryRecall: MemoryRecallResult,
  decision: ResponseDecision,
  provider: "simulated" | "external",
  model: string,
): LlmRequest {
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

  const prompt = [
    `你是虚拟角色 ${state.profile.name} 的语言模块，不是整个角色本体。`,
    `人设：${state.profile.background}`,
    `说话风格：${state.profile.speakingStyle}`,
    `边界：${state.profile.boundaries.join("；")}`,
    `当前场景：${state.scene?.title ?? "未设置"} - ${state.scene?.description ?? ""}`,
    `当前派生心情：${state.runtime.derivedMood.label}`,
    `当前事件：${event.speakerName ?? "unknown"} 说「${event.content}」`,
    `被激活的关切：${JSON.stringify(activatedConcerns, null, 2)}`,
    `说话者关系：${JSON.stringify(appraisal.speakerRelationship ?? null, null, 2)}`,
    `召回记忆：${JSON.stringify(memoryRecall.longTermMemories, null, 2)}`,
    `最近对话：${JSON.stringify(memoryRecall.shortTermContext, null, 2)}`,
    `响应决策：${decision.responseMode}，理由：${decision.rationale}`,
    `请只输出符合以下结构的 JSON，不要输出解释文字：${expectedJsonShape}`,
  ].join("\n\n");

  return {
    provider,
    model,
    prompt,
    expectedJsonShape,
  };
}
