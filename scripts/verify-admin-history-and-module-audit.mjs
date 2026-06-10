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
    exportConversationAudits,
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

  const yuki = { userId: 702, username: "Yuki", nickname: "Yuki", isAdmin: false };
  appendConversationAudit(
    {
      dossierId: dossier.id,
      dossierTitle: dossier.title,
      userInput: "另一个用户的输入",
      personaOutput: "另一个用户的输出",
      status: "completed",
      moduleCalls: [],
    },
    yuki,
  );

  const audits = readConversationAudits(20);
  const audit = audits.find((entry) => entry.username === "Qoo" && JSON.stringify(entry.moduleCalls).includes(moduleCallOutput));
  if (!audit) {
    throw new Error("Expected conversation audit to preserve module calls.");
  }

  const selectedExport = exportConversationAudits({ ids: [audit.id, "missing-audit-id"] });
  if (selectedExport.scope !== "selected" || selectedExport.count !== 1 || selectedExport.entries[0]?.id !== audit.id) {
    throw new Error("Expected selected audit export to include only requested matching entries.");
  }
  if (!selectedExport.missingIds.includes("missing-audit-id")) {
    throw new Error("Expected selected audit export to report missing requested ids.");
  }

  const allExport = exportConversationAudits();
  if (allExport.scope !== "all" || allExport.count !== 2) {
    throw new Error("Expected full audit export to include every user's audit entries.");
  }
  if (!allExport.entries.some((entry) => entry.username === "Qoo") || !allExport.entries.some((entry) => entry.username === "Yuki")) {
    throw new Error("Expected full audit export to include all users.");
  }

  console.log("admin history and module audit verified");
} finally {
  process.chdir(originalCwd);
  rmSync(tempRoot, { recursive: true, force: true });
}
