import { AppraisalResult, CharacterState, ResponseDecision } from "../core/types";

export function decideResponse(appraisal: AppraisalResult, state: CharacterState): ResponseDecision {
  const strongest = appraisal.activatedConcerns[0];
  const relationship = appraisal.speakerRelationship;
  const activeConcern = state.concerns.find((concern) => concern.id === strongest?.concernId);

  if (appraisal.eventSalience < 0.18) {
    return {
      shouldRespond: true,
      responseMode: "neutral_reply",
      delaySeconds: 2,
      rationale: "当前是直接对话，即使事件显著性低，也先给出简短自然回应。",
    };
  }

  if (activeConcern && activeConcern.valence < -0.35 && strongest.activationScore > 0.45) {
    return {
      shouldRespond: true,
      responseMode: relationship && relationship.trust > 0.62 ? "topic_shift" : "short_avoidance",
      delaySeconds: 4,
      rationale: "负面关切被明显激活，角色会回应但倾向克制、回避或转移。",
    };
  }

  if (relationship && relationship.familiarity > 0.65 && appraisal.eventSalience > 0.55) {
    return {
      shouldRespond: true,
      responseMode: "warm_reply",
      delaySeconds: 1,
      rationale: "事件有一定重要性，说话者关系较近，可以更自然地接话。",
    };
  }

  return {
    shouldRespond: true,
    responseMode: "neutral_reply",
    delaySeconds: 2,
    rationale: "普通可回应事件，保持角色基本语气。",
  };
}
