import { CharacterState, EventInput, ShortTermMemory } from "../core/types";

const recentDialogueWindowMs = 6 * 60 * 60 * 1000;

export function selectRecentDialogueMemories(
  state: CharacterState,
  event: EventInput,
  limit = 10,
): ShortTermMemory[] {
  const eventTime = Date.parse(event.timestamp);
  const hasEventTime = Number.isFinite(eventTime);

  return state.shortTermMemory
    .filter((memory) => {
      if (!memory.speakerId && !memory.speakerName) return false;

      if (!hasEventTime) return true;
      const memoryTime = Date.parse(memory.timestamp);
      if (!Number.isFinite(memoryTime)) return true;
      const ageMs = eventTime - memoryTime;
      return ageMs >= 0 && ageMs <= recentDialogueWindowMs;
    })
    .slice(-limit);
}

export function formatRecentDialogueForPrompt(state: CharacterState, event: EventInput) {
  const memories = selectRecentDialogueMemories(state, event);
  if (memories.length === 0) return "最近几个小时没有直接上下文。";
  return memories.map((memory) => formatDialogueMemoryForPrompt(memory, state, event)).join("\n");
}

export function formatRecentSituationSummaryForPrompt(state: CharacterState, event: EventInput) {
  const eventTime = Date.parse(event.timestamp);
  const hasEventTime = Number.isFinite(eventTime);
  const sixHoursMs = recentDialogueWindowMs;
  const relationshipMemory = (state.relationshipMemory ?? []).find((memory) => memory.targetUserId === event.speakerId);
  const recentRelationshipHistory = relationshipMemory?.history
    .filter((item) => {
      if (!hasEventTime) return true;
      const createdAt = Date.parse(item.createdAt);
      return Number.isFinite(createdAt) && eventTime - createdAt >= 0 && eventTime - createdAt <= sixHoursMs;
    })
    .slice(-5)
    .map((item) => item.summary);

  const relationshipSummary = relationshipMemory
    ? [
        `她对${relationshipMemory.targetUserName}的印象：${relationshipMemory.impressionSummary}`,
        `当前关系感：${relationshipMemory.relationshipSummary}`,
        `最近一次关系余波：${relationshipMemory.lastInteractionSummary}`,
        recentRelationshipHistory?.length ? `过去6小时关系片段：${recentRelationshipHistory.join("；")}` : "",
      ]
        .filter(Boolean)
        .join("。")
    : "她对当前说话者还没有稳定的关系记忆，只能从最近几句和当下语气里判断距离。";

  const runtimeSummary = [
    `当前外显心情：${state.runtime.derivedMood.label}`,
    `注意焦点：${state.runtime.attentionFocus || "没有明确写入"}`,
    ...Object.values(state.runtime.signalProfiles).map((profile) =>
      [profile.label, profile.summary, profile.cognitiveNarrative].filter(Boolean).join("："),
    ),
  ].join("。");

  const sceneSummary = state.scene
    ? [
        `当前场景：${state.scene.title}`,
        state.scene.description,
        state.scene.cognitiveNarrative,
        state.location ? `当前位置：${state.location.label}，${state.location.region}，${state.location.motionState}` : "",
      ]
        .filter(Boolean)
        .join("。")
    : "当前没有明确场景，只能按对话现场和人物状态理解。";

  return ["过去6小时关系摘要：" + relationshipSummary, "过去6小时状态摘要：" + runtimeSummary, "过去6小时场景摘要：" + sceneSummary].join("\n");
}

export function formatDialogueMemoryForPrompt(
  memory: ShortTermMemory,
  state: CharacterState,
  event: EventInput,
) {
  const timing = formatRelativeDialogueTime(memory.timestamp, event.timestamp);
  const speaker =
    memory.speakerId === state.profile.id
      ? state.profile.name
      : event.speakerId && memory.speakerId === event.speakerId
        ? "当前说话者"
        : memory.speakerName
          ? `房间里的${memory.speakerName}`
          : "房间里的另一位说话者";
  return `${timing}，${speaker}说过：「${memory.content}」`;
}

export function formatRelativeDialogueTime(memoryTimestamp: string, eventTimestamp: string) {
  const memoryTime = Date.parse(memoryTimestamp);
  const eventTime = Date.parse(eventTimestamp);
  if (!Number.isFinite(memoryTime) || !Number.isFinite(eventTime)) return "先前";

  const ageMs = Math.max(0, eventTime - memoryTime);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  if (ageMs < 5 * minute) return "刚才";
  if (ageMs < hour) return "不久前";
  if (ageMs <= recentDialogueWindowMs) return "几个小时前";
  return "较早前";
}

export function stripReplyStageDirections(reply: string) {
  return reply
    .replace(/^\s*[（(][^（）()]{1,80}[）)]\s*/g, "")
    .replace(/\n\s*[（(][^（）()]{1,80}[）)]\s*/g, "\n")
    .replace(/^\s*[^：:\n]{1,12}[：:]\s*/, "")
    .trim();
}
