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
| 流程步骤进度 | `pipelineStepProgress` | runtime object | 执行中步骤的输入、输出、状态和 transport | `loadingStep`, `traceDump` |
| 认知模块调用 | `cognitiveModuleTrace` | runtime object | 一个脑区式模块的一次 LLM 调用记录 | `debugInfo` |
| 回复请求 | `expressionLlmRequest` | runtime object | 只交给 Reply LLM 的自然语言上下文 | `promptData` |
| 回复输出 | `replyOutput` | runtime object | Reply LLM 生成的角色台词 | `aiResult` |
| Prompt 生成器 | `promptGenerator` | pipeline module | 把认知模块输出转换成自然语言回复上下文 | `promptBuilder` 作为概念名 |
| 状态更新计划 | `stateUpdatePlan` | runtime object | State Update LLM 生成的结构化状态变化 | `stateDeltaDraft` |
| 性格特性 | `personalityFacet` | domain object | 一个性格摘要背后的来源、张力和表达方式 | `traitDefinition` |
| 状态信号详情 | `runtimeSignalProfile` | domain object | 能量、情绪、情绪倾向、唤醒度显示值背后的自然语言考量 | `metricDetail` |
| 状态信号评估 | `runtimeSignalEvaluation` | cognitive module | 专门评估能量、情绪、情绪倾向、唤醒度的 LLM 模块 | `derivedMoodUpdater` |
| 认知叙述 | `cognitiveNarrative` | domain field | 人物内部状态或场景如何参与反应的自然语言描述，不是给 Reply LLM 的直接指令 | `llmContext`, `replyInstruction` |
| 生成预览 | `generationPreview` | UI state | Dossier/Scene 生成后等待用户应用的预览结果 | `draftResult` |
| 人物档案解读 | `dossierInterpretation` | cognitive module | 将用户人物素材重新解读为展示摘要、长期记忆、人性/人格、标签、关切和状态信号 | `profileRewrite`, `rawDossierPreview` |
| 场景解读 | `sceneInterpretation` | cognitive module | 将用户场景素材重新解读为场景摘要、状态影响、人物影响、长期记忆和关切变化 | `sceneRewrite`, `rawScenePreview` |
| 人物档案组合 | `personaDossier` | UI/domain object | 一个可切换的多人档案条目，绑定人物状态、人物素材和配套场景素材 | `profileSlot`, `characterTab` |
| 人物场景一致性 | `profileSceneConsistency` | cognitive module | 判断人物档案和场景是否处于同一世界观、时代和社会语境 | `settingMatch`, `sceneFit` |
| 扭曲时空密码 | `distortionPassword` | permission gate | 人物和场景硬冲突时允许继续应用的本地门禁短语 | `overrideCode`, `adminPassword` |

## 模块登记表

