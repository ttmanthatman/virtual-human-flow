import { randomBytes, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { builtinPersonaDossiers } from "./builtinPersonaDossiers.mjs";

const rootDir = process.cwd();
const liaoChatroomOrigin = process.env.LIAO_CHATROOM_ORIGIN || "";
const personaDossierStorePath = resolve(rootDir, ".persona-dossiers.local.json");
const conversationAuditStorePath = resolve(rootDir, ".conversation-audits.local.json");
const authSessionTtlMs = 7 * 24 * 60 * 60 * 1000;
const maxAuditEntries = 1000;
const appUpdateDefaultBranch = "main";
const appUpdateCommandTimeoutMs = 180000;
const authSessions = new Map();

export function createLocalSession(liaoUser) {
  pruneExpiredSessions();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + authSessionTtlMs;
  const user = {
    userId: Number(liaoUser.userId || liaoUser.id || 0),
    username: String(liaoUser.username || ""),
    nickname: String(liaoUser.nickname || liaoUser.username || ""),
    avatar: typeof liaoUser.avatar === "string" ? liaoUser.avatar : "",
    isAdmin: Boolean(liaoUser.isAdmin || liaoUser.is_admin),
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

  const upstream = await fetch(`${liaoChatroomOrigin}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const text = await upstream.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }

  if (!upstream.ok || !data.success || !data.token) {
    const message = typeof data.message === "string" ? data.message : "登录失败";
    throw new Error(message);
  }

  return data;
}

export function readPersonaDossiers() {
  const store = readJsonFile(personaDossierStorePath, { dossiers: [] });
  const storedDossiers = Array.isArray(store.dossiers) ? store.dossiers : [];
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
  const store = readJsonFile(personaDossierStorePath, { dossiers: [], deletedBuiltinDossierIds: [] });
  const dossiers = Array.isArray(store.dossiers) ? store.dossiers : [];
  const deletedBuiltinDossierIds = Array.isArray(store.deletedBuiltinDossierIds) ? store.deletedBuiltinDossierIds : [];
  const now = new Date().toISOString();
  const safeDossier = {
    ...dossier,
    groupName: typeof dossier.groupName === "string" && dossier.groupName.trim() ? dossier.groupName.trim() : "未分组",
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
  const store = readJsonFile(personaDossierStorePath, { dossiers: [], deletedBuiltinDossierIds: [] });
  const dossiers = Array.isArray(store.dossiers) ? store.dossiers : [];
  const deletedBuiltinDossierIds = Array.isArray(store.deletedBuiltinDossierIds) ? store.deletedBuiltinDossierIds : [];
  const nextDossiers = dossiers.filter((item) => item.id !== dossierId);
  const isBuiltinDossier = builtinPersonaDossiers.some((dossier) => dossier.id === dossierId);
  const nextDeletedBuiltinDossierIds =
    isBuiltinDossier && !deletedBuiltinDossierIds.includes(dossierId) ? [...deletedBuiltinDossierIds, dossierId] : deletedBuiltinDossierIds;
  writeJsonFile(personaDossierStorePath, { dossiers: nextDossiers, deletedBuiltinDossierIds: nextDeletedBuiltinDossierIds });
  return { deleted: dossiers.length !== nextDossiers.length || isBuiltinDossier };
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
    userInput: typeof entry.userInput === "string" ? entry.userInput.slice(0, 8000) : "",
    personaOutput: typeof entry.personaOutput === "string" ? entry.personaOutput.slice(0, 8000) : "",
    status: entry.status === "failed" ? "failed" : "completed",
    error: typeof entry.error === "string" ? entry.error.slice(0, 1200) : "",
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

export function deleteConversationAudit(auditId) {
  const store = readJsonFile(conversationAuditStorePath, { entries: [] });
  const entries = Array.isArray(store.entries) ? store.entries : [];
  const nextEntries = entries.filter((entry) => entry.id !== auditId);
  writeJsonFile(conversationAuditStorePath, { entries: nextEntries });
  return { deleted: entries.length !== nextEntries.length };
}

export function clearConversationAudits() {
  writeJsonFile(conversationAuditStorePath, { entries: [] });
  return { deleted: true };
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

    return {
      ...baseStatus,
      configured: true,
      available: currentCommit !== remoteCommit,
      currentCommit,
      remoteCommit,
      message: currentCommit === remoteCommit ? "当前服务器已是最新版本" : "发现 GitHub 新版本",
    };
  } catch (error) {
    return {
      ...baseStatus,
      configured: false,
      message: error instanceof Error ? error.message : "检查更新失败",
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
