import { randomBytes, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { builtinPersonaDossiers } from "./builtinPersonaDossiers.mjs";

const rootDir = process.cwd();
const liaoChatroomOrigin = process.env.LIAO_CHATROOM_ORIGIN || "";
const liaoChatroomLoginPaths = uniqueStrings([process.env.LIAO_CHATROOM_LOGIN_PATH || "/api/auth/login", "/api/login"]);
const personaDossierStorePath = resolve(rootDir, ".persona-dossiers.local.json");
const conversationStateStorePath = resolve(rootDir, ".conversation-states.local.json");
const conversationHistoryStorePath = resolve(rootDir, ".conversation-histories.local.json");
const conversationAuditStorePath = resolve(rootDir, ".conversation-audits.local.json");
const authSessionTtlMs = 7 * 24 * 60 * 60 * 1000;
const maxAuditEntries = 1000;
const maxConversationHistoryMessages = 240;
const maxModuleCallsPerAudit = 12;
const maxModuleCallTextLength = 20000;
const appUpdateDefaultBranch = "main";
const appUpdateCommandTimeoutMs = 180000;
const appUpdateMaxPendingCommits = 8;
const appUpdateMaxCommitBodyLength = 520;
const authSessions = new Map();

export function createLocalSession(liaoUser) {
  pruneExpiredSessions();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + authSessionTtlMs;
  const userPayload = normalizeLiaoUserPayload(liaoUser);
  const user = {
    userId: userPayload.userId,
    username: userPayload.username,
    nickname: userPayload.nickname,
    avatar: userPayload.avatar,
    isAdmin: userPayload.isAdmin,
  };

  authSessions.set(token, {
    token,
    user,
    expiresAt,
  });
  return { token, user, expiresAt };
}

export function destroyLocalSession(token) {
  if (token) authSessions.delete(token);
}

export function getRequestSession(request) {
  const token = readBearerToken(request);
  if (!token) return undefined;
  const session = authSessions.get(token);
  if (!session) return undefined;
  if (session.expiresAt < Date.now()) {
    authSessions.delete(token);
    return undefined;
  }
  return session;
}

export function requireSession(request, response) {
  const session = getRequestSession(request);
  if (!session) {
    sendJson(response, 401, { error: "请先登录" });
    return undefined;
  }
  return session;
}

export function requireAdminSession(request, response) {
  const session = requireSession(request, response);
  if (!session) return undefined;
  if (!session.user.isAdmin) {
    sendJson(response, 403, { error: "只有管理员可以执行此操作" });
    return undefined;
  }
  return session;
}

export async function loginWithLiaoChatroom(username, password) {
  if (!liaoChatroomOrigin) {
    throw new Error("登录服务尚未配置");
  }

  let lastFailure;
  for (const loginPath of liaoChatroomLoginPaths) {
    const result = await requestLiaoLogin(loginPath, username, password);
    if (result.ok) return result.user;
    lastFailure = result;
    if (result.status !== 404 && result.status !== 405) break;
  }

  throw new Error(lastFailure?.message || "登录失败");
}

export function readPersonaDossiers(user) {
  const dossiers = readBasePersonaDossiers();
  return applyGlobalConversationStates(dossiers);
}

function readBasePersonaDossiers() {
  const store = readPersonaDossierStore();
  const storedDossiers = store.dossiers;
  const deletedBuiltinIds = new Set(Array.isArray(store.deletedBuiltinDossierIds) ? store.deletedBuiltinDossierIds : []);
  const storedById = new Map(storedDossiers.map((dossier) => [dossier.id, dossier]));
  const builtinItems = builtinPersonaDossiers
    .filter((dossier) => !deletedBuiltinIds.has(dossier.id))
    .map((dossier) => storedById.get(dossier.id) ?? dossier);
  const builtinIds = new Set(builtinPersonaDossiers.map((dossier) => dossier.id));
  const customItems = storedDossiers.filter((dossier) => !builtinIds.has(dossier.id));
  return [...builtinItems, ...customItems];
}

export function upsertPersonaDossier(dossier, user) {
  const store = readPersonaDossierStore();
  const dossiers = store.dossiers;
  const deletedBuiltinDossierIds = store.deletedBuiltinDossierIds;
  const now = new Date().toISOString();
  const safeDossier = {
    ...dossier,
    groupName: typeof dossier.groupName === "string" && dossier.groupName.trim() ? dossier.groupName.trim() : "未分组",
    previewStatus: dossier.previewSummary ? "ready" : dossier.previewStatus ?? "pending",
    updatedAt: now,
    createdAt: typeof dossier.createdAt === "string" ? dossier.createdAt : now,
    isBuiltin: Boolean(dossier.isBuiltin),
    ownerUserId: user.userId,
    ownerUsername: user.username,
  };
  const index = dossiers.findIndex((item) => item.id === safeDossier.id);
  const nextDossiers = index >= 0 ? dossiers.map((item, itemIndex) => (itemIndex === index ? safeDossier : item)) : [...dossiers, safeDossier];
  writeJsonFile(personaDossierStorePath, {
    dossiers: nextDossiers,
    deletedBuiltinDossierIds: deletedBuiltinDossierIds.filter((id) => id !== safeDossier.id),
  });
  return safeDossier;
}

export function deletePersonaDossier(dossierId) {
  const store = readPersonaDossierStore();
  const dossiers = store.dossiers;
  const deletedBuiltinDossierIds = store.deletedBuiltinDossierIds;
  const nextDossiers = dossiers.filter((item) => item.id !== dossierId);
  const isBuiltinDossier = builtinPersonaDossiers.some((dossier) => dossier.id === dossierId);
  const nextDeletedBuiltinDossierIds =
    isBuiltinDossier && !deletedBuiltinDossierIds.includes(dossierId) ? [...deletedBuiltinDossierIds, dossierId] : deletedBuiltinDossierIds;
  writeJsonFile(personaDossierStorePath, { dossiers: nextDossiers, deletedBuiltinDossierIds: nextDeletedBuiltinDossierIds });
  return { deleted: dossiers.length !== nextDossiers.length || isBuiltinDossier };
}

export function updatePersonaDossierPreview(dossierId, previewSummary, user) {
  const preview = typeof previewSummary === "string" ? previewSummary.trim().replace(/\s+/g, " ").slice(0, 180) : "";
  if (!preview) return { error: "缺少有效预览" };

  const { store, dossiers, index } = prepareDossierMutation(dossierId);
  if (index < 0) return { error: "找不到档案" };

  const now = new Date().toISOString();
  const nextDossier = {
    ...dossiers[index],
    previewSummary: preview,
    previewGeneratedAt: now,
    previewStatus: "ready",
    updatedAt: now,
    lastPreviewGeneratedByUserId: user.userId,
    lastPreviewGeneratedByUsername: user.username,
  };
  writeMergedPersonaDossiers(store, dossiers.map((item, itemIndex) => (itemIndex === index ? nextDossier : item)), new Set([dossierId]));
  return { dossier: nextDossier };
}

export function updatePersonaDossierConversationState(dossierId, nextState, interaction, user) {
  if (!nextState || typeof nextState !== "object" || !nextState.profile || typeof nextState.profile.name !== "string") {
    return { error: "缺少有效角色状态" };
  }

  const baseDossiers = readBasePersonaDossiers();
  const index = baseDossiers.findIndex((item) => item.id === dossierId);
  if (index < 0) return { error: "找不到档案" };

  const now = new Date().toISOString();
  const globalDossiers = applyGlobalConversationStates(baseDossiers);
  const sourceDossier = globalDossiers[index];
  const updatedSource = {
    ...sourceDossier,
    title: nextState.profile.name,
    state: nextState,
    updatedAt: now,
    lastInteractedAt: now,
    lastInteractedByUserId: user.userId,
    lastInteractedByUsername: user.username,
  };
  const withSource = globalDossiers.map((item, itemIndex) => (itemIndex === index ? updatedSource : item));
  const propagated = propagateRelationshipInfluence(withSource, index, interaction, user, now);
  const changedIds = new Set([dossierId]);
  propagated.forEach((dossier, itemIndex) => {
    if (dossier !== withSource[itemIndex]) changedIds.add(dossier.id);
  });
  writeGlobalConversationStates(propagated.filter((dossier) => changedIds.has(dossier.id)), user);
  return { dossier: propagated[index], dossiers: propagated };
}

export function resetPersonaDossierConversationArtifacts(dossierId) {
  const baseDossiers = readBasePersonaDossiers();
  const baseDossier = baseDossiers.find((item) => item.id === dossierId);
  if (!baseDossier) return { error: "找不到档案" };

  const artifacts = createEmptyDossierResetResult();
  const stateStore = readConversationStateStore();
  const retainedStateEntries = stateStore.entries.filter((entry) => {
    if (!entry || entry.dossierId !== dossierId) return true;
    artifacts.stateEntriesRemoved += 1;
    return false;
  });
  if (retainedStateEntries.length !== stateStore.entries.length) {
    writeJsonFile(conversationStateStorePath, { entries: retainedStateEntries });
  }

  const historyStore = readConversationHistoryStore();
  const retainedHistoryEntries = historyStore.entries.filter((entry) => {
    if (!entry || entry.dossierId !== dossierId) return true;
    artifacts.historyEntriesRemoved += 1;
    artifacts.historyMessagesRemoved += Array.isArray(entry.messages) ? entry.messages.length : 0;
    return false;
  });
  if (retainedHistoryEntries.length !== historyStore.entries.length) {
    writeJsonFile(conversationHistoryStorePath, { entries: retainedHistoryEntries });
  }

  const auditStore = readJsonFile(conversationAuditStorePath, { entries: [] });
  const auditEntries = Array.isArray(auditStore.entries) ? auditStore.entries : [];
  const retainedAuditEntries = auditEntries.filter((entry) => {
    if (!entry || entry.dossierId !== dossierId) return true;
    artifacts.auditsRemoved += 1;
    return false;
  });
  if (retainedAuditEntries.length !== auditEntries.length) {
    writeJsonFile(conversationAuditStorePath, { entries: retainedAuditEntries });
  }

  return {
    dossier: baseDossier,
    dossiers: readPersonaDossiers(),
    artifacts,
  };
}

export function readConversationHistoryMessages(dossierId, user) {
  const key = createConversationHistoryEntryKey(dossierId, user);
  if (!key) return [];
  const store = readConversationHistoryStore();
  const entry = store.entries.find((item) => item.key === key);
  return Array.isArray(entry?.messages) ? entry.messages : [];
}

export function readConversationHistorySummaries(dossierId) {
  const store = readConversationHistoryStore();
  return store.entries
    .filter((entry) => entry && entry.dossierId === dossierId)
    .map((entry) => ({
      key: entry.key,
      userId: Number(entry.userId || 0),
      username: typeof entry.username === "string" ? entry.username : "",
      nickname: typeof entry.nickname === "string" ? entry.nickname : "",
      dossierId: entry.dossierId,
      messageCount: Array.isArray(entry.messages) ? entry.messages.length : 0,
      updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : "",
    }))
    .sort((a, b) => Date.parse(b.updatedAt || "0") - Date.parse(a.updatedAt || "0"));
}

export function readConversationHistoryMessagesByKey(dossierId, key) {
  const store = readConversationHistoryStore();
  const entry = store.entries.find((item) => item?.key === key && item.dossierId === dossierId);
  return Array.isArray(entry?.messages) ? entry.messages : [];
}

export function readConversationRoomMessages(dossierId) {
  const store = readConversationHistoryStore();
  const seenIds = new Set();
  return store.entries
    .filter((entry) => entry && entry.dossierId === dossierId && Array.isArray(entry.messages))
    .flatMap((entry) => entry.messages)
    .filter((message) => {
      const id = typeof message?.id === "string" && message.id ? message.id : "";
      if (!id) return false;
      if (seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    })
    .sort((a, b) => Date.parse(a.timestamp || "0") - Date.parse(b.timestamp || "0"))
    .slice(-maxConversationHistoryMessages);
}

export function appendConversationHistoryMessages(dossierId, messages, user) {
  const key = createConversationHistoryEntryKey(dossierId, user);
  if (!key) return { error: "缺少有效历史键" };
  const safeMessages = sanitizeConversationHistoryMessages(messages);
  if (safeMessages.length === 0) return { error: "缺少有效消息" };

  const store = readConversationHistoryStore();
  const now = new Date().toISOString();
  const existing = store.entries.find((entry) => entry.key === key);
  const nextEntry = {
    key,
    userId: user.userId,
    username: user.username,
    nickname: user.nickname,
    dossierId,
    messages: [...(Array.isArray(existing?.messages) ? existing.messages : []), ...safeMessages].slice(-maxConversationHistoryMessages),
    updatedAt: now,
  };
  const nextEntries = [...store.entries.filter((entry) => entry.key !== key), nextEntry];
  writeJsonFile(conversationHistoryStorePath, { entries: nextEntries });
  return { messages: nextEntry.messages };
}

export function appendConversationAudit(entry, user) {
  const store = readJsonFile(conversationAuditStorePath, { entries: [] });
  const entries = Array.isArray(store.entries) ? store.entries : [];
  const auditEntry = {
    id: randomBytes(12).toString("base64url"),
    createdAt: new Date().toISOString(),
    userId: user.userId,
    username: user.username,
    nickname: user.nickname,
    dossierId: typeof entry.dossierId === "string" ? entry.dossierId : "",
    dossierTitle: typeof entry.dossierTitle === "string" ? entry.dossierTitle : "",
    conversationEventId: typeof entry.conversationEventId === "string" ? entry.conversationEventId.slice(0, 160) : extractConversationEventIdFromModuleCalls(entry.moduleCalls),
    conversationHistoryMessageIds: Array.isArray(entry.conversationHistoryMessageIds)
      ? entry.conversationHistoryMessageIds.map((id) => (typeof id === "string" ? id.slice(0, 160) : "")).filter(Boolean).slice(0, 12)
      : [],
    userInput: typeof entry.userInput === "string" ? entry.userInput.slice(0, 8000) : "",
    personaOutput: typeof entry.personaOutput === "string" ? entry.personaOutput.slice(0, 8000) : "",
    status: entry.status === "failed" ? "failed" : "completed",
    error: typeof entry.error === "string" ? entry.error.slice(0, 1200) : "",
    moduleCalls: sanitizeConversationModuleCalls(entry.moduleCalls),
  };
  const nextEntries = [...entries, auditEntry].slice(-maxAuditEntries);
  writeJsonFile(conversationAuditStorePath, { entries: nextEntries });
  return auditEntry;
}

export function readConversationAudits(limit = 200) {
  const store = readJsonFile(conversationAuditStorePath, { entries: [] });
  const entries = Array.isArray(store.entries) ? store.entries : [];
  return entries.slice(-limit).reverse();
}

export function exportConversationAudits(options = {}) {
  const store = readJsonFile(conversationAuditStorePath, { entries: [] });
  const entries = Array.isArray(store.entries) ? store.entries : [];
  const rawIds = Array.isArray(options.ids) ? options.ids : [];
  const selectedIds = rawIds
    .map((id) => (typeof id === "string" ? id.trim() : ""))
    .filter(Boolean);
  const selectedIdSet = selectedIds.length ? new Set(selectedIds) : undefined;
  const exportedEntries = selectedIdSet ? entries.filter((entry) => selectedIdSet.has(entry?.id)) : entries;
  const exportedIds = new Set(exportedEntries.map((entry) => entry.id));

  return {
    schema: "virtual-human-flow.conversationAuditExport.v1",
    exportedAt: new Date().toISOString(),
    scope: selectedIdSet ? "selected" : "all",
    requestedIds: selectedIds,
    missingIds: selectedIds.filter((id) => !exportedIds.has(id)),
    count: exportedEntries.length,
    entries: exportedEntries,
  };
}

export function deleteConversationAudit(auditId) {
  const store = readJsonFile(conversationAuditStorePath, { entries: [] });
  const entries = Array.isArray(store.entries) ? store.entries : [];
  const deletedEntry = entries.find((entry) => entry?.id === auditId);
  const nextEntries = entries.filter((entry) => entry.id !== auditId);
  writeJsonFile(conversationAuditStorePath, { entries: nextEntries });
  const artifacts = deletedEntry ? deleteConversationArtifactsForAudit(deletedEntry) : createEmptyAuditArtifactDeletionResult();
  return { deleted: entries.length !== nextEntries.length, artifacts };
}

export function clearConversationAudits() {
  const store = readJsonFile(conversationAuditStorePath, { entries: [] });
  const entries = Array.isArray(store.entries) ? store.entries : [];
  const artifacts = entries.reduce((summary, entry) => mergeAuditArtifactDeletionResults(summary, deleteConversationArtifactsForAudit(entry)), createEmptyAuditArtifactDeletionResult());
  writeJsonFile(conversationAuditStorePath, { entries: [] });
  return { deleted: true, artifacts };
}

export async function readAppUpdateStatus() {
  const config = getAppUpdateConfig();
  const currentVersion = readPackageVersion(config.workdir);
  const baseStatus = {
    configured: config.valid,
    available: false,
    branch: config.branch,
    currentVersion,
    currentCommit: "",
    remoteCommit: "",
    pendingCommitCount: 0,
    pendingCommits: [],
    changesSummary: "",
    checkedAt: new Date().toISOString(),
    message: "",
  };

  if (!config.valid) {
    return { ...baseStatus, configured: false, message: config.error };
  }

  if (!existsSync(resolve(config.workdir, ".git"))) {
    return {
      ...baseStatus,
      configured: false,
      message: "更新目录不是 git 工作树，请在 VPS 上配置 APP_UPDATE_WORKDIR 指向仓库 clone。",
    };
  }

  try {
    const currentCommit = (await runCommandText("git", ["rev-parse", "HEAD"], config.workdir, 15000)).trim();
    const currentBranch = (await runCommandText("git", ["rev-parse", "--abbrev-ref", "HEAD"], config.workdir, 15000)).trim();
    if (currentBranch !== config.branch) {
      return {
        ...baseStatus,
        currentCommit,
        configured: false,
        message: `当前工作树在 ${currentBranch} 分支，不是 ${config.branch}。`,
      };
    }

    const remoteLine = (await runCommandText("git", ["ls-remote", "origin", `refs/heads/${config.branch}`], config.workdir, 20000)).trim();
    const remoteCommit = remoteLine.split(/\s+/)[0] || "";
    if (!remoteCommit) {
      return {
        ...baseStatus,
        currentCommit,
        configured: false,
        message: `找不到远程分支 origin/${config.branch}。`,
      };
    }

    const available = currentCommit !== remoteCommit;
    const updateChanges = available
      ? await readPendingUpdateChanges(config.workdir, config.branch, currentCommit, remoteCommit)
      : { pendingCommitCount: 0, pendingCommits: [], changesSummary: "" };

    return {
      ...baseStatus,
      configured: true,
      available,
      currentCommit,
      remoteCommit,
      ...updateChanges,
      message: available ? updateChanges.changesSummary || "发现 GitHub 新版本" : "当前服务器已是最新版本",
    };
  } catch (error) {
    return {
      ...baseStatus,
      configured: false,
      message: error instanceof Error ? error.message : "检查更新失败",
    };
  }
}

async function readPendingUpdateChanges(workdir, branch, currentCommit, remoteCommit) {
  try {
    await runCommandText("git", ["fetch", "--quiet", "origin", branch], workdir, 20000);
    const countText = (await runCommandText("git", ["rev-list", "--count", `${currentCommit}..${remoteCommit}`], workdir, 15000)).trim();
    const pendingCommitCount = Number.parseInt(countText, 10) || 0;
    const logText = await runCommandText(
      "git",
      ["log", `--max-count=${appUpdateMaxPendingCommits}`, "--format=%H%x1f%s%x1f%b%x1e", `${currentCommit}..${remoteCommit}`],
      workdir,
      15000,
    );
    const pendingCommits = logText
      .split("\x1e")
      .map((record) => record.trim())
      .filter(Boolean)
      .map((record) => {
        const fields = record.split("\x1f");
        const commit = fields[0] || "";
        const title = compactStoredText(fields[1] || "未填写提交标题", 160);
        const body = compactStoredText(fields.slice(2).join("\x1f"), appUpdateMaxCommitBodyLength);
        return {
          commit,
          shortCommit: commit.slice(0, 7),
          title,
          body,
        };
      });

    return {
      pendingCommitCount,
      pendingCommits,
      changesSummary: pendingCommitCount > 0 ? `发现 GitHub 新版本，包含 ${pendingCommitCount} 个提交。` : "发现 GitHub 新版本。",
    };
  } catch {
    return {
      pendingCommitCount: 0,
      pendingCommits: [],
      changesSummary: "发现 GitHub 新版本，但暂时无法读取提交说明。",
    };
  }
}

export async function streamAppUpdate(response) {
  const config = getAppUpdateConfig();
  response.statusCode = 200;
  response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");

  const send = (data) => {
    response.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    send({ type: "step", label: "检查更新配置", status: "running", progress: 5 });
    if (!config.valid) {
      throw new Error(config.error);
    }
    if (!existsSync(resolve(config.workdir, ".git"))) {
      throw new Error("更新目录不是 git 工作树，请在 VPS 上配置 APP_UPDATE_WORKDIR 指向仓库 clone。");
    }

    const currentBranch = (await runCommandText("git", ["rev-parse", "--abbrev-ref", "HEAD"], config.workdir, 15000)).trim();
    if (currentBranch !== config.branch) {
      throw new Error(`当前工作树在 ${currentBranch} 分支，不是 ${config.branch}。`);
    }

    const dirtyStatus = (await runCommandText("git", ["status", "--porcelain"], config.workdir, 15000)).trim();
    if (dirtyStatus) {
      send({ type: "log", stream: "stderr", text: dirtyStatus });
      throw new Error("更新目录有未提交的跟踪文件变更，已停止自动更新。");
    }

    await runStreamCommand(send, "拉取远程引用", "git", ["fetch", "origin", config.branch], config.workdir, 20);
    await runStreamCommand(send, "合并最新代码", "git", ["pull", "--ff-only", "origin", config.branch], config.workdir, 40);
    await runStreamCommand(send, "安装依赖", "npm", ["ci"], config.workdir, 62);
    await runStreamCommand(send, "构建前端", "npm", ["run", "build"], config.workdir, 84);

    const restartCommand = getAppUpdateRestartCommand();
    if (restartCommand) {
      send({ type: "step", label: "准备重启服务", status: "running", progress: 96 });
      setTimeout(() => {
        const child = spawn("sh", ["-lc", restartCommand], {
          cwd: config.workdir,
          detached: true,
          env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
          stdio: "ignore",
        });
        child.unref();
      }, 800);
      send({ type: "done", label: "更新完成", status: "completed", progress: 100, message: "服务即将重启，刷新后生效。" });
    } else {
      send({ type: "done", label: "更新完成", status: "completed", progress: 100, message: "已构建完成；未配置重启命令。" });
    }
  } catch (error) {
    send({
      type: "error",
      label: "更新失败",
      status: "failed",
      progress: 100,
      message: error instanceof Error ? error.message : "更新失败",
    });
  } finally {
    response.end();
  }
}

export function sendJson(response, statusCode, data) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(data));
}

