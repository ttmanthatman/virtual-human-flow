import {
  AppraisalResult,
  CharacterState,
  CognitiveModuleTrace,
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
import { deriveCurrentActivityFromStateUpdateNarrative } from "./temporalScene";

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
  const eventContentWithChannel = formatEventContentWithChannel(event);
  const mockOutput: StateUpdatePlan = {
    concernUpdates: [],
    relationshipUpdates: [],
    newConcerns: [],
    userRelationshipMemory: {
      targetUserId: targetId,
      targetUserName: targetName,
      impressionSummary: targetName + "这次互动后，她在心里有了一个初步的印象。",
      relationshipSummary: "她和" + targetName + "的关系还在形成中。",
      evidence: ["对方说：" + eventContentWithChannel],
      lastInteractionSummary: "本轮互动让她对" + targetName + "有了更具体的判断。",
    },
    internalStateNote: "这次对话后，她的内心状态没有明显变化。",
  };

  const trace = await runCognitiveModule<string>(
    {
      moduleName: "state_update",
      inputMode: "natural_language",
      outputMode: "natural_language",
      prompt: [
        "你是虚拟人大脑里的状态写回区。你根据刚发生的事和她的话，判断她内在状态的变化。",
        "请只用自然语言输出，不要 JSON，不要字段名，不要代码式 delta。",
        "不要用关键词触发。请综合事件评估、记忆浮现、回应决策、她实际说出的话、最近关系和当前场景，判断这轮互动之后哪些东西应该留在短期余波、哪些值得成为长期记忆。",
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
        ...state.concerns.map((concern) => concern.title + "：" + concern.description),
        "",
        "请自然语言说明：她说完后身体/情绪/注意力有什么余波；她对当前说话者的印象和关系感有没有改变；哪些内容只该留在短期，哪些值得写成长期记忆；如果不值得长期写入，也请说明为什么。",
      ].join("\n"),
      outputContract: "自然语言状态写回判断，不使用 JSON、字段名、数值 delta 或代码式结构。",
    },
    llmConfig,
    mockOutput.internalStateNote,
    { onStream },
  );

  return {
    ...trace,
    output: stateUpdatePlanFromNarrative(trace.output, mockOutput, event),
  };
}

function stateUpdatePlanFromNarrative(narrative: string, fallback: StateUpdatePlan, event: EventInput): StateUpdatePlan {
  const text = typeof narrative === "string" && narrative.trim() ? narrative.trim() : fallback.internalStateNote;
  const targetUserId = event.speakerId ?? fallback.userRelationshipMemory?.targetUserId ?? "unknown";
  const targetUserName = event.speakerName ?? fallback.userRelationshipMemory?.targetUserName ?? "当前对话者";
  return {
    ...fallback,
    narrative: text,
    concernUpdates: [],
    relationshipUpdates: [],
    newConcerns: [],
    userRelationshipMemory: {
      targetUserId,
      targetUserName,
      impressionSummary: `${targetUserName}在这轮互动里留下的印象需要结合自然语言状态写回理解：${text}`,
      relationshipSummary: `她和${targetUserName}的关系感在这轮互动后被重新解释，不能只沿用旧标签：${text}`,
      evidence: [`${targetUserName}本轮说：「${formatEventContentWithChannel(event)}」`],
      lastInteractionSummary: text,
    },
    internalStateNote: text,
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
  const eventContentWithChannel = formatEventContentWithChannel(event);

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
      content: eventContentWithChannel,
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
  const userRelationshipMemory = strengthenUserRelationshipMemoryForCurrentEvent(stateUpdatePlan.userRelationshipMemory, event, replyOutput, context);
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
  const nextCurrentActivity = deriveCurrentActivityFromStateUpdateNarrative(state, event, replyOutput, stateUpdatePlan.narrative ?? stateUpdatePlan.internalStateNote);
  if (nextCurrentActivity) runtimeChanges.push(`currentActivity -> ${nextCurrentActivity.summary}`);
  const moodFromConcerns = nextConcerns.reduce((sum, concern) => sum + concern.valence * concern.intensity, 0) / Math.max(nextConcerns.length, 1);
  const arousalFromConcerns = nextConcerns.reduce((sum, concern) => sum + concern.arousal * concern.intensity, 0) / Math.max(nextConcerns.length, 1);
  const impact = computeInteractionImpact(context);
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
        currentActivity: nextCurrentActivity ?? state.runtime.currentActivity,
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

function strengthenUserRelationshipMemoryForCurrentEvent(
  memory: StateUpdatePlan["userRelationshipMemory"],
  event: EventInput,
  replyOutput: ReplyOutput,
  context: {
    appraisal: AppraisalResult;
    memoryRecall: MemoryRecallResult;
    decision: ResponseDecision;
  },
): StateUpdatePlan["userRelationshipMemory"] {
  if (!memory) return memory;

  const targetName = memory.targetUserName || event.speakerName || "这个用户";
  const currentEventEvidence = `${targetName}本轮说：「${formatEventContentWithChannel(event)}」`;
  const replyEvidence = replyOutput.reply ? `她当时回应：「${replyOutput.reply}」` : "她当时没有能正常回应。";
  const naturalAftermath = [
    "这次关系印象应承接 State Update 的自然语言判断。",
    context.appraisal.narrative ? `事件评估里已经形成的理解是：${context.appraisal.narrative}` : "",
    context.memoryRecall.narrative ? `记忆召回里浮现的是：${context.memoryRecall.narrative}` : "",
    context.decision.narrative ? `回应决策里形成的倾向是：${context.decision.narrative}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    ...memory,
    impressionSummary: ensureMentionsCurrentEvent(
      memory.impressionSummary,
      event.content,
      `${targetName}这轮互动改变了她对对方的即时印象。`,
    ),
    relationshipSummary: ensureMentionsCurrentEvent(
      memory.relationshipSummary,
      event.content,
      "当前关系需要承接这一轮实际发生的推进、退让、越界或澄清，而不是沿用旧关系标签。",
    ),
    evidence: [...memory.evidence.filter(Boolean), currentEventEvidence, replyEvidence].slice(-6),
    lastInteractionSummary: `${currentEventEvidence}；${replyEvidence}；${naturalAftermath}`,
  };
}

function formatEventContentWithChannel(event: EventInput) {
  return event.channelLabel ? `【${event.channelLabel}】${event.content}` : event.content;
}

function ensureMentionsCurrentEvent(text: string, eventContent: string, prefix: string) {
  const probe = eventContent.trim().slice(0, 8);
  if (probe && text.includes(probe)) return text;
  return `${prefix}${text ? ` ${text}` : ""}`;
}

function computeInteractionImpact(context: {
  appraisal: AppraisalResult;
  memoryRecall: MemoryRecallResult;
  decision: ResponseDecision;
}) {
  const rawImpact = Math.max(
    context.appraisal.dangerState?.level ?? 0,
    context.appraisal.emotionalImpact?.level ?? 0,
    context.appraisal.composureRisk?.level ?? 0,
    context.appraisal.personaBreakRisk?.level ?? 0,
    context.appraisal.eventSalience ?? 0,
    context.decision.shouldLoseComposure ? 0.75 : 0,
    context.decision.shouldBreakPersona ? 0.86 : 0,
  );
  return rawImpact;
}
