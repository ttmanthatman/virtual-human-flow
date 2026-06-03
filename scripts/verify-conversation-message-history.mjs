import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = mkdtempSync(resolve(tmpdir(), "virtual-human-flow-message-history-"));
const originalCwd = process.cwd();

try {
  process.chdir(tempRoot);
  const { appendConversationHistoryMessages, readConversationHistoryMessages, readPersonaDossiers } = await import(
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
      content: marker,
      timestamp: new Date().toISOString(),
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

  assertContains(readConversationHistoryMessages(firstDossier.id, userA), marker, "same user and dossier should load saved messages");
  assertNotContains(readConversationHistoryMessages(secondDossier.id, userA), marker, "different dossier should not load saved messages");
  assertNotContains(readConversationHistoryMessages(firstDossier.id, userB), marker, "different user should not load saved messages");

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