export function readJsonBody(request) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf-8");
        resolveBody(text ? JSON.parse(text) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

async function requestLiaoLogin(loginPath, username, password) {
  const upstream = await fetch(buildLiaoLoginUrl(loginPath), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, deviceName: "虚拟人心流工作台" }),
  });
  const text = await upstream.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }

  if (!upstream.ok || data?.success === false) {
    return {
      ok: false,
      status: upstream.status,
      message: extractLiaoLoginMessage(data) || (upstream.status === 404 ? "登录服务路径不可用" : "登录失败"),
    };
  }

  const normalizedUser = normalizeLiaoLoginResponse(data);
  if (!normalizedUser) {
    return {
      ok: false,
      status: upstream.status,
      message: "登录服务返回格式不可识别",
    };
  }

  return { ok: true, status: upstream.status, user: normalizedUser };
}

function buildLiaoLoginUrl(loginPath) {
  return new URL(loginPath, `${liaoChatroomOrigin.replace(/\/+$/, "")}/`).href;
}

function normalizeLiaoLoginResponse(data) {
  if (!data || typeof data !== "object") return undefined;
  const nested = data.data && typeof data.data === "object" ? data.data : {};
  const account =
    firstObject(data.account, data.user, nested.account, nested.user, data.profile, nested.profile) ??
    (hasAnyUserIdentity(data) ? data : undefined);
  const upstreamToken = firstString(data.token, data.authToken, data.accessToken, nested.token, nested.authToken, nested.accessToken);
  if (!upstreamToken || !account) return undefined;
  const user = normalizeLiaoUserPayload(account);
  if (!user.userId && !user.username) return undefined;
  return user;
}

