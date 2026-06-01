import { AppraisalResult, CharacterState, CognitiveModuleTrace, LlmConfig, MemoryRecallResult, ResponseDecision } from "../core/types";
import { runCognitiveModule } from "./cognitiveModuleClient";

export async function decideResponse(
  appraisal: AppraisalResult,
  memoryRecall: MemoryRecallResult,
  state: CharacterState,
  llmConfig: LlmConfig,
  onStream?: (output: string) => void,
): Promise<CognitiveModuleTrace<ResponseDecision>> {
  const strongest = appraisal.activatedConcerns[0];
  const relationship = appraisal.speakerRelationship;
  const activeConcern = state.concerns.find((concern) => concern.id === strongest?.concernId);

  if (appraisal.eventSalience < 0.18) {
    const mockOutput: ResponseDecision = {
      shouldRespond: true,
      responseMode: "neutral_reply",
      delaySeconds: 2,
      rationale: "当前是直接对话，即使事件显著性低，也先给出简短自然回应。",
    };
    return runDecisionModule(appraisal, memoryRecall, state, llmConfig, mockOutput, onStream);
  }

  if (activeConcern && activeConcern.valence < -0.35 && strongest.activationScore > 0.45) {
    const mockOutput: ResponseDecision = {
      shouldRespond: true,
      responseMode: relationship && relationship.trust > 0.62 ? "topic_shift" : "short_avoidance",
      delaySeconds: 4,
      rationale: "负面关切被明显激活，角色会回应但倾向克制、回避或转移。",
    };
    return runDecisionModule(appraisal, memoryRecall, state, llmConfig, mockOutput, onStream);
  }

  if (relationship && relationship.familiarity > 0.65 && appraisal.eventSalience > 0.55) {
    const mockOutput: ResponseDecision = {
      shouldRespond: true,
      responseMode: "warm_reply",
      delaySeconds: 1,
      rationale: "事件有一定重要性，说话者关系较近，可以更自然地接话。",
    };
    return runDecisionModule(appraisal, memoryRecall, state, llmConfig, mockOutput, onStream);
  }

  const mockOutput: ResponseDecision = {
    shouldRespond: true,
    responseMode: "neutral_reply",
    delaySeconds: 2,
    rationale: "普通可回应事件，保持角色基本语气。",
  };
  return runDecisionModule(appraisal, memoryRecall, state, llmConfig, mockOutput, onStream);
}

function runDecisionModule(
  appraisal: AppraisalResult,
  memoryRecall: MemoryRecallResult,
  state: CharacterState,
  llmConfig: LlmConfig,
  mockOutput: ResponseDecision,
  onStream?: (output: string) => void,
) {
  return runCognitiveModule<ResponseDecision>(
    {
      moduleName: "response_decision",
      inputMode: "structured_context",
      outputMode: "structured_json",
      prompt: [
        "你是虚拟人大脑里的行为决策区。你只负责判断她要不要回应，以及用什么姿态回应。",
        `角色当前整体状态：${state.runtime.derivedMood.label}`,
        `事件评估：${appraisal.appraisalSummary}`,
        `浮现的记忆：${memoryRecall.longTermMemories.map((memory) => memory.summary).join("；") || "没有特别强的记忆"}`,
        "请像判断真人反应一样决定：沉默、短回避、转移、反问、温和接话或情绪外露。",
      ].join("\n\n"),
      outputContract: "Return JSON: { shouldRespond, responseMode, delaySeconds, rationale }",
    },
    llmConfig,
    mockOutput,
    { onStream },
  );
}
