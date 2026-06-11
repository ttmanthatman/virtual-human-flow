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
import { shouldApplyChildSafetyClarification, isChildSafetyClarification } from "./safetyContinuity";

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
  const { nextState, stateDelta } = commitStateUpdates(state, event, replyOutput, stateUpdate.output, context);
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
        "危险/触动/失态：危险强度 " +
          (context.appraisal.dangerState?.level ?? 0) +
          "；触动强度 " +
          (context.appraisal.emotionalImpact?.level ?? 0) +
          "；失态强度 " +
          (context.appraisal.composureRisk?.level ?? 0) +
          "；突破外壳强度 " +
          (context.appraisal.personaBreakRisk?.level ?? 0),
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
        "- userRelationshipMemory 必须合并本轮真实事件，不得只复述旧印象；如果本轮是噩耗、威胁、羞辱、伤害或足以让她崩溃的信息，印象、关系总结、证据和最近互动都必须写出这次冲击。",
        "- 如果本轮是在澄清孩子或女儿已经安全，状态写回要降低直接安全警报，但保留被戏弄后的愤怒、不信任和确认需求。",
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
    output: stabilizeStateUpdateForChildSafetyClarification(normalizeStateUpdatePlan(trace.output, mockOutput, state, event), state, event, context),
  };
}

function stabilizeStateUpdateForChildSafetyClarification(
  plan: StateUpdatePlan,
  state: CharacterState,
  event: EventInput,
  context: {
    appraisal: AppraisalResult;
    memoryRecall: MemoryRecallResult;
    decision: ResponseDecision;
  },
): StateUpdatePlan {
  if (!shouldApplyChildSafetyClarification(event, state)) return plan;

  const targetName = event.speakerName ?? "对方";
  const safetyNote = `${targetName}澄清孩子已经在家或安全，直接危险警报下降；她仍然愤怒、不信任，需要亲眼确认，也会记住对方刚才造成的惊吓。`;
  const childConcernIds = state.concerns
    .filter((concern) => /女儿|孩子|小孩|娃|闺女|儿子/.test([concern.title, concern.object, concern.description, concern.triggers.join("、")].filter(Boolean).join(" ")))
    .map((concern) => concern.id);
  const concernUpdates = mergeSafetyConcernUpdates(plan.concernUpdates, childConcernIds, safetyNote);

  return {
    ...plan,
    concernUpdates,
    userRelationshipMemory: stabilizeRelationshipMemoryForSafetyClarification(plan.userRelationshipMemory, event, safetyNote),
    internalStateNote: [plan.internalStateNote, safetyNote].filter(Boolean).join(" "),
    narrative: [plan.narrative, context.appraisal.narrative, safetyNote].filter(Boolean).join("\n"),
  };
}

function mergeSafetyConcernUpdates(updates: StateUpdatePlan["concernUpdates"], childConcernIds: string[], note: string) {
  if (childConcernIds.length === 0) return updates;
  const byId = new Map(updates.map((update) => [update.concernId, { ...update }]));
  for (const concernId of childConcernIds) {
    const existing = byId.get(concernId);
    byId.set(concernId, {
      concernId,
      intensityDelta: Math.min(existing?.intensityDelta ?? 0, -0.22),
      valenceDelta: Math.max(existing?.valenceDelta ?? 0, 0.22),
      arousalDelta: Math.min(existing?.arousalDelta ?? 0, -0.28),
      status: existing?.status ?? "active",
      note: [existing?.note, note].filter(Boolean).join(" "),
    });
  }
  return Array.from(byId.values());
}