function normalizeLiaoUserPayload(liaoUser) {
  const source = liaoUser && typeof liaoUser === "object" ? liaoUser : {};
  const userId = Number(source.userId || source.user_id || source.id || source.accountId || source.account_id || 0);
  const username = firstString(source.username, source.name, source.login, source.account) || "";
  const nickname = firstString(source.nickname, source.displayName, source.display_name, source.name, source.username) || username;
  const avatar = firstString(source.avatar, source.avatarUrl, source.avatar_url) || "";
  const role = firstString(source.role, source.permission, source.accountRole) || "";
  const isAdmin = Boolean(source.isAdmin || source.is_admin || source.admin || role === "admin" || role === "owner");
  return {
    userId: Number.isFinite(userId) ? userId : 0,
    username,
    nickname,
    avatar,
    isAdmin,
  };
}

function extractLiaoLoginMessage(data) {
  if (!data || typeof data !== "object") return "";
  const nested = data.data && typeof data.data === "object" ? data.data : {};
  return firstString(data.message, data.error, data.reason, nested.message, nested.error);
}

function firstObject(...values) {
  return values.find((value) => value && typeof value === "object" && !Array.isArray(value));
}

function firstString(...values) {
  const value = values.find((item) => typeof item === "string" && item.trim());
  return value ? value.trim() : "";
}

