# App Shell Context Pack

## 边界

App Shell 负责三栏工作台、前端交互状态、房间时间线、聊天入口、消息渠道选择、现场事件触发、当前活动查看、当前上下文标签、连续回复分条呈现、心理/活动流折叠展开、流程追踪、旧兼容管线显示开关、生成监视、心理探针开关、档案切换、当前角色重置入口、共享角色历史选择器、管理员审计查看/选择/导出、浏览器端权限提示和 liao 聊天室跳转入口。它不负责服务端持久化规则、真实 DeepSeek 代理实现或认知模块内部判断。

## 相关文件

- `src/App.tsx`
- `src/styles.css`
- `src/chat/mindFlowMessages.ts`
- `src/core/types.ts`
- `src/pipeline/conversationPipeline.ts`
- `src/pipeline/generators.ts`
- `src/pipeline/profileSceneConsistency.ts`
- `docs/modules/persona-dossiers.md`
- `docs/modules/auth-permissions.md`

## 输入输出

- 输入：用户点击、输入框内容、当前 `authUser`、当前 `personaDossier`、后台 API 返回、更新提交摘要、pipeline trace、`?from=liao`/`?login=liao` 跳转参数。
- 输出：UI 状态、中间栏房间消息（含渠道标签、可折叠心理流、可折叠现场事件活动、可折叠当前活动快照、`roleTurn` 台词连续回复分段）、中间栏当前人物全局 `scene/location/runtime` 摘要和当前上下文标签、当前角色下各用户历史只读展示、右侧 `pipelineTrace`/`generationMonitor`/可选心理探针审计、后台保存请求、管理员审计 JSON 下载、角色重置请求、更新窗口“本次更新”说明。

## 不变量

- 未登录用户可以看界面，但发送、切换、保存、测试、审计查看和审计导出等受限操作必须打开登录浮窗或被拦截。
- 顶部和登录浮窗必须保留去 `liao.xiaogushi.us` 的跳转入口；从 liao 跳转回来带 `from=liao` 或 `login=liao` 时要自动打开登录浮窗。
- 登录用户默认看到当前角色的“房间时间线”，它由同一 `dossierId` 下所有用户私有历史合并而成；发送仍只写入当前用户私有桶和本地房间视图。
- 当前角色下某个用户的私有历史可以通过历史选择器只读查看，查看单个用户历史时必须禁用发送和事件触发。
- 生成监视不能占用聊天发送状态。
- 左上角更新窗口发现新版本时必须展示待更新提交摘要，不能只展示“有新版本”和提交 SHA。
- 发现新版本时“更新服务器”按钮不能因为未登录或管理员状态尚未恢复而原生禁用；点击后应进入 `requireAdmin`，由登录浮窗或权限提示解释原因。
- `roleTurn` 的角色台词边界不能被 UI 调试字段污染；只有 `replyOutput.reply`/`segments` 能进入聊天历史。
- 心理探针开关默认关闭并持久化在浏览器本地；开启时只把 `debug.roleTurnProbeEnabled` 传给 pipeline，探针结果只出现在右侧 trace 和模块审计，不进入聊天历史、State Update 或关系记忆。
- 旧兼容管线显示开关默认关闭并持久化在浏览器本地；关闭时隐藏 Appraisal、Memory Recall、Decision、Reply request/output、Runtime Signal Evaluation 和 State Delta 的兼容视图，但不影响 `roleTurn`、State Update、真实心理流记录或后台状态写回。
- 对话发送必须带上 `ConversationChannel` 和 `channelLabel`。微信、短信、电话、面对面、门外等渠道要进入 `EventInput`、用户消息、主脑 prompt、审计输入和短期记忆，不能把远程消息误当成物理共处。
- `replyOutput.segments` 有多段时，中间栏要保存和展示多条角色消息；审计里的 `personaOutput` 仍保留完整自然语言回复。
- `PipelineStepProgress.mindFlow` 是真实 pipeline progress，不是回复生成后的假摘要。第一句发言完成后，pre-speech 心理流必须折叠成可展开卡；整轮完成后，post-speech 心理流也要折叠成可展开卡。折叠后的心理流要以非 transient 的 `mind_flow` 消息进入当前用户历史，刷新后仍可查看。
- 现场事件触发不是聊天发送；用户输入现场文字后，系统用当前真实时间校准 `scene/location/runtime`，再调用 `runEventActivity`，把 LLM 生成的心理、动作、位移、关系和记忆活动 streaming 到房间，完成后写入一条可折叠 `event_activity` 房间活动卡、角色短期记忆和 `runtime.currentActivity`，不要求角色一定输出台词。
- 触发事件旁边的“查看现在”不是聊天输入；它构造 `internal_trigger`，只运行 `advanceSceneForCurrentTime` 和 `formatCurrentActivitySnapshot`，把当前人物位置、移动状态和持续活动保存成可折叠 `event_activity` 房间卡。
- 当 `replyOutput.segments` 有多段输出时，中间栏先展示第一句，让后置心理流继续 streaming；整轮完成后再追加后续分段，表现为“说完后心理余波推动再次发言”。
- 中间栏场景条必须跟随角色全局运行态展示当前场景、位置、移动状态和状态摘要。
- 中间栏顶部上下文标签优先显示 `runtime.currentActivity` 或注意力焦点，不能直接把长期关切列表当作当前事件标签；长期关切留在左侧详情中解释。
- 切换人物、用户或共享历史时，消息桶不能串线。
- 登录用户历史以后台返回为准；后台返回空历史时，前端必须清空当前消息桶和 localStorage，不能用旧缓存回填服务器。
- 删除审计或重置当前角色后，前端必须同步清理当前消息桶、共享历史桶和 localStorage，避免回主页面后看到旧记录。

## 查询线索

- `rg -n "App Shell|Conversation History|roomConversationHistory|generationMonitor|PipelineStepProgress|replyOutput.segments|roleTurnProbe|createConversationHistoryKey|sharedConversationHistoryAccess|conversationAuditExport" docs/AI_NAMING_REGISTRY.md docs/SYSTEM_FLOW.md`
- `rg -n "activeRoomHistoryKey|activeContextTags|formatActiveContextTags|eventTextInput|handleTriggerRoomEvent|handleCheckCurrentActivity|conversationChannel|legacyTraceVisible|runEventActivity|currentActivity|liveTrace|activeStep|roleTurnProbeEnabled|roleTurnProbeStorageKey|mindFlow|createRecordedMindFlowMessages|upsertMindFlowChatMessage|foldTransientMindFlowMessages|authUser|personaDossier|normalizeReplySegments|conversation-history|conversation-state|resetActiveDossierConversation|selectedAuditIds|exportConversationAuditEntries|chatroomHomeUrl|from=liao" src/App.tsx src/pipeline src/chat src/core/conversationChannels.ts`

## 验证

- UI 或状态改动：`npm run build`
- 回复分段展示：`npm run verify:temporal-scene-and-reply-segments`
- 心理流 streaming 和折叠：`npm run verify:mind-flow-streaming`
- 全局角色运行态：`npm run verify:global-conversation-state`
- 更新按钮可点击性：`npm run verify:update-button-clickable`
- 历史隔离相关：`npm run verify:conversation-message-history`
- 共享历史或管理员审计相关：`npm run verify:admin-history-and-module-audit`
- 管理员审计浮层滚动：`npm run verify:audit-modal-scroll`
