import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = mkdtempSync(resolve(tmpdir(), "virtual-human-flow-admin-history-"));
const originalCwd = process.cwd();

try {
  process.chdir(tempRoot);
  const {
    appendConversationAudit,
    appendConversationHistoryMessages,
    readConversationAudits,
    readConversationHistoryMessagesByKey,
    readConversationHistorySummaries,
    readPersonaDossiers,
  } = await import(pathToFileURL(resolve(repoRoot, "serverSupport.mjs")).href);

  const qoo = { userId: 701, username: "Qoo", nickname: "Qoo", isAdmin: false };
  const dossier = readPersonaDossiers(qoo)[0];
  const marker = `qoo-admin-history-${Date.now()}`;
  appendConversationHistoryMessages(
    dossier.id,
    [
      {
        id: "qoo-user-message",
        speaker: "user",
        speakerName: "Qoo",
        content: marker,
        timestamp: new Date().toISOString(),
      },
      {
        id: "persona-reply-message",
        speaker: "persona",
        speakerName: dossier.state.profile.name,
        content: `reply ${marker}`,
        timestamp: new Date().toISOString(),
      },
    ],
    qoo,
  );

  const summaries = readConversationHistorySummaries(dossier.id);
  const qooSummary = summaries.find((summary) => summary.username === "Qoo");
  if (!qooSummary) {
    throw new Error("Expected admin history summaries to include Qoo.");
  }

  const qooMessages = readConversationHistoryMessagesByKey(dossier.id, qooSummary.key);
  if (!JSON.stringify(qooMessages).includes(marker)) {
    throw new Error("Expected admin history reader to return Qoo messages for the dossier.");
  }

  const moduleCallOutput = `module-call-${Date.now()}`;
  appendConversationAudit(
    {
      dossierId: dossier.id,
      dossierTitle: dossier.title,
      userInput: "用户问是否一起吃饭",
      personaOutput: "角色答应先看看时间",
      status: "completed",
      moduleCalls: [
        {
          id: "call-state-update",
          step: "stateUpdate",
          label: "状态更新",
          status: "completed",
          transport: "external_llm",
          input: "state update input",
          output: moduleCallOutput,
        },
      ],
    },
    qoo,
  );

  const audits = readConversationAudits(20);
  const audit = audits.find((entry) => entry.username === "Qoo" && JSON.stringify(entry.moduleCalls).includes(moduleCallOutput));
  if (!audit) {
    throw new Error("Expected conversation audit to preserve module calls.");
  }

  console.log("admin history and module audit verified");
} finally {
  process.chdir(originalCwd);
  rmSync(tempRoot, { recursive: true, force: true });
}
