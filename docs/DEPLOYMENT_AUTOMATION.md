# Deployment Automation

本文档记录当前生产更新方式。GitHub push 不再自动更新网站；生产环境改为站内管理员手动触发 VPS 自更新。

## 当前策略

左上角版本区域会调用 `/api/app-update/status` 检查服务器 git 工作树与 GitHub 远端分支是否一致。发现远端有新提交时，界面显示“有新版本”，并在更新窗口展示待更新提交的数量、标题和正文摘要。只有管理员可以调用 `/api/app-update/run` 执行更新；普通用户只能看到状态提示。每次提交都要写清楚修改内容和改进点，因为这些提交说明会成为站内更新说明。

更新 API 会在 VPS 本机执行：

1. 确认更新目录是安全的 git 工作树。
2. 确认当前分支与 `APP_UPDATE_BRANCH` 一致。
3. 检查跟踪文件是否干净。
4. `git fetch origin <branch>`。
5. `git pull --ff-only origin <branch>`。
6. `npm ci`。
7. `npm run build`。
8. 执行 `APP_UPDATE_RESTART_COMMAND`，或用 `APP_UPDATE_PM2_NAME` / `PRODUCTION_PM2_NAME` 生成 PM2 重启命令。

更新过程通过 SSE 返回步骤、stdout/stderr 和进度，前端显示成小型代码窗。

## 生产环境变量

| 变量 | 说明 |
| --- | --- |
| `APP_UPDATE_WORKDIR` | VPS 上的 git clone 工作目录；必须包含 `.git` |
| `APP_UPDATE_BRANCH` | 可选；默认 `main` |
| `APP_UPDATE_RESTART_COMMAND` | 可选；更新完成后的重启命令 |
| `APP_UPDATE_PM2_NAME` | 可选；未设置 restart command 时用于 `pm2 restart <name> --update-env` |
| `LIAO_CHATROOM_ORIGIN` | 登录用户来源聊天室 origin |
| `PORT` | 生产服务监听端口 |
| `DEEPSEEK_API_KEY` | 可选；也可以继续使用服务器本地 `.deepseek.local.json` |

不要把 VPS 密码、私钥、生产域名、生产目录、登录源、DeepSeek 密钥写入仓库。

## 引导部署

如果当前线上目录仍来自旧 GitHub Actions tar 包，它通常不是 git 工作树。站内更新功能上线前，需要人工做一次引导部署：

1. 在 VPS 上准备只服务本项目的 git clone 工作目录。
2. 安装依赖并运行 `npm run build`。
3. 用 PM2 启动该工作目录里的 `server.mjs`。
4. 设置 `APP_UPDATE_WORKDIR` 指向这个 git 工作目录。
5. 设置 `APP_UPDATE_PM2_NAME` 或 `APP_UPDATE_RESTART_COMMAND`。
6. 确认 `/health` 返回 OK。

完成引导部署后，后续版本可以由管理员在站内触发。

## 回滚

站内更新不自动改 nginx，也不自动操作同 VPS 上其他站点。若更新后需要回滚，在 VPS 的 git 工作目录中切回确认过的提交并重新构建、重启：

```bash
cd <production-git-workdir>
git checkout <known-good-commit>
npm ci
npm run build
pm2 restart <production-pm2-name> --update-env
curl --fail http://127.0.0.1:<production-port>/health
```

回滚时只操作确认过的生产工作目录和 PM2 进程。
