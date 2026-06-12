import { ChatMessage, MindFlowFrame, MindFlowPhase } from "../core/types";

export function createMindFlowChatMessage(frame: MindFlowFrame): ChatMessage {
  return {
    id: createMindFlowMessageId(frame.id),
    speaker: "system",
    speakerName: frame.phase === "pre_speech" ? "心理流" : "余波",
    content: `${frame.title}：${frame.content}`,
    timestamp: frame.timestamp,
    messageType: "mind_flow",
    transient: true,
    collapsed: false,
    details: [frame.content],
    mindFlow: {
      id: frame.id,
      phase: frame.phase,
      kind: frame.kind,
      status: frame.status,
    },
  };
}

export function upsertMindFlowChatMessage(messages: ChatMessage[], frame: MindFlowFrame) {
  const nextMessage = createMindFlowChatMessage(frame);
  const index = messages.findIndex((message) => message.id === nextMessage.id);
  if (index < 0) return [...messages, nextMessage];
  return messages.map((message, messageIndex) => (messageIndex === index ? { ...message, ...nextMessage } : message));
}

export function foldTransientMindFlowMessages(messages: ChatMessage[], phase?: MindFlowPhase) {
  const targetMessages = messages.filter((message) => message.messageType === "mind_flow" && message.transient && (!phase || message.mindFlow?.phase === phase));
  if (targetMessages.length === 0) return messages;

  const targetIds = new Set(targetMessages.map((message) => message.id));
  const groupedByPhase = new Map<MindFlowPhase, ChatMessage[]>();
  for (const message of targetMessages) {
    const targetPhase = message.mindFlow?.phase ?? "pre_speech";
    groupedByPhase.set(targetPhase, [...(groupedByPhase.get(targetPhase) ?? []), message]);
  }

  const foldedMessages = new Map<string, ChatMessage>();
  for (const [targetPhase, phaseMessages] of groupedByPhase) {
    const first = phaseMessages[0];
    const last = phaseMessages.at(-1) ?? first;
    const details = phaseMessages.map((message) => message.content).filter(Boolean);
    foldedMessages.set(first.id, {
      ...last,
      id: `folded_${targetPhase}_${first.id}`,
      speakerName: targetPhase === "pre_speech" ? "心理流" : "余波",
      content: `${targetPhase === "pre_speech" ? "说话前心理流" : "说话后余波"}已折叠（${details.length} 条）`,
      timestamp: last.timestamp,
      transient: false,
      collapsed: true,
      details,
      mindFlow: {
        ...(last.mindFlow ?? first.mindFlow!),
        phase: targetPhase,
        status: "completed",
      },
    });
  }

  const next: ChatMessage[] = [];
  for (const message of messages) {
    if (!targetIds.has(message.id)) {
      next.push(message);
      continue;
    }
    const folded = foldedMessages.get(message.id);
    if (folded) next.push(folded);
  }
  return next;
}

export function filterPersistableConversationMessages(messages: ChatMessage[]) {
  return messages.filter((message) => !message.transient && message.messageType !== "mind_flow");
}

function createMindFlowMessageId(frameId: string) {
  return `mind_flow_message_${frameId}`;
}