function hasAnyUserIdentity(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      firstString(value.username, value.name, value.login, value.nickname, value.displayName, value.display_name),
  );
}

function uniqueStrings(values) {
  return Array.from(new Set(values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim())));
}

function readBearerToken(request) {
  const header = request.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  return scheme === "Bearer" && token ? token : "";
}

function pruneExpiredSessions() {
  const now = Date.now();
  for (const [token, session] of authSessions.entries()) {
    if (session.expiresAt < now) authSessions.delete(token);
  }
}

function readJsonFile(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return fallback;
  }
}

function readPersonaDossierStore() {
  const store = readJsonFile(personaDossierStorePath, { dossiers: [], deletedBuiltinDossierIds: [] });
  return {
    dossiers: Array.isArray(store.dossiers) ? store.dossiers : [],
    deletedBuiltinDossierIds: Array.isArray(store.deletedBuiltinDossierIds) ? store.deletedBuiltinDossierIds : [],
  };
}

function prepareDossierMutation(dossierId) {
  const store = readPersonaDossierStore();
  const merged = readBasePersonaDossiers();
  return {
    store,
    dossiers: merged,
    index: merged.findIndex((item) => item.id === dossierId),
  };
}

function readConversationStateStore() {
  const store = readJsonFile(conversationStateStorePath, { entries: [] });
  return {
    entries: Array.isArray(store.entries) ? store.entries : [],
  };
}

