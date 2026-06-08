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
| 登录会话 | `authSession` | permission/session object | 本项目本地会话，来源于 liao 聊天室登录校验，不保存密码 | `loginState`, `tokenState` |
| 管理员用户 | `adminUser` | permission role | liao 聊天室返回 `isAdmin` 的用户，可维护共享档案和查看审计 | `superUser`, `rootUser` |
| 虚拟人 | `persona` | domain entity | 可被配置、对话、呈现的虚拟角色 | `bot`, `agent` |
| 对话会话 | `conversationSession` | domain concept | 一次连续交互过程 | `chat`, `talk` |
| 消息 | `message` | domain entity | 用户或虚拟人的单条输入输出 | `contentItem` |
| 系统心流状态 | `flowState` | domain concept | 后续定义的核心状态集合 | `status`, `mode` |
| 关切 | `concern` | domain entity | 虚拟人稳定在意的事项，是情绪的来源之一 | `moodItem` |
| 关系档案 | `relationship` | domain entity | 虚拟人对某个对象的独立关系状态 | `friendship` |
| 场景 | `scene` | domain entity | 当前对话发生的环境和氛围 | `background` |
| 人物位置 | `characterLocation` | domain object | 角色当前物理位置、速度、方向和地图上下文 | `geoPoint`, `placeInfo` |
| 地图上下文 | `mapContext` | domain object | 位置周边道路、地点、建筑和环境摘要；当前可由种子或人工维护，未来可由地图服务解析 | `mapDataDump`, `poiText` |
| 管线追踪 | `pipelineTrace` | runtime object | 一轮对话的完整中间结果 | `debugInfo` |
| 流程步骤进度 | `pipelineStepProgress` | runtime object | 执行中步骤的输入、输出、状态和 transport | `loadingStep`, `traceDump` |
| 结构化输出回退 | `structuredOutputFallback` | runtime safety workflow | 外部认知模块返回截断或不可解析 JSON 时，记录原因并用本地候选结果继续流程 | `jsonCrash`, `silentRetry` |
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
| 人物档案分组 | `personaDossierGroup` | UI/domain object | 多人档案列表中的分组名称，例如“马可福音10”“郑州市” | `folder`, `categoryName` |
| 人物预览缓存 | `personaDossierPreviewCache` | persisted domain field | 由 DeepSeek 生成并全局保存的短预览；缺失时 UI 显示“预览生成中”，源码不手写预览文案 | `manualPreview`, `localPreview` |
| 生成监视 | `generationMonitor` | UI trace area | 右侧显示人物短预览、人物档案生成和场景生成的输入、流式输出和状态 | `generationLog`, `previewDebugger` |
| 人物详细生平 | `lifeEvent` | domain object | 角色从小到大的关键经历、心理变化和关系变化 | `backstoryLine`, `historyItem` |
| 社会人格位置 | `socialPersonaPattern` | domain field | 角色在人群性格分布中的位置，用来避免所有角色都同质化为压抑谨慎 | `personalityTypeLabel`, `archetypeOnly` |
| 用户私有对话运行态 | `userConversationState` | persistence workflow | 登录用户与角色对话后，按 `userId + dossierId` 保存短期记忆、长期记忆、runtime 和关系变化 | `globalPersonaStateWrite`, `sharedChatState` |
| 用户私有消息历史 | `userConversationHistory` | persistence workflow | 登录用户与角色的中间栏消息历史，按 `userId + dossierId` 保存和加载 | `globalChatHistory`, `localOnlyMessages` |
| 用户私有关系余波 | `userRelationshipInfluencePropagation` | persistence workflow | 一个角色的对话只会给同一用户运行态中与其有关系的其他角色写入压缩记忆和关系 note | `globalFriendSync`, `publicSocialRipple` |
| 对话历史键 | `conversationHistoryKey` | UI state key | 前端中间栏消息历史的分桶键，由当前用户和当前档案组成 | `chatKey`, `globalMessagesKey` |
| 共享人物档案 | `sharedPersonaDossier` | persisted domain object | 管理员保存到后台、所有登录用户可读取和使用的多人档案 | `globalProfile`, `publicDossier` |
| 内置人物档案 | `builtinPersonaDossier` | seed domain object | 随服务启动提供的全局人物/场景/位置初始档案，可被管理员删除或覆盖 | `sampleProfile`, `demoDossier` |
| 对话审计记录 | `conversationAuditEntry` | persisted audit object | 记录每个登录用户的一次输入、虚拟人输出、失败信息和模块调用记录，仅管理员可读 | `chatLog`, `debugRecord` |
| 管理员用户历史查看 | `adminConversationHistoryAccess` | admin workflow | 管理员在当前人物下选择用户并查看该用户与该人物的中间栏历史 | `globalAdminChat`, `impersonation` |
| 对话审计删除 | `conversationAuditDeletion` | admin action | 管理员删除单条或清空用户输入输出审计记录 | `logCleanup`, `chatPurge` |
| 人物场景一致性 | `profileSceneConsistency` | cognitive module | 判断人物档案和场景是否处于同一世界观、时代和社会语境 | `settingMatch`, `sceneFit` |
| 扭曲时空密码 | `distortionPassword` | permission gate | 人物和场景硬冲突时允许继续应用的本地门禁短语 | `overrideCode`, `adminPassword` |
| 混合记忆召回 | `hybridMemoryRetrieval` | pipeline design | 记忆召回同时参考自然语言相关度、关切关联、关系关联、情绪显著、近期性和词面线索 | `keywordMemorySearch`, `sensitiveWordRecall` |
| 记忆召回选择结果 | `memoryRecallSelectionResult` | cognitive module output | Memory Recall LLM 只输出短期/长期记忆 ID、分数和短理由，完整记忆内容由本地回填 | `memoryRecallFullDump`, `llmMemoryCopy` |
| 召回自然语言查询 | `naturalLanguageQuery` | runtime field | 将事件、评估、激活关切和关系摘要合成的召回语义查询 | `keywordQuery`, `searchText` |
| 召回因子 | `memoryRecallFactor` | runtime object | 解释某条记忆为什么浮现的分项评分 | `matchReasonOnly`, `keywordScore` |
| 召回来源 | `memoryRecallSource` | runtime field | 标识召回来自同步响应路径还是未来异步生命路径 | `triggerType` |
| 生产手动更新 | `manualVpsUpdate` | deployment workflow | 管理员在站内触发 VPS 从 git 工作树拉取、安装、构建并重启 | `productionAutoDeploy`, `vpsSyncBot` |
| 应用更新状态 | `appUpdateStatus` | UI/API state | 左上角检查服务器当前提交与远端提交是否一致 | `deployStatus`, `versionPoll` |
| 应用更新日志 | `appUpdateLogEntry` | UI state | 站内更新窗口中显示的服务端步骤、stdout/stderr 和结果 | `deployLogLine`, `terminalDump` |
| 应用版本标识 | `appVersionLabel` | UI constant | 页面左上角展示的应用版本号，来源于 `package.json` version | `buildLabel`, `releaseText` |
| 应用版本同步 | `appVersionSync` | release workflow | 每个完成的 reviewable step 必须同步递增 `package.json` 和 `package-lock.json` 版本，防止 UI 版本滞后 | `manualVersionReminder`, `versionAfterthought` |
| GitHub 默认同步 | `defaultGithubPush` | release workflow | 每个完成并提交的 reviewable step 默认推送当前分支到 GitHub，除非用户明确要求不推送 | `manualPushOnly`, `askBeforePush` |
| GitHub 仓库链接 | `githubRepositoryUrl` | UI constant | 页面左上角版本链接指向的项目仓库 | `repoLink`, `sourceUrl` |
| 错误精髓摘要 | `errorInspectionSummary` | development workflow | `docs/ERROR_INSPECTIONS.md` 顶部的压缩原则区，每轮优先阅读，用来替代通读全部历史勘验 | `errorLogDump`, `fullMistakeHistory` |
| 模块上下文包 | `moduleContextPack` | development workflow | `docs/modules/` 下的低 token 启动文档，按模块列出边界、文件、输入输出、不变量、查询线索和验证命令 | `fullContextDump`, `moduleWiki` |
| 模块上下文包索引 | `moduleContextPackIndex` | development document | `docs/modules/README.md`，用于选择本轮应读取的模块包 | `contextMap`, `moduleDirectory` |
| 模块参数审核 | `moduleParameterFlowReview` | review document | `docs/MODULE_PARAMETER_FLOW_REVIEW.md` 中面向人工审核的参数级模块说明和数据流说明 | `parameterDump`, `randomModuleNotes` |

