# Conversation Pipeline Context Pack

## 边界

Conversation Pipeline 负责一轮同步响应路径：事件输入、真实时间/地理约束下的场景推进、结构化状态评估、记忆召回、回应决策、自然语言回复上下文、Reply LLM、状态更新、本地运行时信号派生和 trace 汇总。它不负责 UI 呈现、服务端持久化或共享档案管理。

## 相关文件

- `src/pipeline/conversationPipeline.ts`
- `src/pipeline/temporalScene.ts`
- `src/pipeline/appraisal.ts`
- `src/pipeline/memoryRetrieval.ts`
- `src/pipeline/responseDecision.ts`
- `src/pipeline/promptBuilder.ts`
- `src/pipeline/llmClient.ts`
- `src/pipeline/stateUpdater.ts`
- `src/pipeline/runtimeSignalEvaluator.ts`
- `src/pipeline/cognitiveModuleClient.ts`
- `src/pipeline/conversationContext.ts`
- `src/pipeline/safetyContinuity.ts`
- `src/chat/mindFlowMessages.ts`
- `src/core/types.ts`
- `docs/modules/memory-retrieval.md`

## 输入输出

- 输入：用户消息、当前 `CharacterState`、`LlmConfig`、当前说话者身份、角色位置推断出的当地真实时间。
- 输出：`nextState`、`PipelineTrace`、`mindFlow` 心理流帧、角色台词、回复分段、场景推进 trace、各认知模块 trace。Appraisal 会输出危险状态、清醒程度、回应必要性、回复节奏、触动强度、失态风险和突破人设外壳风险；Response Decision 会把这些评估转成最终回复路由。
- 严重状态承接：重大坏消息、威胁、羞辱或崩溃余波必须进入长期记忆、关系记忆、Appraisal/Decision 输入和 runtime signal；下一轮普通邀约不能只按表面低相关事件处理。

## 不变量

- Appraisal、Memory Recall、Decision、State Update 是独立 LLM 模块；Runtime Signal Evaluation 是本地派生的展示信号快照，不再同步调用外部 LLM 覆盖 State Update 写入的 runtime。
- 认知模块可以使用结构化输入输出，但必须经过确定性归一化和 fallback。
- Reply LLM 只接收自然语言上下文，只输出角色说出口的话。
- Reply 输出归一化要剥离开头动作旁白和说话人标签，避免 `（低头揉眉心）` 这类舞台说明进入持久化台词。
- 最近对话上下文只能使用同一说话者/本角色在短时间窗内的短期记忆；跨天或其他用户的历史不能被描述成“刚才”。
- `temporalSceneProgression` 必须先按人物档案地理范围和真实当地时间推进 `scene/location`；对未来计划不瞬移，对跨城/跨国离谱地点只记录被阻止的场景上下文。
- 对话触发的合理场景变化需要在已持久化的全局运行态中承接一段时间；刷新或下一句普通消息不能马上把人物拉回日程模板，但超过合理时间后 routine 仍可推进上班、睡眠、通勤和回家。
- `replyOutput.segments` 只能来自自然语言回复文本的归一化分段，不能要求 Reply LLM 输出 JSON 或结构化数组。
- Reply Prompt 不能混入 JSON、字段名、工程术语、调试外壳或直接话术指令。
- 每个步骤必须可在 trace 中区分输入、输出、状态和 transport。
- 每轮对话必须把说话前的场景、心理评估、记忆浮现和开口冲动转成 `mindFlow` 帧，通过 `PipelineStepProgress.mindFlow` streaming 给中间栏；第一句完成后，前置心理流由 App Shell 折叠，不能进入持久化历史。
- 说话后的 State Update、Runtime Signal 和 State Delta 也要转成 post-speech `mindFlow` 帧；如果 Reply 分段还有后续，App Shell 在余波后继续显示后续发言，否则折叠余波并收住沉默。
- 如果运行时信号已经显示极低能量、强烈负面、震惊、麻木或崩溃边缘，Appraisal/Decision 必须考虑“新事件与当前状态错位”的影响；但 Response Decision 只有在近期同一关系里存在重大事件证据时，才允许把普通邀约确定性升级成失态/爆发路由。
- 严重余波不能无限压过事实澄清：当用户澄清孩子/家人已经安全时，Appraisal/Decision/State Update 要降低直接现实危险，但保留被戏弄、失信和确认需求；Reply prompt 要承接事实层变化，避免复读旧危险指令。

## 查询线索

- `rg -n "Conversation Pipeline|Reply LLM|Cognitive Module|State Updater|Runtime Signal|PipelineTrace|replyOutput|temporalSceneProgression" docs/AI_NAMING_REGISTRY.md docs/SYSTEM_FLOW.md`
- `rg -n "runConversationPipeline|MindFlowFrame|mindFlow|advanceSceneForCurrentTime|formatCognitiveTraceOutput|runCognitiveModule|fallbackReason|stabilizeDecisionForCurrentState|hasRecentSevereAftermathEvidence|selectRecentDialogueMemories|stripReplyStageDirections|strengthenUserRelationshipMemoryForSevereEvent|shouldAvoidChildSafetyDangerLoop|splitReplyIntoSegments" src/pipeline src/chat src/core/types.ts`

## 验证

- 管线或类型改动：`npm run build`
- 时间场景推进和连续回复分段：`npm run verify:temporal-scene-and-reply-segments`
- 全局角色运行态：`npm run verify:global-conversation-state`
- 结构化 fallback：`npm run verify:cognitive-fallback`
- 用户关系记忆写回：`npm run verify:user-relationship-memory`
- 重大事件跨轮承接：`npm run verify:severe-state-continuity`
- 心理流 streaming、折叠和发言后延续：`npm run verify:mind-flow-streaming`
