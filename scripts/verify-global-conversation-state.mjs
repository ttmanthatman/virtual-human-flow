import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = mkdtempSync(resolve(tmpdir(), "virtual-human-flow-global-state-"));
const originalCwd = process.cwd();

try {
  process.chdir(tempRoot);
  const {
    appendConversationHistoryMessages,
    readConversationHistoryMessages,
    readPersonaDossiers,
    updatePersonaDossierConversationState,
  } = await import(pathToFileURL(resolve(repoRoot, "serverSupport.mjs")).href);

  const userA = { userId: 101, username: "alice", nickname: "Alice", isAdmin: false };
  const userB = { userId: 202, username: "bob", nickname: "Bob", isAdmin: false };
  const dossier = readPersonaDossiers(userA)[0];
  const marker = `global-conversation-state-${Date.now()}`;
  const now = new Date().toISOString();
  const nextState = {
    ...dossier.state,
    runtime: {
      ...dossier.state.runtime,
      attentionFocus: marker,
      lastActiveAt: now,
    },
    scene: {
      ...dossier.state.scene,
      title: `同城回家路上 ${marker}`,
      description: `根据这句对话，人物开始在同城回家路上移动：${marker}`,
      interactionPressure: "这次场景变换来自当前对话触发，但仍受地理位置和人物设定限制。",
    },
    location: {
      ...dossier.state.location,
      label: `回家路上 ${marker}`,
      address: "郑州市内回家路线",
      region: "郑州市",
      speedKmh: 4,
      headingLabel: "前往住处",
      motionState: "walking",
      updatedAt: now,
      source: "temporal_progression",
      mapContext: {
        ...(dossier.state.location?.mapContext ?? {
          nearbyRoads: [],
          nearbyPlaces: [],
          nearbyBuildings: [],
          environmentSummary: "",
          source: "temporal_progression",
          resolvedAt: now,
        }),
        environmentSummary: marker,
        source: "temporal_progression",
        resolvedAt: now,
      },
    },
    longTermMemory: [
      ...(Array.isArray(dossier.state.longTermMemory) ? dossier.state.longTermMemory : []),
      {
        id: "global-long-term",
        summary: marker,
        relatedPeople: [userA.username],
        relatedConcerns: [],
        emotionalValence: 0,
        emotionalIntensity: 0.4,
        createdAt: now,
        importance: 0.7,
      },
    ],
  };

  const result = updatePersonaDossierConversationState(dossier.id, nextState, { userInput: marker, personaOutput: "ok" }, userA);
  if (result.error) throw new Error(result.error);

  const userAState = readPersonaDossiers(userA).find((item) => item.id === dossier.id)?.state;
  const userBState = readPersonaDossiers(userB).find((item) => item.id === dossier.id)?.state;
  const globalState = readPersonaDossiers().find((item) => item.id === dossier.id)?.state;

  assertIncludesMarker(userAState, marker, "user A should read the global conversation state");
  assertIncludesMarker(userBState, marker, "user B should read the same persona's global conversation state");
  assertIncludesMarker(globalState, marker, "shared global read should include the persisted conversation state");

  const historyMarker = `private-message-${Date.now()}`;
  appendConversationHistoryMessages(
    dossier.id,
    [
      {
        id: "user-message",
        speaker: "user",
        speakerName: "Alice",
        content: historyMarker,
        timestamp: now,
      },
    ],
    userA,
  );

  assertIncludesMarker(readConversationHistoryMessages(dossier.id, userA), historyMarker, "same user should load saved messages");
  assertExcludesMarker(readConversationHistoryMessages(dossier.id, userB), historyMarker, "different user should not load private chat messages");

  console.log("global conversation state and private message history verified");
} finally {
  process.chdir(originalCwd);
  rmSync(tempRoot, { recursive: true, force: true });
}

function assertIncludesMarker(value, marker, message) {
  if (!JSON.stringify(value).includes(marker)) {
    throw new Error(message);
  }
}

function assertExcludesMarker(value, marker, message) {
  if (JSON.stringify(value).includes(marker)) {
    throw new Error(message);
  }
}
