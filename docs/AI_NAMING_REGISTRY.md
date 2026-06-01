# AI Naming Registry

本文档是给 AI 使用的命名与关系登记表，用来避免长期开发中的命名混乱。用户不需要逐项阅读。

## 命名约定

| 类型 | 规则 | 示例 |
| --- | --- | --- |
| 文档文件 | 英文大写蛇形或清晰短语 | `SYSTEM_FLOW.md` |
| 前端组件 | PascalCase | `ConversationPanel` |
| 函数 | camelCase，动词开头 | `createSession` |
| 变量 | camelCase，名词明确 | `activePersonaId` |
| API 路由 | kebab-case 或 REST 风格 | `/api/conversation-sessions` |
| 数据库表 | snake_case 复数 | `conversation_sessions` |
| 数据字段 | snake_case | `created_at` |
| 环境变量 | UPPER_SNAKE_CASE | `DATABASE_URL` |

## 概念命名表

| 概念 | 标准名称 | 类型 | 说明 | 禁用/避免名称 |
| --- | --- | --- | --- | --- |
| 项目 | `virtual-human-flow` | project | 当前 MVP 的工程代号 | `test-app`, `demo` |
| 用户 | `user` | domain entity | 使用或配置虚拟人的真人 | `client` |
| 虚拟人 | `persona` | domain entity | 可被配置、对话、呈现的虚拟角色 | `bot`, `agent` |
| 对话会话 | `conversationSession` | domain concept | 一次连续交互过程 | `chat`, `talk` |
| 消息 | `message` | domain entity | 用户或虚拟人的单条输入输出 | `contentItem` |
| 系统心流状态 | `flowState` | domain concept | 后续定义的核心状态集合 | `status`, `mode` |
| 关切 | `concern` | domain entity | 虚拟人稳定在意的事项，是情绪的来源之一 | `moodItem` |
| 关系档案 | `relationship` | domain entity | 虚拟人对某个对象的独立关系状态 | `friendship` |
| 场景 | `scene` | domain entity | 当前对话发生的环境和氛围 | `background` |
| 管线追踪 | `pipelineTrace` | runtime object | 一轮对话的完整中间结果 | `debugInfo` |
| 认知模块调用 | `cognitiveModuleTrace` | runtime object | 一个脑区式模块的一次 LLM 调用记录 | `debugInfo` |
| 回复请求 | `expressionLlmRequest` | runtime object | 只交给 Reply LLM 的自然语言上下文 | `promptData` |
| 回复输出 | `replyOutput` | runtime object | Reply LLM 生成的角色台词 | `aiResult` |
| Prompt 生成器 | `promptGenerator` | pipeline module | 把认知模块输出转换成自然语言回复上下文 | `promptBuilder` 作为概念名 |
| 状态更新计划 | `stateUpdatePlan` | runtime object | State Update LLM 生成的结构化状态变化 | `stateDeltaDraft` |
| 性格特性 | `personalityFacet` | domain object | 一个性格摘要背后的来源、张力和表达方式 | `traitDefinition` |
| 状态信号详情 | `runtimeSignalProfile` | domain object | Energy/Mood/Valence/Arousal 显示值背后的自然语言考量 | `metricDetail` |
| 生成预览 | `generationPreview` | UI state | Dossier/Scene 生成后等待用户应用的预览结果 | `draftResult` |

## 模块登记表

