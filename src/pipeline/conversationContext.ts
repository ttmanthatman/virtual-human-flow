import { CharacterState, EventInput, ShortTermMemory } from "../core/types";

const recentDialogueWindowMs = 6 * 60 * 60 * 1000;

export function selectRecentDialogueMemories(
  state: CharacterState,
  event: EventInput,
  limit = 4,
): ShortTermMemory[] {
  const eventTime = Date.parse(event.timestamp);
  const hasEventTime = Number.isFinite(eventTime);
  const personaId = state.profile.id;

  return state.shortTermMemory
    .filter((memory) => {
      const sameDialogue =
        memory.speakerId === personaId ||
        (event.speakerId ? memory.speakerId === event.speakerId : false);
      if (!sameDialogue) return false;

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
        : memory.speakerName || "另一位说话者";
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
