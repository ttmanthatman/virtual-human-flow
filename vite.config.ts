import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

const deepseekConfigPath = resolve(process.cwd(), ".deepseek.local.json");
const defaultDeepseekEndpoint = "https://api.deepseek.com/chat/completions";
const defaultDeepseekModel = "deepseek-v4-flash";

export default defineConfig({
  plugins: [react(), deepseekProxyPlugin()],
});

function deepseekProxyPlugin(): Plugin {
  return {
    name: "deepseek-local-proxy",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
        const pathname = request.url?.split("?")[0];
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
                model: typeof body.model === "string" && body.model.trim() ? body.model.trim() : defaultDeepseekModel,
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

        if (pathname === "/api/deepseek-chat" && request.method === "POST") {
          try {
            const body = await readJsonBody(request);
            const config = readDeepseekConfig();
            const apiKey = config.apiKey || process.env.DEEPSEEK_API_KEY;
            if (!apiKey) {
              sendJson(response, 401, { error: "DeepSeek API Key 尚未保存" });
              return;
            }

            const result = await callDeepseek(body, config, apiKey);
            sendJson(response, 200, result);
          } catch (error) {
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
      model: parsed.model || defaultDeepseekModel,
    };
  } catch {
    return { apiKey: "", endpoint: defaultDeepseekEndpoint, model: defaultDeepseekModel };
  }
}

async function callDeepseek(body: Record<string, unknown>, config: ReturnType<typeof readDeepseekConfig>, apiKey: string) {
  const outputMode = body.outputMode === "structured_json" ? "structured_json" : "natural_language";
  const moduleName = typeof body.moduleName === "string" ? body.moduleName : "unknown";
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  const outputContract = typeof body.outputContract === "string" ? body.outputContract : "";
  const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : config.model;
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

  const upstream = await fetch(config.endpoint || defaultDeepseekEndpoint, {
    method: "POST",
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
      stream: false,
      temperature: 0.4,
      max_tokens: outputMode === "structured_json" ? 1400 : 700,
    }),
  });

  const raw = await upstream.text();
  if (!upstream.ok) {
    throw new Error(`DeepSeek 返回 ${upstream.status}: ${raw.slice(0, 300)}`);
  }

  const payload = JSON.parse(raw) as { choices?: { message?: { content?: string | null } }[] };
  const content = payload.choices?.[0]?.message?.content?.trim() || "";
  if (!content) {
    throw new Error("DeepSeek 没有返回内容");
  }

  if (outputMode === "structured_json") {
    return parseJsonContent(content);
  }

  return moduleName === "reply_generation" ? { reply: content } : content;
}

function parseJsonContent(content: string) {
  const withoutFence = content
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(withoutFence);
}

function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf-8");
        resolveBody(text ? (JSON.parse(text) as Record<string, unknown>) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response: ServerResponse, statusCode: number, data: unknown) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(data));
}
