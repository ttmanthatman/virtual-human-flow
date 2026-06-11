import { createServer } from "node:http";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import {
  appendConversationAudit,
  createLocalSession,
  clearConversationAudits,
  deleteConversationAudit,
  deletePersonaDossier,
  destroyLocalSession,
  exportConversationAudits,
  getRequestSession,
  appendConversationHistoryMessages,
  loginWithLiaoChatroom,
  readConversationAudits,
  readConversationHistoryMessages,
  readConversationHistoryMessagesByKey,
  readConversationHistorySummaries,
  readAppUpdateStatus,
  readJsonBody,
  readPersonaDossiers,
  requireAdminSession,
  requireSession,
  resetPersonaDossierConversationArtifacts,
  sendJson,
  streamAppUpdate,
  updatePersonaDossierConversationState,
  updatePersonaDossierPreview,
  upsertPersonaDossier,
} from "./serverSupport.mjs";

const rootDir = process.cwd();
const distDir = resolve(rootDir, "dist");
const deepseekConfigPath = resolve(rootDir, ".deepseek.local.json");
const defaultDeepseekEndpoint = "https://api.deepseek.com/chat/completions";
const defaultDeepseekModel = "deepseek-v4-flash";
const deepseekRequestTimeoutMs = 90000;
const port = Number(process.env.PORT || 4174);
const host = process.env.HOST || "127.0.0.1";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`).pathname;

    if (pathname === "/health" && (request.method === "GET" || request.method === "HEAD")) {
      response.statusCode = 200;
      response.setHeader("Content-Type", "text/plain; charset=utf-8");
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      response.end("OK");
      return;
    }

    if (pathname === "/api/auth/session" && request.method === "GET") {
      const session = getRequestSession(request);
      sendJson(response, 200, {
        authenticated: Boolean(session),
        user: session?.user ?? null,
      });
      return;
    }

    if (pathname === "/api/auth/login" && request.method === "POST") {
      const body = await readJsonBody(request);
      const username = typeof body.username === "string" ? body.username.trim() : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (!username || !password) {
        sendJson(response, 400, { error: "请输入用户名和密码" });
        return;
      }

      try {
        const liaoUser = await loginWithLiaoChatroom(username, password);
        const session = createLocalSession(liaoUser);
        sendJson(response, 200, { success: true, token: session.token, user: session.user, expiresAt: session.expiresAt });
      } catch (error) {
        sendJson(response, 401, { error: error instanceof Error ? error.message : "登录失败" });
      }
      return;
    }

    if (pathname === "/api/auth/logout" && request.method === "POST") {
      const session = getRequestSession(request);
      if (session) destroyLocalSession(session.token);
      sendJson(response, 200, { success: true });
      return;
    }

    if (pathname === "/api/persona-dossiers" && request.method === "GET") {
      const session = requireSession(request, response);
      if (!session) return;
      sendJson(response, 200, { dossiers: readPersonaDossiers(session.user) });
      return;
    }

    if (pathname === "/api/persona-dossiers" && request.method === "POST") {
      const session = requireAdminSession(request, response);
      if (!session) return;
      const body = await readJsonBody(request);
      if (!body.dossier || typeof body.dossier.id !== "string") {
        sendJson(response, 400, { error: "缺少有效档案" });
        return;
      }
      sendJson(response, 200, { dossier: upsertPersonaDossier(body.dossier, session.user) });
      return;
    }

    if (pathname.startsWith("/api/persona-dossiers/") && pathname.endsWith("/preview") && request.method === "POST") {
      const session = requireSession(request, response);
      if (!session) return;
      const dossierId = decodeURIComponent(pathname.replace("/api/persona-dossiers/", "").replace("/preview", ""));
      const body = await readJsonBody(request);
      const result = updatePersonaDossierPreview(dossierId, body.previewSummary, session.user);
      if (result.error) {
        sendJson(response, result.error === "找不到档案" ? 404 : 400, { error: result.error });
        return;
      }
      sendJson(response, 200, result);
      return;
    }

    if (pathname.startsWith("/api/persona-dossiers/") && pathname.endsWith("/conversation-state") && request.method === "POST") {
      const session = requireSession(request, response);
      if (!session) return;
      const dossierId = decodeURIComponent(pathname.replace("/api/persona-dossiers/", "").replace("/conversation-state", ""));
      const body = await readJsonBody(request);
      const result = updatePersonaDossierConversationState(dossierId, body.state, body.interaction, session.user);
      if (result.error) {
        sendJson(response, result.error === "找不到档案" ? 404 : 400, { error: result.error });
        return;
      }
      sendJson(response, 200, result);
      return;
    }

    if (pathname.startsWith("/api/persona-dossiers/") && pathname.endsWith("/reset-conversation") && request.method === "POST") {
      if (!requireAdminSession(request, response)) return;
      const dossierId = decodeURIComponent(pathname.replace("/api/persona-dossiers/", "").replace("/reset-conversation", ""));
      const result = resetPersonaDossierConversationArtifacts(dossierId);
      if (result.error) {
        sendJson(response, 404, { error: result.error });
        return;
      }
      sendJson(response, 200, result);
      return;
    }

    if (pathname.startsWith("/api/persona-dossiers/") && pathname.endsWith("/conversation-history") && request.method === "GET") {
      const session = requireSession(request, response);
      if (!session) return;
      const dossierId = decodeURIComponent(pathname.replace("/api/persona-dossiers/", "").replace("/conversation-history", ""));
      sendJson(response, 200, { messages: readConversationHistoryMessages(dossierId, session.user) });
      return;
    }

    if (pathname.startsWith("/api/persona-dossiers/") && pathname.endsWith("/conversation-history") && request.method === "POST") {
      const session = requireSession(request, response);
      if (!session) return;
      const dossierId = decodeURIComponent(pathname.replace("/api/persona-dossiers/", "").replace("/conversation-history", ""));
      const body = await readJsonBody(request);
      const result = appendConversationHistoryMessages(dossierId, body.messages, session.user);
      if (result.error) {
        sendJson(response, 400, { error: result.error });
        return;
      }
      sendJson(response, 200, result);
      return;
    }

    if ((pathname === "/api/conversation-histories" || pathname === "/api/admin/conversation-histories") && request.method === "GET") {
      if (!requireSession(request, response)) return;
      const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
      const dossierId = url.searchParams.get("dossierId") || "";
      const key = url.searchParams.get("key") || "";
      if (!dossierId) {
        sendJson(response, 400, { error: "缺少 dossierId" });
        return;
      }
      if (key) {
        sendJson(response, 200, { messages: readConversationHistoryMessagesByKey(dossierId, key) });
        return;
      }
      sendJson(response, 200, { summaries: readConversationHistorySummaries(dossierId) });
      return;
    }

    if (pathname.startsWith("/api/persona-dossiers/") && request.method === "DELETE") {
      if (!requireAdminSession(request, response)) return;
      const dossierId = decodeURIComponent(pathname.replace("/api/persona-dossiers/", ""));
      sendJson(response, 200, deletePersonaDossier(dossierId));
      return;
    }

    if (pathname === "/api/conversation-audits" && request.method === "POST") {
      const session = requireSession(request, response);
      if (!session) return;
      const body = await readJsonBody(request);
      sendJson(response, 200, { entry: appendConversationAudit(body, session.user) });
      return;
    }

    if (pathname === "/api/conversation-audits" && request.method === "GET") {
      if (!requireAdminSession(request, response)) return;
      sendJson(response, 200, { entries: readConversationAudits() });
      return;
    }

    if (pathname === "/api/conversation-audits/export" && request.method === "POST") {
      if (!requireAdminSession(request, response)) return;
      const body = await readJsonBody(request);
      const ids = Array.isArray(body.ids) ? body.ids : [];
      sendJson(response, 200, exportConversationAudits({ ids }));
      return;
    }

    if (pathname === "/api/conversation-audits" && request.method === "DELETE") {
      if (!requireAdminSession(request, response)) return;
      sendJson(response, 200, clearConversationAudits());
      return;
    }

    if (pathname.startsWith("/api/conversation-audits/") && request.method === "DELETE") {
      if (!requireAdminSession(request, response)) return;
      const auditId = decodeURIComponent(pathname.replace("/api/conversation-audits/", ""));
      sendJson(response, 200, deleteConversationAudit(auditId));
      return;
    }

    if (pathname === "/api/deepseek-config" && request.method === "GET") {
      const config = readDeepseekConfig();
      sendJson(response, 200, {
        apiKeySaved: Boolean(config.apiKey),
        endpoint: "/api/deepseek-chat",
        model: config.model || defaultDeepseekModel,
      });
      return;
    }

    if (pathname === "/api/deepseek-config" && request.method === "POST") {
      if (!requireAdminSession(request, response)) return;
      const body = await readJsonBody(request);
      const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
      if (!apiKey) {
        sendJson(response, 400, { error: "缺少 DeepSeek API Key" });
        return;
      }

      writeFileSync(
        deepseekConfigPath,
        `${JSON.stringify(
          {
            apiKey,
            endpoint: defaultDeepseekEndpoint,
            model: normalizeDeepseekModel(typeof body.model === "string" && body.model.trim() ? body.model.trim() : defaultDeepseekModel),
            savedAt: new Date().toISOString(),
          },
          null,
          2,
        )}\n`,
        { encoding: "utf-8", mode: 0o600 },
      );
      sendJson(response, 200, { apiKeySaved: true, endpoint: "/api/deepseek-chat" });
      return;
    }

    if (pathname === "/api/app-update/status" && request.method === "GET") {
      sendJson(response, 200, await readAppUpdateStatus());
      return;
    }

    if (pathname === "/api/app-update/run" && request.method === "POST") {
      if (!requireAdminSession(request, response)) return;
      await streamAppUpdate(response);
      return;
    }

    if (pathname === "/api/deepseek-chat" && request.method === "POST") {
      if (!requireSession(request, response)) return;
      const body = await readJsonBody(request);
      const config = readDeepseekConfig();
      const apiKey = config.apiKey || process.env.DEEPSEEK_API_KEY;
      if (!apiKey) {
        sendJson(response, 401, { error: "DeepSeek API Key 尚未保存" });
        return;
      }

      if (body.stream === true) {
        await streamDeepseek(body, config, apiKey, response);
      } else {
        const result = await callDeepseek(body, config, apiKey);
        sendJson(response, 200, result);
      }
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      sendJson(response, 405, { error: "Method Not Allowed" });
      return;
    }

    serveStatic(pathname, request.method, response);
  } catch (error) {
    if (response.headersSent) {
      sendSse(response, { error: error instanceof Error ? error.message : "服务处理失败" });
      response.end();
      return;
    }
    sendJson(response, 500, { error: error instanceof Error ? error.message : "服务处理失败" });
  }
}).listen(port, host, () => {
  console.log(`virtual-human-flow listening on http://${host}:${port}`);
});

