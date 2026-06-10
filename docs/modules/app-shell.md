# App Shell Context Pack

## 边界

App Shell 负责三栏工作台、前端交互状态、聊天入口、流程追踪、生成监视、档案切换和浏览器端权限提示。它不负责服务端持久化规则、真实 DeepSeek 代理实现或认知模块内部判断。

## 相关文件

- `src/App.tsx`
- `src/App.css`
- `src/core/types.ts`
- `src/pipeline/conversationPipeline.ts`
- `src/pipeline/generators.ts`
- `src/pipeline/profileSceneConsistency.ts`
- `docs/modules/persona-dossiers.md`
- `docs/modules/auth-permissions.md`

## 输入输出

- 输入：用户点击、输入框内容、当前 `authUser`、当前 `personaDossier`、后台 API 返回、pipeline trace。
- 输出：UI 状态、中间栏消息、右侧 `pipelineTrace`/`generationMonitor`、后台保存请求。

## 不变量

- 未登录用户可以看界面，但发送、切换、保存、测试、审计等受限操作必须打开登录浮窗或被拦截。
- 普通用户只能读取自己的历史和运行态；管理员查看他人历史必须是只读入口。
- 生成监视不能占用聊天发送状态。
- Reply LLM 的角色台词边界不能被 UI 调试字段污染。
- 切换人物、用户或管理员历史时，消息桶不能串线。

## 查询线索

- `rg -n "App Shell|Conversation History|generationMonitor|PipelineStepProgress|createConversationHistoryKey|adminConversationHistoryAccess" docs/AI_NAMING_REGISTRY.md docs/SYSTEM_FLOW.md`
- `rg -n "liveTrace|activeStep|authUser|personaDossier|conversation-history|conversation-state" src/App.tsx`

## 验证

- UI 或状态改动：`npm run build`
- 历史隔离相关：`npm run verify:conversation-message-history`
- 管理员历史或审计相关：`npm run verify:admin-history-and-module-audit`
- 管理员审计浮层滚动：`npm run verify:audit-modal-scroll`
