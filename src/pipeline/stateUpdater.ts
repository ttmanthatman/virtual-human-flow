import {
  AppraisalResult,
  CharacterState,
  CognitiveModuleTrace,
  ConcernStatus,
  EventInput,
  LlmConfig,
  MemoryRecallResult,
  ReplyOutput,
  ResponseDecision,
  StateDelta,
  StateUpdatePlan,
} from "../core/types";
import { clamp, makeId, nowIso, round } from "../core/utils";
import { runCognitiveModule } from "./cognitiveModuleClient";

export async function applyStateUpdates(
  state: CharacterState,
  event: EventInput,
  replyOutput: ReplyOutput,
  context: {
    appraisal: AppraisalResult;
    memoryRecall: MemoryRecallResult;
    decision: ResponseDecision;
  },
  llmConfig: LlmConfig,
  onStream?: (output: string) => void,
): Promise<{ nextState: CharacterState; stateDelta: StateDelta; stateUpdate: CognitiveModuleTrace<StateUpdatePlan> }> {
  const stateUpdate = await planStateUpdates(state, event, replyOutput, context, llmConfig, onStream);
  const { nextState, stateDelta } = commitStateUpdates(state, event, replyOutput, stateUpdate.output);
  return { nextState, stateDelta, stateUpdate };
}

async function planStateUpdates(
  state: CharacterState,
  event: EventInput,
  replyOutput: ReplyOutput,
  context: {
    appraisal: AppraisalResult;
    memoryRecall: MemoryRecallResult;
    decision: ResponseDecision;
  },
  llmConfig: LlmConfig,
  onStream?: (output: string) => void,
) {
  const targetId = event.speakerId ?? "user_b";
  const targetName = event.speakerName ?? "当前对话者";
  const mockOutput: StateUpdatePlan = {
    concernUpdates: [],
    relationshipUpdates: [],
    newConcerns: [],
    userRelationshipMemory: {
      targetUserId: targetId,
      targetUserName: targetName,
      impressionSummary: targetName + "这次互动后，她在心里有了一个初步的印象。",
      relationshipSummary: "她和" + targetName + "的关系还在形成中。",
      evidence: ["对方说：" + event.content],
      lastInteractionSummary: "本轮互动让她对" + targetName + "有了更具体的判断。",
    },
    internalStateNote: "这次对话后，她的内心状态没有明显变化。",
  };

  const trace = await runCognitiveModule<StateUpdatePlan>(
    {
      moduleName: "state_update",
      inputMode: "structured_context",
      outputMode: "structured_json",
      prompt: [
        "你是虚拟人大脑里的状态写回区。你根据刚发生的事和她的话，判断她内在状态的变化。",
        "先理解下面这些自然语言叙述，然后把变化填入结构化出口。",
        "",
        "事件评估：",
        context.appraisal.narrative || "",
        "",
        "记忆浮现：",
        context.memoryRecall.narrative || "没有特别的记忆。",
        "",
        "回应决策：",
        context.decision.narrative || "",
        "",
        "她说出口的话：" + (replyOutput.reply || "她选择了沉默"),
        "当前说话者：" + targetName + "(" + targetId + ")",
        "",
        "当前心事状态：",
        ...state.concerns.map((concern) => concern.title + "：强度" + concern.intensity + "，偏好" + concern.valence + "，唤醒" + concern.arousal),
        "",
        "请判断哪些数值需要调整。注意：",
        "- 关切各维度变化一般在 -0.1 到 +0.1 之间",
        "- 关系各维度变化一般在 -0.05 到 +0.05 之间",
        "- 如果没有明显变化，填 0 或不包含该项",
        "- 关系印象(userRelationshipMemory)必须用自然语言写，不要数字",
      ].join("\n"),
      outputContract:
        "Return JSON: { concernUpdates: [{ concernId, intensityDelta, valenceDelta, arousalDelta, status, note }], relationshipUpdates: [{ targetId, familiarityDelta, trustDelta, affectionDelta, tensionDelta, note }], newConcerns: [], userRelationshipMemory: { targetUserId, targetUserName, impressionSummary, relationshipSummary, evidence: string[], lastInteractionSummary }, internalStateNote }",
    },
    llmConfig,
    mockOutput,
    { onStream },
  );

  return {
    ...trace,
    output: normalizeStateUpdatePlan(trace.output, mockOutput, state, event),
  };
}

