import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  appendConversationAudit,
  createLocalSession,
  clearConversationAudits,
  deleteConversationAudit,
  deletePersonaDossier,
  destroyLocalSession,
  getRequestSession,
  appendConversationHistoryMessages,
  loginWithLiaoChatroom,
  readConversationAudits,
  readConversationHistoryMessages,
  readAppUpdateStatus,
  readJsonBody,
  readPersonaDossiers,
  requireAdminSession,
  requireSession,
  sendJson,
  streamAppUpdate,
  updatePersonaDossierConversationState,
  updatePersonaDossierPreview,
  upsertPersonaDossier,
} from "./serverSupport.mjs";

const deepseekConfigPath = resolve(process.cwd(), ".deepseek.local.json");
const defaultDeepseekEndpoint = "https://api.deepseek.com/chat/completions";
const defaultDeepseekModel = "deepseek-v4-flash";
const deepseekRequestTimeoutMs = 90000;

export default defineConfig({
  plugins: [react(), deepseekProxyPlugin()],
});

function deepseekProxyPlugin(): Plugin {
  return {
    name: "deepseek-local-proxy",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
        const pathname = request.url?.split("?")[0];
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

        if (pathname?.startsWith("/api/persona-dossiers/") && pathname.endsWith("/preview") && request.method === "POST") {
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

        if (pathname?.startsWith("/api/persona-dossiers/") && pathname.endsWith("/conversation-state") && request.method === "POST") {
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

        if (pathname?.startsWith("/api/persona-dossiers/") && pathname.endsWith("/conversation-history") && request.method === "GET") {
          const session = requireSession(request, response);
          if (!session) return;
          const dossierId = decodeURIComponent(pathname.replace("/api/persona-dossiers/", "").replace("/conversation-history", ""));
          sendJson(response, 200, { messages: readConversationHistoryMessages(dossierId, session.user) });
          return;
        }

        if (pathname?.startsWith("/api/persona-dossiers/") && pathname.endsWith("/conversation-history") && request.method === "POST") {
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

        if (pathname?.startsWith("/api/persona-dossiers/") && request.method === "DELETE") {
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

        if (pathname === "/api/conversation-audits" && request.method === "DELETE") {
          if (!requireAdminSession(request, response)) return;
          sendJson(response, 200, clearConversationAudits());
          return;
        }

        if (pathname?.startsWith("/api/conversation-audits/") && request.method === "DELETE") {
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
            "utf-8",
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
          try {
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
          } catch (error) {
            if (response.headersSent) {
              sendSse(response, { error: error instanceof Error ? error.message : "DeepSeek 调用失败" });
              response.end();
              return;
            }
            sendJson(response, 500, { error: error instanceof Error ? error.message : "DeepSeek 调用失败" });
          }
          return;
        }

        next();
      });
    },
  };
}

function readDeepseekConfig() {
  if (!existsSync(deepseekConfigPath)) {
    return { apiKey: "", endpoint: defaultDeepseekEndpoint, model: defaultDeepseekModel };
  }

  try {
    const parsed = JSON.parse(readFileSync(deepseekConfigPath, "utf-8")) as { apiKey?: string; endpoint?: string; model?: string };
    return {
      apiKey: parsed.apiKey || "",
      endpoint: parsed.endpoint || defaultDeepseekEndpoint,
      model: normalizeDeepseekModel(parsed.model || defaultDeepseekModel),
    };
  } catch {
    return { apiKey: "", endpoint: defaultDeepseekEndpoint, model: defaultDeepseekModel };
  }
}

async function callDeepseek(body: Record<string, unknown>, config: ReturnType<typeof readDeepseekConfig>, apiKey: string) {
  const outputMode = body.outputMode === "structured_json" ? "structured_json" : "natural_language";
  const moduleName = typeof body.moduleName === "string" ? body.moduleName : "unknown";
  const upstream = await fetchDeepseek(body, config, apiKey, false);

  const raw = await upstream.text();
  if (!upstream.ok) {
    throw new Error(`DeepSeek 返回 ${upstream.status}: ${raw.slice(0, 300)}`);
  }

  const payload = JSON.parse(raw) as { choices?: { message?: { content?: string | null; reasoning_content?: string | null } }[] };
  const content = payload.choices?.[0]?.message?.content?.trim() || "";
  if (!content) {
    throw new Error("DeepSeek 没有返回内容");
  }

  if (outputMode === "structured_json") {
    return parseJsonContent(content);
  }

  return moduleName === "reply_generation" ? { reply: content } : content;
}

async function streamDeepseek(body: Record<string, unknown>, config: ReturnType<typeof readDeepseekConfig>, apiKey: string, response: ServerResponse) {
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

      const parsed = JSON.parse(data) as { choices?: { delta?: { content?: string | null; reasoning_content?: string | null } }[] };
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

async function fetchDeepseek(body: Record<string, unknown>, config: ReturnType<typeof readDeepseekConfig>, apiKey: string, stream: boolean) {
  const outputMode = body.outputMode === "structured_json" ? "structured_json" : "natural_language";
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
      : "你只返回最终文本，不要解释，不要附加标签。";
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
      max_tokens: outputMode === "structured_json" ? 2600 : 700,
    }),
  }).finally(() => clearTimeout(timeout));
}

function parseJsonContent(content: string) {
  const withoutFence = content
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(withoutFence);
}

function sendSse(response: ServerResponse, data: unknown) {
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

function normalizeDeepseekModel(model: string) {
  return model === "deepseek-reasoner" ? defaultDeepseekModel : model;
}
