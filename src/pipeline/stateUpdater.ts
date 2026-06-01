import { CharacterState, EventInput, LlmOutput, StateDelta } from "../core/types";
import { clamp, makeId, nowIso, round } from "../core/utils";

export function applyStateUpdates(state: CharacterState, event: EventInput, llmOutput: LlmOutput): { nextState: CharacterState; stateDelta: StateDelta } {
  const concernChanges: string[] = [];
  const relationshipChanges: string[] = [];
  const memoryWrites: string[] = [];
  const runtimeChanges: string[] = [];

  const nextConcerns = state.concerns.map((concern) => {
    const update = llmOutput.concernUpdates.find((candidate) => candidate.concernId === concern.id);
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
  for (const update of llmOutput.relationshipUpdates) {
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

  if (llmOutput.reply) {
    shortTermMemory.push({
      id: makeId("stm"),
      timestamp: nowIso(),
      speakerId: state.profile.id,
      speakerName: state.profile.name,
      content: llmOutput.reply,
      eventId: event.id,
    });
  }

  memoryWrites.push("写入本轮事件到短期记忆");
  if (llmOutput.reply) memoryWrites.push("写入角色回复到短期记忆");

  const longTermMemory = [...state.longTermMemory];
  if (llmOutput.internalStateNote) {
    longTermMemory.push({
      id: makeId("ltm"),
      summary: llmOutput.internalStateNote,
      relatedPeople: [event.speakerId ?? "unknown"],
      relatedConcerns: llmOutput.concernUpdates.map((update) => update.concernId),
      emotionalValence: llmOutput.concernUpdates.length > 0 ? -0.35 : 0,
      emotionalIntensity: llmOutput.concernUpdates.length > 0 ? 0.55 : 0.2,
      createdAt: nowIso(),
      importance: llmOutput.concernUpdates.length > 0 ? 0.62 : 0.25,
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
