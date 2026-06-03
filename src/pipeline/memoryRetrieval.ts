import {
  AppraisalResult,
  CharacterState,
  CognitiveModuleTrace,
  EventInput,
  LlmConfig,
  LongTermMemory,
  MemoryRecallFactor,
  MemoryRecallResult,
  MemoryRecallSource,
} from "../core/types";
import { clamp, round } from "../core/utils";
import { runCognitiveModule } from "./cognitiveModuleClient";

interface MemoryRetrievalContext {
  source: MemoryRecallSource;
  naturalLanguageQuery: string;
  activatedConcernScores: Map<string, number>;
  activatedConcernSummaries: string[];
  speakerNames: string[];
  speakerRelationshipSummary: string;
}

interface RankedMemoryCandidate {
  memoryId: string;
  summary: string;
  score: number;
  reason: string;
  factors: MemoryRecallFactor[];
}

interface MemoryRecallSelectionResult {
  source?: MemoryRecallSource;
  retrievalMode?: "hybrid_relevance";
  naturalLanguageQuery?: string;
  shortTermMemoryIds?: string[];
  longTermMemories?: {
    memoryId?: string;
    score?: number;
    reason?: string;
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
  const rankedCandidates = rankLongTermMemoryCandidates(longTermMemoryCandidates, retrievalContext);
  const longTermMemories = selectRecallCandidates(rankedCandidates);
  const shortTermCandidates = state.shortTermMemory.slice(-4);

  const mockOutput: MemoryRecallResult = {
    source: retrievalContext.source,
    retrievalMode: "hybrid_relevance",
    naturalLanguageQuery: retrievalContext.naturalLanguageQuery,
    shortTermContext: shortTermCandidates,
    longTermMemories,
  };
  const fallbackSelection: MemoryRecallSelectionResult = {
    source: mockOutput.source,
    retrievalMode: mockOutput.retrievalMode,
    naturalLanguageQuery: mockOutput.naturalLanguageQuery,
    shortTermMemoryIds: shortTermCandidates.map((memory) => memory.id),
    longTermMemories: longTermMemories.map((memory) => ({
      memoryId: memory.memoryId,
      score: memory.score,
      reason: memory.reason,
    })),
  };

  const compactLongTermCandidates = rankedCandidates.slice(0, 8).map((candidate) => ({
    memoryId: candidate.memoryId,
    summary: candidate.summary,
    score: candidate.score,
    factorScores: Object.fromEntries(candidate.factors.map((factor) => [factor.name, factor.score])),
  }));

  const trace = await runCognitiveModule<MemoryRecallSelectionResult>(
    {
      moduleName: "memory_retrieval",
      inputMode: "structured_context",
      outputMode: "structured_json",
      prompt: [
        "你是虚拟人大脑里的记忆召回区。你只负责判断此刻哪些短期和长期记忆会自然浮上来。",
        "召回不是敏感词过滤。敏感词和触发词可以作为线索，但必须同时看自然语言语义相关度、当前关切、说话者关系、情绪显著性、时间远近。",
        `刚发生的事：${event.speakerName ?? "对方"}说「${event.content}」`,
        `事件评估：${appraisal.appraisalSummary}`,
        `自然语言召回查询：${retrievalContext.naturalLanguageQuery}`,
        `当前激活关切：${retrievalContext.activatedConcernSummaries.join("；") || "没有强激活关切"}`,
        `说话者关系：${retrievalContext.speakerRelationshipSummary}`,
        `短期记忆候选 ID：${shortTermCandidates.map((memory) => `${memory.id}=${memory.speakerName}：「${memory.content}」`).join("；") || "无"}`,
        `长期记忆候选和本地混合评分：${JSON.stringify(compactLongTermCandidates, null, 2)}`,
        "请复判这些候选。只选择会自然浮现的记忆 ID，不要复述短期记忆全文，不要复述长期记忆 summary，不要输出 factors。",
        "输出要克制：shortTermMemoryIds 最多 4 个，longTermMemories 最多 5 条，每条只包含 memoryId、score、短 reason。",
      ].join("\n\n"),
      outputContract:
        "Return JSON: { source, retrievalMode, naturalLanguageQuery, shortTermMemoryIds: string[] max 4, longTermMemories: [{ memoryId, score, reason }] max 5 }",
    },
    llmConfig,
    fallbackSelection,
    { onStream },
  );

  return {
    ...trace,
    output: normalizeMemoryRecallResult(trace.output, fallbackSelection, retrievalContext, shortTermCandidates, rankedCandidates, mockOutput),
  };
}

function createMemoryRetrievalContext(
  event: EventInput,
  appraisal: AppraisalResult,
  state: CharacterState,
  source: MemoryRecallSource,
): MemoryRetrievalContext {
  const activatedConcernScores = new Map(appraisal.activatedConcerns.map((concern) => [concern.concernId, concern.activationScore]));
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
    appraisal.appraisalSummary,
    ...activatedConcernSummaries,
    speakerRelationshipSummary,
  ]
    .filter(Boolean)
    .join("。");