function readConversationHistoryStore() {
  const store = readJsonFile(conversationHistoryStorePath, { entries: [] });
  return {
    entries: Array.isArray(store.entries) ? store.entries : [],
  };
}

function createConversationHistoryEntryKey(dossierId, user) {
  if (typeof dossierId !== "string" || !dossierId.trim()) return "";
  const userId = normalizeUserId(user);
  return userId ? `${userId}::dossier:${dossierId}` : "";
}

function sanitizeConversationHistoryMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((message) => message && typeof message === "object")
    .map((message) => {
      const speaker = ["user", "persona", "system"].includes(message.speaker) ? message.speaker : "system";
      const timestamp = typeof message.timestamp === "string" && message.timestamp ? message.timestamp : new Date().toISOString();
      const messageType = ["event_activity", "mind_flow"].includes(message.messageType) ? message.messageType : undefined;
      const details = Array.isArray(message.details)
        ? message.details.filter((item) => typeof item === "string" && item.trim()).map((item) => item.slice(0, 1600)).slice(0, 12)
        : undefined;
      const channel = ["face_to_face", "wechat", "sms", "phone", "outside_door", "scene_event"].includes(message.channel) ? message.channel : undefined;
      const channelLabel = typeof message.channelLabel === "string" && message.channelLabel.trim() ? message.channelLabel.slice(0, 80) : undefined;
      return {
        id: typeof message.id === "string" && message.id ? message.id.slice(0, 120) : randomBytes(8).toString("base64url"),
        speaker,
        speakerName: typeof message.speakerName === "string" ? message.speakerName.slice(0, 120) : "",
        content: typeof message.content === "string" ? message.content.slice(0, 8000) : "",
        timestamp,
        ...(channel ? { channel } : {}),
        ...(channelLabel ? { channelLabel } : {}),
        ...(messageType ? { messageType, collapsed: message.collapsed !== false, details } : {}),
      };
    })
    .filter((message) => message.content.trim());
}

function sanitizeConversationModuleCalls(moduleCalls) {
  if (!Array.isArray(moduleCalls)) return [];
  return moduleCalls
    .filter((call) => call && typeof call === "object")
    .map((call) => ({
      id: typeof call.id === "string" && call.id ? call.id.slice(0, 120) : randomBytes(8).toString("base64url"),
      step: typeof call.step === "string" ? call.step.slice(0, 80) : "",
      label: typeof call.label === "string" ? call.label.slice(0, 120) : "",
      status: typeof call.status === "string" ? call.status.slice(0, 40) : "",
      transport: typeof call.transport === "string" ? call.transport.slice(0, 80) : "",
      input: typeof call.input === "string" ? call.input.slice(0, maxModuleCallTextLength) : "",
      output: typeof call.output === "string" ? call.output.slice(0, maxModuleCallTextLength) : "",
      error: typeof call.error === "string" ? call.error.slice(0, 1200) : "",
    }))
    .filter((call) => call.step || call.label)
    .slice(0, maxModuleCallsPerAudit);
}

function deleteConversationArtifactsForAudit(auditEntry) {
  return mergeAuditArtifactDeletionResults(deleteConversationHistoryArtifactsForAudit(auditEntry), deleteConversationStateArtifactsForAudit(auditEntry));
}

function deleteConversationHistoryArtifactsForAudit(auditEntry) {
  const summary = createEmptyAuditArtifactDeletionResult();
  if (!auditEntry?.dossierId) return summary;

  const store = readConversationHistoryStore();
  let changed = false;
  const targetKey = createConversationHistoryEntryKey(auditEntry.dossierId, auditEntry);
  const targetUserKey = normalizeUserId(auditEntry);
  const targetMessageIds = new Set(Array.isArray(auditEntry.conversationHistoryMessageIds) ? auditEntry.conversationHistoryMessageIds : []);
  const textFragments = createAuditTextFragments(auditEntry);
  const nextEntries = store.entries.map((entry) => {
    if (!entry || entry.dossierId !== auditEntry.dossierId) return entry;
    const entryUserKey = normalizeUserId(entry);
    if (entry.key !== targetKey && entryUserKey !== targetUserKey) return entry;
    const messages = Array.isArray(entry.messages) ? entry.messages : [];
    const nextMessages = messages.filter((message) => !shouldDeleteConversationHistoryMessage(message, auditEntry, targetMessageIds, textFragments));
    const removedCount = messages.length - nextMessages.length;
    if (!removedCount) return entry;
    changed = true;
    summary.historyMessagesRemoved += removedCount;
    return { ...entry, messages: nextMessages, updatedAt: new Date().toISOString() };
  });

  if (changed) writeJsonFile(conversationHistoryStorePath, { entries: nextEntries });
  return summary;
}