function serveStatic(pathname, method, response) {
  const safePath = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const requestedPath = safePath === "/" ? "/index.html" : safePath;
  let filePath = resolve(join(distDir, requestedPath));

  if (!filePath.startsWith(distDir) || !existsSync(filePath)) {
    filePath = resolve(distDir, "index.html");
  }

  const contentType = mimeTypes[extname(filePath)] || "application/octet-stream";
  response.statusCode = 200;
  response.setHeader("Content-Type", contentType);
  if (filePath.includes(`${distDir}/assets/`)) {
    response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  }
  if (method === "HEAD") {
    response.end();
    return;
  }
  response.end(readFileSync(filePath));
}

function readDeepseekConfig() {
  if (!existsSync(deepseekConfigPath)) {
    return { apiKey: "", endpoint: defaultDeepseekEndpoint, model: defaultDeepseekModel };
  }

  try {
    const parsed = JSON.parse(readFileSync(deepseekConfigPath, "utf-8"));
    return {
      apiKey: parsed.apiKey || "",
      endpoint: parsed.endpoint || defaultDeepseekEndpoint,
      model: normalizeDeepseekModel(parsed.model || defaultDeepseekModel),
    };
  } catch {
    return { apiKey: "", endpoint: defaultDeepseekEndpoint, model: defaultDeepseekModel };
  }
}