  return {
    source,
    naturalLanguageQuery,
    activatedConcernScores,
    activatedConcernSummaries,
    speakerNames,
    speakerRelationshipSummary,
  };
}

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
  rankedCandidates: RankedMemoryCandidate[],
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
    longTermMemories: normalizeRecalledMemories(result.longTermMemories, rankedCandidates, fallback.longTermMemories),
  };
}

function normalizeRecalledMemories(value: unknown, rankedCandidates: RankedMemoryCandidate[], fallback: MemoryRecallResult["longTermMemories"]) {
  if (!Array.isArray(value)) return fallback;

  const normalized: MemoryRecallResult["longTermMemories"] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const memoryId = typeof item.memoryId === "string" ? item.memoryId : "";
    const candidate = rankedCandidates.find((memory) => memory.memoryId === memoryId);
    if (!memoryId || !candidate) continue;

    normalized.push({
      memoryId,
      summary: candidate.summary,
      score: round(clamp(typeof item.score === "number" ? item.score : candidate.score, 0, 1)),
      reason: typeof item.reason === "string" && item.reason.trim() ? item.reason.slice(0, 80) : candidate.reason,
      factors: candidate.factors,
    });
  }

  return normalized.slice(0, 5);
}

function rankLongTermMemoryCandidates(memories: LongTermMemory[], context: MemoryRetrievalContext): RankedMemoryCandidate[] {
  return memories
    .map((memory) => scoreLongTermMemory(memory, context))
    .sort((a, b) => b.score - a.score);
}

function scoreLongTermMemory(memory: LongTermMemory, context: MemoryRetrievalContext): RankedMemoryCandidate {
  const naturalLanguageRelevance = calculateNaturalLanguageRelevance(context.naturalLanguageQuery, memory.summary);
  const concernAffinity = calculateConcernAffinity(memory, context);
  const relationshipAffinity = calculateRelationshipAffinity(memory, context);
  const affectiveSalience = round(clamp(memory.emotionalIntensity * 0.58 + memory.importance * 0.42, 0, 1));
  const recency = calculateRecencyWeight(memory);
  const lexicalHint = calculateLexicalHint(context.naturalLanguageQuery, memory.summary);

  const score = round(
    clamp(
      naturalLanguageRelevance * 0.34 +
        concernAffinity * 0.22 +
        relationshipAffinity * 0.14 +
        affectiveSalience * 0.14 +
        recency * 0.08 +
        lexicalHint * 0.08,
      0,
      1,
    ),
  );

  const factors: MemoryRecallFactor[] = [
    {
      name: "natural_language_relevance",
      score: naturalLanguageRelevance,
      reason: naturalLanguageRelevance >= 0.42 ? "事件与记忆摘要在语义片段上相近" : "事件与记忆摘要的语义片段重合较弱",
    },
    {
      name: "concern_affinity",
      score: concernAffinity,
      reason: concernAffinity > 0 ? "记忆关联了当前被激活的关切" : "记忆没有直接绑定当前关切",
    },
    {
      name: "relationship_affinity",
      score: relationshipAffinity,
      reason: relationshipAffinity > 0 ? "记忆关联当前说话者或关系对象" : "记忆与当前说话者关系较弱",
    },
    {
      name: "affective_salience",
      score: affectiveSalience,
      reason: "由情绪强度和重要度共同决定",
    },
    {
      name: "recency",
      score: recency,
      reason: "越近期或最近访问过，越容易自然浮现",
    },
    {
      name: "lexical_hint",
      score: lexicalHint,
      reason: lexicalHint > 0 ? "存在词面线索，但它只作为辅助" : "没有明显词面线索",
    },
  ];

  return {
    memoryId: memory.id,
    summary: memory.summary,
    score,
    reason: buildMemoryRecallReason(factors),
    factors,
  };
}