function commitStateUpdates(state: CharacterState, event: EventInput, replyOutput: ReplyOutput, stateUpdatePlan: StateUpdatePlan): { nextState: CharacterState; stateDelta: StateDelta } {
  const concernChanges: string[] = [];
  const relationshipChanges: string[] = [];
  const memoryWrites: string[] = [];
  const runtimeChanges: string[] = [];

  const nextConcerns = state.concerns.map((concern) => {
    const update = stateUpdatePlan.concernUpdates.find((candidate) => candidate.concernId === concern.id);
    if (!update) return concern;

    const next = {
      ...concern,
      intensity: round(clamp(concern.intensity + (update.intensityDelta ?? 0), 0, 1)),
      valence: round(clamp(concern.valence + (update.valenceDelta ?? 0), -1, 1)),
      arousal: round(clamp(concern.arousal + (update.arousalDelta ?? 0), 0, 1)),
      status: update.status ?? concern.status,
      lastActivatedAt: nowIso(),
    };
    concernChanges.push(`${concern.title}: intensity ${concern.intensity} -> ${next.intensity}`);
    return next;
  });

  const nextRelationships = { ...state.relationships };
  for (const update of stateUpdatePlan.relationshipUpdates) {
    const existing = nextRelationships[update.targetId] ?? {
      targetId: update.targetId,
      targetName: event.speakerId === update.targetId ? event.speakerName ?? update.targetId : update.targetId,
      familiarity: 0.2,
      trust: 0.2,
      affection: 0,
      tension: 0,
      recentTone: "新关系",
      unresolvedIssues: [],
      notes: [],
    };

    nextRelationships[update.targetId] = {
      ...existing,
      familiarity: round(clamp(existing.familiarity + (update.familiarityDelta ?? 0), 0, 1)),
      trust: round(clamp(existing.trust + (update.trustDelta ?? 0), 0, 1)),
      affection: round(clamp(existing.affection + (update.affectionDelta ?? 0), -1, 1)),
      tension: round(clamp(existing.tension + (update.tensionDelta ?? 0), 0, 1)),
      lastInteractionAt: nowIso(),
      targetName: event.speakerId === update.targetId ? event.speakerName ?? existing.targetName : existing.targetName,
      notes: [...existing.notes.slice(-5), update.note],
    };
    relationshipChanges.push(`${existing.targetName}: ${update.note}`);
  }

  const shortTermMemory = [
    ...state.shortTermMemory,
    {
      id: makeId("stm"),
      timestamp: event.timestamp,
      speakerId: event.speakerId ?? "unknown",
      speakerName: event.speakerName ?? "Unknown",
      content: event.content,
      eventId: event.id,
    },
  ];

  if (replyOutput.reply) {
    shortTermMemory.push({
      id: makeId("stm"),
      timestamp: nowIso(),
      speakerId: state.profile.id,
      speakerName: state.profile.name,
      content: replyOutput.reply,
      eventId: event.id,
    });
  }

  memoryWrites.push("写入本轮事件到短期记忆");
  if (replyOutput.reply) memoryWrites.push("写入角色回复到短期记忆");

  const longTermMemory = [...state.longTermMemory];
  if (stateUpdatePlan.internalStateNote) {
    longTermMemory.push({
      id: makeId("ltm"),
      summary: stateUpdatePlan.internalStateNote,
      relatedPeople: [event.speakerId ?? "unknown"],
      relatedConcerns: stateUpdatePlan.concernUpdates.map((update) => update.concernId),
      emotionalValence: stateUpdatePlan.concernUpdates.length > 0 ? -0.35 : 0,
      emotionalIntensity: stateUpdatePlan.concernUpdates.length > 0 ? 0.55 : 0.2,
      createdAt: nowIso(),
      importance: stateUpdatePlan.concernUpdates.length > 0 ? 0.62 : 0.25,
    });
    memoryWrites.push("写入 internal_state_note 到长期记忆");
  }

  const relationshipMemory = [...(state.relationshipMemory ?? [])];
  const userRelationshipMemory = stateUpdatePlan.userRelationshipMemory;
  if (userRelationshipMemory?.targetUserId) {
    const targetUserId = userRelationshipMemory.targetUserId;
    const existingIndex = relationshipMemory.findIndex((memory) => memory.targetUserId === targetUserId);
    const existingMemory = existingIndex >= 0 ? relationshipMemory[existingIndex] : undefined;
    const historyItem = {
      id: makeId("relationship_history"),
      summary: userRelationshipMemory.lastInteractionSummary,
      createdAt: nowIso(),
    };
    const nextMemory = {
      id: existingMemory?.id ?? makeId("relationship_memory"),
      targetUserId,
      targetUserName: userRelationshipMemory.targetUserName,
      impressionSummary: userRelationshipMemory.impressionSummary,
      relationshipSummary: userRelationshipMemory.relationshipSummary,
      evidence: userRelationshipMemory.evidence.slice(-6),
      lastInteractionSummary: userRelationshipMemory.lastInteractionSummary,
      updatedAt: nowIso(),
      history: [...(existingMemory?.history ?? []).slice(-5), historyItem],
    };

    if (existingIndex >= 0) {
      relationshipMemory[existingIndex] = nextMemory;
    } else {
      relationshipMemory.push(nextMemory);
    }

    const existingRelationship = nextRelationships[targetUserId] ?? {
      targetId: targetUserId,
      targetName: userRelationshipMemory.targetUserName,
      familiarity: 0.2,
      trust: 0.2,
      affection: 0,
      tension: 0,
      recentTone: "新关系",
      unresolvedIssues: [],
      notes: [],
    };
    nextRelationships[targetUserId] = {
      ...existingRelationship,
      targetName: userRelationshipMemory.targetUserName,
      lastInteractionAt: nowIso(),
      recentTone: userRelationshipMemory.relationshipSummary,
      notes: [...existingRelationship.notes.slice(-4), userRelationshipMemory.impressionSummary, userRelationshipMemory.lastInteractionSummary],
    };
    relationshipChanges.push(`${userRelationshipMemory.targetUserName}: ${userRelationshipMemory.relationshipSummary}`);
    memoryWrites.push(`写入对 ${userRelationshipMemory.targetUserName} 的关系印象记忆`);
  }

  const activeConcernIds = nextConcerns.filter((concern) => concern.status === "active" && concern.intensity > 0.15).map((concern) => concern.id);
  const moodValence = round(clamp(nextConcerns.reduce((sum, concern) => sum + concern.valence * concern.intensity, 0) / Math.max(nextConcerns.length, 1), -1, 1));
  const moodArousal = round(clamp(nextConcerns.reduce((sum, concern) => sum + concern.arousal * concern.intensity, 0) / Math.max(nextConcerns.length, 1), 0, 1));

  runtimeChanges.push(`derivedMood -> valence ${moodValence}, arousal ${moodArousal}`);

  return {
    nextState: {
      ...state,
      concerns: nextConcerns,
      relationships: nextRelationships,
      shortTermMemory: shortTermMemory.slice(-20),
      longTermMemory: longTermMemory.slice(-30),
      relationshipMemory: relationshipMemory.slice(-80),
      runtime: {
        ...state.runtime,
        activeConcernIds,
        lastActiveAt: nowIso(),
        derivedMood: {
          valence: moodValence,
          arousal: moodArousal,
          label: moodValence < -0.25 ? "被旧事牵动，语气更轻" : moodValence > 0.25 ? "稍微放松" : "平稳克制",
        },
        signalProfiles: {
          ...state.runtime.signalProfiles,
          mood: {
            ...state.runtime.signalProfiles.mood,
            label: moodValence < -0.25 ? "被旧事牵动，语气更轻" : moodValence > 0.25 ? "稍微放松" : "平稳克制",
            summary:
              moodValence < -0.25
                ? "刚才的互动让某个具体心事浮上来，表层仍克制。"
                : moodValence > 0.25
                  ? "刚才的互动稍微缓和了她的表层状态。"
                  : "刚才的互动没有明显改变她的整体外显状态。",
            cognitiveNarrative:
              moodValence < -0.25
                ? "回复后旧事余波仍在，心理预算更集中在维持体面和守住边界上。"
                : moodValence > 0.25
                  ? "回复后她稍微放松，但关系边界仍然清楚地留在心里。"
                  : "回复后她保持平稳，后续反应仍主要取决于具体话题和关系对象。",
          },
          valence: {
            ...state.runtime.signalProfiles.valence,
            label: moodValence < -0.25 ? "局部偏负面" : moodValence > 0.25 ? "局部缓和" : "接近中性",
            cognitiveNarrative: "这是当前互动之后形成的局部情绪方向，不是她整个人的全局色彩。",
          },
          arousal: {
            ...state.runtime.signalProfiles.arousal,
            label: moodArousal > 0.45 ? "内在被牵动，外表压低" : "外表平稳，内部观察",
            cognitiveNarrative: moodArousal > 0.45 ? "她心里有波动，身体和注意力会先收紧，外在仍努力维持体面。" : "她没有明显被推高，主要处在观察和判断对方意图的状态。",
          },
        },
      },
    },
    stateDelta: {
      concernChanges,
      relationshipChanges,
      memoryWrites,
      runtimeChanges,
    },
  };
}

