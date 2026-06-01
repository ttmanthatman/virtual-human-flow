import { AppraisalResult, CharacterState, EventInput, MemoryRecallResult } from "../core/types";
import { clamp, round } from "../core/utils";

export function retrieveMemory(event: EventInput, appraisal: AppraisalResult, state: CharacterState): MemoryRecallResult {
  const activatedIds = new Set(appraisal.activatedConcerns.map((concern) => concern.concernId));
  const speakerNames = [event.speakerId, event.speakerName].filter(Boolean) as string[];

  const longTermMemories = state.longTermMemory
    .map((memory) => {
      const concernMatch = memory.relatedConcerns.some((id) => activatedIds.has(id)) ? 0.38 : 0;
      const peopleMatch = memory.relatedPeople.some((person) => speakerNames.includes(person)) ? 0.18 : 0;
      const emotionWeight = memory.emotionalIntensity * 0.24;
      const importanceWeight = memory.importance * 0.2;
      const textMatch = event.content
        .split("")
        .some((token) => token.trim() && memory.summary.includes(token))
        ? 0.08
        : 0;
      const score = round(clamp(concernMatch + peopleMatch + emotionWeight + importanceWeight + textMatch, 0, 1));

      return {
        memoryId: memory.id,
        summary: memory.summary,
        score,
        reason: [
          concernMatch ? "关联当前关切" : "",
          peopleMatch ? "关联说话者" : "",
          emotionWeight > 0.15 ? "情绪强度高" : "",
          importanceWeight > 0.12 ? "重要度高" : "",
        ]
          .filter(Boolean)
          .join("、") || "低强度背景记忆",
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  return {
    shortTermContext: state.shortTermMemory.slice(-8),
    longTermMemories,
  };
}
