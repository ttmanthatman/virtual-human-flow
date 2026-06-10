# App Shell Context Pack

## 边界

App Shell 负责三栏工作台、前端交互状态、聊天入口、连续回复分条呈现、流程追踪、生成监视、档案切换、管理员审计查看/选择/导出和浏览器端权限提示。它不负责服务端持久化规则、真实 DeepSeek 代理实现或认知模块内部判断。

## 相关文件

- `src/App.tsx`
- `src/styles.css`
- `src/core/types.ts`
- `src/pipeline/conversationPipeline.ts`
- `src/pipeline/generators.ts`
- `src/pipeline/profileSceneConsistency.ts`
- `docs/modules/persona-dossiers.md`
- `docs/modules/auth-permissions.md`

## 输入输出

- 输入：用户点击、输入框内容、当前 `authUser`、当前 `personaDossier`、后台 API 返回、更新提交摘要、pipeline trace。
- 输出：UI 状态、中间栏消息（含 Reply LLM 连续回复分段）、右侧 `pipelineTrace`/`generationMonitor`、后台保存请求、管理员审计 JSON 下载、更新窗口“本次更新”说明。

## 不变量

- 未登录用户可以看界面，但发送、切换、保存、测试、审计查看和审计导出等受限操作必须打开登录浮窗或被拦截。
- 普通用户只能读取自己的历史和运行态；管理员查看他人历史必须是只读入口。
- 生成监视不能占用聊天发送状态。
- 左上角更新窗口发现新版本时必须展示待更新提交摘要，不能只展示“有新版本”和提交 SHA。
- 发现新版本时“更新服务器”按钮不能因为未登录或管理员状态尚未恢复而原生禁用；点击后应进入 `requireAdmin`，由登录浮窗或权限提示解释原因。
- Reply LLM 的角色台词边界不能被 UI 调试字段污染。
- `replyOutput.segments` 有多段时，中间栏要保存和展示多条角色消息；审计里的 `personaOutput` 仍保留完整自然语言回复。
- 切换人物、用户或管理员历史时，消息桶不能串线。

## 查询线索

- `rg -n "App Shell|Conversation History|generationMonitor|PipelineStepProgress|replyOutput.segments|createConversationHistoryKey|adminConversationHistoryAccess|conversationAuditExport" docs/AI_NAMING_REGISTRY.md docs/SYSTEM_FLOW.md`
- `rg -n "liveTrace|activeStep|authUser|personaDossier|normalizeReplySegments|conversation-history|conversation-state|selectedAuditIds|exportConversationAuditEntries" src/App.tsx`

## 验证

- UI 或状态改动：`npm run build`
- 回复分段展示：`npm run verify:temporal-scene-and-reply-segments`
- 更新按钮可点击性：`npm run verify:update-button-clickable`
- 历史隔离相关：`npm run verify:conversation-message-history`
- 管理员历史或审计相关：`npm run verify:admin-history-and-module-audit`
- 管理员审计浮层滚动：`npm run verify:audit-modal-scroll`