| 模块 | 路径 | 责任 | 输入 | 输出 | 调用方 | 被调用方 |
| --- | --- | --- | --- | --- | --- | --- |
| App Shell | `src/App.tsx` | 三栏 MVP 工作台，DeepSeek 连接状态、聊天和 trace | 用户输入、按钮操作 | UI 状态 | 浏览器用户 | conversation pipeline |
| Core Types | `src/core/types.ts` | 定义角色、关切、关系、记忆、事件、trace 类型 | 无 | TypeScript 类型 | 全模块 | 无 |
| Seed State | `src/data/seedState.ts` | 提供林安初始状态和默认消息 | 无 | `CharacterState` | App Shell | Core Types |
| Cognitive Module Client | `src/pipeline/cognitiveModuleClient.ts` | 调用认知模块 LLM，记录 request/output/transport | `CognitiveModuleRequest`, `LlmConfig` | `CognitiveModuleTrace` | Appraisal/Memory/Decision/State Update | 外部 LLM endpoint |
| Appraisal | `src/pipeline/appraisal.ts` | 通过 LLM 判断事件触发了哪些关切 | `EventInput`, `CharacterState`, `LlmConfig` | `CognitiveModuleTrace<AppraisalResult>` | Conversation Pipeline | Cognitive Module Client |
| Memory Retrieval | `src/pipeline/memoryRetrieval.ts` | 通过 LLM 判断哪些记忆会浮现 | event, appraisal, state, llmConfig | `CognitiveModuleTrace<MemoryRecallResult>` | Conversation Pipeline | Cognitive Module Client |
| Response Decision | `src/pipeline/responseDecision.ts` | 通过 LLM 决定是否回应和回应姿态 | appraisal, recall, state, llmConfig | `CognitiveModuleTrace<ResponseDecision>` | Conversation Pipeline | Cognitive Module Client |
| Prompt Generator | `src/pipeline/promptBuilder.ts` | 将认知模块输出转成只给 Reply LLM 的自然语言 prompt | event, state, appraisal, recall, decision | `ExpressionLlmRequest` | Conversation Pipeline | Core Types |
| LLM Client | `src/pipeline/llmClient.ts` | 调用 Reply LLM；正式模式只传自然语言 prompt | `ExpressionLlmRequest`, `LlmConfig` | `ReplyOutput` | Conversation Pipeline | 外部 LLM endpoint |
| State Updater | `src/pipeline/stateUpdater.ts` | 通过 State Update LLM 生成状态更新计划，再确定性写回 | state, event, replyOutput, context, llmConfig | next state, `StateDelta`, `stateUpdate` | Conversation Pipeline | Cognitive Module Client |
| Runtime Signal Evaluator | `src/pipeline/runtimeSignalEvaluator.ts` | 通过专门 LLM 模块评估能量、情绪、情绪倾向、唤醒度 | state, event, replyOutput, appraisal/memory/decision/stateUpdatePlan, llmConfig | `runtimeSignalEvaluation`, next runtime signals | Conversation Pipeline | Cognitive Module Client |
| Conversation Pipeline | `src/pipeline/conversationPipeline.ts` | 串联一轮同步响应路径 | content, state, llmConfig | next state, trace | App Shell | pipeline steps |
| Generators | `src/pipeline/generators.ts` | 通过 LLM 解读用户人物/场景素材，并确定性归一化为待应用预览 | 描述文本、当前状态、LLM 配置 | `CharacterState` | App Shell | Cognitive Module Client, Core Types |
| Profile Scene Consistency | `src/pipeline/profileSceneConsistency.ts` | 通过 LLM 判断人物档案和场景是否匹配，并返回是否需要扭曲时空密码 | `CharacterState`, `LlmConfig` | `ProfileSceneConsistencyResult` | App Shell | Cognitive Module Client |
| DeepSeek Local Proxy | `vite.config.ts` | 在本地开发服务器中代理 DeepSeek Chat Completions，固定 flash 模型、关闭 thinking 并保存根目录密钥文件 | `/api/deepseek-config`, `/api/deepseek-chat` | DeepSeek 响应或配置状态 | App Shell | DeepSeek API |
| Production Server | `server.mjs` | 生产环境服务 `dist/` 并提供 DeepSeek API 代理 | HTTP request, `.deepseek.local.json` | HTML/assets/API/SSE | nginx reverse proxy | DeepSeek API |

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
| `readReplyEventStream` | `src/pipeline/llmClient.ts` | 读取 Reply LLM 的 SSE 输出并累积为回复文本 | response, onStream | ReplyOutput-like object | 调用 onStream 更新 live trace | implemented |
| `applyStateUpdates` | `src/pipeline/stateUpdater.ts` | 调用 State Update LLM 并写回状态 | state, event, replyOutput, context, llmConfig | nextState, StateDelta, stateUpdate | 写入记忆和状态 | implemented |
| `evaluateRuntimeSignals` | `src/pipeline/runtimeSignalEvaluator.ts` | 调用 Runtime Signal Evaluation LLM 评估能量、情绪、情绪倾向、唤醒度 | state, event, replyOutput, context, llmConfig | CognitiveModuleTrace<RuntimeSignalEvaluationResult> | 可调用外部 endpoint | implemented |
| `applyRuntimeSignalEvaluation` | `src/pipeline/runtimeSignalEvaluator.ts` | 将信号评估结果写回 runtime 并追加 trace 变化 | state, stateDelta, evaluation | nextState, StateDelta | 写入 runtime signals | implemented |
| `normalizeRuntimeSignalEvaluation` | `src/pipeline/runtimeSignalEvaluator.ts` | 将模型返回的信号评估结果归一化为稳定 UI 结构 | state, evaluation | RuntimeSignalEvaluationResult | 防止模型形状漂移导致 UI 崩溃 | implemented |
| `readEventStream` | `src/pipeline/cognitiveModuleClient.ts` | 读取认知模块 SSE 输出，累积并解析最终 JSON | response, onStream | parsed module output | 调用 onStream 更新 live trace | implemented |
| `buildCompletedTraceProgress` | `src/App.tsx` | 将最终 PipelineTrace 转成输入/输出/状态展示结构 | step, trace | PipelineStepProgress | 无 | implemented |
| `traceStatusLabel` | `src/App.tsx` | 将步骤状态转换为中文 UI 文案 | status | string | 无 | implemented |
| `generateDossierFromDescription` | `src/pipeline/generators.ts` | 调用人物档案解读 LLM，将用户素材归类为展示摘要、长期记忆、人性/人格、标签、关切和状态信号 | description, current state, llmConfig | CharacterState | 可调用外部 endpoint；生成待应用状态预览 | implemented |
| `generateSceneFromDescription` | `src/pipeline/generators.ts` | 调用场景解读 LLM，将用户场景素材归类为场景摘要、状态影响和人物影响 | description, current state, llmConfig | CharacterState | 可调用外部 endpoint；生成待应用状态预览 | implemented |
| `applyDossierInterpretation` | `src/pipeline/generators.ts` | 将人物档案解读结果归一化并写入预览状态 | source, current, result | CharacterState | 生成 profile/concerns/longTermMemory/runtime 预览 | implemented |
| `applySceneInterpretation` | `src/pipeline/generators.ts` | 将场景解读结果归一化并写入预览状态 | source, current, result | CharacterState | 生成 scene/concerns/longTermMemory/runtime/profile 预览 | implemented |
| `compactText` | `src/pipeline/generators.ts` | 限制展示文本长度并避免完整原文进入展示字段 | value, fallback, maxLength, source | string | 无 | implemented |
| `evaluateProfileSceneConsistency` | `src/pipeline/profileSceneConsistency.ts` | 调用一致性检测 LLM，判断人物和场景是否存在时代/世界观硬冲突 | state, llmConfig | ProfileSceneConsistencyResult | 可调用外部 endpoint | implemented |
| `normalizeProfileSceneConsistency` | `src/pipeline/profileSceneConsistency.ts` | 稳定一致性检测结果并确保 hard mismatch 必须需要门禁 | result, fallback | ProfileSceneConsistencyResult | 无 | implemented |
| `createPersonaDossier` | `src/App.tsx` | 创建绑定人物状态和场景素材的可切换档案条目 | state, dossierDescription, sceneDescription, title | PersonaDossier | 无 | implemented |
| `handleCreateDossier` | `src/App.tsx` | 在左栏新建一个空的人物-场景配套档案 | 无 | void | 更新 App state | implemented |
| `handleDeleteDossier` | `src/App.tsx` | 删除当前或指定人物档案，至少保留一个档案 | dossier id | void | 更新 App state | implemented |
| `applyCandidateState` | `src/App.tsx` | 应用人物或场景预览前先运行人物场景一致性检测 | candidate, target | Promise<void> | 可能打开扭曲时空门禁或写入状态 | implemented |
| `handleConfirmDistortionPassword` | `src/App.tsx` | 校验扭曲时空密码后继续应用硬冲突的人物/场景组合 | 无 | void | 写入状态 | implemented |
| `streamDeepseek` | `vite.config.ts` | 代理 DeepSeek SSE 输出并转成前端可读事件 | body, config, apiKey, response | text/event-stream | 读取 DeepSeek API | implemented |
| `fetchDeepseek` | `vite.config.ts` | 组装 DeepSeek Chat Completions 请求，强制关闭 thinking | body, config, apiKey, stream | Response | 调用 DeepSeek API | implemented |
| `normalizeDeepseekModel` | `vite.config.ts` / `src/App.tsx` | 避免使用 `deepseek-reasoner`，改为非思考模型 | model | model | 无 | implemented |
| `sendSse` | `vite.config.ts` | 写出本地 SSE data 事件 | response, data | void | 写 HTTP response | implemented |
| `serveStatic` | `server.mjs` | 生产环境返回 `dist/` 静态文件并支持 SPA fallback | pathname, method, response | HTML/assets | 读取 dist | implemented |

