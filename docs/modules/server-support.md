# Server Support Context Pack

## 边界

Server Support 负责 Node/Vite/生产服务共享的后端能力：登录会话、liao 登录代理、共享档案合并、运行时 JSON 文件、用户私有历史和运行态、审计、管理员审计导出、管理员历史读取和站内更新执行。它不负责前端 UI 布局或认知模块内部判断。

## 相关文件

- `serverSupport.mjs`
- `server.mjs`
- `vite.config.ts`
- `builtinPersonaDossiers.mjs`
- `docs/modules/auth-permissions.md`
- `docs/modules/persona-dossiers.md`
- `docs/modules/deployment-update.md`

## 输入输出

- 输入：HTTP request、本地 runtime JSON、`builtinPersonaDossiers`、liao 登录响应、git 工作树状态。
- 输出：auth session、persona dossiers、conversation histories、conversation states、conversation audits、conversation audit export、update status/SSE。

## 不变量

- `.deepseek.local.json`、`.persona-dossiers.local.json`、`.conversation-histories.local.json`、`.conversation-states.local.json`、`.conversation-audits.local.json` 不能提交。
- 共享档案底稿和用户私有运行态必须分开。
- 普通用户只能读写自己的历史和运行态。
- 管理员入口可以观察和维护共享数据，但查看他人历史时必须保持只读语义。
- 生产和本地代理都必须关闭 DeepSeek thinking，并避免 `deepseek-reasoner`。

## 查询线索

- `rg -n "Server Support|authSession|sharedPersonaDossier|userConversationState|conversationAuditEntry|conversationAuditExport|manualVpsUpdate|DeepSeek" docs/AI_NAMING_REGISTRY.md docs/SYSTEM_FLOW.md`
- `rg -n "requireSession|requireAdminSession|readPersonaDossiers|conversation-history|conversation-state|conversation-audits|exportConversationAudits|app-update" serverSupport.mjs server.mjs vite.config.ts`

## 验证

- 服务端 API 或 runtime 文件改动：`npm run build`
- 用户历史隔离：`npm run verify:conversation-history-isolation`
- 中间栏历史：`npm run verify:conversation-message-history`
- 管理员历史和审计：`npm run verify:admin-history-and-module-audit`
