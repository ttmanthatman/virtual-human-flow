import {
  AppraisalResult,
  CharacterState,
  CognitiveModuleTrace,
  EventInput,
  LlmConfig,
  LongTermMemory,
  MemoryRecallResult,
  MemoryRecallSource,
} from "../core/types";
import { runCognitiveModule } from "./cognitiveModuleClient";

interface MemoryRetrievalContext {
  source: MemoryRecallSource;
  naturalLanguageQuery: string;
  activatedConcernSummaries: string[];
  speakerNames: string[];
  speakerRelationshipSummary: string;
}

interface MemoryCandidate {
  memoryId: string;
  summary: string;
  score: number;
  reason: string;
  factors: [];
}

interface MemoryRecallSelectionResult {
  source?: MemoryRecallSource;
  retrievalMode?: "hybrid_relevance";
  naturalLanguageQuery?: string;
  shortTermMemoryIds?: string[];
  longTermMemories?: {
    memoryId?: string;
  }[];
}

export async function retrieveMemory(
  event: EventInput,
  appraisal: AppraisalResult,
  state: CharacterState,
  llmConfig: LlmConfig,
  onStream?: (output: string) => void,
): Promise<CognitiveModuleTrace<MemoryRecallResult>> {
  const retrievalContext = createMemoryRetrievalContext(event, appraisal, state, "sync_response");
  const longTermMemoryCandidates = [...state.longTermMemory, ...buildRelationshipMemoryCandidates(state)];
  const memoryCandidates = createMemoryCandidates(longTermMemoryCandidates);
  const shortTermCandidates = state.shortTermMemory.slice(-4);
  const fallbackLongTermMemories = memoryCandidates
    .slice()
    .sort((a, b) => Date.parse(b.lastAccessedAt ?? b.createdAt) - Date.parse(a.lastAccessedAt ?? a.createdAt))
    .slice(0, 3);

  const mockOutput: MemoryRecallResult = {
    source: retrievalContext.source,
    retrievalMode: "hybrid_relevance",
    naturalLanguageQuery: retrievalContext.naturalLanguageQuery,
    shortTermContext: shortTermCandidates,
    longTermMemories: fallbackLongTermMemories.map((memory) => ({
      memoryId: memory.memoryId,
      summary: memory.summary,
      score: memory.score,
      reason: memory.reason,
      factors: memory.factors,
    })),
  };
  const fallbackSelection: MemoryRecallSelectionResult = {
    source: mockOutput.source,
    retrievalMode: mockOutput.retrievalMode,
    naturalLanguageQuery: mockOutput.naturalLanguageQuery,
    shortTermMemoryIds: shortTermCandidates.map((memory) => memory.id),
    longTermMemories: fallbackLongTermMemories.map((memory) => ({
      memoryId: memory.memoryId,
    })),
  };

  const trace = await runCognitiveModule<MemoryRecallSelectionResult>(
    {
      moduleName: "memory_retrieval",
      inputMode: "structured_context",
      outputMode: "structured_json",
      prompt: [
        "你是虚拟人大脑里的记忆召回区。",
        "",
        "当前情境：",
        appraisal.narrative || "",
        "",
        buildNaturalCandidateList(state, retrievalContext, event.speakerId),
        "",
        "请从上面的候选中选出此刻会自然浮现的记忆。",
        "选短期记忆：最多4条，列出它们的序号（短期1、短期2）。",
        "选长期记忆：最多5条，列出它们的序号（候选1、候选2）。",
        "输出JSON格式：",
        '{ "shortTermMemoryIds": ["stm_xxx"], "longTermMemories": [{ "memoryId": "ltm_xxx" }] }',
        "每条长期记忆只需要 memoryId，不需要 score 或 reason。",
        "选得少比选多好——只选真的会浮上来的。",
      ].join("\n"),
      outputContract:
        "Return JSON: { shortTermMemoryIds: string[] max 4, longTermMemories: [{ memoryId }] max 5 }",
    },
    llmConfig,
    fallbackSelection,
    { onStream },
  );

  return {
    ...trace,
    output: normalizeMemoryRecallResult(trace.output, fallbackSelection, retrievalContext, shortTermCandidates, memoryCandidates, mockOutput),
  };
}

function createMemoryRetrievalContext(
  event: EventInput,
  appraisal: AppraisalResult,
  state: CharacterState,
  source: MemoryRecallSource,
): MemoryRetrievalContext {
  const activatedConcernSummaries = appraisal.activatedConcerns
    .map((item) => {
      const concern = state.concerns.find((candidate) => candidate.id === item.concernId);
      if (!concern) return "";
      const triggerText = item.matchedTriggers.length > 0 ? `触发线索：${item.matchedTriggers.join("、")}` : "没有直接触发词";
      return `${concern.title}：${concern.description}（激活 ${item.activationScore}，${triggerText}）`;
    })
    .filter(Boolean);

  const speakerNames = [event.speakerId, event.speakerName, appraisal.speakerRelationship?.targetId, appraisal.speakerRelationship?.targetName]
    .filter(Boolean)
    .map((value) => String(value));
  const relationshipMemory = (state.relationshipMemory ?? []).find((memory) => memory.targetUserId === event.speakerId);
  const speakerRelationshipSummary = appraisal.speakerRelationship
    ? [
        `${appraisal.speakerRelationship.targetName}`,
        `最近气氛：${appraisal.speakerRelationship.recentTone}`,
        relationshipMemory ? `她对这个用户的印象：${relationshipMemory.impressionSummary}` : "",
        relationshipMemory ? `当前关系总结：${relationshipMemory.relationshipSummary}` : "",
        relationshipMemory ? `最近一次关系记忆：${relationshipMemory.lastInteractionSummary}` : "",
        appraisal.speakerRelationship.notes.length > 0 ? `关系备注：${appraisal.speakerRelationship.notes.slice(-3).join("；")}` : "",
        Array.isArray(appraisal.speakerRelationship.unresolvedIssues) && appraisal.speakerRelationship.unresolvedIssues.length > 0
          ? `未解决：${appraisal.speakerRelationship.unresolvedIssues.join("、")}`
          : "",
      ]
        .filter(Boolean)
        .join("；")
    : "没有明确关系档案";

  const naturalLanguageQuery = [
    event.content,
    appraisal.narrative,
    ...activatedConcernSummaries,
    speakerRelationshipSummary,
  ]
    .filter(Boolean)
    .join("。");

  return {
    source,
    naturalLanguageQuery,
    activatedConcernSummaries,
    speakerNames,
    speakerRelationshipSummary,
  };
}