function stabilizeRelationshipMemoryForSafetyClarification(
  memory: StateUpdatePlan["userRelationshipMemory"],
  event: EventInput,
  note: string,
): StateUpdatePlan["userRelationshipMemory"] {
  const targetUserId = event.speakerId ?? memory?.targetUserId ?? "unknown";
  const targetUserName = event.speakerName ?? memory?.targetUserName ?? "对方";
  const evidence = [`${targetUserName}本轮说：「${event.content}」`, ...(memory?.evidence ?? [])].filter(Boolean).slice(-6);

  return {
    targetUserId,
    targetUserName,
    impressionSummary: ensureMentionsCurrentEvent(
      memory?.impressionSummary ?? "",
      event.content,
      `${targetUserName}刚澄清孩子安全，直接危险暂时缓解，但她会把对方和惊吓、戏弄、不可靠联系在一起。`,
    ),
    relationshipSummary: ensureMentionsCurrentEvent(
      memory?.relationshipSummary ?? "",
      event.content,
      "安全事实被澄清后，关系没有恢复轻松；她仍然戒备、愤怒，需要确认对方没有继续耍她。",
    ),
    evidence,
    lastInteractionSummary: note,
  };
}

function commitStateUpdates(
  state: CharacterState,
  event: EventInput,
  replyOutput: ReplyOutput,
  stateUpdatePlan: StateUpdatePlan,
  context: {
    appraisal: AppraisalResult;
    memoryRecall: MemoryRecallResult;
    decision: ResponseDecision;
  },
): { nextState: CharacterState; stateDelta: StateDelta } {
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
    const impact = computeInteractionImpact(context);
    longTermMemory.push({
      id: makeId("ltm"),
      summary: stateUpdatePlan.internalStateNote,
      relatedPeople: [event.speakerId ?? "unknown"],
      relatedConcerns: Array.from(new Set([...stateUpdatePlan.concernUpdates.map((update) => update.concernId), ...context.appraisal.activatedConcerns.map((item) => item.concernId)])),
      emotionalValence: impact >= 0.7 ? -0.75 : stateUpdatePlan.concernUpdates.length > 0 ? -0.35 : 0,
      emotionalIntensity: impact >= 0.7 ? round(Math.max(0.72, impact)) : stateUpdatePlan.concernUpdates.length > 0 ? 0.55 : 0.2,
      createdAt: nowIso(),
      sourceEventId: event.id,
      importance: impact >= 0.7 ? round(Math.max(0.82, impact)) : stateUpdatePlan.concernUpdates.length > 0 ? 0.62 : 0.25,
    });
    memoryWrites.push("写入 internal_state_note 到长期记忆");
  }

  const relationshipMemory = [...(state.relationshipMemory ?? [])];
  const userRelationshipMemory = strengthenUserRelationshipMemoryForSevereEvent(stateUpdatePlan.userRelationshipMemory, event, replyOutput, context);
  if (userRelationshipMemory?.targetUserId) {
    const targetUserId = userRelationshipMemory.targetUserId;
    const existingIndex = relationshipMemory.findIndex((memory) => memory.targetUserId === targetUserId);
    const existingMemory = existingIndex >= 0 ? relationshipMemory[existingIndex] : undefined;
    const historyItem = {
      id: makeId("relationship_history"),
      summary: userRelationshipMemory.lastInteractionSummary,
      createdAt: nowIso(),
      sourceEventId: event.id,
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
  const moodFromConcerns = nextConcerns.reduce((sum, concern) => sum + concern.valence * concern.intensity, 0) / Math.max(nextConcerns.length, 1);
  const arousalFromConcerns = nextConcerns.reduce((sum, concern) => sum + concern.arousal * concern.intensity, 0) / Math.max(nextConcerns.length, 1);
  const impact = computeInteractionImpact(context, event);
  const moodValence = round(clamp(impact >= 0.7 ? Math.min(moodFromConcerns, -0.65) : moodFromConcerns, -1, 1));
  const moodArousal = round(clamp(impact >= 0.7 ? Math.max(arousalFromConcerns, 0.62) : arousalFromConcerns, 0, 1));
  const energyDrain = impact >= 0.7 ? 0.25 : moodValence < -0.25 ? 0.08 : 0.02;
  const energy = round(clamp(state.runtime.energy - energyDrain, 0.05, 1));
  const moodLabel = impact >= 0.7 ? "强烈震动，勉强压住" : moodValence < -0.25 ? "被旧事牵动，语气更轻" : moodValence > 0.25 ? "稍微放松" : "平稳克制";
  const energyProfile =
    impact >= 0.7
      ? {
          label: "能量被冲击压低",
          summary: "这轮互动消耗很大，她只能用剩下的力气维持外表。",
          considerations: ["重大事件余波压过普通社交", "身体和注意力都在省力"],
          cognitiveNarrative: "她不是平静，而是在把有限能量优先留给不失控和处理现实。",
        }
      : moodValence < -0.25
        ? {
            label: "能量偏低，继续硬撑",
            summary: "这轮话题牵动旧事，消耗了一部分回应余力。",
            considerations: ["旧事或关系边界被带起", "仍能维持简短表达"],
            cognitiveNarrative: "她还有回应能力，但会自然缩短解释，先保护自己的心理预算。",
          }
        : {
            label: "能量维持",
            summary: "这轮互动没有明显耗空她的精力。",
            considerations: ["状态主要随具体话题轻微起伏"],
            cognitiveNarrative: "她仍能按当前关系距离继续判断和回应。",
          };
  const valenceProfile =
    impact >= 0.7
      ? {
          label: "强烈负面",
          summary: "负面余波很重，普通闲聊也会被这层情绪压住。",
          considerations: ["重大事件仍占据注意力", "表面克制不代表内在平稳"],
          cognitiveNarrative: "这次互动的负面余波会压过普通闲聊和工作安排。",
        }
      : moodValence < -0.25
        ? {
            label: "局部偏负面",
            summary: "负面感受集中在被触动的对象或关系上，不是全局崩溃。",
            considerations: ["具体心事被带起", "仍能维持边界"],
            cognitiveNarrative: "这是当前互动之后形成的局部情绪方向，不是她整个人的全局色彩。",
          }
        : moodValence > 0.25
          ? {
              label: "局部缓和",
              summary: "这轮互动让她表层稍微松了一点。",
              considerations: ["对方没有继续越界", "回应后压力有所下降"],
              cognitiveNarrative: "缓和只发生在这一小段互动里，关系边界仍然保留。",
            }
          : {
              label: "接近中性",
              summary: "这轮互动没有明显把情绪推向负面或正面。",
              considerations: ["主要处在观察和判断"],
              cognitiveNarrative: "她的情绪方向保持克制，后续仍取决于话题和关系对象。",
            };
  const arousalProfile =
    impact >= 0.7
      ? {
          label: "内部警报，外部压住",
          summary: "身体和注意力已被强烈事件推高，但外表仍在硬压。",
          considerations: ["重大事件余波仍在", "控制感被迫消耗"],
          cognitiveNarrative: "她看起来可能没立刻爆发，但身体和注意力已经进入强烈应激。",
        }
      : moodArousal > 0.45
        ? {
            label: "内在被牵动，外表压低",
            summary: "她心里有波动，外在表达会压低音量和长度。",
            considerations: ["注意力短暂收紧", "仍努力维持体面"],
            cognitiveNarrative: "她心里有波动，身体和注意力会先收紧，外在仍努力维持体面。",
          }
        : {
            label: "外表平稳，内部观察",
            summary: "她没有明显被推高，主要在观察对方意图。",
            considerations: ["触动有限", "表达仍可控制"],
            cognitiveNarrative: "她没有明显被推高，主要处在观察和判断对方意图的状态。",
          };

  runtimeChanges.push(`energy -> ${energy}`);
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
        energy,
        activeConcernIds,
        lastActiveAt: nowIso(),
        derivedMood: {
          valence: moodValence,
          arousal: moodArousal,
          label: moodLabel,
        },
        signalProfiles: {
          ...state.runtime.signalProfiles,
          energy: energyProfile,
          mood: {
            label: moodLabel,
            summary:
              impact >= 0.7
                ? "刚才的互动造成强烈冲击，她只能勉强维持外表，不代表内在平稳。"
                : moodValence < -0.25
                  ? "刚才的互动让某个具体心事浮上来，表层仍克制。"
                  : moodValence > 0.25
                    ? "刚才的互动稍微缓和了她的表层状态。"
                    : "刚才的互动没有明显改变她的整体外显状态。",
            considerations:
              impact >= 0.7
                ? ["重大事件余波仍在", "外表克制不等于内在平稳"]
                : moodValence < -0.25
                  ? ["具体心事被带起", "仍在维持体面和边界"]
                  : moodValence > 0.25
                    ? ["表层压力略有下降", "关系边界仍在"]
                    : ["没有明显状态跃迁"],
            cognitiveNarrative:
              impact >= 0.7
                ? "她的注意力被冲击事件占住，身体和表达都在用力压制失控。"
                : moodValence < -0.25
                  ? "回复后旧事余波仍在，心理预算更集中在维持体面和守住边界上。"
                  : moodValence > 0.25
                    ? "回复后她稍微放松，但关系边界仍然清楚地留在心里。"
                    : "回复后她保持平稳，后续反应仍主要取决于具体话题和关系对象。",
          },
          valence: valenceProfile,
          arousal: arousalProfile,
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

function strengthenUserRelationshipMemoryForSevereEvent(
  memory: StateUpdatePlan["userRelationshipMemory"],
  event: EventInput,
  replyOutput: ReplyOutput,
  context: {
    appraisal: AppraisalResult;
    memoryRecall: MemoryRecallResult;
    decision: ResponseDecision;
  },
): StateUpdatePlan["userRelationshipMemory"] {
  if (memory && isChildSafetyClarification(event.content)) {
    return stabilizeRelationshipMemoryForSafetyClarification(
      memory,
      event,
      `${memory.targetUserName || event.speakerName || "对方"}澄清孩子已经在家或安全，直接危险暂时缓解，但惊吓和信任破裂仍留下余波。`,
    );
  }
  if (!memory || !isSevereInteraction(context)) return memory;

  const targetName = memory.targetUserName || event.speakerName || "这个用户";
  const currentEventEvidence = `${targetName}本轮说：「${event.content}」`;
  const replyEvidence = replyOutput.reply ? `她当时回应：「${replyOutput.reply}」` : "她当时没有能正常回应。";
  const severeAftermath = "这次互动带来了极端冲击，她暂时无法把对方和普通闲聊或工作配合放在同一个心理位置。";

  return {
    ...memory,
    impressionSummary: ensureMentionsCurrentEvent(
      memory.impressionSummary,
      event.content,
      `${targetName}这次带来足以让她崩溃的消息；旧有的普通印象被这次冲击盖过。`,
    ),
    relationshipSummary: ensureMentionsCurrentEvent(
      memory.relationshipSummary,
      event.content,
      `当前关系被本轮冲击推入高压和失衡，她很难立刻恢复到普通工作关系或轻松社交。`,
    ),
    evidence: [...memory.evidence.filter(Boolean), currentEventEvidence, replyEvidence].slice(-6),
    lastInteractionSummary: `${currentEventEvidence}；${replyEvidence}；${severeAftermath}`,
  };
}

function ensureMentionsCurrentEvent(text: string, eventContent: string, prefix: string) {
  const probe = eventContent.trim().slice(0, 8);
  if (probe && text.includes(probe)) return text;
  return `${prefix}${text ? ` ${text}` : ""}`;
}

function isSevereInteraction(context: {
  appraisal: AppraisalResult;
  memoryRecall: MemoryRecallResult;
  decision: ResponseDecision;
}) {
  return computeInteractionImpact(context) >= 0.7 || context.decision.shouldLoseComposure || context.decision.shouldBreakPersona;
}

function computeInteractionImpact(context: {
  appraisal: AppraisalResult;
  memoryRecall: MemoryRecallResult;
  decision: ResponseDecision;
}, event?: EventInput) {
  const rawImpact = Math.max(
    context.appraisal.dangerState?.level ?? 0,
    context.appraisal.emotionalImpact?.level ?? 0,
    context.appraisal.composureRisk?.level ?? 0,
    context.appraisal.personaBreakRisk?.level ?? 0,
    context.appraisal.eventSalience ?? 0,
    context.decision.shouldLoseComposure ? 0.75 : 0,
    context.decision.shouldBreakPersona ? 0.86 : 0,
  );
  return event && isChildSafetyClarification(event.content) ? Math.min(rawImpact, 0.58) : rawImpact;
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
