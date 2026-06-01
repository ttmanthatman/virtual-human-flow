import { AppraisalResult, CharacterState, EventInput } from "../core/types";
import { clamp, round } from "../core/utils";

export function runAppraisal(event: EventInput, state: CharacterState): AppraisalResult {
  const speakerRelationship = event.speakerId ? state.relationships[event.speakerId] : undefined;

  const activatedConcerns = state.concerns
    .filter((concern) => concern.status === "active")
    .map((concern) => {
      const matchedTriggers = concern.triggers.filter((trigger) => event.content.includes(trigger));
      const objectMatched = concern.object ? event.content.includes(concern.object) : false;
      const relationshipBoost = speakerRelationship?.targetName === concern.object ? 0.18 : 0;
      const activationScore = clamp(
        matchedTriggers.length * 0.22 + (objectMatched ? 0.25 : 0) + relationshipBoost + concern.intensity * 0.18,
        0,
        1,
      );

      return {
        concernId: concern.id,
        activationScore: round(activationScore),
        matchedTriggers,
        reason:
          matchedTriggers.length > 0
            ? `命中触发词：${matchedTriggers.join("、")}。`
            : "没有直接触发词，仅保留背景强度。",
      };
    })
    .filter((item) => item.activationScore >= 0.18)
    .sort((a, b) => b.activationScore - a.activationScore);

  const strongest = activatedConcerns[0]?.activationScore ?? 0;
  const relationshipWeight = speakerRelationship ? speakerRelationship.familiarity * 0.12 + speakerRelationship.tension * 0.18 : 0;
  const eventSalience = round(clamp(strongest * 0.72 + relationshipWeight + event.content.length / 300, 0, 1));

  return {
    eventId: event.id,
    speakerRelationship,
    activatedConcerns,
    eventSalience,
    appraisalSummary:
      activatedConcerns.length > 0
        ? `这条事件触发了 ${activatedConcerns.length} 个关切，最高激活度 ${activatedConcerns[0].activationScore}。`
        : "这条事件没有明显触发核心关切，按普通互动处理。",
  };
}
