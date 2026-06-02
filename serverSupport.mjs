import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const rootDir = process.cwd();
const liaoChatroomOrigin = process.env.LIAO_CHATROOM_ORIGIN || "https://liao.xiaogushi.us";
const personaDossierStorePath = resolve(rootDir, ".persona-dossiers.local.json");
const conversationAuditStorePath = resolve(rootDir, ".conversation-audits.local.json");
const authSessionTtlMs = 7 * 24 * 60 * 60 * 1000;
const maxAuditEntries = 1000;
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
  return Array.isArray(store.dossiers) ? store.dossiers : [];
}

export function upsertPersonaDossier(dossier, user) {
  const store = readJsonFile(personaDossierStorePath, { dossiers: [] });
  const dossiers = Array.isArray(store.dossiers) ? store.dossiers : [];
  const now = new Date().toISOString();
  const safeDossier = {
    ...dossier,
    updatedAt: now,
    createdAt: typeof dossier.createdAt === "string" ? dossier.createdAt : now,
    ownerUserId: user.userId,
    ownerUsername: user.username,
  };
  const index = dossiers.findIndex((item) => item.id === safeDossier.id);
  const nextDossiers = index >= 0 ? dossiers.map((item, itemIndex) => (itemIndex === index ? safeDossier : item)) : [...dossiers, safeDossier];
  writeJsonFile(personaDossierStorePath, { dossiers: nextDossiers });
  return safeDossier;
}

export function deletePersonaDossier(dossierId) {
  const store = readJsonFile(personaDossierStorePath, { dossiers: [] });
  const dossiers = Array.isArray(store.dossiers) ? store.dossiers : [];
  const nextDossiers = dossiers.filter((item) => item.id !== dossierId);
  writeJsonFile(personaDossierStorePath, { dossiers: nextDossiers });
  return { deleted: dossiers.length !== nextDossiers.length };
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

export function isSameToken(a, b) {
  const left = Buffer.from(a || "");
  const right = Buffer.from(b || "");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