async function callDeepseek(body, config, apiKey) {
  const outputMode = body.outputMode === "structured_json" ? "structured_json" : "natural_language";
  const moduleName = typeof body.moduleName === "string" ? body.moduleName : "unknown";
  const upstream = await fetchDeepseek(body, config, apiKey, false);

  const raw = await upstream.text();
  if (!upstream.ok) {
    throw new Error(`DeepSeek 返回 ${upstream.status}: ${raw.slice(0, 300)}`);
  }

  const payload = JSON.parse(raw);
  const content = payload.choices?.[0]?.message?.content?.trim() || "";
  if (!content) {
    throw new Error("DeepSeek 没有返回内容");
  }

  if (outputMode === "structured_json") {
    return parseJsonContent(content);
  }

  return moduleName === "reply_generation" ? { reply: content } : content;
}

async function streamDeepseek(body, config, apiKey, response) {
  const outputMode = body.outputMode === "structured_json" ? "structured_json" : "natural_language";
  const moduleName = typeof body.moduleName === "string" ? body.moduleName : "unknown";
  const upstream = await fetchDeepseek(body, config, apiKey, true);

  response.statusCode = upstream.ok ? 200 : upstream.status;
  response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");

  if (!upstream.ok || !upstream.body) {
    const raw = await upstream.text();
    sendSse(response, { error: `DeepSeek 返回 ${upstream.status}: ${raw.slice(0, 300)}` });
    response.end();
    return;
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      const data = event
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");
      if (!data || data === "[DONE]") continue;

      const parsed = JSON.parse(data);
      const delta = parsed.choices?.[0]?.delta?.content ?? "";
      if (!delta) continue;

      accumulated += delta;
      sendSse(response, { delta });
    }
  }

  const content = accumulated.trim();
  if (!content) {
    sendSse(response, { error: "DeepSeek 流结束但没有返回内容" });
    response.end();
    return;
  }

  try {
    const final = outputMode === "structured_json" ? parseJsonContent(content) : moduleName === "reply_generation" ? { reply: content } : content;
    sendSse(response, { final });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendSse(response, { error: `结构化 JSON 解析失败：${message}` });
  }
  response.end();
}

