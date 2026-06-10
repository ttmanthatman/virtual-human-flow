import { spawn } from "node:child_process";
import { chromium } from "playwright";

const port = 5176;
const server = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port)], {
  stdio: ["ignore", "pipe", "pipe"],
});

let serverOutput = "";
server.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

try {
  await waitForServer(`http://127.0.0.1:${port}/`);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.route("**/api/app-update/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configured: true,
        available: true,
        branch: "main",
        currentVersion: "0.3.3",
        currentCommit: "dfe9e6e41b798c32eed9f68101e7ea84e5c676ca",
        remoteCommit: "a8deb8e3e5cd20ccb1e224af88f328fa652f5fd4",
        pendingCommitCount: 1,
        pendingCommits: [
          {
            commit: "a8deb8e3e5cd20ccb1e224af88f328fa652f5fd4",
            shortCommit: "a8deb8e",
            title: "fixture update",
            body: "fixture body",
          },
        ],
        changesSummary: "发现 GitHub 新版本，包含 1 个提交。",
        checkedAt: new Date().toISOString(),
        message: "发现 GitHub 新版本，包含 1 个提交。",
      }),
    });
  });

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /有新版本|检查更新|已是最新/ }).click();
  const updateButton = page.getByRole("button", { name: /更新服务器/ });
  await updateButton.waitFor({ state: "visible" });
  if (!(await updateButton.isEnabled())) {
    throw new Error("Expected 更新服务器 button to stay clickable so requireAdmin can show login or permission feedback.");
  }

  await browser.close();
  console.log("update button clickable verified");
} finally {
  server.kill("SIGTERM");
}

async function waitForServer(url) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15000) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Dev server did not start. Output:\n${serverOutput}`);
}
