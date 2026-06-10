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
    deleteConversationAudit,
    exportConversationAudits,
    readConversationAudits,
    readConversationHistoryMessagesByKey,
    readConversationHistorySummaries,
    readPersonaDossiers,
    updatePersonaDossierConversationState,
  } = await import(pathToFileURL(resolve(repoRoot, "serverSupport.mjs")).href);

  const qoo = { userId: 701, username: "Qoo", nickname: "Qoo", isAdmin: false };
  const dossier = readPersonaDossiers(qoo)[0];
  const marker = `qoo-admin-history-${Date.now()}`;
  const conversationEventId = "event_admin_audit_delete";
  const userMessageId = "qoo-user-message";
  const personaMessageId = "persona-reply-message";
  appendConversationHistoryMessages(
    dossier.id,
    [
      {
        id: userMessageId,
        speaker: "user",
        speakerName: "Qoo",
        content: marker,
        timestamp: new Date().toISOString(),
      },
      {
        id: personaMessageId,
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

  const stateWithDeletedEvent = {
    ...dossier.state,
    shortTermMemory: [
      ...(dossier.state.shortTermMemory ?? []),
      {
        id: "stm-delete-user",
        timestamp: new Date().toISOString(),
        speakerId: "user:701",
        speakerName: "Qoo",
        content: marker,
        eventId: conversationEventId,
      },
      {
        id: "stm-delete-reply",
        timestamp: new Date().toISOString(),
        speakerId: dossier.state.profile.id,
        speakerName: dossier.state.profile.name,
        content: `reply ${marker}`,
        eventId: conversationEventId,
      },
    ],
    longTermMemory: [
      ...(dossier.state.longTermMemory ?? []),
      {
        id: "ltm-delete-event",
        summary: `deleted audit memory ${marker}`,
        relatedPeople: ["user:701"],
        relatedConcerns: [],
        emotionalValence: -0.5,
        emotionalIntensity: 0.8,
        createdAt: new Date().toISOString(),
        importance: 0.8,
        sourceEventId: conversationEventId,
      },
    ],
    relationshipMemory: [
      ...(dossier.state.relationshipMemory ?? []),
      {
        id: "relationship-delete-event",
        targetUserId: "user:701",
        targetUserName: "Qoo",
        impressionSummary: `impression ${marker}`,
        relationshipSummary: `relationship ${marker}`,
        evidence: [`Qoo said ${marker}`],
        lastInteractionSummary: `last ${marker}`,
        updatedAt: new Date().toISOString(),
        history: [
          {
            id: "relationship-history-delete-event",
            summary: `history ${marker}`,
            createdAt: new Date().toISOString(),
            sourceEventId: conversationEventId,
          },
        ],
      },
    ],
  };
  const stateWrite = updatePersonaDossierConversationState(
    dossier.id,
    stateWithDeletedEvent,
    { userInput: marker, personaOutput: `reply ${marker}` },
    qoo,
  );
  if (stateWrite.error) {
    throw new Error(`Expected global state write for audit delete fixture to succeed: ${stateWrite.error}`);
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

  const deletableAudit = appendConversationAudit(
    {
      dossierId: dossier.id,
      dossierTitle: dossier.title,
      conversationEventId,
      conversationHistoryMessageIds: [userMessageId, personaMessageId],
      userInput: marker,
      personaOutput: `reply ${marker}`,
      status: "completed",
      moduleCalls: [
        {
          id: "call-event-delete",
          step: "event",
          label: "事件",
          status: "completed",
          transport: "local",
          input: marker,
          output: JSON.stringify({ id: conversationEventId, content: marker }),
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
  if (allExport.scope !== "all" || allExport.count !== 3) {
    throw new Error("Expected full audit export to include every user's audit entries.");
  }
  if (!allExport.entries.some((entry) => entry.username === "Qoo") || !allExport.entries.some((entry) => entry.username === "Yuki")) {
    throw new Error("Expected full audit export to include all users.");
  }

  const deletion = deleteConversationAudit(deletableAudit.id);
  if (!deletion.deleted || deletion.artifacts?.historyMessagesRemoved !== 2) {
    throw new Error("Expected audit deletion to remove its persisted conversation history messages.");
  }

  const qooMessagesAfterDelete = readConversationHistoryMessagesByKey(dossier.id, qooSummary.key);
  if (JSON.stringify(qooMessagesAfterDelete).includes(marker)) {
    throw new Error("Expected deleted audit messages to be removed from admin-readable history.");
  }

  const dossierAfterDelete = readPersonaDossiers(qoo).find((item) => item.id === dossier.id);
  const stateAfterDelete = dossierAfterDelete?.state;
  if (JSON.stringify(stateAfterDelete?.shortTermMemory ?? []).includes(conversationEventId)) {
    throw new Error("Expected deleted audit event to be removed from short-term memory.");
  }
  if (JSON.stringify(stateAfterDelete?.longTermMemory ?? []).includes(marker)) {
    throw new Error("Expected deleted audit event to be removed from long-term memory.");
  }
  if (JSON.stringify(stateAfterDelete?.relationshipMemory ?? []).includes(marker)) {
    throw new Error("Expected deleted audit event to be removed from relationship memory.");
  }

  console.log("admin history and module audit verified");
} finally {
  process.chdir(originalCwd);
  rmSync(tempRoot, { recursive: true, force: true });
}
