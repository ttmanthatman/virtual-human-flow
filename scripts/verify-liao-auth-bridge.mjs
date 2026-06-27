import { resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

process.env.LIAO_CHATROOM_ORIGIN = "https://liao.test";
delete process.env.LIAO_CHATROOM_LOGIN_PATH;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { createLocalSession, loginWithLiaoChatroom } = await import(`${pathToFileURL(resolve(repoRoot, "serverSupport.mjs")).href}?verify=${Date.now()}`);

await verifyCurrentLiaoLoginShape();
await verifyLegacyLoginFallback();
await verifyCredentialFailureDoesNotFallBack();

console.log("liao auth bridge verified");

async function verifyCurrentLiaoLoginShape() {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), body: JSON.parse(options.body) });
    return jsonResponse(200, {
      token: "upstream-token",
      account: {
        id: 701,
        username: "qoo",
        displayName: "Qoo",
        avatarUrl: "https://example.test/avatar.png",
        role: "admin",
      },
    });
  };

  const liaoUser = await loginWithLiaoChatroom("qoo", "secret");
  const session = createLocalSession(liaoUser);

  assert(calls.length === 1, "Expected current login path to succeed without fallback.");
  assert(calls[0].url === "https://liao.test/api/auth/login", `Unexpected current login URL: ${calls[0].url}`);
  assert(calls[0].body.deviceName === "虚拟人心流工作台", "Expected deviceName to be forwarded to liao.");
  assert(session.user.userId === 701, "Expected account.id to become local userId.");
  assert(session.user.username === "qoo", "Expected account.username to become local username.");
  assert(session.user.nickname === "Qoo", "Expected account.displayName to become local nickname.");
  assert(session.user.avatar === "https://example.test/avatar.png", "Expected account.avatarUrl to become local avatar.");
  assert(session.user.isAdmin, "Expected admin role to become local isAdmin.");
}

async function verifyLegacyLoginFallback() {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).endsWith("/api/auth/login")) {
      return jsonResponse(404, { success: false, message: "Not found" });
    }
    return jsonResponse(200, {
      success: true,
      token: "legacy-token",
      userId: 702,
      username: "legacy",
      nickname: "Legacy User",
      is_admin: true,
    });
  };

  const liaoUser = await loginWithLiaoChatroom("legacy", "secret");
  const session = createLocalSession(liaoUser);

  assert(calls.length === 2, "Expected 404 current path to fall back to legacy /api/login.");
  assert(calls[1] === "https://liao.test/api/login", `Unexpected legacy login URL: ${calls[1]}`);
  assert(session.user.userId === 702, "Expected legacy userId to be preserved.");
  assert(session.user.isAdmin, "Expected legacy is_admin to become local isAdmin.");
}

async function verifyCredentialFailureDoesNotFallBack() {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return jsonResponse(401, { success: false, message: "用户名或密码错误" });
  };

  let errorMessage = "";
  try {
    await loginWithLiaoChatroom("bad", "bad");
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  assert(calls.length === 1, "Expected credential failure to stop without trying legacy path.");
  assert(errorMessage === "用户名或密码错误", `Unexpected credential failure message: ${errorMessage}`);
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
