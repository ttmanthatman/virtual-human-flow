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
  return messages.filter((message) => {
    if (message.messageType !== "mind_flow" || !message.transient) return true;
    return phase ? message.mindFlow?.phase !== phase : false;
  });
}

export function filterPersistableConversationMessages(messages: ChatMessage[]) {
  return messages.filter((message) => !message.transient && message.messageType !== "mind_flow");
}

function createMindFlowMessageId(frameId: string) {
  return `mind_flow_message_${frameId}`;
}
