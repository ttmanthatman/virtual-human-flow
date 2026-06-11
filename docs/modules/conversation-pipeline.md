# Conversation Pipeline Context Pack

## 边界

Conversation Pipeline 负责一轮同步响应路径：事件输入、真实时间/地理约束下的场景推进、`roleTurn` 人物主脑、由主脑输出派生的 Appraisal/Memory/Decision 兼容视图、自然语言状态写回、本地运行时信号派生和 trace 汇总。它不负责 UI 呈现、服务端持久化或共享档案管理。

## 相关文件

- `src/pipeline/conversationPipeline.ts`
- `src/pipeline/roleTurn.ts`
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
- `src/chat/mindFlowMessages.ts`
- `src/core/types.ts`
- `docs/modules/memory-retrieval.md`

## 输入输出

- 输入：用户消息、当前 `CharacterState`、`LlmConfig`、当前说话者身份、角色位置推断出的当地真实时间。
- 输出：`nextState`、`PipelineTrace`、`mindFlow` 心理流帧、角色台词、回复分段、场景推进 trace、`roleTurn` trace、派生认知视图 trace 和 State Update trace。`roleTurn` 的自然语言心理状态、记忆浮现、开口倾向和说出口段落是同步回复语义主干；兼容字段只服务 UI、审计和持久化，不作为台词生成前的下游语义主干。
- 关系和状态承接：重复越界、亲密推进、重大事件、澄清和承诺兑现都必须由自然语言模块承接递进；不能用本地关键词、数值阈值或旧台词复制来决定路由。

## 不变量

- 同步对话主路径只在说话前调用一次 `roleTurn` LLM，让同一个模型在同一上下文里模拟人物心理并产出台词；Appraisal、Memory Recall 和 Decision 不再逐个外部调用。
- Appraisal、Memory Recall、Decision 在主路径中是 `roleTurn` 输出的兼容视图；旧独立模块文件可以保留供实验和回滚，但不能悄悄重新接回主路径。
- State Update 仍是说话后的独立自然语言 LLM 模块；Runtime Signal Evaluation 是本地派生的展示信号快照，不再同步调用外部 LLM 覆盖 State Update 写入的 runtime。
- `roleTurn` 输出四段自然语言：心理状态、记忆浮现、开口倾向、说出口。它不是 JSON、字段表或代码式结构；前三段服务 trace、心流和写回上下文，只有“说出口”进入聊天历史。
- 旧 Prompt Builder 和 Reply LLM 在 pipeline 主路径里被 `roleTurn` 取代；仍保留为兼容 helper，不能再作为当前同步回复的第二次改写环节。
- 最终 Reply 输出只保留角色说出口的话；表达上下文要提醒模型承接上一轮边界，避免机械复用上一句完整台词。
- Reply 输出归一化要剥离开头动作旁白和说话人标签，避免 `（低头揉眉心）` 这类舞台说明进入持久化台词。
- 最近对话上下文只能使用同一说话者/本角色在 6 小时时间窗内的短期记忆，最多 10 条；同时把过去 6 小时关系、状态和场景摘要、长期记忆候选和关系记忆候选提供给 `roleTurn`。
- `temporalSceneProgression` 在同步路径中只做真实时间和人物作息推进；用户话语是否触发行动意图不再由本地关键词判断，交给后续 LLM 自然语言模块评价并由 State Update 写回。
- `replyOutput.segments` 只能来自自然语言回复文本的归一化分段，不能要求 `roleTurn` 或旧 Reply LLM 输出 JSON 或结构化数组。
- 表达模块上下文不能混入 JSON、字段名、工程术语、调试外壳或直接话术指令。
- 每个步骤必须可在 trace 中区分输入、输出、状态和 transport。
- 每轮对话必须把说话前的场景、心理评估、记忆浮现和开口冲动转成 `mindFlow` 帧，通过 `PipelineStepProgress.mindFlow` streaming 给中间栏；第一句完成后，前置心理流由 App Shell 折叠，不能进入持久化历史。
- 说话后的 State Update、Runtime Signal 和 State Delta 也要转成 post-speech `mindFlow` 帧；如果 Reply 分段还有后续，App Shell 在余波后继续显示后续发言，否则折叠余波并收住沉默。
- 如果运行时信号、短期上下文或关系记忆显示强余波，`roleTurn` 必须在同一个人物心理回合里考虑“新事件与当前状态错位”的影响；本地兼容字段只能帮助 UI 和写回，不得变成台词路由主干。
- 事实澄清、关系愤怒、重复亲密推进和重大事件余波都要交给 `roleTurn` 和 State Update 的自然语言判断承接，不能用单独正则特例覆盖。

## 查询线索

- `rg -n "Conversation Pipeline|Reply LLM|Cognitive Module|State Updater|Runtime Signal|PipelineTrace|replyOutput|temporalSceneProgression" docs/AI_NAMING_REGISTRY.md docs/SYSTEM_FLOW.md`
- `rg -n "runConversationPipeline|runRoleTurn|RoleTurnResult|roleTurn|MindFlowFrame|mindFlow|advanceSceneForCurrentTime|formatCognitiveTraceOutput|runCognitiveModule|fallbackReason|selectRecentDialogueMemories|formatRecentSituationSummaryForPrompt|stripReplyStageDirections|strengthenUserRelationshipMemoryForCurrentEvent|runExpressionLlm|splitReplyIntoSegments" src/pipeline src/chat src/core/types.ts`

## 验证

- 管线或类型改动：`npm run build`
- 时间场景推进和连续回复分段：`npm run verify:temporal-scene-and-reply-segments`
- 全局角色运行态：`npm run verify:global-conversation-state`
- 结构化 fallback：`npm run verify:cognitive-fallback`
- 用户关系记忆写回：`npm run verify:user-relationship-memory`
- 重大事件跨轮承接：`npm run verify:severe-state-continuity`
- 心理流 streaming、折叠和发言后延续：`npm run verify:mind-flow-streaming`