function deleteConversationStateArtifactsForAudit(auditEntry) {
  const summary = createEmptyAuditArtifactDeletionResult();
  if (!auditEntry?.dossierId) return summary;

  const store = readConversationStateStore();
  const eventId = getConversationAuditEventId(auditEntry);
  const textFragments = createAuditTextFragments(auditEntry);
  const userSpeakerId = createAuditUserSpeakerId(auditEntry);
  let changed = false;

  const nextEntries = store.entries.map((entry) => {
    if (!entry || entry.dossierId !== auditEntry.dossierId || !entry.state || typeof entry.state !== "object") return entry;
    const state = entry.state;
    const shortTermMemory = Array.isArray(state.shortTermMemory) ? state.shortTermMemory : [];
    const nextShortTermMemory = shortTermMemory.filter((memory) => !shouldDeleteShortTermMemory(memory, eventId, userSpeakerId, textFragments));
    const shortRemoved = shortTermMemory.length - nextShortTermMemory.length;

    const longTermMemory = Array.isArray(state.longTermMemory) ? state.longTermMemory : [];
    const nextLongTermMemory = longTermMemory.filter((memory) => !shouldDeleteLongTermMemory(memory, eventId, userSpeakerId, textFragments, auditEntry));
    const longRemoved = longTermMemory.length - nextLongTermMemory.length;

    const relationshipMemory = Array.isArray(state.relationshipMemory) ? state.relationshipMemory : [];
    const nextRelationshipMemory = relationshipMemory
      .map((memory) => scrubRelationshipMemoryForAudit(memory, eventId, userSpeakerId, textFragments, summary))
      .filter(Boolean);
    const relationshipRemoved = relationshipMemory.length - nextRelationshipMemory.length;

    if (!shortRemoved && !longRemoved && !relationshipRemoved) return entry;
    changed = true;
    summary.shortTermMemoriesRemoved += shortRemoved;
    summary.longTermMemoriesRemoved += longRemoved;
    summary.relationshipMemoriesRemoved += relationshipRemoved;
    return {
      ...entry,
      state: {
        ...state,
        shortTermMemory: nextShortTermMemory,
        longTermMemory: nextLongTermMemory,
        relationshipMemory: nextRelationshipMemory,
      },
      updatedAt: new Date().toISOString(),
    };
  });

  if (changed) writeJsonFile(conversationStateStorePath, { entries: nextEntries });
  return summary;
}

function shouldDeleteConversationHistoryMessage(message, auditEntry, targetMessageIds, textFragments) {
  if (!message || typeof message !== "object") return false;
  if (targetMessageIds.has(message.id)) return true;
  if (!isWithinAuditDeleteWindow(message.timestamp, auditEntry.createdAt)) return false;
  const content = compactComparableText(message.content);
  if (!content) return false;
  if (message.speaker === "user" && content === compactComparableText(auditEntry.userInput)) return true;
  if (message.speaker === "persona" && textFragments.has(content)) return true;
  return false;
}

function shouldDeleteShortTermMemory(memory, eventId, userSpeakerId, textFragments) {
  if (!memory || typeof memory !== "object") return false;
  if (eventId && memory.eventId === eventId) return true;
  const content = compactComparableText(memory.content);
  if (!content) return false;
  if (memory.speakerId === userSpeakerId && textFragments.has(content)) return true;
  if (textFragments.has(content)) return true;
  return false;
}

function shouldDeleteLongTermMemory(memory, eventId, userSpeakerId, textFragments, auditEntry) {
  if (!memory || typeof memory !== "object") return false;
  if (eventId && memory.sourceEventId === eventId) return true;
  if (!isWithinAuditDeleteWindow(memory.createdAt, auditEntry.createdAt)) return false;
  const relatedPeople = Array.isArray(memory.relatedPeople) ? memory.relatedPeople : [];
  const content = compactComparableText(memory.summary);
  return relatedPeople.includes(userSpeakerId) && containsAnyAuditText(content, textFragments);
}

function scrubRelationshipMemoryForAudit(memory, eventId, userSpeakerId, textFragments, summary) {
  if (!memory || typeof memory !== "object") return memory;
  if (userSpeakerId && memory.targetUserId !== userSpeakerId) return memory;

  const evidence = Array.isArray(memory.evidence) ? memory.evidence : [];
  const nextEvidence = evidence.filter((item) => !containsAnyAuditText(compactComparableText(item), textFragments));
  summary.relationshipEvidenceRemoved += evidence.length - nextEvidence.length;

  const history = Array.isArray(memory.history) ? memory.history : [];
  const nextHistory = history.filter((item) => {
    if (eventId && item?.sourceEventId === eventId) return false;
    return !containsAnyAuditText(compactComparableText(item?.summary), textFragments);
  });
  summary.relationshipHistoryItemsRemoved += history.length - nextHistory.length;

  const hasDeletedSummaryText =
    containsAnyAuditText(compactComparableText(memory.impressionSummary), textFragments) ||
    containsAnyAuditText(compactComparableText(memory.relationshipSummary), textFragments) ||
    containsAnyAuditText(compactComparableText(memory.lastInteractionSummary), textFragments);

  if (nextEvidence.length === 0 && nextHistory.length === 0 && hasDeletedSummaryText) {
    return undefined;
  }

  if (!hasDeletedSummaryText && nextEvidence.length === evidence.length && nextHistory.length === history.length) return memory;

  return {
    ...memory,
    impressionSummary: scrubDeletedAuditFragments(memory.impressionSummary, textFragments),
    relationshipSummary: scrubDeletedAuditFragments(memory.relationshipSummary, textFragments),
    lastInteractionSummary: scrubDeletedAuditFragments(memory.lastInteractionSummary, textFragments),
    evidence: nextEvidence,
    history: nextHistory,
    updatedAt: new Date().toISOString(),
  };
}

function extractConversationEventIdFromModuleCalls(moduleCalls) {
  if (!Array.isArray(moduleCalls)) return "";
  const eventCall = moduleCalls.find((call) => call && typeof call === "object" && call.step === "event");
  const output = typeof eventCall?.output === "string" ? eventCall.output : "";
  if (!output) return "";
  try {
    const parsed = JSON.parse(output);
    if (parsed && typeof parsed.id === "string") return parsed.id.slice(0, 160);
  } catch {
    const match = output.match(/"id"\s*:\s*"([^"]+)"/);
    if (match?.[1]) return match[1].slice(0, 160);
  }
  return "";
}

function getConversationAuditEventId(auditEntry) {
  return typeof auditEntry?.conversationEventId === "string" && auditEntry.conversationEventId
    ? auditEntry.conversationEventId
    : extractConversationEventIdFromModuleCalls(auditEntry?.moduleCalls);
}

function createAuditUserSpeakerId(auditEntry) {
  const userId = Number(auditEntry?.userId);
  return Number.isFinite(userId) && userId > 0 ? `user:${userId}` : "";
}

function createAuditTextFragments(auditEntry) {
  const fragments = new Set();
  for (const value of [auditEntry?.userInput, auditEntry?.personaOutput]) {
    const compact = compactComparableText(value);
    if (compact) fragments.add(compact);
    if (typeof value === "string") {
      value
        .split(/\n+/)
        .map(compactComparableText)
        .filter(Boolean)
        .forEach((item) => fragments.add(item));
    }
  }
  return fragments;
}

function containsAnyAuditText(text, fragments) {
  if (!text) return false;
  for (const fragment of fragments) {
    if (fragment && (text.includes(fragment) || fragment.includes(text))) return true;
  }
  return false;
}

