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
| LLM 请求 | `llmRequest` | runtime object | 最后输入给 LLM 的 prompt 和结构要求 | `promptData` |
| LLM 输出 | `llmOutput` | runtime object | LLM 回复和状态更新 JSON | `aiResult` |

## 模块登记表

| 模块 | 路径 | 责任 | 输入 | 输出 | 调用方 | 被调用方 |
| --- | --- | --- | --- | --- | --- | --- |
| App Shell | `src/App.tsx` | 三栏 MVP 工作台，连接状态、聊天和 trace | 用户输入、按钮操作 | UI 状态 | 浏览器用户 | conversation pipeline |
| Core Types | `src/core/types.ts` | 定义角色、关切、关系、记忆、事件、trace 类型 | 无 | TypeScript 类型 | 全模块 | 无 |
| Seed State | `src/data/seedState.ts` | 提供林安初始状态和默认消息 | 无 | `CharacterState` | App Shell | Core Types |
| Appraisal | `src/pipeline/appraisal.ts` | 判断事件触发了哪些关切 | `EventInput`, `CharacterState` | `AppraisalResult` | Conversation Pipeline | Core Types |
| Memory Retrieval | `src/pipeline/memoryRetrieval.ts` | 召回短期上下文和长期记忆 | event, appraisal, state | `MemoryRecallResult` | Conversation Pipeline | Core Types |
| Response Decision | `src/pipeline/responseDecision.ts` | 决定是否回应和回应姿态 | appraisal, state | `ResponseDecision` | Conversation Pipeline | Core Types |
| Prompt Builder | `src/pipeline/promptBuilder.ts` | 构造最终输入给 LLM 的材料 | event, state, appraisal, recall, decision | `LlmRequest` | Conversation Pipeline | Core Types |
| LLM Client | `src/pipeline/llmClient.ts` | 调用模拟 LLM 或外部 endpoint | `LlmRequest`, `LlmConfig` | `LlmOutput` | Conversation Pipeline | 外部 LLM endpoint |
| State Updater | `src/pipeline/stateUpdater.ts` | 校验并应用状态增量 | state, event, llmOutput | next state, `StateDelta` | Conversation Pipeline | Core Types |
| Conversation Pipeline | `src/pipeline/conversationPipeline.ts` | 串联一轮同步响应路径 | content, state, llmConfig | next state, trace | App Shell | pipeline steps |
| Generators | `src/pipeline/generators.ts` | 根据描述一键生成人物档案和场景 | 描述文本 | `CharacterState` 或 `SceneState` | App Shell | Core Types |

## 函数登记表

| 函数名 | 文件 | 责任 | 参数 | 返回 | 副作用 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| `runConversationPipeline` | `src/pipeline/conversationPipeline.ts` | 运行完整对话 pipeline | content, state, llmConfig | nextState, trace | 写入状态 | implemented |
| `runAppraisal` | `src/pipeline/appraisal.ts` | 事件到关切激活 | event, state | AppraisalResult | 无 | implemented |
| `retrieveMemory` | `src/pipeline/memoryRetrieval.ts` | 召回相关记忆 | event, appraisal, state | MemoryRecallResult | 无 | implemented |
| `decideResponse` | `src/pipeline/responseDecision.ts` | 决定回应姿态 | appraisal, state | ResponseDecision | 无 | implemented |
| `buildPromptRequest` | `src/pipeline/promptBuilder.ts` | 构造 LLM 输入 | event, state, appraisal, recall, decision, provider, model | LlmRequest | 无 | implemented |
| `runLlm` | `src/pipeline/llmClient.ts` | 模拟或调用外部 LLM | request, config, simulateInput | LlmOutput | 可调用外部 endpoint | implemented |
| `applyStateUpdates` | `src/pipeline/stateUpdater.ts` | 应用 LLM 状态更新 | state, event, llmOutput | nextState, StateDelta | 写入记忆和状态 | implemented |
| `generateDossierFromDescription` | `src/pipeline/generators.ts` | 一键生成人物档案 | description, current state | CharacterState | 替换 profile/concerns | implemented |
| `generateSceneFromDescription` | `src/pipeline/generators.ts` | 一键生成场景 | description | SceneState | 无 | implemented |

## 数据字段登记表

| 字段名 | 所属对象/表 | 类型 | 含义 | 来源 | 消费方 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| `profile` | `CharacterState` | `CharacterProfile` | 角色基础人设 | seed/generator | promptBuilder/UI | implemented |
| `concerns` | `CharacterState` | `Concern[]` | 角色当前关切清单 | seed/generator/stateUpdater | appraisal/promptBuilder/UI | implemented |
| `relationships` | `CharacterState` | `Record<string, Relationship>` | 角色对每个对象的关系档案 | seed/stateUpdater | appraisal/promptBuilder/UI | implemented |
| `shortTermMemory` | `CharacterState` | `ShortTermMemory[]` | 最近对话原文 | stateUpdater | memoryRetrieval/promptBuilder | implemented |
| `longTermMemory` | `CharacterState` | `LongTermMemory[]` | 长期摘要记忆 | seed/stateUpdater | memoryRetrieval/promptBuilder | implemented |
| `runtime.derivedMood` | `RuntimeState` | object | 从 concerns 派生的当前心情 | seed/stateUpdater | UI/promptBuilder | implemented |
| `scene` | `CharacterState` | `SceneState` | 当前场景 | seed/generator | UI/promptBuilder | implemented |
| `pipelineTrace` | `ChatMessage` | `PipelineTrace` | 一轮对话所有中间结果 | conversationPipeline | Pipeline Debug Panel | implemented |

## 外部服务登记表

| 服务 | 标准名称 | 用途 | 权限/密钥位置 | 风险 |
| --- | --- | --- | --- | --- |
| GitHub | `github` | 代码远程同步和版本回溯 | 本机 GitHub CLI 或 GitHub 连接器 | 需要确认仓库名和可见性 |
| VPS | `productionVps` | MVP 部署 | 不写入仓库 | 只允许操作 `ok.xiaogushi.us` |
| 外部 LLM Endpoint | `externalLlmEndpoint` | 后续真实 LLM 生成 | 不在前端保存密钥；应由后端代理 | 当前仅提供输入框，尚未部署后端 |
