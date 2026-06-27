# Server Support Context Pack

## 边界

Server Support 负责 Node/Vite/生产服务共享的后端能力：登录会话、liao 登录代理、liao 登录响应归一化、共享档案合并、运行时 JSON 文件、用户私有消息历史、房间时间线聚合读取、共享角色历史只读读取、角色全局对话运行态、审计、管理员审计导出、当前角色运行态重置和站内更新执行。它不负责前端 UI 布局或认知模块内部判断。

## 相关文件

- `serverSupport.mjs`
- `server.mjs`
- `vite.config.ts`
- `builtinPersonaDossiers.mjs`
- `docs/modules/auth-permissions.md`
- `docs/modules/persona-dossiers.md`
- `docs/modules/deployment-update.md`

## 输入输出

- 输入：HTTP request、本地 runtime JSON、`builtinPersonaDossiers`、liao `/api/auth/login` 或旧 `/api/login` 登录响应、git 工作树状态。
- 输出：auth session、persona dossiers、当前用户 conversation history（含渠道标签、现场事件活动卡、当前活动快照和折叠心理流记录）、当前角色房间 room messages、当前角色下所有用户 history summaries/messages、conversation states（含 `runtime.currentActivity`）、conversation audits、conversation audit export、审计删除级联清理结果、角色重置清理结果、update status/SSE。

## 不变量

- `.deepseek.local.json`、`.persona-dossiers.local.json`、`.conversation-histories.local.json`、`.conversation-states.local.json`、`.conversation-audits.local.json` 不能提交。
- liao 登录桥接优先请求 `/api/auth/login`，只有 404/405 才回退旧 `/api/login`；401 这类账号密码失败不能继续回退，以免把真实错误改写成路径错误。
- liao 当前 `{ token, account }` 与旧顶层用户字段都要归一化成本地 `authUser`；上游 token 不返回前端。
- 共享档案底稿和角色全局运行态必须分开。
- 登录用户只能向自己的 `userId + dossierId` 中间栏消息历史写入；角色记忆、runtime、`runtime.currentActivity`、scene 和 location 是同一人物的全局运行态。
- 登录用户默认可以读取当前角色的房间时间线；房间时间线由同一 `dossierId` 下所有私有历史合并、按时间排序、去重生成，不提供冒充其他用户写入能力。
- 消息历史 sanitizer 必须保留 `channel`、`channelLabel`、`messageType: "mind_flow" | "event_activity"`、`collapsed` 和 `details`，让渠道现实约束、现场事件和真实心理流记录能在刷新后继续显示。
- 登录用户可以通过共享历史入口只读查看当前角色下某个用户的中间栏消息；不能通过该入口写入或冒充其他用户。
- 管理员入口可以观察和维护共享数据；审计、导出、删除和重置仍要求管理员。
- 删除单条或清空审计记录时，不能只删 `.conversation-audits.local.json`；需要按 `conversationEventId`、`conversationHistoryMessageIds` 或旧记录内容兜底，清理同轮中间栏历史和角色全局运行态里的短期/长期/关系记忆。
- 重置当前角色时只清理该 `dossierId` 的用户历史、角色全局运行态和对应审计记录，恢复到共享档案底稿；不能删除或改写 `.persona-dossiers.local.json` 中的档案定义。
- 生产和本地代理都必须关闭 DeepSeek thinking，并避免 `deepseek-reasoner`。

## 查询线索

- `rg -n "Server Support|authSession|sharedPersonaDossier|roomConversationHistory|globalConversationState|conversationAuditEntry|conversationAuditExport|manualVpsUpdate|DeepSeek" docs/AI_NAMING_REGISTRY.md docs/SYSTEM_FLOW.md`
- `rg -n "requireSession|requireAdminSession|readPersonaDossiers|readConversationRoomMessages|conversation-history|conversation-histories|conversation-state|reset-conversation|conversation-audits|exportConversationAudits|deleteConversationArtifactsForAudit|app-update|loginWithLiaoChatroom|LIAO_CHATROOM_LOGIN_PATH" serverSupport.mjs server.mjs vite.config.ts`

## 验证

- 服务端 API 或 runtime 文件改动：`npm run build`
- liao 登录桥接：`npm run verify:liao-auth-bridge`
- 全局角色运行态和私有消息历史：`npm run verify:global-conversation-state`
- 中间栏历史：`npm run verify:conversation-message-history`
- 共享历史和管理员审计：`npm run verify:admin-history-and-module-audit`