function scrubDeletedAuditFragments(value, fragments) {
  if (typeof value !== "string") return "";
  let next = value;
  for (const fragment of fragments) {
    if (!fragment) continue;
    next = next.split(fragment).join("");
  }
  return next.replace(/\s+/g, " ").trim() || "一轮已删除的对话内容已从关系记忆中移除。";
}

function compactComparableText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function isWithinAuditDeleteWindow(candidateTime, auditTime) {
  const candidateMs = Date.parse(candidateTime || "");
  const auditMs = Date.parse(auditTime || "");
  if (!Number.isFinite(candidateMs) || !Number.isFinite(auditMs)) return true;
  return Math.abs(candidateMs - auditMs) <= 30 * 60 * 1000;
}

function createEmptyAuditArtifactDeletionResult() {
  return {
    historyMessagesRemoved: 0,
    shortTermMemoriesRemoved: 0,
    longTermMemoriesRemoved: 0,
    relationshipMemoriesRemoved: 0,
    relationshipHistoryItemsRemoved: 0,
    relationshipEvidenceRemoved: 0,
  };
}

function createEmptyDossierResetResult() {
  return {
    historyEntriesRemoved: 0,
    historyMessagesRemoved: 0,
    stateEntriesRemoved: 0,
    auditsRemoved: 0,
  };
}

function mergeAuditArtifactDeletionResults(left, right) {
  const next = createEmptyAuditArtifactDeletionResult();
  for (const key of Object.keys(next)) {
    next[key] = (left?.[key] ?? 0) + (right?.[key] ?? 0);
  }
  return next;
}

function applyGlobalConversationStates(dossiers) {
  const store = readConversationStateStore();
  const entriesByDossierId = buildGlobalConversationStateEntries(store.entries, dossiers);

  return dossiers.map((dossier) => {
    const entry = entriesByDossierId.get(dossier.id);
    if (!entry || !entry.state || typeof entry.state !== "object" || !entry.state.profile) return dossier;
    return {
      ...dossier,
      title: typeof entry.title === "string" && entry.title ? entry.title : dossier.title,
      state: entry.state,
      updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : dossier.updatedAt,
      lastInteractedAt: typeof entry.lastInteractedAt === "string" ? entry.lastInteractedAt : undefined,
      lastInteractedByUserId: entry.lastInteractedByUserId,
      lastInteractedByUsername: entry.lastInteractedByUsername,
    };
  });
}

function buildGlobalConversationStateEntries(entries, dossiers) {
  const byDossierId = new Map();
  for (const entry of entries) {
    if (!isGlobalConversationStateEntry(entry)) continue;
    if (isUsableConversationStateEntry(entry)) byDossierId.set(entry.dossierId, entry);
  }

  for (const dossier of dossiers) {
    if (byDossierId.has(dossier.id)) continue;
    const legacyEntries = entries
      .filter((entry) => isLegacyUserConversationStateEntry(entry, dossier.id))
      .sort(compareConversationStateEntries);
    if (legacyEntries.length === 0) continue;
    byDossierId.set(dossier.id, mergeLegacyConversationStateEntries(dossier, legacyEntries));
  }

  return byDossierId;
}

function isGlobalConversationStateEntry(entry) {
  return (
    entry &&
    typeof entry === "object" &&
    typeof entry.dossierId === "string" &&
    (entry.scope === "global" || entry.key === createGlobalConversationStateEntryKey(entry.dossierId) || (!entry.userId && !entry.username))
  );
}

function isLegacyUserConversationStateEntry(entry, dossierId) {
  return entry && typeof entry === "object" && entry.dossierId === dossierId && Boolean(normalizeUserId(entry)) && isUsableConversationStateEntry(entry);
}

function isUsableConversationStateEntry(entry) {
  return entry && entry.state && typeof entry.state === "object" && entry.state.profile;
}

function compareConversationStateEntries(a, b) {
  return Date.parse(a.updatedAt || a.lastInteractedAt || "0") - Date.parse(b.updatedAt || b.lastInteractedAt || "0");
}

function mergeLegacyConversationStateEntries(dossier, entries) {
  const latest = entries[entries.length - 1];
  const mergedState = entries.reduce((state, entry) => mergeCharacterStateForGlobalConversation(state, entry.state), dossier.state);
  return {
    ...latest,
    scope: "global",
    key: createGlobalConversationStateEntryKey(dossier.id),
    userId: undefined,
    username: undefined,
    dossierId: dossier.id,
    title: typeof latest.title === "string" && latest.title ? latest.title : dossier.title,
    state: mergedState,
  };
}

function mergeCharacterStateForGlobalConversation(baseState, incomingState) {
  if (!incomingState || typeof incomingState !== "object" || !incomingState.profile) return baseState;
  return {
    ...baseState,
    ...incomingState,
    relationships: {
      ...(baseState.relationships ?? {}),
      ...(incomingState.relationships ?? {}),
    },
    shortTermMemory: mergeMemoryItems(baseState.shortTermMemory, incomingState.shortTermMemory, "id").slice(-80),
    longTermMemory: mergeMemoryItems(baseState.longTermMemory, incomingState.longTermMemory, "id").slice(-120),
    relationshipMemory: mergeMemoryItems(baseState.relationshipMemory, incomingState.relationshipMemory, "targetUserId").slice(-80),
  };
}

function mergeMemoryItems(baseItems, incomingItems, identityKey) {
  const byId = new Map();
  for (const item of [...(Array.isArray(baseItems) ? baseItems : []), ...(Array.isArray(incomingItems) ? incomingItems : [])]) {
    if (!item || typeof item !== "object") continue;
    const rawId = item[identityKey] || item.id;
    const id = typeof rawId === "string" && rawId ? rawId : randomBytes(8).toString("base64url");
    byId.set(id, item);
  }
  return Array.from(byId.values());
}

function createGlobalConversationStateEntryKey(dossierId) {
  return `global::dossier:${dossierId}`;
}

function writeGlobalConversationStates(changedDossiers, user) {
  const store = readConversationStateStore();
  const changedIds = new Set(changedDossiers.map((dossier) => dossier.id));
  const retainedEntries = store.entries.filter((entry) => !changedIds.has(entry.dossierId));
  const nextEntries = [
    ...retainedEntries,
    ...changedDossiers.map((dossier) => ({
      scope: "global",
      key: createGlobalConversationStateEntryKey(dossier.id),
      dossierId: dossier.id,
      title: dossier.title,
      state: dossier.state,
      updatedAt: dossier.updatedAt,
      lastInteractedAt: dossier.lastInteractedAt,
      lastInteractedByUserId: user.userId,
      lastInteractedByUsername: user.username,
    })),
  ];
  writeJsonFile(conversationStateStorePath, { entries: nextEntries });
}

