import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = mkdtempSync(resolve(tmpdir(), "virtual-human-flow-message-history-"));
const originalCwd = process.cwd();

try {
  process.chdir(tempRoot);
  const { appendConversationHistoryMessages, readConversationHistoryMessages, readConversationRoomMessages, readPersonaDossiers } = await import(
    pathToFileURL(resolve(repoRoot, "serverSupport.mjs")).href
  );

  const userA = { userId: 301, username: "history-alice", nickname: "Alice", isAdmin: false };
  const userB = { userId: 302, username: "history-bob", nickname: "Bob", isAdmin: false };
  const [firstDossier, secondDossier] = readPersonaDossiers(userA);
  const marker = `message-history-${Date.now()}`;
  const messages = [
    {
      id: "user-message",
      speaker: "user",
      speakerName: "Alice",
      channel: "wechat",
      channelLabel: "微信",
      content: marker,
      timestamp: new Date().toISOString(),
    },
    {
      id: "recorded-mind-flow",
      speaker: "system",
      speakerName: "心理流",
      channelLabel: "心理记录",
      content: `mind flow ${marker}`,
      timestamp: new Date().toISOString(),
      messageType: "mind_flow",
      collapsed: true,
      details: ["场景先动了一下", "心里先有了判断"],
    },
    {
      id: "persona-message",
      speaker: "persona",
      speakerName: firstDossier.state.profile.name,
      content: `reply ${marker}`,
      timestamp: new Date().toISOString(),
    },
  ];

  appendConversationHistoryMessages(firstDossier.id, messages, userA);
  appendConversationHistoryMessages(
    firstDossier.id,
    [
      {
        id: "bob-user-message",
        speaker: "user",
        speakerName: "Bob",
        content: `bob sees ${marker}`,
        timestamp: new Date().toISOString(),
      },
      {
        id: "room-event-activity",
        speaker: "system",
        speakerName: "现场事件",
        content: `room event ${marker}`,
        timestamp: new Date().toISOString(),
        channel: "scene_event",
        channelLabel: "现场事件",
        messageType: "event_activity",
        collapsed: true,
        details: ["心理活动：听见杯子落地", "位移：留在当前房间"],
      },
    ],
    userB,
  );

  assertContains(readConversationHistoryMessages(firstDossier.id, userA), marker, "same user and dossier should load saved messages");
  assertNotContains(readConversationHistoryMessages(secondDossier.id, userA), marker, "different dossier should not load saved messages");
  assertNotContains(readConversationHistoryMessages(firstDossier.id, userB), `reply ${marker}`, "different user should not load another user's private replies");
  assertContains(readConversationRoomMessages(firstDossier.id), marker, "room history should include Alice messages");
  assertContains(readConversationRoomMessages(firstDossier.id), `bob sees ${marker}`, "room history should include Bob messages");
  const roomMessages = readConversationRoomMessages(firstDossier.id);
  const eventActivity = roomMessages.find((message) => message.id === "room-event-activity");
  if (!eventActivity || eventActivity.messageType !== "event_activity" || eventActivity.channel !== "scene_event" || eventActivity.channelLabel !== "现场事件" || !Array.isArray(eventActivity.details) || eventActivity.details.length < 2) {
    throw new Error("Expected room history to preserve event activity collapse details.");
  }
  const recordedMindFlow = roomMessages.find((message) => message.id === "recorded-mind-flow");
  if (!recordedMindFlow || recordedMindFlow.messageType !== "mind_flow" || recordedMindFlow.channelLabel !== "心理记录" || !Array.isArray(recordedMindFlow.details) || recordedMindFlow.details.length < 2) {
    throw new Error("Expected room history to preserve recorded mind-flow cards.");
  }
  const aliceMessage = roomMessages.find((message) => message.id === "user-message");
  if (!aliceMessage || aliceMessage.channel !== "wechat" || aliceMessage.channelLabel !== "微信") {
    throw new Error("Expected room history to preserve user message channel metadata.");
  }

  console.log("conversation message history verified");
} finally {
  process.chdir(originalCwd);
  rmSync(tempRoot, { recursive: true, force: true });
}

function assertContains(messages, marker, message) {
  if (!JSON.stringify(messages).includes(marker)) {
    throw new Error(message);
  }
}

function assertNotContains(messages, marker, message) {
  if (JSON.stringify(messages).includes(marker)) {
    throw new Error(message);
  }
}