## 数据字段登记表

| 字段名 | 所属对象/表 | 类型 | 含义 | 来源 | 消费方 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| `profile` | `CharacterState` | `CharacterProfile` | 角色基础人设 | seed/generator | promptBuilder/UI | implemented |
| `profile.displaySummary` | `CharacterProfile` | `string` | 左侧个人展示使用的短摘要，由人物档案解读 LLM 总结，不展示用户输入长段原文 | seed/generator | UI | implemented |
| `profile.personalitySummary` | `CharacterProfile` | `string` | 性格标签背后的综合描述 | seed/generator | promptBuilder/UI | implemented |
| `profile.personalityFacets` | `CharacterProfile` | `PersonalityFacet[]` | 性格由哪些特性、经历和表达习惯组成 | seed/generator | promptBuilder/UI | implemented |
| `concerns` | `CharacterState` | `Concern[]` | 角色当前关切清单 | seed/generator/stateUpdater | appraisal/promptBuilder/UI | implemented |
| `relationships` | `CharacterState` | `Record<string, Relationship>` | 角色对每个对象的关系档案 | seed/stateUpdater | appraisal/promptBuilder/UI | implemented |
| `shortTermMemory` | `CharacterState` | `ShortTermMemory[]` | 最近对话原文 | stateUpdater | memoryRetrieval/promptBuilder | implemented |
| `longTermMemory` | `CharacterState` | `LongTermMemory[]` | 长期摘要记忆 | seed/stateUpdater | memoryRetrieval/promptBuilder | implemented |
| `runtime.derivedMood` | `RuntimeState` | object | 由状态信号评估模块产出的当前心情摘要 | seed/runtimeSignalEvaluator | UI/promptBuilder | implemented |
| `runtime.signalProfiles` | `RuntimeState` | `Record<RuntimeSignalKey, RuntimeSignalProfile>` | UI 简化指标背后的自然语言考量，供 Prompt Generator 组织上下文 | seed/generator/stateUpdater | promptBuilder/UI | implemented |
| `runtime.signalProfiles.*.cognitiveNarrative` | `RuntimeSignalProfile` | `string` | 状态信号背后的内在状态叙述，只描述属性和成因，不写回复指令 | seed/generator/stateUpdater | promptBuilder/UI | implemented |
| `scene` | `CharacterState` | `SceneState` | 当前场景 | seed/generator | UI/promptBuilder | implemented |
| `scene.cognitiveNarrative` | `SceneState` | `string` | 场景如何改变注意力、身体感和关系距离的自然语言叙述 | seed/generator | promptBuilder/UI | implemented |
| `dossierPreview` | App state | `CharacterState?` | 人物档案生成后的待应用预览 | App Shell | UI/apply action | implemented |
| `scenePreview` | App state | `CharacterState?` | 场景解读后的待应用状态预览，包含 scene、状态、关切、长期记忆和人物影响 | App Shell | UI/apply action | implemented |
| `personaDossiers` / `dossiers` | App state | `PersonaDossier[]` | 左侧多人档案列表，每个条目绑定人物状态和场景输入 | App Shell | UI/switch/apply/delete | implemented |
| `activeDossierId` | App state | `string` | 当前选中的人物档案组合 ID | App Shell | UI/switch/apply/delete | implemented |
| `consistencyGate` | App state | `ConsistencyGate?` | 一致性检测发现硬冲突后等待用户输入扭曲时空密码的门禁状态 | App Shell | UI/apply action | implemented |
| `distortionPassword` | App constant | `string` | 本地门禁短语，当前为“扭曲时空密码” | App Shell | UI/apply action | implemented |
| `profileSceneConsistency` | cognitive module output | `ProfileSceneConsistencyResult` | 人物档案和场景的匹配结果、冲突理由、是否需要门禁 | Profile Scene Consistency | App Shell | implemented |
| `pipelineTrace` | `ChatMessage` | `PipelineTrace` | 一轮对话所有中间结果 | conversationPipeline | Pipeline Debug Panel | implemented |
| `prompt` | `ExpressionLlmRequest` | `string` | 交给 Reply LLM 的自然语言上下文 | promptGenerator | llmClient/UI | implemented |
| `outputContract` | `CognitiveModuleRequest` | `string` | 认知模块结构化输出约束，不进入 Reply LLM prompt | cognitive modules | cognitiveModuleClient/backend | implemented |
| `stateUpdate` | `PipelineTrace` | `CognitiveModuleTrace<StateUpdatePlan>` | State Update LLM 的完整调用记录 | stateUpdater | Pipeline Debug Panel | implemented |
| `runtimeSignalEvaluation` | `PipelineTrace` | `CognitiveModuleTrace<RuntimeSignalEvaluationResult>` | Runtime Signal Evaluation LLM 的完整调用记录 | runtimeSignalEvaluator | Pipeline Debug Panel | implemented |
| `pipelineStepProgress` | App state | `PipelineStepProgress` | 执行中某一步的输入、输出、状态和 transport，用于 live trace | conversationPipeline | App Shell | implemented |
| `deepseekConnected` | App state | `boolean` | 顶部显示 DeepSeek 是否已有本地密钥并可作为真实 LLM 入口 | `/api/deepseek-config` / 测试连接 | App Shell | implemented |
| `deepseekStatus` | App state | `string` | DeepSeek 密钥保存和真实连接测试的人类可读状态 | `/api/deepseek-config` / `/api/deepseek-chat` | App Shell | implemented |

