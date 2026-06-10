# Conversation Pipeline Context Pack

## 边界

Conversation Pipeline 负责一轮同步响应路径：事件输入、结构化状态评估、记忆召回、回应决策、自然语言回复上下文、Reply LLM、状态更新、信号评估和 trace 汇总。它不负责 UI 呈现、服务端持久化或共享档案管理。

## 相关文件

- `src/pipeline/conversationPipeline.ts`
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

- 输入：用户消息、当前 `CharacterState`、`LlmConfig`、当前说话者身份。
- 输出：`nextState`、`PipelineTrace`、角色台词、各认知模块 trace。Appraisal 会输出危险状态、清醒程度、回应必要性、回复节奏、触动强度、失态风险和突破人设外壳风险；Response Decision 会把这些评估转成最终回复路由。

## 不变量

- Appraisal、Memory Recall、Decision、State Update、Runtime Signal Evaluation 都是独立 LLM 模块。
- 认知模块可以使用结构化输入输出，但必须经过确定性归一化和 fallback。
- Reply LLM 只接收自然语言上下文，只输出角色说出口的话。
- Reply Prompt 不能混入 JSON、字段名、工程术语、调试外壳或直接话术指令。
- 每个步骤必须可在 trace 中区分输入、输出、状态和 transport。

## 查询线索

- `rg -n "Conversation Pipeline|Reply LLM|Cognitive Module|State Updater|Runtime Signal|PipelineTrace|replyOutput" docs/AI_NAMING_REGISTRY.md docs/SYSTEM_FLOW.md`
- `rg -n "runConversationPipeline|formatCognitiveTraceOutput|runCognitiveModule|fallbackReason" src/pipeline src/core/types.ts`

## 验证

- 管线或类型改动：`npm run build`
- 结构化 fallback：`npm run verify:cognitive-fallback`
- 用户关系记忆写回：`npm run verify:user-relationship-memory`
