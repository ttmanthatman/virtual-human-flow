import { AppraisalResult, CharacterState, CognitiveModuleTrace, EventInput, LlmConfig, MemoryRecallResult } from "../core/types";
import { clamp, round } from "../core/utils";
import { runCognitiveModule } from "./cognitiveModuleClient";

export async function retrieveMemory(
  event: EventInput,
  appraisal: AppraisalResult,
  state: CharacterState,
  llmConfig: LlmConfig,
): Promise<CognitiveModuleTrace<MemoryRecallResult>> {
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

  const mockOutput = {
    shortTermContext: state.shortTermMemory.slice(-8),
    longTermMemories,
  };

  return runCognitiveModule<MemoryRecallResult>(
    {
      moduleName: "memory_retrieval",
      inputMode: "structured_context",
      outputMode: "structured_json",
      prompt: [
        "你是虚拟人大脑里的记忆召回区。你只负责判断此刻哪些短期和长期记忆会自然浮上来。",
        `刚发生的事：${event.speakerName ?? "对方"}说「${event.content}」`,
        `事件评估：${appraisal.appraisalSummary}`,
        `长期记忆候选：${state.longTermMemory.map((memory) => `「${memory.summary}」`).join("；")}`,
        "请选出她此刻最可能想起的几件事，并说明每件事为什么会浮上来。",
      ].join("\n\n"),
      outputContract:
        "Return JSON: { shortTermContext: ShortTermMemory[], longTermMemories: [{ memoryId, summary, score, reason }] }",
    },
    llmConfig,
    mockOutput,
  );
}