## 模块登记表

| 模块 | 路径 | 责任 | 输入 | 输出 | 调用方 | 被调用方 |
| --- | --- | --- | --- | --- | --- | --- |
| App Shell | `src/App.tsx` | 三栏 MVP 工作台，DeepSeek 连接状态、聊天和 trace | 用户输入、按钮操作 | UI 状态 | 浏览器用户 | conversation pipeline |
| Core Types | `src/core/types.ts` | 定义角色、关切、关系、记忆、事件、trace 类型 | 无 | TypeScript 类型 | 全模块 | 无 |
| Seed State | `src/data/seedState.ts` | 提供林安初始状态和默认消息 | 无 | `CharacterState` | App Shell | Core Types |
| Builtin Persona Dossiers | `builtinPersonaDossiers.mjs` | 提供“马可福音10”和“郑州市”全局初始人物/场景/位置档案，并登记生平事件、社会人格位置和熟人关系 | 无 | `PersonaDossier[]` | Server Support | 无 |
| Cognitive Module Client | `src/pipeline/cognitiveModuleClient.ts` | 调用认知模块 LLM，记录 request/output/transport/fallbackReason | `CognitiveModuleRequest`, `LlmConfig` | `CognitiveModuleTrace` | Appraisal/Memory/Decision/State Update | 外部 LLM endpoint |
| Cognitive Module Fallback Verification | `scripts/verify-cognitive-module-fallback.mjs` | 伪造未闭合 SSE JSON，验证认知模块会 fallback 而不是抛错卡住 | 无 | pass/fail | npm script | TypeScript compiler |
| Appraisal | `src/pipeline/appraisal.ts` | 通过 LLM 判断事件触发了哪些关切 | `EventInput`, `CharacterState`, `LlmConfig` | `CognitiveModuleTrace<AppraisalResult>` | Conversation Pipeline | Cognitive Module Client |
| Memory Retrieval | `src/pipeline/memoryRetrieval.ts` | 用自然语言候选清单和 LLM 复判判断哪些记忆会浮现；LLM 只选择 ID，完整记忆由本地回填；召回不能退化为敏感词过滤 | event, appraisal, state, llmConfig | `CognitiveModuleTrace<MemoryRecallResult>` | Conversation Pipeline | Cognitive Module Client |
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
| Server Support | `serverSupport.mjs` | 认证会话、liao 登录代理、内置/共享档案合并、共享档案存储、DeepSeek 预览缓存写回、用户私有消息历史、用户私有对话运行态、用户私有关系余波、对话审计和站内手动更新 | HTTP request, liao login response, local runtime JSON, builtin persona dossiers, git working tree | auth session, persona dossiers, audit entries, update status/SSE | Vite Dev Server/Production Server | liao Chatroom, local runtime files, Builtin Persona Dossiers, Git |
| Conversation History Isolation Verification | `scripts/verify-conversation-history-isolation.mjs` | 在临时运行目录验证用户 A 的对话状态不会进入用户 B 或共享档案 | 无 | pass/fail | npm script | Server Support |
| Conversation Message History Verification | `scripts/verify-conversation-message-history.mjs` | 在临时运行目录验证中间栏消息历史按用户和档案保存、读取和隔离 | 无 | pass/fail | npm script | Server Support |
| Admin History And Module Audit Verification | `scripts/verify-admin-history-and-module-audit.mjs` | 验证管理员能按人物列出/读取用户历史，且审计会保存模块调用记录 | 无 | pass/fail | npm script | Server Support |
| User Relationship Memory Verification | `scripts/verify-user-relationship-memory.mjs` | 验证 State Update 会按当前说话用户写入自然语言关系印象记忆，并回写关系备注 | 无 | pass/fail | npm script | State Updater |
| Deployment Automation Runbook | `docs/DEPLOYMENT_AUTOMATION.md` | 记录站内手动更新、VPS git 工作树配置、部署边界和回滚方法 | 部署约束 | 可读部署说明 | 用户/AI | manualVpsUpdate |
| Module Parameter Flow Review | `docs/MODULE_PARAMETER_FLOW_REVIEW.md` | 逐项说明共享数据对象、模块输入参数、内部派生参数、输出参数和模块间数据流，供人工审核 | 当前代码模块和系统流 | 可读审核说明 | 用户/AI | App Shell, Conversation Pipeline, Server Support |
| Module Context Pack Index | `docs/modules/README.md` | 选择本轮低 token 模块上下文包，说明模块包维护规则和查询方式 | 用户请求的模块或边界 | 模块包路径和查询规则 | 用户/AI | docs/modules/* |
| App Shell Context Pack | `docs/modules/app-shell.md` | 记录 App Shell 的低 token 入口、边界、不变量和验证命令 | App Shell 相关任务 | 最小阅读清单 | 用户/AI | App Shell |
| Conversation Pipeline Context Pack | `docs/modules/conversation-pipeline.md` | 记录同步响应路径的低 token 入口、边界、不变量和验证命令 | Conversation Pipeline 相关任务 | 最小阅读清单 | 用户/AI | Conversation Pipeline |
| Memory Retrieval Context Pack | `docs/modules/memory-retrieval.md` | 记录混合记忆召回的低 token 入口、边界、不变量和验证命令 | Memory Retrieval 相关任务 | 最小阅读清单 | 用户/AI | Memory Retrieval |
| Server Support Context Pack | `docs/modules/server-support.md` | 记录服务端支持层、运行时文件和 API 边界的低 token 入口 | Server Support 相关任务 | 最小阅读清单 | 用户/AI | Server Support |
| Persona Dossiers Context Pack | `docs/modules/persona-dossiers.md` | 记录多人档案、人物/场景生成和一致性检测的低 token 入口 | Persona Dossier 相关任务 | 最小阅读清单 | 用户/AI | App Shell, Generators, Server Support |
| Auth Permissions Context Pack | `docs/modules/auth-permissions.md` | 记录登录、会话和管理员权限边界的低 token 入口 | Auth/permission 相关任务 | 最小阅读清单 | 用户/AI | Server Support, App Shell |
| Deployment Update Context Pack | `docs/modules/deployment-update.md` | 记录站内手动更新和生产部署边界的低 token 入口 | Deployment/update 相关任务 | 最小阅读清单 | 用户/AI | Server Support, Production Server |

## 函数登记表

| 函数名 | 文件 | 责任 | 参数 | 返回 | 副作用 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| `runConversationPipeline` | `src/pipeline/conversationPipeline.ts` | 运行完整对话 pipeline，并把当前登录用户作为事件说话者 | content, state, llmConfig, speaker | nextState, trace | 写入状态 | implemented |
| `runCognitiveModule` | `src/pipeline/cognitiveModuleClient.ts` | 执行一个认知脑区式 LLM 模块；结构化输出不可解析时用 mockOutput 继续并记录原因 | request, config, mockOutput | CognitiveModuleTrace | 可调用外部 endpoint | implemented |
| `runAppraisal` | `src/pipeline/appraisal.ts` | 通过 LLM 做事件到关切评估 | event, state, llmConfig | CognitiveModuleTrace<AppraisalResult> | 可调用外部 endpoint | implemented |
| `normalizeAppraisalResult` | `src/pipeline/appraisal.ts` | 将 Appraisal LLM 输出归一化，防止关系、关切数组和事件 ID 形状漂移传入下游 | result, fallback, event, state | AppraisalResult | 无 | implemented |
| `retrieveMemory` | `src/pipeline/memoryRetrieval.ts` | 通过 LLM 召回相关记忆 | event, appraisal, state, llmConfig | CognitiveModuleTrace<MemoryRecallResult> | 可调用外部 endpoint | implemented |
| `createMemoryRetrievalContext` | `src/pipeline/memoryRetrieval.ts` | 将事件、自然语言评估和说话者关系合成召回上下文，供同步和未来异步路径复用 | event, appraisal, state, source | MemoryRetrievalContext | 无 | implemented |
| `buildNaturalCandidateList` | `src/pipeline/memoryRetrieval.ts` | 将短期上下文、长期记忆和关系记忆候选转成给 Memory Recall LLM 读取的自然语言候选清单 | state, context, speechSpeakerId | string | 无 | implemented |
| `buildRelationshipMemoryCandidates` | `src/pipeline/memoryRetrieval.ts` | 将 `relationshipMemory` 关系印象转换为长期记忆候选，参与混合召回 | state | LongTermMemory[] | 无 | implemented |
| `createMemoryCandidates` | `src/pipeline/memoryRetrieval.ts` | 将长期记忆候选转成本地按 ID 回填摘要、参考重要性和空 factors 的候选表 | memories | MemoryCandidate[] | 无 | implemented |
| `normalizeMemoryRecallResult` | `src/pipeline/memoryRetrieval.ts` | 将 Memory Recall LLM 的 ID 选择结果归一化，并从本地候选表回填完整短期/长期记忆内容 | result, fallbackSelection, retrievalContext, candidates, fallback | MemoryRecallResult | 无 | implemented |
| `decideResponse` | `src/pipeline/responseDecision.ts` | 通过 LLM 决定回应姿态 | appraisal, recall, state, llmConfig | CognitiveModuleTrace<ResponseDecision> | 可调用外部 endpoint | implemented |
| `normalizeResponseDecision` | `src/pipeline/responseDecision.ts` | 将 Response Decision LLM 输出归一化，保证回应模式枚举和是否回应字段稳定 | result, fallback | ResponseDecision | 无 | implemented |
| `generateNaturalPromptRequest` | `src/pipeline/promptBuilder.ts` | 生成只含自然语言的 Reply LLM 输入 | event, state, appraisal, recall, decision, provider, model | ExpressionLlmRequest | 无 | implemented |
| `runLlm` | `src/pipeline/llmClient.ts` | 调用 Reply LLM | request, config, simulateInput | ReplyOutput | 可调用外部 endpoint | implemented |
| `readReplyEventStream` | `src/pipeline/llmClient.ts` | 读取 Reply LLM 的 SSE 输出并累积为回复文本 | response, onStream | ReplyOutput-like object | 调用 onStream 更新 live trace | implemented |
| `applyStateUpdates` | `src/pipeline/stateUpdater.ts` | 调用 State Update LLM 并写回状态 | state, event, replyOutput, context, llmConfig | nextState, StateDelta, stateUpdate | 写入记忆和状态 | implemented |
| `normalizeStateUpdatePlan` | `src/pipeline/stateUpdater.ts` | 将 State Update LLM 输出归一化，保证 concernUpdates、relationshipUpdates、userRelationshipMemory 和 internalStateNote 稳定 | result, fallback, state, event | StateUpdatePlan | 无 | implemented |
| `normalizeUserRelationshipMemory` | `src/pipeline/stateUpdater.ts` | 将 State Update LLM 生成的当前用户印象和关系总结归一化为自然语言关系记忆 | value, fallback, event | StateUpdatePlan.userRelationshipMemory | 无 | implemented |
| `evaluateRuntimeSignals` | `src/pipeline/runtimeSignalEvaluator.ts` | 调用 Runtime Signal Evaluation LLM 评估能量、情绪、情绪倾向、唤醒度 | state, event, replyOutput, context, llmConfig | CognitiveModuleTrace<RuntimeSignalEvaluationResult> | 可调用外部 endpoint | implemented |
| `applyRuntimeSignalEvaluation` | `src/pipeline/runtimeSignalEvaluator.ts` | 将信号评估结果写回 runtime 并追加 trace 变化 | state, stateDelta, evaluation | nextState, StateDelta | 写入 runtime signals | implemented |
| `normalizeRuntimeSignalEvaluation` | `src/pipeline/runtimeSignalEvaluator.ts` | 将模型返回的信号评估结果归一化为稳定 UI 结构 | state, evaluation | RuntimeSignalEvaluationResult | 防止模型形状漂移导致 UI 崩溃 | implemented |
| `readEventStream` | `src/pipeline/cognitiveModuleClient.ts` | 读取认知模块 SSE 输出，累积并解析最终 JSON | response, onStream | parsed module output | 调用 onStream 更新 live trace | implemented |
| `shouldUseStructuredFallback` | `src/pipeline/cognitiveModuleClient.ts` | 判断外部结构化输出错误是否应降级到本地候选结果 | request, caught | boolean | 无 | implemented |
| `formatStructuredFallbackReason` | `src/pipeline/cognitiveModuleClient.ts` | 将结构化输出解析错误整理为 trace 可展示的中文原因 | caught | string | 无 | implemented |
| `formatCognitiveTraceOutput` | `src/pipeline/conversationPipeline.ts` | 将认知模块输出和 fallbackReason 合并为右侧流程追踪展示文本 | trace | string | 无 | implemented |
| `buildCompletedTraceProgress` | `src/App.tsx` | 将最终 PipelineTrace 转成输入/输出/状态展示结构 | step, trace | PipelineStepProgress | 无 | implemented |
| `traceStatusLabel` | `src/App.tsx` | 将步骤状态转换为中文 UI 文案 | status | string | 无 | implemented |
| `generateDossierFromDescription` | `src/pipeline/generators.ts` | 调用人物档案解读 LLM，将用户素材归类为展示摘要、长期记忆、人性/人格、标签、关切和状态信号 | description, current state, llmConfig, onProgress? | CharacterState | 可调用外部 endpoint；生成待应用状态预览并上报生成监视 | implemented |
| `generateSceneFromDescription` | `src/pipeline/generators.ts` | 调用场景解读 LLM，将用户场景素材归类为场景摘要、状态影响和人物影响 | description, current state, llmConfig, onProgress? | CharacterState | 可调用外部 endpoint；生成待应用状态预览并上报生成监视 | implemented |
| `applyDossierInterpretation` | `src/pipeline/generators.ts` | 将人物档案解读结果归一化并写入预览状态 | source, current, result | CharacterState | 生成 profile/concerns/longTermMemory/runtime 预览 | implemented |
| `applySceneInterpretation` | `src/pipeline/generators.ts` | 将场景解读结果归一化并写入预览状态 | source, current, result | CharacterState | 生成 scene/concerns/longTermMemory/runtime/profile 预览 | implemented |
| `compactText` | `src/pipeline/generators.ts` | 限制展示文本长度并避免完整原文进入展示字段 | value, fallback, maxLength, source | string | 无 | implemented |
| `evaluateProfileSceneConsistency` | `src/pipeline/profileSceneConsistency.ts` | 调用一致性检测 LLM，判断人物和场景是否存在时代/世界观硬冲突 | state, llmConfig | ProfileSceneConsistencyResult | 可调用外部 endpoint | implemented |
| `normalizeProfileSceneConsistency` | `src/pipeline/profileSceneConsistency.ts` | 稳定一致性检测结果并确保 hard mismatch 必须需要门禁 | result, fallback | ProfileSceneConsistencyResult | 无 | implemented |
| `createPersonaDossier` | `src/App.tsx` | 创建绑定人物状态和场景素材的可切换档案条目 | state, dossierDescription, sceneDescription, title | PersonaDossier | 无 | implemented |
| `ensureDossierPreview` | `src/App.tsx` | 当前角色缺少预览时调用 DeepSeek 流式生成短预览，并提交后台全局保存 | dossier | Promise<void> | 调用 `/api/deepseek-chat` 和 `/api/persona-dossiers/:id/preview`，上报生成监视 | implemented |
| `createConversationHistoryKey` | `src/App.tsx` | 为中间栏消息历史生成 `user + dossier` 隔离键 | user, dossierId | string | 无 | implemented |
| `createAdminConversationHistoryKey` | `src/App.tsx` | 为管理员查看其他用户历史生成前端只读历史桶键 | historyKey | string | 无 | implemented |
| `createConversationSpeaker` | `src/App.tsx` | 将登录用户归一化为 pipeline 事件说话者身份 | user | `{ id, name }` | 无 | implemented |
| `readStoredConversationHistory` | `src/App.tsx` | 从 localStorage 读取指定历史桶 | historyKey | ChatMessage[]? | 读取 localStorage | implemented |
| `writeStoredConversationHistory` | `src/App.tsx` | 将指定历史桶截断后写入 localStorage | historyKey, messages | void | 写入 localStorage | implemented |
| `setMessagesForHistory` | `src/App.tsx` | 将消息更新写入指定 `conversationHistoryKey`，避免切任务或切用户串历史 | historyKey, updater | void | 更新 App state 和 localStorage | implemented |
| `loadConversationHistory` | `src/App.tsx` | 切换人物或登录后读取当前用户当前人物的后台中间栏历史，并在后台为空时回填本地缓存 | dossierId, historyKey, cachedMessages? | Promise<void> | 调用 `/api/persona-dossiers/:id/conversation-history` 并更新历史桶 | implemented |
| `loadAdminConversationHistorySummaries` | `src/App.tsx` | 管理员读取当前人物下所有用户历史摘要 | dossierId | Promise<void> | 调用 `/api/admin/conversation-histories` | implemented |
| `handleSelectAdminHistoryKey` | `src/App.tsx` | 管理员选择某个用户历史后加载其当前人物消息 | historyKey | Promise<void> | 更新中间栏只读历史桶 | implemented |
| `persistConversationHistoryMessages` | `src/App.tsx` | 将本轮新增的用户消息和角色回复追加保存到后台历史 | dossierId, messagesToSave | Promise<void> | 调用 `/api/persona-dossiers/:id/conversation-history` | implemented |
| `buildConversationModuleCalls` | `src/App.tsx` | 将 `PipelineTrace` 转成可持久化的模块调用记录列表 | trace | ConversationModuleCall[] | 无 | implemented |
| `syncConversationState` | `src/App.tsx` | 一轮对话完成后把角色最新状态写回当前用户的私有对话运行态 | nextState, interaction | Promise<void> | 调用 `/api/persona-dossiers/:id/conversation-state` 并更新当前用户叠加后的档案列表 | implemented |
| `formatDossierDetailForPreview` | `src/App.tsx` | 将详细人物档案整理成 DeepSeek 预览生成输入 | dossier | string | 无 | implemented |
| `updateMonitorProgress` | `src/App.tsx` | 将对话流程或生成监视的一步进度写入右侧 live trace，并切换当前查看步骤 | progress | void | 更新 `activeStep` 和 `liveTrace` | implemented |
| `readNaturalLanguageEventStream` | `src/App.tsx` | 读取人物短预览自然语言 SSE，累积 delta 并兼容最终文本或 reply 对象 | response, onStream? | string | 调用 onStream 更新生成监视 | implemented |
| `isPipelineTraceStep` | `src/App.tsx` | 区分对话流程步骤和生成监视步骤，避免生成步骤被当作 `PipelineTrace` 读取 | step | boolean type guard | 无 | implemented |
| `LocationCard` | `src/App.tsx` | 在左侧显示角色当前位置、速度、方向和周边地图上下文摘要 | location | JSX | 无 | implemented |
| `handleCreateDossier` | `src/App.tsx` | 在左栏新建一个空的人物-场景配套档案 | 无 | void | 更新 App state | implemented |
| `handleDeleteDossier` | `src/App.tsx` | 管理员删除当前或指定人物档案，删空后工作台回到无当前共享档案状态 | dossier id | void | 更新 App state | implemented |
| `handleDossierGroupChange` | `src/App.tsx` | 管理员修改当前人物档案分组 | groupName | void | 更新 App state | implemented |
| `deleteConversationAuditEntry` | `src/App.tsx` | 管理员在审计浮层删除单条用户输入输出记录 | auditId | Promise<void> | 调用审计删除 API 并更新 App state | implemented |
| `clearConversationAuditEntries` | `src/App.tsx` | 管理员在审计浮层清空用户输入输出记录 | 无 | Promise<void> | 调用审计清空 API 并更新 App state | implemented |
| `checkAppUpdate` | `src/App.tsx` | 左上角自动检查服务器是否落后于 GitHub 远端 | 无 | Promise<void> | 调用 `/api/app-update/status` 并更新 UI 状态 | implemented |
| `handleRunAppUpdate` | `src/App.tsx` | 管理员触发 VPS 手动更新并读取 SSE 日志 | 无 | Promise<void> | 调用 `/api/app-update/run`，显示进度和日志 | implemented |
| `consumeUpdateEvent` | `src/App.tsx` | 解析更新 SSE data 事件 | event text | void | 更新进度条和日志窗口 | implemented |
| `appendUpdateLog` | `src/App.tsx` | 将一条更新日志追加到窗口并限制长度 | log entry | void | 更新 App state | implemented |
| `applyCandidateState` | `src/App.tsx` | 应用人物或场景预览前先运行人物场景一致性检测 | candidate, target | Promise<void> | 可能打开扭曲时空门禁或写入状态 | implemented |
| `handleConfirmDistortionPassword` | `src/App.tsx` | 校验扭曲时空密码后继续应用硬冲突的人物/场景组合 | 无 | void | 写入状态 | implemented |
| `streamDeepseek` | `vite.config.ts` | 代理 DeepSeek SSE 输出并转成前端可读事件 | body, config, apiKey, response | text/event-stream | 读取 DeepSeek API | implemented |
| `fetchDeepseek` | `vite.config.ts` | 组装 DeepSeek Chat Completions 请求，强制关闭 thinking | body, config, apiKey, stream | Response | 调用 DeepSeek API | implemented |
| `normalizeDeepseekModel` | `vite.config.ts` / `src/App.tsx` | 避免使用 `deepseek-reasoner`，改为非思考模型 | model | model | 无 | implemented |
| `sendSse` | `vite.config.ts` | 写出本地 SSE data 事件 | response, data | void | 写 HTTP response | implemented |
| `serveStatic` | `server.mjs` | 生产环境返回 `dist/` 静态文件并支持 SPA fallback | pathname, method, response | HTML/assets | 读取 dist | implemented |
| `loginWithLiaoChatroom` | `serverSupport.mjs` | 用 liao 聊天室 `/api/login` 校验用户名和密码，不修改聊天室数据、不保存密码 | username, password | liao user payload | 读取外部登录接口 | implemented |
| `createLocalSession` | `serverSupport.mjs` | 将 liao 登录结果转换成本项目本地会话 token | liao user payload | token, user, expiresAt | 写入内存会话表 | implemented |
| `getRequestSession` | `serverSupport.mjs` | 从 Authorization Bearer token 读取当前本地登录会话 | HTTP request | auth session? | 清理过期会话 | implemented |
| `requireSession` | `serverSupport.mjs` | 保护需要登录的 API | HTTP request/response | auth session? | 可能返回 401 | implemented |
| `requireAdminSession` | `serverSupport.mjs` | 保护只有管理员可执行的 API | HTTP request/response | auth session? | 可能返回 401/403 | implemented |
| `readPersonaDossiers` | `serverSupport.mjs` | 读取后台共享多人档案，并在传入用户时叠加该用户私有对话运行态 | user? | PersonaDossier[] | 读取 `.persona-dossiers.local.json` 和 `.conversation-states.local.json` | implemented |
| `upsertPersonaDossier` | `serverSupport.mjs` | 管理员新增或覆盖共享多人档案 | dossier, user | PersonaDossier | 写入 `.persona-dossiers.local.json` | implemented |
| `deletePersonaDossier` | `serverSupport.mjs` | 管理员删除共享多人档案 | dossierId | deleted flag | 写入 `.persona-dossiers.local.json` | implemented |
| `updatePersonaDossierPreview` | `serverSupport.mjs` | 登录用户提交 DeepSeek 生成的人物短预览并全局保存 | dossierId, previewSummary, user | dossier or error | 写入 `.persona-dossiers.local.json` | implemented |
| `updatePersonaDossierConversationState` | `serverSupport.mjs` | 登录用户对话后写回该用户对当前角色的私有运行态，并触发该用户范围内的关系余波 | dossierId, nextState, interaction, user | dossier/dossiers or error | 写入 `.conversation-states.local.json` | implemented |
| `readConversationHistoryMessages` | `serverSupport.mjs` | 读取当前用户在指定人物上的中间栏消息历史 | dossierId, user | ChatMessage-like[] | 读取 `.conversation-histories.local.json` | implemented |
| `appendConversationHistoryMessages` | `serverSupport.mjs` | 追加保存当前用户在指定人物上的中间栏消息历史 | dossierId, messages, user | messages or error | 写入 `.conversation-histories.local.json` | implemented |
| `sanitizeConversationHistoryMessages` | `serverSupport.mjs` | 限制服务端保存的历史消息字段、长度和 speaker 枚举 | messages | message[] | 无 | implemented |
| `applyUserConversationStates` | `serverSupport.mjs` | 将某个用户保存的私有角色状态叠加到共享档案列表上 | dossiers, user | PersonaDossier[] | 读取 `.conversation-states.local.json` | implemented |
| `writeUserConversationStates` | `serverSupport.mjs` | 保存某个用户被修改的私有角色运行态条目 | user, changedDossiers | void | 写入 `.conversation-states.local.json` | implemented |
| `propagateRelationshipInfluence` | `serverSupport.mjs` | 将一个角色的压缩互动余波写入同一用户运行态中与其有关系的其他角色 | dossiers, sourceIndex, interaction, user, now | PersonaDossier[] | 更新当前用户相关角色长期记忆和 relationship notes | implemented |
| `appendConversationAudit` | `serverSupport.mjs` | 记录登录用户的一次输入输出 | entry, user | ConversationAuditEntry | 写入 `.conversation-audits.local.json` | implemented |
| `readConversationAudits` | `serverSupport.mjs` | 管理员读取最近用户输入输出 | limit | ConversationAuditEntry[] | 读取 `.conversation-audits.local.json` | implemented |
| `readConversationHistorySummaries` | `serverSupport.mjs` | 管理员按人物读取所有用户历史摘要 | dossierId | ConversationHistorySummary[] | 读取 `.conversation-histories.local.json` | implemented |
| `readConversationHistoryMessagesByKey` | `serverSupport.mjs` | 管理员按内部历史 key 读取某用户某人物消息 | dossierId, key | ChatMessage[] | 读取 `.conversation-histories.local.json` | implemented |
| `deleteConversationAudit` | `serverSupport.mjs` | 管理员删除单条用户输入输出审计记录 | auditId | deleted flag | 写入 `.conversation-audits.local.json` | implemented |
| `clearConversationAudits` | `serverSupport.mjs` | 管理员清空用户输入输出审计记录 | 无 | deleted flag | 写入 `.conversation-audits.local.json` | implemented |
| `readAppUpdateStatus` | `serverSupport.mjs` | 检查本机 git 工作树当前提交和远端分支提交是否一致 | 无 | appUpdateStatus | 调用 git 命令读取本机和远端状态 | implemented |
| `streamAppUpdate` | `serverSupport.mjs` | 管理员触发 git pull、npm ci、npm run build 和重启命令，并通过 SSE 返回进度 | HTTP response | text/event-stream | 在 `APP_UPDATE_WORKDIR` 执行更新命令 | implemented |
| `createDossier` | `builtinPersonaDossiers.mjs` | 将内置规格转换为全局 `PersonaDossier` | spec | PersonaDossier | 无 | implemented |
| `createLifeEvents` | `builtinPersonaDossiers.mjs` | 将内置生平规格转换为 `LifeEvent[]` | specId, items | LifeEvent[] | 无 | implemented |
| `createPersonaRelationships` | `builtinPersonaDossiers.mjs` | 将内置熟人关系规格转换为 `Relationship` map | items | relationships | 无 | implemented |
| `createLocation` | `builtinPersonaDossiers.mjs` | 将内置位置规格转换为 `CharacterLocation` | location tuple | CharacterLocation-like object | 无 | implemented |

## 数据字段登记表

| 字段名 | 所属对象/表 | 类型 | 含义 | 来源 | 消费方 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| `profile` | `CharacterState` | `CharacterProfile` | 角色基础人设 | seed/generator | promptBuilder/UI | implemented |
| `profile.displaySummary` | `CharacterProfile` | `string` | 左侧个人展示使用的短摘要，由人物档案解读 LLM 总结，不展示用户输入长段原文 | seed/generator | UI | implemented |
| `profile.socialPersonaPattern` | `CharacterProfile` | `string?` | 角色在人群性格分布里的位置，用于保持角色差异化 | seed/generator | promptBuilder/UI | implemented |
| `profile.fullLifeStory` | `CharacterProfile` | `string?` | 角色从小到大的完整故事脉络 | seed/generator | promptBuilder/UI | implemented |
| `profile.lifeEvents` | `CharacterProfile` | `LifeEvent[]` | 关键成长经历、心理变化和关系变化 | seed/generator | promptBuilder/UI/memory | implemented |
| `lifeEvent.psychologicalChange` | `LifeEvent` | `string` | 某段经历带来的心理结构变化 | seed/generator | promptBuilder/UI | implemented |
| `lifeEvent.relationshipChange` | `LifeEvent` | `string` | 某段经历带来的关系距离、信任或依附变化 | seed/generator | promptBuilder/UI | implemented |
| `profile.personalitySummary` | `CharacterProfile` | `string` | 性格标签背后的综合描述 | seed/generator | promptBuilder/UI | implemented |
| `profile.personalityFacets` | `CharacterProfile` | `PersonalityFacet[]` | 性格由哪些特性、经历和表达习惯组成 | seed/generator | promptBuilder/UI | implemented |
| `concerns` | `CharacterState` | `Concern[]` | 角色当前关切清单 | seed/generator/stateUpdater | appraisal/promptBuilder/UI | implemented |
| `relationships` | `CharacterState` | `Record<string, Relationship>` | 角色对每个对象的关系档案 | seed/stateUpdater | appraisal/promptBuilder/UI | implemented |
| `shortTermMemory` | `CharacterState` | `ShortTermMemory[]` | 最近对话原文 | stateUpdater | memoryRetrieval/promptBuilder | implemented |
| `longTermMemory` | `CharacterState` | `LongTermMemory[]` | 长期摘要记忆 | seed/stateUpdater | memoryRetrieval/promptBuilder | implemented |
| `relationshipMemory` | `CharacterState` | `RelationshipMemory[]` | 长期记忆中的关系记忆区，按当前用户保存自然语言印象、关系总结、证据和最近互动 | seed/builtin/stateUpdater | memoryRetrieval/promptBuilder/right panel | implemented |
| `relationshipMemory[].impressionSummary` | `RelationshipMemory` | `string` | 人物对该用户的自然语言印象，不使用数值评分 | stateUpdater | promptBuilder/right panel | implemented |
| `relationshipMemory[].relationshipSummary` | `RelationshipMemory` | `string` | 人物与该用户当前关系的自然语言总结，不使用数值评分 | stateUpdater | promptBuilder/right panel | implemented |
| `runtime.derivedMood` | `RuntimeState` | object | 由状态信号评估模块产出的当前心情摘要 | seed/runtimeSignalEvaluator | UI/promptBuilder | implemented |
| `runtime.signalProfiles` | `RuntimeState` | `Record<RuntimeSignalKey, RuntimeSignalProfile>` | UI 简化指标背后的自然语言考量，供 Prompt Generator 组织上下文 | seed/generator/stateUpdater | promptBuilder/UI | implemented |
| `runtime.signalProfiles.*.cognitiveNarrative` | `RuntimeSignalProfile` | `string` | 状态信号背后的内在状态叙述，只描述属性和成因，不写回复指令 | seed/generator/stateUpdater | promptBuilder/UI | implemented |
| `scene` | `CharacterState` | `SceneState` | 当前场景 | seed/generator | UI/promptBuilder | implemented |
| `scene.cognitiveNarrative` | `SceneState` | `string` | 场景如何改变注意力、身体感和关系距离的自然语言叙述 | seed/generator | promptBuilder/UI | implemented |
| `location` | `CharacterState` | `CharacterLocation?` | 角色当前物理位置、速度、方向和地图上下文 | seed/builtin/manual | UI/promptBuilder | implemented |
| `location.label` | `CharacterLocation` | `string` | 人可读当前位置名称 | seed/builtin/manual | UI/promptBuilder | implemented |
| `location.address` | `CharacterLocation` | `string` | 当前位置地址或范围描述 | seed/builtin/manual | UI/promptBuilder | implemented |
| `location.region` | `CharacterLocation` | `string` | 位置所属城市/区县/世界区域 | seed/builtin/manual | UI/promptBuilder | implemented |
| `location.coordinate` | `CharacterLocation` | `{ lng: number; lat: number }?` | 经纬度坐标；当前仅作为种子/人工字段，未来可由国内地图服务解析 | seed/builtin/manual/mapService | UI/future map panel | implemented |
| `location.speedKmh` | `CharacterLocation` | `number` | 角色移动速度，单位 km/h | seed/builtin/manual | UI/promptBuilder | implemented |
| `location.headingDeg` | `CharacterLocation` | `number` | 角色移动方向角度 | seed/builtin/manual | UI/promptBuilder | implemented |
| `location.headingLabel` | `CharacterLocation` | `string` | 角色移动方向中文摘要 | seed/builtin/manual | UI/promptBuilder | implemented |
| `location.motionState` | `CharacterLocation` | enum | 停留、步行、骑行、驾车或未知 | seed/builtin/manual | UI/promptBuilder | implemented |
| `location.mapContext` | `CharacterLocation` | object? | 周边道路、地点、建筑和环境摘要 | seed/builtin/manual/mapService | UI/promptBuilder | implemented |
| `dossierPreview` | App state | `CharacterState?` | 人物档案生成后的待应用预览 | App Shell | UI/apply action | implemented |
| `scenePreview` | App state | `CharacterState?` | 场景解读后的待应用状态预览，包含 scene、状态、关切、长期记忆和人物影响 | App Shell | UI/apply action | implemented |
| `personaDossiers` / `dossiers` | App state | `PersonaDossier[]` | 左侧多人档案列表，每个条目绑定人物状态和场景输入 | App Shell | UI/switch/apply/delete | implemented |
| `personaDossier.groupName` | `PersonaDossier` | `string` | 多人档案所属分组，例如“马可福音10”“郑州市” | builtin/admin UI | UI/shared dossier API | implemented |
| `personaDossier.previewSummary` | `PersonaDossier` | `string?` | DeepSeek 生成并全局保存的人物短预览；源码不手写 | `/api/deepseek-chat` + preview API | UI | implemented |
| `personaDossier.previewGeneratedAt` | `PersonaDossier` | `string?` | 人物短预览生成时间 | preview API | UI/shared dossier API | implemented |
| `personaDossier.previewStatus` | `PersonaDossier` | enum? | `pending/generating/ready/failed`，用于 UI 判断预览缓存状态；缺失时视为 pending | App Shell/shared dossier API | UI | implemented |
| `personaDossier.isBuiltin` | `PersonaDossier` | `boolean?` | 是否为服务内置全局初始档案 | Builtin Persona Dossiers | Server Support/Admin UI | implemented |
| `activeDossierId` | App state | `string` | 当前选中的人物档案组合 ID | App Shell | UI/switch/apply/delete | implemented |
| `consistencyGate` | App state | `ConsistencyGate?` | 一致性检测发现硬冲突后等待用户输入扭曲时空密码的门禁状态 | App Shell | UI/apply action | implemented |
| `distortionPassword` | App constant | `string` | 本地门禁短语，当前为“扭曲时空密码” | App Shell | UI/apply action | implemented |
| `profileSceneConsistency` | cognitive module output | `ProfileSceneConsistencyResult` | 人物档案和场景的匹配结果、冲突理由、是否需要门禁 | Profile Scene Consistency | App Shell | implemented |
| `pipelineTrace` | `ChatMessage` | `PipelineTrace` | 一轮对话所有中间结果 | conversationPipeline | Pipeline Debug Panel | implemented |
| `prompt` | `ExpressionLlmRequest` | `string` | 交给 Reply LLM 的自然语言上下文 | promptGenerator | llmClient/UI | implemented |
| `outputContract` | `CognitiveModuleRequest` | `string` | 认知模块结构化输出约束，不进入 Reply LLM prompt | cognitive modules | cognitiveModuleClient/backend | implemented |
| `appraisal.narrative` | `AppraisalResult` | `string?` | Appraisal LLM 输出的可选自然语言叙事说明 | appraisal | Pipeline Debug Panel/downstream cognitive context | implemented |
| `memoryRecall.narrative` | `MemoryRecallResult` | `string?` | Memory Recall LLM 输出的可选自然语言叙事说明 | memoryRetrieval | Pipeline Debug Panel/downstream cognitive context | implemented |
| `responseDecision.narrative` | `ResponseDecision` | `string?` | Response Decision LLM 输出的可选自然语言叙事说明 | responseDecision | Pipeline Debug Panel/downstream cognitive context | implemented |
| `stateUpdate.narrative` | `StateUpdatePlan` | `string?` | State Update LLM 输出的可选自然语言叙事说明 | stateUpdater | Pipeline Debug Panel/downstream cognitive context | implemented |
| `runtimeSignalEvaluation.narrative` | `RuntimeSignalEvaluationResult` | `string?` | Runtime Signal Evaluation LLM 输出的可选自然语言叙事说明 | runtimeSignalEvaluator | Pipeline Debug Panel/downstream cognitive context | implemented |
| `memoryRecall.source` | `MemoryRecallResult` | `MemoryRecallSource` | 说明本次召回来自同步响应路径或未来异步生命路径 | memoryRetrieval | Decision/Prompt Generator/Pipeline Debug Panel | implemented |
| `memoryRecall.retrievalMode` | `MemoryRecallResult` | `"hybrid_relevance"` | 标识当前使用混合相关度召回，不是敏感词召回 | memoryRetrieval | Pipeline Debug Panel | implemented |
| `memoryRecall.naturalLanguageQuery` | `MemoryRecallResult` | `string` | 召回时放入自然语言候选清单的语义查询 | memoryRetrieval | Pipeline Debug Panel | implemented |
| `memoryRecall.longTermMemories[].factors` | `MemoryRecallResult` | `MemoryRecallFactor[]` | 兼容旧 UI 的可选分项原因；自然语言候选策略下通常为空数组 | memoryRetrieval | Pipeline Debug Panel/Decision/Prompt Generator | implemented |
| `stateUpdate.userRelationshipMemory` | `StateUpdatePlan` | object | State Update LLM 为当前说话用户生成的自然语言印象和关系总结 | stateUpdater | relationshipMemory writeback | implemented |
| `stateUpdate` | `PipelineTrace` | `CognitiveModuleTrace<StateUpdatePlan>` | State Update LLM 的完整调用记录 | stateUpdater | Pipeline Debug Panel | implemented |
| `runtimeSignalEvaluation` | `PipelineTrace` | `CognitiveModuleTrace<RuntimeSignalEvaluationResult>` | Runtime Signal Evaluation LLM 的完整调用记录 | runtimeSignalEvaluator | Pipeline Debug Panel | implemented |
| `pipelineStepProgress` | App state | `PipelineStepProgress` | 执行中某一步的输入、输出、状态和 transport，用于 live trace | conversationPipeline | App Shell | implemented |
| `cognitiveModuleTrace.fallbackReason` | `CognitiveModuleTrace` | `string?` | 外部结构化输出无法解析时的回退原因，右侧流程追踪会展示 | cognitiveModuleClient | Pipeline Debug Panel | implemented |
| `generationMonitorStep` | Core type | `GenerationMonitorStep` | 右侧生成监视可选步骤：`dossierSummaryGeneration`、`dossierGeneration`、`sceneGeneration` | App Shell/generators | live trace UI | implemented |
| `dossier_summary_generation` | `CognitiveModuleName` | string literal | 人物短预览自然语言生成模块名，只写 `personaDossier.previewSummary` | App Shell `/api/deepseek-chat` | DeepSeek proxy | implemented |
| `liveTrace` | App state | `TraceDisplayState` | 同时保存对话流程和生成监视的实时输入、输出、状态 | conversation pipeline/generators/preview cache | right panel | implemented |
| `deepseekConnected` | App state | `boolean` | 顶部显示 DeepSeek 是否已有本地密钥并可作为真实 LLM 入口 | `/api/deepseek-config` / 测试连接 | App Shell | implemented |
| `deepseekStatus` | App state | `string` | DeepSeek 密钥保存和真实连接测试的人类可读状态 | `/api/deepseek-config` / `/api/deepseek-chat` | App Shell | implemented |
| `appVersionLabel` | App constant | `string` | 页面左上角显示的版本号，如 `v0.1.0` | `package.json` | App Shell | implemented |
| `package.version` | `package.json` / `package-lock.json` | semver string | 应用版本源；每个完成的 reviewable step 都要同步递增 | release workflow | App Shell / build metadata | implemented |
| `githubRepositoryUrl` | App constant | `string` | 页面左上角 GitHub 链接地址 | GitHub remote | App Shell | implemented |
| `authToken` | App state / `LlmConfig` | `string` | 本项目本地登录 token，用于保护 DeepSeek 代理、共享档案和审计 API | `/api/auth/login` | App Shell/pipeline LLM clients | implemented |
| `authUser` | App state | `AuthUser?` | 当前登录用户，包含是否管理员 | `/api/auth/login` `/api/auth/session` | App Shell permission gates | implemented |
| `isAdmin` | App derived state | `boolean` | 当前用户是否可维护共享档案和查看审计 | `authUser.isAdmin` | App Shell permission gates | implemented |
| `dossierSyncStatus` | App state | `string` | 后台共享档案读取/保存状态文案 | shared dossier API | UI | implemented |
| `groupedDossiers` | App derived state | `[groupName, PersonaDossier[]][]` | 左侧多人档案按分组聚合后的渲染结构 | `dossiers` | App Shell UI | implemented |
| `conversationHistories` | App state | `ConversationHistoryMap` | 中间栏消息历史集合，按 `conversationHistoryKey` 分桶 | App Shell/localStorage | Chat panel | implemented |
| `conversationHistoryKey` | App derived state | `string` | 当前中间栏历史桶键，由 `authUser` 和 `activeDossierId` 组成 | App Shell | `setMessagesForHistory` | implemented |
| `userConversationHistoryEntry` | `.conversation-histories.local.json` | object | 某个用户在某个档案上的中间栏消息历史 | `/api/persona-dossiers/:id/conversation-history` | App Shell chat panel | implemented |
| `conversationHistorySummary` | `/api/admin/conversation-histories` | object | 管理员可见的某人物下用户历史摘要，包含用户、消息数和更新时间 | Server Support | App Shell admin history selector | implemented |
| `userConversationStateEntry` | `.conversation-states.local.json` | object | 某个用户在某个档案上的私有角色运行态覆盖层 | `/api/persona-dossiers/:id/conversation-state` | `readPersonaDossiers(user)` | implemented |
| `conversationAuditEntry.id` | ConversationAuditEntry | `string` | 单条审计记录 ID，用于管理员删除 | serverSupport | Admin audit UI/API | implemented |
| `conversationAuditEntry.userInput` | ConversationAuditEntry | `string` | 登录用户发送给虚拟人的输入 | App Shell | Admin audit UI | implemented |
| `conversationAuditEntry.personaOutput` | ConversationAuditEntry | `string` | 虚拟人回复或失败时为空 | App Shell | Admin audit UI | implemented |
| `conversationAuditEntry.moduleCalls` | ConversationAuditEntry | `ConversationModuleCall[]` | 一轮对话中每个 pipeline 模块的输入、输出、状态和 transport | App Shell | Admin audit UI/API | implemented |
| `conversationModuleCall.step` | ConversationModuleCall | `string` | 模块步骤键，例如 `memoryRecall`、`stateUpdate` | App Shell | Admin audit UI | implemented |
| `appUpdateStatus.available` | AppUpdateStatus | `boolean` | 服务器当前提交是否落后于远端分支 | `/api/app-update/status` | 左上角更新提示 | implemented |
| `appUpdateStatus.currentCommit` | AppUpdateStatus | `string` | VPS 当前 git 提交 SHA | serverSupport git command | 更新窗口 | implemented |
| `appUpdateStatus.remoteCommit` | AppUpdateStatus | `string` | GitHub 远端分支 SHA | serverSupport git command | 更新窗口 | implemented |
| `appUpdateLogEntry.text` | AppUpdateLogEntry | `string` | 更新过程中一行步骤或命令输出 | `/api/app-update/run` SSE | 更新窗口代码区 | implemented |

## API 路由登记表

| 路由 | 方法 | 责任 | 密钥/风险 | 状态 |
| --- | --- | --- | --- | --- |
| `/api/deepseek-config` | GET | 返回本地 DeepSeek 密钥是否已保存、默认 endpoint 和 `deepseek-v4-flash` 模型 | 不返回密钥明文 | implemented |
| `/api/deepseek-config` | POST | 管理员将 DeepSeek 密钥保存到项目根目录 `.deepseek.local.json`，模型固定为 `deepseek-v4-flash` | 需要管理员会话；文件必须被 `.gitignore` 忽略 | implemented |
| `/api/deepseek-chat` | POST | 登录用户可调用的本地 DeepSeek Chat Completions 代理；支持 SSE 流式返回 | 需要登录会话；从 `.deepseek.local.json` 或 `DEEPSEEK_API_KEY` 读取密钥；强制关闭 thinking 并纠正 reasoner 模型 | implemented |
| `/health` | GET | 线上 nginx 健康检查 | 只返回 OK | implemented |
| `/api/auth/session` | GET | 返回当前本地会话是否有效和用户摘要 | 不返回 liao token 或密码 | implemented |
| `/api/auth/login` | POST | 用 liao 聊天室账号密码登录本项目 | 请求会发送到 `liaoChatroomOrigin` 的 `/api/login`；本项目不保存密码 | implemented |
| `/api/auth/logout` | POST | 销毁本项目内存会话 | 不修改 liao 聊天室数据 | implemented |
| `/api/persona-dossiers` | GET | 登录用户读取后台共享多人档案，并叠加当前用户私有对话运行态 | 需要本项目登录会话 | implemented |
| `/api/persona-dossiers` | POST | 管理员新增或更新后台共享多人档案 | 需要管理员会话；写 `.persona-dossiers.local.json` | implemented |
| `/api/persona-dossiers/:id/preview` | POST | 登录用户提交 DeepSeek 已生成的人物短预览，全局保存到对应档案 | 需要登录会话；只允许写预览缓存，不允许改完整档案 | implemented |
| `/api/persona-dossiers/:id/conversation-history` | GET | 登录用户读取自己在某个人物上的中间栏消息历史 | 需要登录会话；只返回当前用户当前档案历史 | implemented |
| `/api/persona-dossiers/:id/conversation-history` | POST | 登录用户追加保存自己在某个人物上的中间栏消息历史 | 需要登录会话；写 `.conversation-histories.local.json` | implemented |
| `/api/admin/conversation-histories` | GET | 管理员按 `dossierId` 列出用户历史摘要，或按 `dossierId + key` 读取某用户消息 | 需要管理员会话；只读 `.conversation-histories.local.json` | implemented |
| `/api/persona-dossiers/:id/conversation-state` | POST | 登录用户对话完成后写回当前用户在该角色上的私有运行态，并向当前用户相关人物传播关系余波 | 需要登录会话；只允许写当前用户对话产生的角色状态和关系余波 | implemented |
| `/api/persona-dossiers/:id` | DELETE | 管理员删除后台共享多人档案 | 需要管理员会话；写 `.persona-dossiers.local.json` | implemented |
| `/api/conversation-audits` | POST | 登录用户记录一次输入输出和模块调用记录 | 需要登录会话；写 `.conversation-audits.local.json` | implemented |
| `/api/conversation-audits` | GET | 管理员读取所有用户输入输出和模块调用记录 | 需要管理员会话 | implemented |
| `/api/conversation-audits` | DELETE | 管理员清空所有用户输入输出审计记录 | 需要管理员会话；写 `.conversation-audits.local.json` | implemented |
| `/api/conversation-audits/:id` | DELETE | 管理员删除单条用户输入输出审计记录 | 需要管理员会话；写 `.conversation-audits.local.json` | implemented |
| `/api/app-update/status` | GET | 检查服务器 git 工作树和 GitHub 远端分支是否一致 | 不执行更新；需要 VPS git remote 凭据可用 | implemented |
| `/api/app-update/run` | POST | 管理员触发 VPS 拉取远端代码、安装、构建和重启 | 需要管理员会话；会在 `APP_UPDATE_WORKDIR` 执行命令 | implemented |

## 外部服务登记表

| 服务 | 标准名称 | 用途 | 权限/密钥位置 | 风险 |
| --- | --- | --- | --- | --- |
| GitHub | `github` | 代码远程同步和版本回溯 | 本机 GitHub CLI 或 GitHub 连接器 | 需要确认仓库名和可见性 |
| GitHub Actions | `githubActions` | 当前不再承担生产自动部署 | 无当前生产部署 workflow | 旧部署记录仅作历史参考 |
| Git 工作树更新目录 | `appUpdateWorkdir` | VPS 站内手动更新的 git clone 工作目录 | `APP_UPDATE_WORKDIR` 环境变量，不写入仓库 | 目录不是 git 工作树时无法站内更新 |
| VPS | `productionVps` | MVP 部署 | 不写入仓库 | 只允许操作 `<production-domain>` |
| PM2 进程 | `productionPm2Process` | 运行线上 Node 生产服务 | root 用户 PM2，仅新增 `<production-pm2-name>` | 不触碰其他 PM2 应用 |
| Nginx 站点 | `productionNginxSite` | 将生产域名反代到 `127.0.0.1:<production-port>` | `<production-nginx-site>` | 只修改该域名配置 |
| DeepSeek API | `deepseekApi` | 本地真实 LLM 测试，驱动认知模块和 Reply LLM | `.deepseek.local.json` 或 `DEEPSEEK_API_KEY`，不进 git | 通过 Vite 本地代理调用；固定 `deepseek-v4-flash` 并强制 `thinking.disabled` |
| 外部 LLM Endpoint | `externalLlmEndpoint` | DeepSeek 本地代理入口 | 不在前端保存密钥；由 Vite 代理读取本地密钥 | 当前由 `/api/deepseek-chat` 承担本地代理，不作为 UI 可选模拟模式 |
| liao 聊天室 | `liaoChatroom` | 本项目用户来源和密码校验来源 | `LIAO_CHATROOM_ORIGIN` 配置的 `/api/login`；本项目只调用登录校验，不写聊天室数据 | 上游接口不可用或未配置时无法登录 |
| 国内地图服务 | `domesticMapService` | 未来解析真实道路、建筑、POI 和角色位置；当前尚未接入 | 待选型；不得使用 Google Maps 作为国内用户默认服务 | 当前 `mapContext.source=seed/manual`，不能假装来自真实地图 API |