function normalizeStateUpdatePlan(result: unknown, fallback: StateUpdatePlan, state: CharacterState, event: EventInput): StateUpdatePlan {
  if (!isRecord(result)) return fallback;
  const knownConcernIds = new Set(state.concerns.map((concern) => concern.id));
  const concernUpdates = normalizeConcernUpdates(result.concernUpdates, fallback.concernUpdates, knownConcernIds);
  const relationshipUpdates = normalizeRelationshipUpdates(result.relationshipUpdates, fallback.relationshipUpdates);
  const userRelationshipMemory = normalizeUserRelationshipMemory(result.userRelationshipMemory, fallback.userRelationshipMemory, event);

  return {
    concernUpdates,
    relationshipUpdates,
    newConcerns: Array.isArray(result.newConcerns) ? result.newConcerns : fallback.newConcerns,
    userRelationshipMemory,
    internalStateNote:
      typeof result.internalStateNote === "string" && result.internalStateNote.trim()
        ? result.internalStateNote
        : typeof result.internal_state_note === "string" && result.internal_state_note.trim()
          ? result.internal_state_note
          : fallback.internalStateNote,
  };
}

function normalizeUserRelationshipMemory(value: unknown, fallback: StateUpdatePlan["userRelationshipMemory"], event: EventInput): StateUpdatePlan["userRelationshipMemory"] {
  const targetUserId = event.speakerId ?? fallback?.targetUserId ?? "unknown";
  const targetUserName = event.speakerName ?? fallback?.targetUserName ?? "Unknown";
  if (!isRecord(value)) return fallback ? { ...fallback, targetUserId, targetUserName } : undefined;

  const impressionSummary = normalizeNaturalText(value.impressionSummary, fallback?.impressionSummary ?? `${targetUserName}这次互动后仍处在待观察的位置。`);
  const relationshipSummary = normalizeNaturalText(value.relationshipSummary, fallback?.relationshipSummary ?? `她和${targetUserName}的关系还在形成中，会根据对方是否尊重边界继续调整。`);
  const lastInteractionSummary = normalizeNaturalText(value.lastInteractionSummary, fallback?.lastInteractionSummary ?? `本轮互动让她对${targetUserName}有了新的具体印象。`);
  const evidence = Array.isArray(value.evidence)
    ? value.evidence.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean).slice(0, 6)
    : fallback?.evidence ?? [];

  return {
    targetUserId,
    targetUserName,
    impressionSummary,
    relationshipSummary,
    evidence: evidence.length > 0 ? evidence : [`对方说：「${event.content}」`],
    lastInteractionSummary,
  };
}