const buildNaturalCandidateList = (
  state: CharacterState,
  context: MemoryRetrievalContext,
  speechSpeakerId?: string,
): string => {
  const stmLines = state.shortTermMemory
    .slice(-4)
    .map((memory, index) => "短期" + (index + 1) + "（ID=" + memory.id + "）：" + memory.speakerName + "说「" + memory.content + "」");

  const ltmBase = state.longTermMemory.map((memory) => ({
    ...memory,
    _source: "长期记忆",
    _score: String(memory.importance),
  }));
  const relBase = buildRelationshipMemoryCandidates(state).map((memory) => ({
    ...memory,
    _source: speechSpeakerId && memory.relatedPeople.includes(speechSpeakerId) ? "当前说话者关系记忆" : "关系记忆",
    _score: String(memory.importance),
  }));
  const all = [...ltmBase, ...relBase];

  const candidateLines = all.slice(0, 20).map(
    (memory, index) =>
      "候选" +
      (index + 1) +
      "（ID=" +
      memory.id +
      "） " +
      memory._source +
      "：" +
      memory.summary +
      "（重要性" +
      memory._score +
      "，情绪强度" +
      memory.emotionalIntensity +
      "）",
  );

  return [
    "【短期上下文】",
    ...stmLines,
    "",
    "【当前召回语境】",
    context.naturalLanguageQuery,
    "",
    "【长期记忆候选】",
    ...candidateLines,
  ].join("\n");
};

function buildRelationshipMemoryCandidates(state: CharacterState): LongTermMemory[] {
  return (state.relationshipMemory ?? []).map((memory) => ({
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
}

function normalizeMemoryRecallResult(
  result: unknown,
  fallbackSelection: MemoryRecallSelectionResult,
  retrievalContext: MemoryRetrievalContext,
  shortTermCandidates: MemoryRecallResult["shortTermContext"],
  memoryCandidates: MemoryCandidate[],
  fallback: MemoryRecallResult,
): MemoryRecallResult {
  if (!isRecord(result)) return fallback;

  const shortTermMemoryIds = Array.isArray(result.shortTermMemoryIds)
    ? result.shortTermMemoryIds.filter((value): value is string => typeof value === "string").slice(0, 4)
    : fallbackSelection.shortTermMemoryIds ?? [];
  const shortTermContext = shortTermMemoryIds
    .map((memoryId) => shortTermCandidates.find((memory) => memory.id === memoryId))
    .filter((memory): memory is MemoryRecallResult["shortTermContext"][number] => Boolean(memory));

  return {
    source: result.source === "async_life" || result.source === "sync_response" ? result.source : fallbackSelection.source ?? fallback.source,
    retrievalMode: result.retrievalMode === "hybrid_relevance" ? result.retrievalMode : fallback.retrievalMode,
    naturalLanguageQuery:
      typeof result.naturalLanguageQuery === "string" && result.naturalLanguageQuery.trim()
        ? result.naturalLanguageQuery
        : fallbackSelection.naturalLanguageQuery ?? retrievalContext.naturalLanguageQuery,
    shortTermContext,
    longTermMemories: normalizeRecalledMemories(result.longTermMemories, memoryCandidates, fallback.longTermMemories),
  };
}

function normalizeRecalledMemories(value: unknown, memoryCandidates: MemoryCandidate[], fallback: MemoryRecallResult["longTermMemories"]) {
  if (!Array.isArray(value)) return fallback;

  const normalized: MemoryRecallResult["longTermMemories"] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const memoryId = typeof item.memoryId === "string" ? item.memoryId : "";
    const candidate = memoryCandidates.find((memory) => memory.memoryId === memoryId);
    if (!memoryId || !candidate) continue;

    normalized.push({
      memoryId,
      summary: candidate.summary,
      score: candidate.score,
      reason: candidate.reason,
      factors: candidate.factors,
    });
  }

  return normalized.slice(0, 5);
}

function createMemoryCandidates(memories: LongTermMemory[]): Array<MemoryCandidate & Pick<LongTermMemory, "createdAt" | "lastAccessedAt">> {
  return memories.map((memory) => ({
    memoryId: memory.id,
    summary: memory.summary,
    score: memory.importance,
    reason: "LLM 从自然语言候选清单中选择，完整记忆由本地按 ID 回填。",
    factors: [],
    createdAt: memory.createdAt,
    lastAccessedAt: memory.lastAccessedAt,
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
