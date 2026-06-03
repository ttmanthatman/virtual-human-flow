# Deployment Automation

本文档记录生产环境的自动部署方式。目标是减少重复人工 SSH 操作：新版本进入 GitHub `main` 分支后，由 GitHub Actions 自动构建并同步到已授权 VPS。

## 自动触发

`.github/workflows/deploy-production.yml` 会在以下场景运行：

- push 到 `main`，但纯 `docs/**` 或 `README.md` 变更不会触发部署
- 在 GitHub Actions 页面手动点击 `workflow_dispatch`

工作流只允许在 `<owner>/<repo>` 仓库运行，避免 fork 或错误仓库误触发生产部署。

## GitHub Secrets

需要在 GitHub 仓库的 Actions secrets 中配置：

| Secret | 说明 |
| --- | --- |
| `PRODUCTION_SSH_HOST` | VPS 主机名或 IP |
| `PRODUCTION_SSH_USER` | SSH 用户，必须有权限操作 `<production-app-dir>`、PM2 和备份目录 |
| `PRODUCTION_SSH_KEY_B64` | 只用于部署的私钥内容，使用 base64 单行格式 |
| `PRODUCTION_SSH_PORT` | 可选；不填默认 `22` |
| `PRODUCTION_APP_DIR` | 生产应用目录，必须是绝对路径 |
| `PRODUCTION_BACKUP_DIR` | 生产备份目录，必须是绝对路径 |
| `PRODUCTION_PM2_NAME` | 生产 PM2 进程名 |
| `PRODUCTION_PORT` | 生产服务监听端口 |
| `LIAO_CHATROOM_ORIGIN` | 登录用户来源聊天室的 origin |

不要把 VPS 密码、私钥、生产域名、生产目录、登录源、DeepSeek 密钥写入仓库。线上 DeepSeek 凭据仍然保留在服务器的 `.deepseek.local.json` 或环境变量中，GitHub Actions 不上传、不覆盖。

## 部署动作

自动部署执行以下步骤：

1. GitHub runner 安装依赖。
2. 校验 `APP_VERSION`、`package.json` 和 `package-lock.json` 版本一致。
3. 运行 `npm run build`。
4. 打包 `dist/`、`server.mjs`、`serverSupport.mjs`、`builtinPersonaDossiers.mjs`、`package.json`、`package-lock.json`。
5. 通过 SSH 上传 release archive 到 VPS 临时目录。
6. VPS 端确认目标目录和备份目录是安全的绝对路径。
7. 备份当前线上目录到 `<production-backup-dir>/<timestamp>.tgz`。
8. 解压新版本到 `<production-app-dir>`。
9. 运行 `npm ci --omit=dev`。
10. 重启或创建 PM2 进程 `<production-pm2-name>`，监听 `127.0.0.1:<production-port>`。
11. 请求 `http://127.0.0.1:<production-port>/health` 验证本机服务健康。

## 部署边界

自动部署只允许操作：

- 域名对应应用目录：`<production-app-dir>`
- 备份目录：`<production-backup-dir>`
- PM2 进程：`<production-pm2-name>`
- 本机健康检查：`127.0.0.1:<production-port>/health`

自动部署不修改 nginx 配置，不操作同一 VPS 上其他站点、数据库、PM2 进程或服务。

## 回滚

如果自动部署失败，GitHub Actions 会停在失败步骤。若需要回滚，在 VPS 上把最近一次备份解压回应用目录，然后重启 PM2：

```bash
cd <production-app-dir>
tar --extract --gzip --file <production-backup-dir>/<timestamp>.tgz --directory .
PORT=<production-port> pm2 restart <production-pm2-name> --update-env
curl --fail http://127.0.0.1:<production-port>/health
```

回滚时只使用确认过的生产备份文件。
