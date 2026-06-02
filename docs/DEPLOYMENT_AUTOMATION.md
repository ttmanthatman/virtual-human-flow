# Deployment Automation

本文档记录 `ok.xiaogushi.us` 的自动部署方式。目标是减少重复人工 SSH 操作：新版本进入 GitHub `main` 分支后，由 GitHub Actions 自动构建并同步到 VPS。

## 自动触发

`.github/workflows/deploy-production.yml` 会在以下场景运行：

- push 到 `main`，但纯 `docs/**` 或 `README.md` 变更不会触发部署
- 在 GitHub Actions 页面手动点击 `workflow_dispatch`

工作流只允许在 `ttmanthatman/virtual-human-flow` 仓库运行，避免 fork 或错误仓库误触发生产部署。

## GitHub Secrets

需要在 GitHub 仓库的 Actions secrets 中配置：

| Secret | 说明 |
| --- | --- |
| `PRODUCTION_SSH_HOST` | VPS 主机名或 IP |
| `PRODUCTION_SSH_USER` | SSH 用户，必须有权限操作 `/var/www/ok.xiaogushi.us/app`、PM2 和备份目录 |
| `PRODUCTION_SSH_KEY_B64` | 只用于部署的私钥内容，使用 base64 单行格式 |
| `PRODUCTION_SSH_PORT` | 可选；不填默认 `22` |

不要把 VPS 密码、私钥、DeepSeek 密钥写入仓库。线上 DeepSeek 凭据仍然保留在服务器的 `.deepseek.local.json` 或环境变量中，GitHub Actions 不上传、不覆盖。

## 部署动作

自动部署执行以下步骤：

1. GitHub runner 安装依赖并运行 `npm run build`。
2. 打包 `dist/`、`server.mjs`、`package.json`、`package-lock.json`。
3. 通过 SSH 上传 release archive 到 VPS `/tmp`。
4. VPS 端确认目标目录必须是 `/var/www/ok.xiaogushi.us/app`。
5. 备份当前线上目录到 `/root/ok.xiaogushi.us-backups/<timestamp>.tgz`。
6. 解压新版本到 `/var/www/ok.xiaogushi.us/app`。
7. 运行 `npm ci --omit=dev`。
8. 重启或创建 PM2 进程 `ok-xiaogushi-us`，监听 `127.0.0.1:4174`。
9. 请求 `http://127.0.0.1:4174/health` 验证本机服务健康。

## 部署边界

自动部署只允许操作：

- 域名对应应用目录：`/var/www/ok.xiaogushi.us/app`
- 备份目录：`/root/ok.xiaogushi.us-backups`
- PM2 进程：`ok-xiaogushi-us`
- 本机健康检查：`127.0.0.1:4174/health`

自动部署不修改 nginx 配置，不操作同一 VPS 上其他站点、数据库、PM2 进程或服务。

## 回滚

如果自动部署失败，GitHub Actions 会停在失败步骤。若需要回滚，在 VPS 上把最近一次备份解压回应用目录，然后重启 PM2：

```bash
cd /var/www/ok.xiaogushi.us/app
tar --extract --gzip --file /root/ok.xiaogushi.us-backups/<timestamp>.tgz --directory .
PORT=4174 pm2 restart ok-xiaogushi-us --update-env
curl --fail http://127.0.0.1:4174/health
```

回滚时只使用确认过的 `ok.xiaogushi.us` 备份文件。
