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
): Promise<{ nextState: CharacterState; stateDelta: StateDelta; stateUpdate: CognitiveModuleTrace<StateUpdatePlan> }> {
  const stateUpdate = await planStateUpdates(state, event, replyOutput, context, llmConfig);
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
) {
  const activeConcern = state.concerns.find((concern) => concern.status === "active" && concern.triggers.some((trigger) => event.content.includes(trigger)));
  const targetId = event.speakerId ?? "user_b";
  const mockOutput: StateUpdatePlan = {
    concernUpdates: activeConcern
      ? [
          {
            concernId: activeConcern.id,
            intensityDelta: activeConcern.valence < 0 ? 0.05 : 0.02,
            arousalDelta: 0.06,
            note: `事件「${event.content}」和回复「${replyOutput.reply || "沉默"}」让「${activeConcern.title}」继续留在心里。`,
          },
        ]
      : [],
    relationshipUpdates: [
      {
        targetId,
        familiarityDelta: 0.01,
        tensionDelta: context.decision.responseMode === "short_avoidance" ? 0.02 : -0.01,
        note: "本轮互动被记录为一次轻微关系变化。",
      },
    ],
    newConcerns: [],
    internalStateNote: activeConcern
      ? `她没有把「${activeConcern.title}」完整说出口，只是在心里停了一下。`
      : "这次对话没有明显戳中她的心事。",
  };

  return runCognitiveModule<StateUpdatePlan>(
    {
      moduleName: "state_update",
      inputMode: "structured_context",
      outputMode: "structured_json",
      prompt: [
        "你是虚拟人大脑里的状态写回区。你不负责写台词，只负责根据刚才发生的事和她说出口的话，判断她内在状态如何变化。",
        `事件：${event.speakerName ?? "对方"}说「${event.content}」`,
        `她说出口的话：${replyOutput.reply || "她选择了沉默"}`,
        `事件评估：${context.appraisal.appraisalSummary}`,
        `浮现的记忆：${context.memoryRecall.longTermMemories.map((memory) => memory.summary).join("；") || "没有特别强的记忆"}`,
        `回应姿态：${context.decision.rationale}`,
        "请判断：哪些心事被加重或减轻、关系是否变化、是否产生新的心事、有没有没说出口但应该存入记忆的内心余波。",
      ].join("\n\n"),
      outputContract:
        "Return JSON: { concernUpdates: [{ concernId, intensityDelta, valenceDelta, arousalDelta, status, note }], relationshipUpdates: [{ targetId, familiarityDelta, trustDelta, affectionDelta, tensionDelta, note }], newConcerns: [], internalStateNote }",
    },
    llmConfig,
    mockOutput,
  );
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
      targetName: update.targetId,
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
            llmContext:
              moodValence < -0.25
                ? "回复后她仍在压住旧事带来的余波，后续表达应更短、更轻。"
                : moodValence > 0.25
                  ? "回复后她稍微放松，但仍会保留边界。"
                  : "回复后她保持平稳，继续根据具体话题调整。",
          },
          valence: {
            ...state.runtime.signalProfiles.valence,
            label: moodValence < -0.25 ? "局部偏负面" : moodValence > 0.25 ? "局部缓和" : "接近中性",
            llmContext: "这是对当前互动后的自然语言判断，不是全局分数；后续仍要看触发物和关系对象。",
          },
          arousal: {
            ...state.runtime.signalProfiles.arousal,
            label: moodArousal > 0.45 ? "内在被牵动，外表压低" : "外表平稳，内部观察",
            llmContext: moodArousal > 0.45 ? "她心里有波动，但会用短句和转移话题压住。" : "她没有明显被推高，可以自然但保留地回应。",
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