async function fetchDeepseek(body, config, apiKey, stream) {
  const outputMode = body.outputMode === "structured_json" ? "structured_json" : "natural_language";
  const moduleName = typeof body.moduleName === "string" ? body.moduleName : "unknown";
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  const outputContract = typeof body.outputContract === "string" ? body.outputContract : "";
  const requestedModel = typeof body.model === "string" && body.model.trim() ? body.model.trim() : config.model;
  const model = normalizeDeepseekModel(requestedModel);
  const systemContent =
    outputMode === "structured_json"
      ? [
          "你是虚拟人认知系统里的一个内部模块。",
          "你必须只返回一个合法 JSON 对象，不要 Markdown，不要代码块，不要解释。",
          outputContract ? `输出契约：${outputContract}` : "",
        ]
            .filter(Boolean)
            .join("\n")
      : buildNaturalLanguageSystemPrompt(moduleName);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), deepseekRequestTimeoutMs);

  return fetch(config.endpoint || defaultDeepseekEndpoint, {
    method: "POST",
    signal: controller.signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: prompt },
      ],
      response_format: outputMode === "structured_json" ? { type: "json_object" } : { type: "text" },
      thinking: { type: "disabled" },
      stream,
      temperature: 0.4,
      max_tokens: outputMode === "structured_json" ? 2600 : moduleName === "role_turn" ? 1200 : moduleName === "role_turn_probe" ? 900 : 700,
    }),
  }).finally(() => clearTimeout(timeout));
}

function buildNaturalLanguageSystemPrompt(moduleName) {
  if (moduleName === "role_turn") {
    return [
      "你是虚拟人对话系统的一次角色主脑回合。",
      "你要遵循用户提示里的自然语言段落格式，把心理摘要和最终说出口的话分开。",
      "不要输出 JSON、Markdown 代码块、调试说明或系统解释。",
    ].join("\n");
  }
  if (moduleName === "role_turn_probe") {
    return [
      "你是虚拟人对话系统的旁路审计探针。",
      "你只解释已经完成的主脑决策路径、标签锁定风险和上下文噪声。",
      "不要改写角色台词，不要给角色下一轮指令，不要输出 JSON 或 Markdown 代码块。",
    ].join("\n");
  }
  if (moduleName === "reply_generation") {
    return "你只返回角色最终说出口的聊天文本，不要解释，不要附加标签。";
  }
  return "你只返回最终文本，不要解释，不要附加标签。";
}

function parseJsonContent(content) {
  const withoutFence = content
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(withoutFence);
}

function sendSse(response, data) {
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

function normalizeDeepseekModel(model) {
  return model === "deepseek-reasoner" ? defaultDeepseekModel : model;
}
