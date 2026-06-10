# Conversation Pipeline Context Pack

## 边界

Conversation Pipeline 负责一轮同步响应路径：事件输入、真实时间/地理约束下的场景推进、结构化状态评估、记忆召回、回应决策、自然语言回复上下文、Reply LLM、状态更新、信号评估和 trace 汇总。它不负责 UI 呈现、服务端持久化或共享档案管理。

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
- `src/core/types.ts`
- `docs/modules/memory-retrieval.md`

## 输入输出

- 输入：用户消息、当前 `CharacterState`、`LlmConfig`、当前说话者身份、角色位置推断出的当地真实时间。
- 输出：`nextState`、`PipelineTrace`、角色台词、回复分段、场景推进 trace、各认知模块 trace。Appraisal 会输出危险状态、清醒程度、回应必要性、回复节奏、触动强度、失态风险和突破人设外壳风险；Response Decision 会把这些评估转成最终回复路由。
- 严重状态承接：重大坏消息、威胁、羞辱或崩溃余波必须进入长期记忆、关系记忆、Appraisal/Decision 输入和 runtime signal；下一轮普通邀约不能只按表面低相关事件处理。

## 不变量

- Appraisal、Memory Recall、Decision、State Update、Runtime Signal Evaluation 都是独立 LLM 模块。
- 认知模块可以使用结构化输入输出，但必须经过确定性归一化和 fallback。
- Reply LLM 只接收自然语言上下文，只输出角色说出口的话。
- `temporalSceneProgression` 必须先按人物档案地理范围和真实当地时间推进 `scene/location`；对未来计划不瞬移，对跨城/跨国离谱地点只记录被阻止的场景上下文。
- 对话触发的合理场景变化需要在已持久化的全局运行态中承接一段时间；刷新或下一句普通消息不能马上把人物拉回日程模板，但超过合理时间后 routine 仍可推进上班、睡眠、通勤和回家。
- `replyOutput.segments` 只能来自自然语言回复文本的归一化分段，不能要求 Reply LLM 输出 JSON 或结构化数组。
- Reply Prompt 不能混入 JSON、字段名、工程术语、调试外壳或直接话术指令。
- 每个步骤必须可在 trace 中区分输入、输出、状态和 transport。
- 如果运行时信号已经显示极低能量、强烈负面、震惊、麻木或崩溃边缘，Appraisal/Decision 必须考虑“新事件与当前状态错位”的影响。

## 查询线索

- `rg -n "Conversation Pipeline|Reply LLM|Cognitive Module|State Updater|Runtime Signal|PipelineTrace|replyOutput|temporalSceneProgression" docs/AI_NAMING_REGISTRY.md docs/SYSTEM_FLOW.md`
- `rg -n "runConversationPipeline|advanceSceneForCurrentTime|formatCognitiveTraceOutput|runCognitiveModule|fallbackReason|stabilizeDecisionForCurrentState|strengthenUserRelationshipMemoryForSevereEvent|splitReplyIntoSegments" src/pipeline src/core/types.ts`

## 验证

- 管线或类型改动：`npm run build`
- 时间场景推进和连续回复分段：`npm run verify:temporal-scene-and-reply-segments`
- 全局角色运行态：`npm run verify:global-conversation-state`
- 结构化 fallback：`npm run verify:cognitive-fallback`
- 用户关系记忆写回：`npm run verify:user-relationship-memory`
- 重大事件跨轮承接：`npm run verify:severe-state-continuity`