function normalizeNaturalText(value: unknown, fallback: string) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return value.trim();
}

function normalizeConcernUpdates(value: unknown, fallback: StateUpdatePlan["concernUpdates"], knownConcernIds: Set<string>) {
  if (!Array.isArray(value)) return fallback;
  const normalized: StateUpdatePlan["concernUpdates"] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const concernId = typeof item.concernId === "string" ? item.concernId : "";
    if (!knownConcernIds.has(concernId)) continue;

    normalized.push({
      concernId,
      intensityDelta: normalizeOptionalNumber(item.intensityDelta, -1, 1),
      valenceDelta: normalizeOptionalNumber(item.valenceDelta, -2, 2),
      arousalDelta: normalizeOptionalNumber(item.arousalDelta, -1, 1),
      status: normalizeConcernStatus(item.status),
      note: typeof item.note === "string" && item.note.trim() ? item.note : "模型未给出明确状态变化说明。",
    });
  }

  return normalized;
}

function normalizeRelationshipUpdates(value: unknown, fallback: StateUpdatePlan["relationshipUpdates"]) {
  if (!Array.isArray(value)) return fallback;
  const normalized: StateUpdatePlan["relationshipUpdates"] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const targetId = typeof item.targetId === "string" && item.targetId.trim() ? item.targetId : "";
    if (!targetId) continue;

    normalized.push({
      targetId,
      familiarityDelta: normalizeOptionalNumber(item.familiarityDelta, -1, 1),
      trustDelta: normalizeOptionalNumber(item.trustDelta, -1, 1),
      affectionDelta: normalizeOptionalNumber(item.affectionDelta, -2, 2),
      tensionDelta: normalizeOptionalNumber(item.tensionDelta, -1, 1),
      note: typeof item.note === "string" && item.note.trim() ? item.note : "模型未给出明确关系变化说明。",
    });
  }

  return normalized;
}

function normalizeOptionalNumber(value: unknown, min: number, max: number) {
  return typeof value === "number" ? clamp(value, min, max) : undefined;
}

function normalizeConcernStatus(value: unknown): ConcernStatus | undefined {
  return value === "active" || value === "dormant" || value === "resolved" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