| 模块 | 路径 | 责任 | 输入 | 输出 | 调用方 | 被调用方 |
| --- | --- | --- | --- | --- | --- | --- |
| App Shell | `src/App.tsx` | 三栏 MVP 工作台，连接状态、聊天和 trace | 用户输入、按钮操作 | UI 状态 | 浏览器用户 | conversation pipeline |
| Core Types | `src/core/types.ts` | 定义角色、关切、关系、记忆、事件、trace 类型 | 无 | TypeScript 类型 | 全模块 | 无 |
| Seed State | `src/data/seedState.ts` | 提供林安初始状态和默认消息 | 无 | `CharacterState` | App Shell | Core Types |
| Cognitive Module Client | `src/pipeline/cognitiveModuleClient.ts` | 调用认知模块 LLM，记录 request/output/transport | `CognitiveModuleRequest`, `LlmConfig` | `CognitiveModuleTrace` | Appraisal/Memory/Decision/State Update | 外部 LLM endpoint |
| Appraisal | `src/pipeline/appraisal.ts` | 通过 LLM 判断事件触发了哪些关切 | `EventInput`, `CharacterState`, `LlmConfig` | `CognitiveModuleTrace<AppraisalResult>` | Conversation Pipeline | Cognitive Module Client |
| Memory Retrieval | `src/pipeline/memoryRetrieval.ts` | 通过 LLM 判断哪些记忆会浮现 | event, appraisal, state, llmConfig | `CognitiveModuleTrace<MemoryRecallResult>` | Conversation Pipeline | Cognitive Module Client |
| Response Decision | `src/pipeline/responseDecision.ts` | 通过 LLM 决定是否回应和回应姿态 | appraisal, recall, state, llmConfig | `CognitiveModuleTrace<ResponseDecision>` | Conversation Pipeline | Cognitive Module Client |
| Prompt Generator | `src/pipeline/promptBuilder.ts` | 将认知模块输出转成只给 Reply LLM 的自然语言 prompt | event, state, appraisal, recall, decision | `ExpressionLlmRequest` | Conversation Pipeline | Core Types |
| LLM Client | `src/pipeline/llmClient.ts` | 调用 Reply LLM；正式模式只传自然语言 prompt | `ExpressionLlmRequest`, `LlmConfig` | `ReplyOutput` | Conversation Pipeline | 外部 LLM endpoint |
| State Updater | `src/pipeline/stateUpdater.ts` | 通过 State Update LLM 生成状态更新计划，再确定性写回 | state, event, replyOutput, context, llmConfig | next state, `StateDelta`, `stateUpdate` | Conversation Pipeline | Cognitive Module Client |
| Conversation Pipeline | `src/pipeline/conversationPipeline.ts` | 串联一轮同步响应路径 | content, state, llmConfig | next state, trace | App Shell | pipeline steps |
| Generators | `src/pipeline/generators.ts` | 根据描述一键生成人物档案和场景 | 描述文本 | `CharacterState` 或 `SceneState` | App Shell | Core Types |

## 函数登记表

| 函数名 | 文件 | 责任 | 参数 | 返回 | 副作用 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| `runConversationPipeline` | `src/pipeline/conversationPipeline.ts` | 运行完整对话 pipeline | content, state, llmConfig | nextState, trace | 写入状态 | implemented |
| `runCognitiveModule` | `src/pipeline/cognitiveModuleClient.ts` | 执行一个认知脑区式 LLM 模块 | request, config, mockOutput | CognitiveModuleTrace | 可调用外部 endpoint | implemented |
| `runAppraisal` | `src/pipeline/appraisal.ts` | 通过 LLM 做事件到关切评估 | event, state, llmConfig | CognitiveModuleTrace<AppraisalResult> | 可调用外部 endpoint | implemented |
| `retrieveMemory` | `src/pipeline/memoryRetrieval.ts` | 通过 LLM 召回相关记忆 | event, appraisal, state, llmConfig | CognitiveModuleTrace<MemoryRecallResult> | 可调用外部 endpoint | implemented |
| `decideResponse` | `src/pipeline/responseDecision.ts` | 通过 LLM 决定回应姿态 | appraisal, recall, state, llmConfig | CognitiveModuleTrace<ResponseDecision> | 可调用外部 endpoint | implemented |
| `generateNaturalPromptRequest` | `src/pipeline/promptBuilder.ts` | 生成只含自然语言的 Reply LLM 输入 | event, state, appraisal, recall, decision, provider, model | ExpressionLlmRequest | 无 | implemented |
| `runLlm` | `src/pipeline/llmClient.ts` | 调用 Reply LLM | request, config, simulateInput | ReplyOutput | 可调用外部 endpoint | implemented |
| `applyStateUpdates` | `src/pipeline/stateUpdater.ts` | 调用 State Update LLM 并写回状态 | state, event, replyOutput, context, llmConfig | nextState, StateDelta, stateUpdate | 写入记忆和状态 | implemented |
| `generateDossierFromDescription` | `src/pipeline/generators.ts` | 一键生成人物档案 | description, current state | CharacterState | 替换 profile/concerns | implemented |
| `generateSceneFromDescription` | `src/pipeline/generators.ts` | 一键生成场景 | description | SceneState | 无 | implemented |