function normalizeUserId(user) {
  const userId = Number(user?.userId);
  if (Number.isFinite(userId) && userId > 0) return `id:${userId}`;
  const username = typeof user?.username === "string" ? user.username.trim() : "";
  return username ? `name:${username}` : "";
}

function writeMergedPersonaDossiers(store, mergedDossiers, changedIds) {
  const builtinIds = new Set(builtinPersonaDossiers.map((dossier) => dossier.id));
  const storedIds = new Set(store.dossiers.map((dossier) => dossier.id));
  const nextStored = mergedDossiers.filter((dossier) => storedIds.has(dossier.id) || changedIds.has(dossier.id) || (!builtinIds.has(dossier.id) && !dossier.isBuiltin));
  writeJsonFile(personaDossierStorePath, {
    dossiers: nextStored,
    deletedBuiltinDossierIds: store.deletedBuiltinDossierIds,
  });
}

function propagateRelationshipInfluence(dossiers, sourceIndex, interaction, user, now) {
  const sourceDossier = dossiers[sourceIndex];
  const sourceState = sourceDossier.state ?? {};
  const sourceProfile = sourceState.profile ?? {};
  const sourceProfileId = sourceProfile.id || "";
  const sourceName = sourceProfile.name || sourceDossier.title || "某个角色";
  const userInput = compactStoredText(interaction?.userInput, 36);
  const personaOutput = compactStoredText(interaction?.personaOutput, 54);
  if (!userInput && !personaOutput) return dossiers;

  return dossiers.map((dossier, index) => {
    if (index === sourceIndex) return dossier;
    const state = dossier.state;
    if (!state || !state.profile || !hasPersonaRelationship(state, sourceProfileId, sourceName)) return dossier;

    const memory = {
      id: randomBytes(10).toString("base64url"),
      summary: `${sourceName}最近和${user.nickname || user.username || "一位用户"}聊到「${userInput || "一件事"}」，回应里留下的状态是「${personaOutput || "没有明确回复"}」。这会影响下次谈到${sourceName}时的关系判断。`,
      relatedPeople: [sourceProfileId, sourceName, user.username].filter(Boolean),
      relatedConcerns: [],
      emotionalValence: 0,
      emotionalIntensity: 0.38,
      createdAt: now,
      importance: 0.46,
    };
    const nextRelationships = Object.fromEntries(
      Object.entries(state.relationships ?? {}).map(([key, relationship]) => {
        if (!relationshipMatchesPersona(relationship, sourceProfileId, sourceName)) return [key, relationship];
        return [
          key,
          {
            ...relationship,
            lastInteractionAt: now,
            recentTone: `最近听见${sourceName}和外部对话有了新余波`,
            notes: [...(Array.isArray(relationship.notes) ? relationship.notes : []).slice(-5), memory.summary],
          },
        ];
      }),
    );

    return {
      ...dossier,
      state: {
        ...state,
        relationships: nextRelationships,
        longTermMemory: [...(Array.isArray(state.longTermMemory) ? state.longTermMemory : []), memory].slice(-30),
      },
      updatedAt: now,
    };
  });
}

function hasPersonaRelationship(state, profileId, profileName) {
  return Object.values(state.relationships ?? {}).some((relationship) => relationshipMatchesPersona(relationship, profileId, profileName));
}

function relationshipMatchesPersona(relationship, profileId, profileName) {
  return (
    (profileId && relationship?.targetId === profileId) ||
    (profileName && relationship?.targetName === profileName) ||
    (profileName && Array.isArray(relationship?.notes) && relationship.notes.some((note) => String(note).includes(profileName)))
  );
}

function compactStoredText(value, maxLength) {
  if (typeof value !== "string") return "";
  const compact = value.trim().replace(/\s+/g, " ");
  return compact.length > maxLength ? `${compact.slice(0, maxLength)}...` : compact;
}

function writeJsonFile(path, data) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, { encoding: "utf-8", mode: 0o600 });
}

function getAppUpdateConfig() {
  const branch = process.env.APP_UPDATE_BRANCH || appUpdateDefaultBranch;
  const workdir = resolve(rootDir, process.env.APP_UPDATE_WORKDIR || ".");
  if (!/^[A-Za-z0-9._/-]+$/.test(branch) || branch.includes("..")) {
    return { valid: false, error: "APP_UPDATE_BRANCH 配置不安全。", branch, workdir };
  }
  if (workdir === "/" || !existsSync(workdir)) {
    return { valid: false, error: "APP_UPDATE_WORKDIR 不存在或不安全。", branch, workdir };
  }
  return { valid: true, error: "", branch, workdir };
}

function getAppUpdateRestartCommand() {
  if (process.env.APP_UPDATE_RESTART_COMMAND) return process.env.APP_UPDATE_RESTART_COMMAND;
  const pm2Name = process.env.APP_UPDATE_PM2_NAME || process.env.PRODUCTION_PM2_NAME || "";
  if (!pm2Name) return "";
  return `pm2 restart ${shellQuote(pm2Name)} --update-env`;
}

function readPackageVersion(workdir) {
  const packagePath = resolve(workdir, "package.json");
  if (!existsSync(packagePath)) return "";
  try {
    const parsed = JSON.parse(readFileSync(packagePath, "utf-8"));
    return typeof parsed.version === "string" ? parsed.version : "";
  } catch {
    return "";
  }
}

function runCommandText(command, args, cwd, timeoutMs = appUpdateCommandTimeoutMs) {
  return new Promise((resolveText, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${command} ${args.join(" ")} 超时`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf-8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf-8");
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolveText(stdout);
        return;
      }
      reject(new Error((stderr || stdout || `${command} ${args.join(" ")} 失败`).trim()));
    });
  });
}

function runStreamCommand(send, label, command, args, cwd, progress) {
  return new Promise((resolveCommand, reject) => {
    send({ type: "step", label, status: "running", progress });
    send({ type: "log", stream: "stdout", text: `$ ${command} ${args.join(" ")}` });
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${label}超时`));
    }, appUpdateCommandTimeoutMs);
    const forward = (stream) => (chunk) => {
      const text = chunk.toString("utf-8");
      for (const line of text.split(/\r?\n/)) {
        if (line.trim()) send({ type: "log", stream, text: line });
      }
    };

    child.stdout.on("data", forward("stdout"));
    child.stderr.on("data", forward("stderr"));
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        send({ type: "step", label, status: "completed", progress: Math.min(progress + 12, 95) });
        resolveCommand();
        return;
      }
      reject(new Error(`${label}失败，退出码 ${code ?? "unknown"}`));
    });
  });
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

export function isSameToken(a, b) {
  const left = Buffer.from(a || "");
  const right = Buffer.from(b || "");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
