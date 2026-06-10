# Deployment Update Context Pack

## 边界

Deployment Update 负责 GitHub 推送后的站内手动更新路径、生产服务边界、VPS 工作树更新、构建、重启和回滚说明。它不负责自动部署到其他站点，也不管理同一 VPS 上的其他服务。

## 相关文件

- `serverSupport.mjs`
- `server.mjs`
- `src/App.tsx`
- `docs/DEPLOYMENT_AUTOMATION.md`
- `docs/modules/server-support.md`

## 输入输出

- 输入：当前 git 提交、远端分支提交、待更新提交说明、管理员更新请求、`APP_UPDATE_WORKDIR`、`APP_UPDATE_BRANCH`、`APP_UPDATE_PM2_NAME` 或 `APP_UPDATE_RESTART_COMMAND`。
- 输出：`appUpdateStatus`、`appUpdateChangeSummary`、`appUpdateLogEntry`、站内 SSE 更新日志、生产构建和重启结果。

## 不变量

- 每个完成并提交的 reviewable step 默认推送当前分支到 GitHub。
- 提交信息必须说明修改了什么、改进了什么，因为左上角更新窗口会直接展示待更新提交摘要。
- GitHub push 不自动更新生产；管理员在站内触发 `/api/app-update/run`。
- 部署只操作 `<production-domain>` 对应站点、配置、进程和目录。
- 生产环境变量和 `.deepseek.local.json` 留在 VPS，不写入仓库。
- 更新前必须检查工作树，更新后要能看到提交、版本、服务位置、验证结果和回滚方式。

## 查询线索

- `rg -n "manualVpsUpdate|appUpdateStatus|appUpdateChangeSummary|appUpdateLogEntry|defaultGithubPush|Deployment Automation|站内手动更新" docs/AI_NAMING_REGISTRY.md docs/SYSTEM_FLOW.md docs/DEPLOYMENT_AUTOMATION.md`
- `rg -n "readAppUpdateStatus|streamAppUpdate|app-update|APP_UPDATE|checkAppUpdate|handleRunAppUpdate" serverSupport.mjs src/App.tsx server.mjs`

## 验证

- 更新 UI/API 改动：`npm run build`
- 文档-only 部署规则改动：`git diff --check`
