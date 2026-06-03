import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = mkdtempSync(resolve(tmpdir(), "virtual-human-flow-history-"));
const originalCwd = process.cwd();

try {
  process.chdir(tempRoot);
  const { readPersonaDossiers, updatePersonaDossierConversationState } = await import(pathToFileURL(resolve(repoRoot, "serverSupport.mjs")).href);

  const userA = { userId: 101, username: "alice", nickname: "Alice", isAdmin: false };
  const userB = { userId: 202, username: "bob", nickname: "Bob", isAdmin: false };
  const dossier = readPersonaDossiers(userA)[0];
  const privateMarker = `private-history-${Date.now()}`;
  const nextState = {
    ...dossier.state,
    runtime: {
      ...dossier.state.runtime,
      attentionFocus: privateMarker,
    },
    shortTermMemory: [
      ...(Array.isArray(dossier.state.shortTermMemory) ? dossier.state.shortTermMemory : []),
      {
        id: "private-short-term",
        eventId: "private-event",
        content: privateMarker,
        timestamp: new Date().toISOString(),
        salience: 0.8,
      },
    ],
    longTermMemory: [
      ...(Array.isArray(dossier.state.longTermMemory) ? dossier.state.longTermMemory : []),
      {
        id: "private-long-term",
        summary: privateMarker,
        relatedPeople: [userA.username],
        relatedConcerns: [],
        emotionalValence: 0,
        emotionalIntensity: 0.4,
        createdAt: new Date().toISOString(),
        importance: 0.7,
      },
    ],
  };

  const result = updatePersonaDossierConversationState(dossier.id, nextState, { userInput: privateMarker, personaOutput: "ok" }, userA);
  if (result.error) throw new Error(result.error);

  const userAState = readPersonaDossiers(userA).find((item) => item.id === dossier.id)?.state;
  const userBState = readPersonaDossiers(userB).find((item) => item.id === dossier.id)?.state;
  const globalState = readPersonaDossiers().find((item) => item.id === dossier.id)?.state;

  assertIncludesMarker(userAState, privateMarker, "user A should read their private conversation state");
  assertExcludesMarker(userBState, privateMarker, "user B must not read user A conversation state");
  assertExcludesMarker(globalState, privateMarker, "shared dossier must not contain user A conversation state");

  console.log("conversation history isolation verified");
} finally {
  process.chdir(originalCwd);
  rmSync(tempRoot, { recursive: true, force: true });
}

function assertIncludesMarker(state, marker, message) {
  if (!JSON.stringify(state).includes(marker)) {
    throw new Error(message);
  }
}

function assertExcludesMarker(state, marker, message) {
  if (JSON.stringify(state).includes(marker)) {
    throw new Error(message);
  }
}
