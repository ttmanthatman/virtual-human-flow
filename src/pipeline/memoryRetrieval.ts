import { CharacterState, CognitiveModuleTrace, EventInput, LlmConfig, LongTermMemory, MemoryRecallResult } from "../core/types";
import { runCognitiveModule } from "./cognitiveModuleClient";
import { formatDialogueMemoryForPrompt, formatRecentSituationSummaryForPrompt, selectRecentDialogueMemories } from "./conversationContext";

export async function retrieveMemory(
  event: EventInput,
  appraisalNarrative: string,
  state: CharacterState,
  llmConfig: LlmConfig,
  onStream?: (output: string) => void,
): Promise<CognitiveModuleTrace<MemoryRecallResult>> {
  const shortTermContext = selectRecentDialogueMemories(state, event, 10);
  const longTermCandidates = createLongTermCandidates(state).slice(0, 12);
  const naturalLanguageQuery = [
    "当前用户原话：" + event.content,
    "事件评估：" + appraisalNarrative,
    "过去6小时摘要：\n" + formatRecentSituationSummaryForPrompt(state, event),
  ].join("\n\n");
  const fallbackNarrative = [
    "短期记忆先浮现最近6小时内与当前说话者和角色自己有关的对话。",
    "长期记忆只作为候选背景，本地回退不按关键词选择；真正应该浮现什么应由 LLM 在自然语言里判断。",
  ].join("\n");

  const prompt = [
    "你是虚拟人大脑里的记忆召回区。",
    "请只用自然语言输出，不要 JSON，不要字段名，不要代码式列表。",
    "不要用关键词命中来召回。请像人在回忆一样判断：此刻哪些刚发生的对话、关系余波、状态变化、场景压力和长期记忆会自然浮上来。",
    "",
    "当前召回语境：",
    naturalLanguageQuery,
    "",
    "短期记忆范围：最近6小时，最多10条直接对话。",
    formatShortTermList(state, event, shortTermContext),
    "",
    "过去6小时关系、状态和场景摘要：",
    formatRecentSituationSummaryForPrompt(state, event),
    "",
    "长期记忆和关系记忆候选：",
    formatLongTermCandidates(longTermCandidates),
    "",
    "请自然语言说明：哪些短期内容会浮现，哪些长期/关系记忆会浮现，哪些不该浮现，以及为什么。不要复制整段候选，只写她脑中此刻真正会被带起来的记忆感。",
  ].join("\n");

  const trace = await runCognitiveModule<string>(
    {
      moduleName: "memory_retrieval",
      inputMode: "natural_language",
      outputMode: "natural_language",
      prompt,
      outputContract: "自然语言记忆召回，不使用 JSON、字段名或候选 ID 输出契约。",
    },
    llmConfig,
    fallbackNarrative,
    { onStream },
  );

  return {
    ...trace,
    output: {
      source: "sync_response",
      retrievalMode: "hybrid_relevance",
      naturalLanguageQuery,
      shortTermContext,
      longTermMemories: longTermCandidates.slice(0, 8).map((memory) => ({
        memoryId: memory.id,
        summary: memory.summary,
        score: memory.importance,
        reason: "作为自然语言召回候选提供；实际是否浮现由 Memory Recall LLM 的叙述决定。",
        factors: [],
      })),
      narrative: typeof trace.output === "string" && trace.output.trim() ? trace.output.trim() : fallbackNarrative,
    },
  };
}

export function createLongTermCandidates(state: CharacterState): LongTermMemory[] {
  const relationshipCandidates = (state.relationshipMemory ?? []).map((memory) => ({
    id: memory.id,
    summary: [
      `关系记忆区：${memory.targetUserName}`,
      `印象：${memory.impressionSummary}`,
      `关系：${memory.relationshipSummary}`,
      `最近互动：${memory.lastInteractionSummary}`,
      memory.evidence.length > 0 ? `依据：${memory.evidence.join("；")}` : "",
    ]
      .filter(Boolean)
      .join("。"),
    relatedPeople: [memory.targetUserId, memory.targetUserName],
    relatedConcerns: [],
    emotionalValence: 0,
    emotionalIntensity: 0.48,
    createdAt: memory.updatedAt,
    lastAccessedAt: memory.updatedAt,
    importance: 0.82,
  }));

  return [...state.longTermMemory, ...relationshipCandidates].sort((left, right) => {
    const rightTime = Date.parse(right.lastAccessedAt ?? right.createdAt);
    const leftTime = Date.parse(left.lastAccessedAt ?? left.createdAt);
    const timeOrder = (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
    if (timeOrder !== 0) return timeOrder;
    return right.importance - left.importance;
  });
}

function formatShortTermList(state: CharacterState, event: EventInput, memories: ReturnType<typeof selectRecentDialogueMemories>) {
  if (memories.length === 0) return "最近6小时没有可用的直接短期对话。";
  return memories.map((memory) => formatDialogueMemoryForPrompt(memory, state, event)).join("\n");
}

export function formatLongTermCandidates(memories: LongTermMemory[]) {
  if (memories.length === 0) return "没有可用的长期记忆候选。";
  return memories.map((memory, index) => `候选${index + 1}：${memory.summary}`).join("\n");
}