## 数据字段登记表

| 字段名 | 所属对象/表 | 类型 | 含义 | 来源 | 消费方 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| `profile` | `CharacterState` | `CharacterProfile` | 角色基础人设 | seed/generator | promptBuilder/UI | implemented |
| `profile.personalitySummary` | `CharacterProfile` | `string` | 性格标签背后的综合描述 | seed/generator | promptBuilder/UI | implemented |
| `profile.personalityFacets` | `CharacterProfile` | `PersonalityFacet[]` | 性格由哪些特性、经历和表达习惯组成 | seed/generator | promptBuilder/UI | implemented |
| `concerns` | `CharacterState` | `Concern[]` | 角色当前关切清单 | seed/generator/stateUpdater | appraisal/promptBuilder/UI | implemented |
| `relationships` | `CharacterState` | `Record<string, Relationship>` | 角色对每个对象的关系档案 | seed/stateUpdater | appraisal/promptBuilder/UI | implemented |
| `shortTermMemory` | `CharacterState` | `ShortTermMemory[]` | 最近对话原文 | stateUpdater | memoryRetrieval/promptBuilder | implemented |
| `longTermMemory` | `CharacterState` | `LongTermMemory[]` | 长期摘要记忆 | seed/stateUpdater | memoryRetrieval/promptBuilder | implemented |
| `runtime.derivedMood` | `RuntimeState` | object | 从 concerns 派生的当前心情 | seed/stateUpdater | UI/promptBuilder | implemented |
| `runtime.signalProfiles` | `RuntimeState` | `Record<RuntimeSignalKey, RuntimeSignalProfile>` | UI 简化指标背后的自然语言考量，供 LLM prompt 使用 | seed/generator/stateUpdater | promptBuilder/UI | implemented |
| `scene` | `CharacterState` | `SceneState` | 当前场景 | seed/generator | UI/promptBuilder | implemented |
| `scene.llmContext` | `SceneState` | `string` | 场景对角色表达的自然语言影响 | seed/generator | promptBuilder/UI | implemented |
| `dossierPreview` | App state | `CharacterState?` | 人物档案生成后的待应用预览 | App Shell | UI/apply action | implemented |
| `scenePreview` | App state | `SceneState?` | 场景生成后的待应用预览 | App Shell | UI/apply action | implemented |
| `pipelineTrace` | `ChatMessage` | `PipelineTrace` | 一轮对话所有中间结果 | conversationPipeline | Pipeline Debug Panel | implemented |
| `prompt` | `ExpressionLlmRequest` | `string` | 交给 Reply LLM 的自然语言上下文 | promptGenerator | llmClient/UI | implemented |
| `outputContract` | `CognitiveModuleRequest` | `string` | 认知模块结构化输出约束，不进入 Reply LLM prompt | cognitive modules | cognitiveModuleClient/backend | implemented |
| `stateUpdate` | `PipelineTrace` | `CognitiveModuleTrace<StateUpdatePlan>` | State Update LLM 的完整调用记录 | stateUpdater | Pipeline Debug Panel | implemented |

## 外部服务登记表

| 服务 | 标准名称 | 用途 | 权限/密钥位置 | 风险 |
| --- | --- | --- | --- | --- |
| GitHub | `github` | 代码远程同步和版本回溯 | 本机 GitHub CLI 或 GitHub 连接器 | 需要确认仓库名和可见性 |
| VPS | `productionVps` | MVP 部署 | 不写入仓库 | 只允许操作 `ok.xiaogushi.us` |
| 外部 LLM Endpoint | `externalLlmEndpoint` | 后续真实 LLM 生成 | 不在前端保存密钥；应由后端代理 | 当前仅提供输入框，尚未部署后端 |