function selectRecallCandidates(candidates: RankedMemoryCandidate[]) {
  const meaningfulCandidates = candidates.filter((candidate) => candidate.score >= 0.16).slice(0, 5);
  if (meaningfulCandidates.length > 0) return meaningfulCandidates;
  return candidates.slice(0, 2).filter((candidate) => candidate.score > 0);
}

function calculateConcernAffinity(memory: LongTermMemory, context: MemoryRetrievalContext) {
  const scores = memory.relatedConcerns
    .map((concernId) => context.activatedConcernScores.get(concernId) ?? 0)
    .filter((score) => score > 0);
  if (scores.length === 0) return 0;
  return round(clamp(Math.max(...scores), 0, 1));
}

function calculateRelationshipAffinity(memory: LongTermMemory, context: MemoryRetrievalContext) {
  const normalizedPeople = memory.relatedPeople.map(normalizeText).filter(Boolean);
  const normalizedSpeakers = context.speakerNames.map(normalizeText).filter(Boolean);
  const directMatch = normalizedPeople.some((person) => normalizedSpeakers.some((speaker) => person === speaker || person.includes(speaker) || speaker.includes(person)));
  if (directMatch) return 1;

  const summary = normalizeText(memory.summary);
  const summaryMatch = normalizedSpeakers.some((speaker) => speaker.length >= 2 && summary.includes(speaker));
  return summaryMatch ? 0.62 : 0;
}

function calculateRecencyWeight(memory: LongTermMemory) {
  const timestamp = Date.parse(memory.lastAccessedAt ?? memory.createdAt);
  if (!Number.isFinite(timestamp)) return 0.24;

  const ageInDays = Math.max((Date.now() - timestamp) / 86_400_000, 0);
  return round(clamp(Math.exp(-ageInDays / 30), 0.12, 1));
}

function calculateNaturalLanguageRelevance(query: string, summary: string) {
  const queryUnits = tokenizeSemanticUnits(query);
  const summaryUnits = tokenizeSemanticUnits(summary);
  if (queryUnits.size === 0 || summaryUnits.size === 0) return 0;

  const overlap = [...summaryUnits].filter((unit) => queryUnits.has(unit)).length;
  const summaryCoverage = overlap / summaryUnits.size;
  const queryCoverage = overlap / queryUnits.size;
  const balancedCoverage = Math.sqrt(summaryCoverage * queryCoverage);

  return round(clamp(balancedCoverage * 1.8, 0, 1));
}

function calculateLexicalHint(query: string, summary: string) {
  const queryTokens = tokenizeWords(query);
  if (queryTokens.size === 0) return 0;

  const normalizedSummary = normalizeText(summary);
  const matched = [...queryTokens].filter((token) => normalizedSummary.includes(token)).length;
  return round(clamp(matched / Math.max(queryTokens.size, 1), 0, 1));
}

function tokenizeSemanticUnits(text: string) {
  const normalized = normalizeText(text);
  const units = new Set<string>();

  for (const word of tokenizeWords(normalized)) {
    units.add(word);
  }

  const cjkRuns = normalized.match(/[\u4e00-\u9fa5]+/g) ?? [];
  for (const run of cjkRuns) {
    for (const size of [2, 3, 4]) {
      for (let index = 0; index <= run.length - size; index += 1) {
        units.add(run.slice(index, index + size));
      }
    }
  }

  return units;
}

function tokenizeWords(text: string) {
  const normalized = normalizeText(text);
  return new Set((normalized.match(/[a-z0-9]+|[\u4e00-\u9fa5]{2,}/g) ?? []).filter((token) => token.length >= 2));
}

function normalizeText(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function buildMemoryRecallReason(factors: MemoryRecallFactor[]) {
  return factors
    .filter((factor) => factor.score >= 0.35)
    .map((factor) => `${describeRecallFactor(factor.name)} ${factor.score}`)
    .join("、") || "低强度背景记忆，交给 LLM 判断是否真正浮现";
}

function describeRecallFactor(name: MemoryRecallFactor["name"]) {
  switch (name) {
    case "natural_language_relevance":
      return "自然语言相关";
    case "concern_affinity":
      return "关切关联";
    case "relationship_affinity":
      return "关系关联";
    case "affective_salience":
      return "情绪显著";
    case "recency":
      return "近期性";
    case "lexical_hint":
      return "词面线索";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