## API 路由登记表

| 路由 | 方法 | 责任 | 密钥/风险 | 状态 |
| --- | --- | --- | --- | --- |
| `/api/deepseek-config` | GET | 返回本地 DeepSeek 密钥是否已保存、默认 endpoint 和 `deepseek-v4-flash` 模型 | 不返回密钥明文 | implemented |
| `/api/deepseek-config` | POST | 将 DeepSeek 密钥保存到项目根目录 `.deepseek.local.json`，模型固定为 `deepseek-v4-flash` | 文件必须被 `.gitignore` 忽略 | implemented |
| `/api/deepseek-chat` | POST | 本地代理 DeepSeek Chat Completions，避免浏览器直接携带密钥请求外网；支持 SSE 流式返回 | 从 `.deepseek.local.json` 或 `DEEPSEEK_API_KEY` 读取密钥；强制关闭 thinking 并纠正 reasoner 模型 | implemented |
| `/health` | GET | 线上 nginx 健康检查 | 只返回 OK | implemented |

## 外部服务登记表

| 服务 | 标准名称 | 用途 | 权限/密钥位置 | 风险 |
| --- | --- | --- | --- | --- |
| GitHub | `github` | 代码远程同步和版本回溯 | 本机 GitHub CLI 或 GitHub 连接器 | 需要确认仓库名和可见性 |
| VPS | `productionVps` | MVP 部署 | 不写入仓库 | 只允许操作 `ok.xiaogushi.us` |
| PM2 进程 | `okXiaogushiUsPm2Process` | 运行线上 Node 生产服务 | root 用户 PM2，仅新增 `ok-xiaogushi-us` | 不触碰其他 PM2 应用 |
| Nginx 站点 | `okXiaogushiUsNginxSite` | 将 `ok.xiaogushi.us` 反代到 `127.0.0.1:4174` | `/etc/nginx/sites-available/ok.xiaogushi.us.conf` | 只修改该域名配置 |
| DeepSeek API | `deepseekApi` | 本地真实 LLM 测试，驱动认知模块和 Reply LLM | `.deepseek.local.json` 或 `DEEPSEEK_API_KEY`，不进 git | 通过 Vite 本地代理调用；固定 `deepseek-v4-flash` 并强制 `thinking.disabled` |
| 外部 LLM Endpoint | `externalLlmEndpoint` | DeepSeek 本地代理入口 | 不在前端保存密钥；由 Vite 代理读取本地密钥 | 当前由 `/api/deepseek-chat` 承担本地代理，不作为 UI 可选模拟模式 |
