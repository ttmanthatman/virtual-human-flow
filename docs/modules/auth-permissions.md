# Auth Permissions Context Pack

## 边界

Auth Permissions 负责 liao 聊天室登录校验、本项目本地 session、登录态 UI、管理员权限、普通用户隔离、管理员审计导出权限和受限 API 边界。它不负责上游聊天室数据维护，也不保存用户密码。

## 相关文件

- `serverSupport.mjs`
- `src/App.tsx`
- `vite.config.ts`
- `server.mjs`
- `docs/modules/server-support.md`
- `docs/modules/app-shell.md`

## 输入输出

- 输入：用户名、密码、liao `/api/login` 响应、Authorization Bearer token、用户发起的受限操作。
- 输出：`authSession`、`authUser`、管理员/普通用户权限分支、401/403 响应、登录浮窗状态。

## 不变量

- 本项目只调用 liao 聊天室 `/api/login` 校验，不保存密码，不修改聊天室数据。
- 上游 token 不返回前端，也不写入仓库。
- 本地 `authSession` 存内存，服务重启后需要重新登录。
- 管理员权限来自 liao 返回的 `isAdmin`。
- 普通登录用户不能新增、保存、删除或应用共享档案，不能查看审计、导出审计或查看他人中间栏历史；普通用户的对话仍会写入该人物的全局记忆和全局场景运行态。

## 查询线索

- `rg -n "authSession|adminUser|loginWithLiaoChatroom|requireSession|requireAdminSession|adminConversationHistoryAccess|conversationAuditExport|liao" docs/AI_NAMING_REGISTRY.md docs/SYSTEM_FLOW.md`
- `rg -n "login|authToken|authUser|isAdmin|requireSession|requireAdminSession|conversation-audits/export|LIAO_CHATROOM_ORIGIN" src serverSupport.mjs vite.config.ts server.mjs`

## 验证

- 登录或权限改动：`npm run build`
- 全局角色运行态和私有消息历史：`npm run verify:global-conversation-state`
- 管理员历史/审计权限：`npm run verify:admin-history-and-module-audit`
