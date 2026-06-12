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
| 时间场景推进 | `temporalSceneProgression` | pipeline workflow | 每轮对话在 Appraisal 前根据人物位置时区和真实时间推进 `scene/location`；不按用户话语关键词移动或瞬移 | `sceneAutoSwap`, `timeJump`, `teleportScene` |
| 当前持续活动 | `runtime.currentActivity` | runtime field/domain object | 角色因现场事件或 State Update 对聊天行动意图的写回产生的持续动作/移动，时间场景推进会在有效期内优先承接 | `eventStateOnly`, `activityLog`, `currentTaskText` |
| 当前活动状态 | `CurrentActivityStatus` | domain enum | 当前持续活动的类别，例如处理事件、准备/前往工作、移动或休息 | `activityKind`, `taskMode` |
| 人物位置 | `characterLocation` | domain object | 角色当前物理位置、速度、方向和地图上下文 | `geoPoint`, `placeInfo` |
| 地图上下文 | `mapContext` | domain object | 位置周边道路、地点、建筑和环境摘要；当前可由种子或人工维护，未来可由地图服务解析 | `mapDataDump`, `poiText` |
| 管线追踪 | `pipelineTrace` | runtime object | 一轮对话的完整中间结果 | `debugInfo` |
| 流程步骤进度 | `pipelineStepProgress` | runtime object | 执行中步骤的输入、输出、状态和 transport | `loadingStep`, `traceDump` |
| 结构化输出回退 | `structuredOutputFallback` | runtime safety workflow | 仍使用结构化输出的生成/兼容模块返回截断或不可解析 JSON 时，记录原因并用本地候选结果继续流程；同步对话认知模块使用自然语言 narrative | `jsonCrash`, `silentRetry` |
| 认知模块调用 | `cognitiveModuleTrace` | runtime object | 一个脑区式模块的一次 LLM 调用记录 | `debugInfo` |
| 人物主脑回合 | `roleTurn` | pipeline module | 同步对话说话前唯一主脑 LLM 调用；在同一上下文里模拟人物心理、记忆浮现、开口倾向和最终台词 | `splitBrainReply`, `jsonDecisionRouter` |
| 人物主脑结果 | `roleTurnResult` | runtime object | `roleTurn` 的自然语言心理状态、记忆浮现、开口倾向和 `ReplyOutput` | `brainJson`, `replyPlan` |
| 消息渠道 | `conversationChannel` | domain field/UI state | 用户消息抵达虚拟人的现实媒介，例如微信、短信、电话、面对面、门外；必须进入主脑和记忆，不只是 UI 标签 | `chatMode`, `deliveryStyle` |
| 事件活动回合 | `eventActivity` | pipeline module | 非聊天现场/环境事件的 LLM 活动回合；输出人物心理、动作、位移、关系变化、记忆变化和可能的外显输出 | `eventJsonParser`, `timeRuleCard` |
| 事件活动结果 | `eventActivityResult` | runtime object | `eventActivity` 的自然语言活动段落，用于房间可折叠活动卡、短期记忆和持续活动派生 | `activityJson`, `eventLogText` |
| 当前活动快照 | `currentActivitySnapshot` | UI/domain output | 用户点击“查看现在”后生成的位置、移动状态和持续活动折叠卡 | `whereIsSheDebug`, `activityPeek` |
| 回复请求 | `expressionLlmRequest` | runtime object | 旧统一表达 helper 的自然语言上下文；当前同步主路径用 `roleTurn.request.prompt` 作为审计用表达输入 | `promptData` |
| 回复输出 | `replyOutput` | runtime object | `roleTurn` 的“说出口”段落或旧 Reply LLM 结果归一化后的角色台词和本地分段 | `aiResult` |
| 回复分段 | `replyOutput.segments` | runtime field | 从自然语言角色回复归一化出的多条聊天消息，用于 `multi_turn` 或 `burst` 展示；不是 Reply LLM JSON 契约 | `replyArrayContract`, `messageJson` |
| 统一表达模块 | `expressionModule` | pipeline module | 旧 helper：把前序自然语言评价、召回和决策综合成 Reply LLM prompt；当前同步主路径已由 `roleTurn` 取代 | `separatePromptStep`, `replyRouter` |
| 状态更新计划 | `stateUpdatePlan` | runtime object | State Update LLM 的自然语言写回判断落成的兼容写回壳 | `stateDeltaDraft` |
| 心理流帧 | `mindFlowFrame` | runtime object | 每轮对话中可 streaming 到中间栏的心理、场景、动作和余波片段；完成后折叠为可持久化记录 | `thoughtBubble`, `debugTyping` |
| 心理流消息 | `mindFlowChatMessage` | app state object | App Shell 用来 streaming 展示 `mindFlowFrame` 的中间栏消息，发言后折叠；非 transient 记录可进入历史 | `hiddenReasoningMessage`, `pipelineBubble` |
| 性格特性 | `personalityFacet` | domain object | 一个性格摘要背后的来源、张力和表达方式 | `traitDefinition` |
| 状态信号详情 | `runtimeSignalProfile` | domain object | 能量、情绪、情绪倾向、唤醒度显示值背后的自然语言考量 | `metricDetail` |
| 状态信号评估 | `runtimeSignalEvaluation` | local trace module | 根据 State Update 后的 runtime 本地派生能量、情绪、情绪倾向、唤醒度快照 | `derivedMoodUpdater` |
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
| 角色全局对话运行态 | `globalConversationState` | persistence workflow | 任意登录用户与角色对话后，按 `dossierId` 保存该角色共享的短期记忆、长期记忆、runtime、scene、location 和关系变化 | `userPrivateState`, `localPersonaState` |
| 用户私有消息历史 | `userConversationHistory` | persistence workflow | 登录用户与角色的中间栏消息历史，按 `userId + dossierId` 保存；默认“我的历史”只加载当前用户消息桶 | `localOnlyMessages` |
| 共享角色历史查看 | `sharedConversationHistoryAccess` | shared read workflow | 登录用户在当前角色下列出所有用户历史摘要，并只读查看任意用户与该角色的中间栏历史 | `globalAdminChat`, `impersonation` |
| 全局关系余波 | `globalRelationshipInfluencePropagation` | persistence workflow | 一个角色的对话会给全局运行态中与其有关系的其他角色写入压缩记忆和关系 note | `userOnlyFriendSync`, `privateSocialRipple` |
| 对话历史键 | `conversationHistoryKey` | UI state key | 前端中间栏消息历史的分桶键，由当前用户和当前档案组成 | `chatKey`, `globalMessagesKey` |
| 共享人物档案 | `sharedPersonaDossier` | persisted domain object | 管理员保存到后台、所有登录用户可读取和使用的多人档案 | `globalProfile`, `publicDossier` |
| 内置人物档案 | `builtinPersonaDossier` | seed domain object | 随服务启动提供的全局人物/场景/位置初始档案，可被管理员删除或覆盖 | `sampleProfile`, `demoDossier` |
| 对话审计记录 | `conversationAuditEntry` | persisted audit object | 记录每个登录用户的一次输入、虚拟人输出、失败信息和模块调用记录，仅管理员可读 | `chatLog`, `debugRecord` |
| 对话审计删除 | `conversationAuditDeletion` | admin action | 管理员删除单条或清空用户输入输出审计记录 | `logCleanup`, `chatPurge` |
| 对话审计导出 | `conversationAuditExport` | admin workflow | 管理员将所选用户输入输出记录或全部用户全部输入输出记录导出为 JSON 文件 | `logDownload`, `chatBackup` |
| 当前角色重置 | `activeDossierConversationReset` | admin workflow | 管理员清空当前档案对应的所有用户历史、角色全局运行态和审计记录，让角色回到共享档案底稿 | `deleteCharacter`, `resetApp` |
| 人物场景一致性 | `profileSceneConsistency` | cognitive module | 判断人物档案和场景是否处于同一世界观、时代和社会语境 | `settingMatch`, `sceneFit` |
| 扭曲时空密码 | `distortionPassword` | permission gate | 人物和场景硬冲突时允许继续应用的本地门禁短语 | `overrideCode`, `adminPassword` |
| 混合记忆召回 | `hybridMemoryRetrieval` | pipeline design | 记忆召回把短期上下文、过去 6 小时关系/状态/场景摘要、长期记忆和关系记忆候选整理成自然语言，让 LLM 判断什么自然浮现 | `keywordMemorySearch`, `sensitiveWordRecall` |
| 记忆召回叙述 | `memoryRecallNarrative` | cognitive module output | Memory Recall LLM 输出的自然语言召回判断，不输出候选 ID、分数、字段或 JSON | `memoryRecallFullDump`, `llmMemoryCopy` |
| 召回自然语言查询 | `naturalLanguageQuery` | runtime field | 将事件、评估、短期上下文、关系状态和长期候选合成的召回语义语境 | `keywordQuery`, `searchText` |
| 召回因子 | `memoryRecallFactor` | runtime object | 解释某条记忆为什么浮现的分项评分 | `matchReasonOnly`, `keywordScore` |
| 召回来源 | `memoryRecallSource` | runtime field | 标识召回来自同步响应路径还是未来异步生命路径 | `triggerType` |
| 生产手动更新 | `manualVpsUpdate` | deployment workflow | 管理员在站内触发 VPS 从 git 工作树拉取、安装、构建并重启 | `productionAutoDeploy`, `vpsSyncBot` |
| 应用更新状态 | `appUpdateStatus` | UI/API state | 左上角检查服务器当前提交与远端提交是否一致 | `deployStatus`, `versionPoll` |
| 应用更新变更摘要 | `appUpdateChangeSummary` | UI/API state | 左上角更新窗口展示远端待更新提交的数量、标题和正文摘要 | `releaseNotes`, `updateDiffText` |
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
| Cognitive Module Client | `src/pipeline/cognitiveModuleClient.ts` | 调用认知模块 LLM，记录 request/output/transport/fallbackReason；同步主路径由 `roleTurn` 和 State Update 使用 | `CognitiveModuleRequest`, `LlmConfig` | `CognitiveModuleTrace` | Role Turn/State Update/Generators/compat modules | 外部 LLM endpoint |
| Cognitive Module Fallback Verification | `scripts/verify-cognitive-module-fallback.mjs` | 伪造未闭合 SSE JSON，验证认知模块会 fallback 而不是抛错卡住 | 无 | pass/fail | npm script | TypeScript compiler |
| Severe State Continuity Verification | `scripts/verify-severe-state-continuity.mjs` | 伪造重大坏消息和后续普通邀约，验证自然语言 Appraisal/Decision/State Update 能承接余波且不会依赖本地强制路由 | 无 | pass/fail | npm script | Appraisal, State Updater, Response Decision, Expression Module |
| Temporal Scene And Reply Segments Verification | `scripts/verify-temporal-scene-and-reply-segments.mjs` | 验证真实时间场景推进不会瞬移，现场事件活动 LLM 能 streaming 并解析活动段落，紧急工作事件会派生并承接当前活动，后续会合对话和当前活动查看能替换旧活动，连续/爆发回复会归一化为多条消息 | 无 | pass/fail | npm script | Temporal Scene Progression, Event Activity, LLM Client |
| Update Button Clickable Verification | `scripts/verify-update-button-clickable.mjs` | 用 Playwright mock 有新版本状态，验证未登录时“更新服务器”按钮仍可点击并进入权限反馈路径 | 无 | pass/fail | npm script | App Shell |
| Role Turn | `src/pipeline/roleTurn.ts` | 同步对话主脑：一次 LLM 调用读取人物、场景、位置、消息渠道、最近对话、关系记忆、长期候选和用户原话，输出心理状态、记忆浮现、开口倾向和台词 | `EventInput`, `CharacterState`, `LlmConfig` | `CognitiveModuleTrace<RoleTurnResult>` | Conversation Pipeline | Cognitive Module Client, Memory Retrieval helpers, Conversation Channels |
| Conversation Channels | `src/core/conversationChannels.ts` | 定义可选消息渠道、渠道标签和写入主脑 prompt 的现实约束叙述 | `ConversationChannel`, `EventInput`, `CharacterState` | channel options / label / prompt narrative | App Shell, Conversation Pipeline | Core Types |
| Event Activity | `src/pipeline/eventActivity.ts` | 非聊天事件活动主脑：接收现场/环境事件和场景推进结果，让 LLM 输出心理活动、动作、位移、关系变化、记忆变化和外显输出，结果可派生持续活动 | `EventInput`, `CharacterState`, `TemporalSceneProgression`, `LlmConfig` | `CognitiveModuleTrace<EventActivityResult>` | App Shell room event trigger | Cognitive Module Client, Conversation Context, Memory Retrieval helpers, Conversation Channels |
| Appraisal | `src/pipeline/appraisal.ts` | 旧独立自然语言评估模块，当前同步主路径改由 `roleTurn` 派生 Appraisal 兼容视图；文件保留供实验和回滚 | `EventInput`, `CharacterState`, `LlmConfig` | `CognitiveModuleTrace<AppraisalResult>` | compat scripts/future experiments | Cognitive Module Client |
| Memory Retrieval | `src/pipeline/memoryRetrieval.ts` | 提供最近 6 小时短期上下文、长期记忆和关系记忆候选 helper；旧独立 Memory Recall LLM 保留供实验和回滚 | event, appraisal, state, llmConfig | `CognitiveModuleTrace<MemoryRecallResult>` or candidate lists | Role Turn/compat scripts | Cognitive Module Client |
| Response Decision | `src/pipeline/responseDecision.ts` | 旧独立自然语言回应决策模块，当前同步主路径改由 `roleTurn` 派生 Decision 兼容视图；文件保留供实验和回滚 | event, appraisal, recall, state, llmConfig | `CognitiveModuleTrace<ResponseDecision>` | compat scripts/future experiments | Cognitive Module Client |
| Temporal Scene Progression | `src/pipeline/temporalScene.ts` | 根据人物地理位置推断时区，用当地真实时间和未过期 `runtime.currentActivity` 推进 `scene/location`；同步聊天不再用用户话语关键词触发移动 | `CharacterState`, `EventInput`, now? | `TemporalSceneProgression`, next `CharacterState` | Conversation Pipeline/App Shell current activity check | Core Types |
| Conversation Context | `src/pipeline/conversationContext.ts` | 统一格式化最近 6 小时短期对话、过去 6 小时关系/状态/场景摘要和清理 Reply 台词，避免过期/跨用户消息被说成“刚才” | `CharacterState`, `EventInput`, `ShortTermMemory`, reply text | prompt-safe context lines, situation summary, sanitized reply text | Appraisal/Memory Retrieval/Decision/Expression Module/LLM Client | Core Types |
| Prompt Builder | `src/pipeline/promptBuilder.ts` | 旧统一表达 helper：把前序自然语言材料综合成 Reply LLM prompt；当前同步主路径已由 `roleTurn` 取代 | event, state, appraisal, recall, decision | `ExpressionLlmRequest` | LLM Client `runExpressionLlm` | Core Types |
| LLM Client | `src/pipeline/llmClient.ts` | 调用旧 Reply LLM 并提供回复清洗/分段 helper；当前同步主路径复用其分段函数处理 `roleTurn` 台词 | `ExpressionLlmRequest`, `LlmConfig` or reply text | `ReplyOutput` / segments | Role Turn/compat scripts | 外部 LLM endpoint |
| State Updater | `src/pipeline/stateUpdater.ts` | 通过 State Update LLM 输出自然语言状态写回判断，再落成兼容写回壳，写入短期记忆、长期记忆、关系记忆、`runtime.currentActivity` 和 runtime 展示信号 | state, event, replyOutput, context, llmConfig | next state, `StateDelta`, `stateUpdate` | Conversation Pipeline | Cognitive Module Client |
| Runtime Signal Evaluator | `src/pipeline/runtimeSignalEvaluator.ts` | 本地读取 State Update 已写入的 runtime 形成可审计展示信号快照，不再同步调用外部 LLM 覆盖状态 | state, event, replyOutput, stateUpdatePlan, llmConfig | `runtimeSignalEvaluation`, same runtime signals | Conversation Pipeline | State Updater |
| Mind Flow Messages | `src/chat/mindFlowMessages.ts` | 将 `MindFlowFrame` 转成中间栏消息，负责 streaming upsert、折叠和只过滤 transient 消息 | `MindFlowFrame`, `ChatMessage[]` | `ChatMessage[]` | App Shell, verification scripts | Core Types |
| Conversation Pipeline | `src/pipeline/conversationPipeline.ts` | 串联一轮同步响应路径，并在认知模块前接入时间场景推进、消息渠道和心流 streaming | content, channel, state, llmConfig | next state, trace + `mindFlow` | App Shell | pipeline steps, Temporal Scene Progression, Conversation Channels |
| Generators | `src/pipeline/generators.ts` | 通过 LLM 解读用户人物/场景素材，并确定性归一化为待应用预览 | 描述文本、当前状态、LLM 配置 | `CharacterState` | App Shell | Cognitive Module Client, Core Types |
| Profile Scene Consistency | `src/pipeline/profileSceneConsistency.ts` | 通过 LLM 判断人物档案和场景是否匹配，并返回是否需要扭曲时空密码 | `CharacterState`, `LlmConfig` | `ProfileSceneConsistencyResult` | App Shell | Cognitive Module Client |
| DeepSeek Local Proxy | `vite.config.ts` | 在本地开发服务器中代理 DeepSeek Chat Completions，固定 flash 模型、关闭 thinking 并保存根目录密钥文件 | `/api/deepseek-config`, `/api/deepseek-chat` | DeepSeek 响应或配置状态 | App Shell | DeepSeek API |
| Production Server | `server.mjs` | 生产环境服务 `dist/` 并提供 DeepSeek API 代理 | HTTP request, `.deepseek.local.json` | HTML/assets/API/SSE | nginx reverse proxy | DeepSeek API |
| Server Support | `serverSupport.mjs` | 认证会话、liao 登录代理、内置/共享档案合并、共享档案存储、DeepSeek 预览缓存写回、用户私有消息历史、共享角色历史读取、角色全局对话运行态、全局关系余波、对话审计和站内手动更新 | HTTP request, liao login response, local runtime JSON, builtin persona dossiers, git working tree | auth session, persona dossiers, history summaries/messages, audit entries, update status/SSE | Vite Dev Server/Production Server | liao Chatroom, local runtime files, Builtin Persona Dossiers, Git |
| Global Conversation State Verification | `scripts/verify-global-conversation-state.mjs` | 在临时运行目录验证用户 A 写入角色运行态后用户 B 和全局读取都能承接，同时中间栏消息仍按用户隔离 | 无 | pass/fail | npm script | Server Support |
| Conversation Message History Verification | `scripts/verify-conversation-message-history.mjs` | 在临时运行目录验证中间栏消息历史按用户和档案保存、读取和隔离 | 无 | pass/fail | npm script | Server Support |
| Admin History And Module Audit Verification | `scripts/verify-admin-history-and-module-audit.mjs` | 验证共享角色历史能按人物列出/读取多个用户消息，审计会保存模块调用记录，删除审计会级联清理历史和运行态记忆 | 无 | pass/fail | npm script | Server Support |
| Mind Flow Streaming Verification | `scripts/verify-mind-flow-streaming.mjs` | 验证说话前心理流 streaming、第一句后折叠、说话后余波继续并产生后续发言或收住沉默 | 无 | pass/fail | npm script | Conversation Pipeline, Mind Flow Messages |
| Audit Modal Scroll Verification | `scripts/verify-audit-modal-scroll.mjs` | 用真实 App Shell 样式构造大量审计记录，验证管理员审计浮层内部列表可滚动且不会被父级裁掉 | 无 | pass/fail | npm script | App Shell |
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
| `runConversationPipeline` | `src/pipeline/conversationPipeline.ts` | 运行完整对话 pipeline，并把当前登录用户作为事件说话者和渠道来源，可按 debug 开关运行旁路心理探针 | content, channel, state, llmConfig, speaker, debug? | nextState, trace | 写入状态 | implemented |
| `runCognitiveModule` | `src/pipeline/cognitiveModuleClient.ts` | 执行一个认知脑区式 LLM 模块；同步对话模块可读取自然语言 final，结构化兼容模块仍在解析失败时记录 fallbackReason | request, config, mockOutput | CognitiveModuleTrace | 可调用外部 endpoint | implemented |
| `runRoleTurn` | `src/pipeline/roleTurn.ts` | 调用同步对话人物主脑 LLM，让同一模型在同一上下文中模拟心理并产出台词 | event, state, llmConfig, onStream? | `CognitiveModuleTrace<RoleTurnResult>` | 可调用外部 endpoint | implemented |
| `runRoleTurnProbe` | `src/pipeline/roleTurn.ts` | 在主脑回复和状态写回完成后旁路审计主脑决策路径、标签锁定风险和上下文噪声 | event, state, roleTurn, llmConfig, onStream? | `CognitiveModuleTrace<RoleTurnProbeResult>` | 可调用外部 endpoint；不写状态 | implemented |
| `buildRoleTurnPrompt` | `src/pipeline/roleTurn.ts` | 将人物档案、场景、位置、runtime、消息渠道现实约束、最近对话、关系记忆、长期候选和用户原话合成主脑自然语言 prompt | event, state | string | 无 | implemented |
| `getConversationChannelLabel` | `src/core/conversationChannels.ts` | 将 `ConversationChannel` 转成人类可读渠道标签 | channel, fallback? | string | 无 | implemented |
| `describeConversationChannelForPrompt` | `src/core/conversationChannels.ts` | 根据消息渠道和角色当前场景生成物理在场约束，提醒主脑区分远程、门外、面对面和现场事件 | event, state | string | 无 | implemented |
| `buildRoleTurnProbePrompt` | `src/pipeline/roleTurn.ts` | 将主脑原始输入、主脑输出和本轮用户原话合成旁路审计 prompt | event, state, roleTurn | string | 无 | implemented |
| `buildFallbackRoleTurn` | `src/pipeline/roleTurn.ts` | 为主脑外部输出为空时提供可继续流程的本地自然语言候选 | event, state | `RoleTurnResult` | 无 | implemented |
| `buildFallbackRoleTurnProbe` | `src/pipeline/roleTurn.ts` | 为心理探针输出为空或不可用时提供可展示的本地审计占位 | event, state, roleTurn | `RoleTurnProbeResult` | 无 | implemented |
| `serializeRoleTurnFallback` | `src/pipeline/roleTurn.ts` | 将本地主脑候选序列化成四段自然语言文本，供 fallback streaming 展示 | fallback | string | 无 | implemented |
| `serializeRoleTurnProbeFallback` | `src/pipeline/roleTurn.ts` | 将本地心理探针候选序列化成五段自然语言文本 | fallback | string | 无 | implemented |
| `parseRoleTurnNarrative` | `src/pipeline/roleTurn.ts` | 从主脑四段自然语言输出中提取心理状态、记忆浮现、开口倾向和说出口台词 | text, fallback | `RoleTurnResult` | 无 | implemented |
| `parseRoleTurnProbeNarrative` | `src/pipeline/roleTurn.ts` | 从心理探针自然语言输出中提取决策路径、心理证据、标签锁定风险、上下文噪声和裁剪建议 | text, fallback | `RoleTurnProbeResult` | 无 | implemented |
| `buildAppraisalTraceFromRoleTurn` | `src/pipeline/roleTurn.ts` | 将 `roleTurn.innerStateNarrative` 派生为 Appraisal 兼容 trace | event, state, roleTurn | `CognitiveModuleTrace<AppraisalResult>` | 无 | implemented |
| `buildMemoryTraceFromRoleTurn` | `src/pipeline/roleTurn.ts` | 将 `roleTurn.memoryNarrative` 和本地候选上下文派生为 Memory Recall 兼容 trace | event, state, roleTurn | `CognitiveModuleTrace<MemoryRecallResult>` | 无 | implemented |
| `buildDecisionTraceFromRoleTurn` | `src/pipeline/roleTurn.ts` | 将 `roleTurn.decisionNarrative` 和最终台词派生为 Response Decision 兼容 trace | event, roleTurn | `CognitiveModuleTrace<ResponseDecision>` | 无 | implemented |
| `extractNaturalSections` | `src/pipeline/roleTurn.ts` | 从主脑自然语言段落标题中切出心理状态、记忆浮现、开口倾向和说出口段落 | text | section object | 无 | implemented |
| `extractProbeSections` | `src/pipeline/roleTurn.ts` | 从心理探针自然语言段落标题中切出五段审计内容 | text | section object | 无 | implemented |
| `formatRoleTurnProbeSource` | `src/pipeline/roleTurn.ts` | 将 `RoleTurnResult` 重新格式化为心理探针可读证据材料 | roleTurn | string | 无 | implemented |
| `extractLastQuotedReply` | `src/pipeline/roleTurn.ts` | 当主脑输出缺少段落标题时，从最后一段引号内容尝试恢复台词 | text | string | 无 | implemented |
| `normalizeSpokenReply` | `src/pipeline/roleTurn.ts` | 清理主脑“说出口”段落，把沉默标记转成空台词并剥离动作/说话人标签 | reply | string | 无 | implemented |
| `derivedRequest` | `src/pipeline/roleTurn.ts` | 为由 `roleTurn` 派生的 Appraisal/Memory/Decision trace 构造兼容 request | moduleName, roleTurn, description | `CognitiveModuleRequest`-like object | 无 | implemented |
| `inferReplyRhythm` | `src/pipeline/roleTurn.ts` | 从 `RoleTurnResult` 生成旧兼容回复节奏 | roleTurn | `ReplyRhythm` | 无 | implemented |
| `inferReplyRhythmFromText` | `src/pipeline/roleTurn.ts` | 根据主脑台词分行和开口倾向生成分段兼容节奏 | reply, decisionNarrative | `ReplyRhythm` | 无 | implemented |
| `inferResponseMode` | `src/pipeline/roleTurn.ts` | 将主脑自然语言倾向映射到旧 UI 兼容回应模式 | roleTurn, rhythm | `ResponseMode` | 无 | implemented |
| `estimateCompatibilityImpact` | `src/pipeline/roleTurn.ts` | 根据主脑自然语言热度和当前 runtime 生成旧兼容壳所需的影响强度 | state, roleTurn | number | 无 | implemented |
| `estimateNarrativeHeat` | `src/pipeline/roleTurn.ts` | 将主脑自然语言中的强余波线索映射成 UI/写回兼容热度，不作为台词语义主干 | roleTurn | number | 无 | implemented |
| `roundCompatibility` | `src/pipeline/roleTurn.ts` | 将派生兼容强度限制在 0~1 两位小数 | value | number | 无 | implemented |
| `runAppraisal` | `src/pipeline/appraisal.ts` | 通过 LLM 用自然语言做事件到角色状态评估，并落成兼容 `AppraisalResult` 壳 | event, state, llmConfig | CognitiveModuleTrace<AppraisalResult> | 可调用外部 endpoint | implemented |
| `appraisalFromNarrative` | `src/pipeline/appraisal.ts` | 将 Appraisal LLM 自然语言判断放入兼容字段，供 UI 和后续模块读取 narrative | narrative, fallback | AppraisalResult | 无 | implemented |
| `formatRuntimeSignalNarrative` | `src/pipeline/appraisal.ts`, `src/pipeline/responseDecision.ts` | 将运行时信号 profile 合成为认知模块可读的自然语言状态叙述 | state | string | 无 | implemented |
| `retrieveMemory` | `src/pipeline/memoryRetrieval.ts` | 通过 LLM 用自然语言判断短期上下文、过去 6 小时摘要、长期候选和关系记忆此刻如何浮现 | event, appraisalNarrative, state, llmConfig | CognitiveModuleTrace<MemoryRecallResult> | 可调用外部 endpoint | implemented |
| `createLongTermCandidates` | `src/pipeline/memoryRetrieval.ts` | 将长期记忆和关系记忆整理成自然语言召回候选，只供 LLM 阅读和 UI/审计展示 | state | LongTermMemory[] | 无 | implemented |
| `formatShortTermList` | `src/pipeline/memoryRetrieval.ts` | 将最近 6 小时最多 10 条短期对话格式化为 Memory Recall 可读清单 | state, event, memories | string | 无 | implemented |
| `formatLongTermCandidates` | `src/pipeline/memoryRetrieval.ts` | 将长期候选格式化为 Memory Recall 可读清单 | memories | string | 无 | implemented |
| `decideResponse` | `src/pipeline/responseDecision.ts` | 通过 LLM 根据事件、Appraisal narrative、Memory Recall narrative、最近对话和运行时信号输出自然语言回应判断 | event, appraisal, memoryRecallNarrative, state, llmConfig | CognitiveModuleTrace<ResponseDecision> | 可调用外部 endpoint | implemented |
| `decisionFromNarrative` | `src/pipeline/responseDecision.ts` | 将 Response Decision 自然语言判断放入兼容字段，供表达模块和 UI 读取 narrative | narrative | ResponseDecision | 无 | implemented |
| `selectRecentDialogueMemories` | `src/pipeline/conversationContext.ts` | 从短期记忆中选择同一说话者/本角色且位于短时间窗内的对话上下文 | state, event, limit? | ShortTermMemory[] | 无 | implemented |
| `formatRecentDialogueForPrompt` | `src/pipeline/conversationContext.ts` | 将近期短期记忆格式化为带时间感的 prompt 文本，不把过期消息说成“刚才” | state, event | string | 无 | implemented |
| `stripReplyStageDirections` | `src/pipeline/conversationContext.ts` | 从 Reply LLM 输出中剥离开头括号动作旁白和说话人标签，只保留角色说出口的话 | reply | string | 无 | implemented |
| `advanceSceneForCurrentTime` | `src/pipeline/temporalScene.ts` | 在一轮对话的 Appraisal 前按真实当地时间、人物生活节奏和未过期当前活动推进场景与位置；不再按用户话语关键词触发移动 | state, event, now? | nextState, `TemporalSceneProgression` | 写入运行态 scene/location，并清理过期 `currentActivity` | implemented |
| `deriveCurrentActivityFromEventActivity` | `src/pipeline/temporalScene.ts` | 将非聊天事件活动的心理、动作、位移和外显输出派生为持续活动状态 | state, event, activity, now? | `RuntimeCurrentActivity` | 无 | implemented |
| `deriveCurrentActivityFromStateUpdateNarrative` | `src/pipeline/temporalScene.ts` | 从 State Update 自然语言写回、角色台词和近期短期上下文中保守识别明确的新行动，用生活会合等当前活动替换过时持续活动 | state, event, replyOutput, narrative, now? | `RuntimeCurrentActivity?` | 无 | implemented |
| `formatCurrentActivitySnapshot` | `src/pipeline/temporalScene.ts` | 将当前场景、位置、移动状态和持续活动整理为中间栏可折叠活动卡内容 | state, progression | `{ content, details }` | 无 | implemented |
| `getActiveCurrentActivity` | `src/pipeline/temporalScene.ts` | 读取未过期且时间有效的当前持续活动，过期或非法时返回空 | state, now | `RuntimeCurrentActivity?` | 无 | implemented |
| `buildCurrentActivitySceneTarget` | `src/pipeline/temporalScene.ts` | 根据当前持续活动决定准备出门、通勤、工作、休息或现场处理目标场景 | state, archetype, localClock, activity, now | `SceneTarget` | 无 | implemented |
| `inferTimezone` | `src/pipeline/temporalScene.ts` | 根据人物位置、地址、背景和场景推断当前真实时间所用时区 | state | IANA timezone string | 无 | implemented |
| `chooseScheduledPhase` | `src/pipeline/temporalScene.ts` | 根据人物职业/生活类型和当地小时数判断睡眠、工作、通勤、住处或外出阶段 | archetype, hour | `TemporalSceneProgression.schedulePhase` | 无 | implemented |
| `generateNaturalPromptRequest` | `src/pipeline/promptBuilder.ts` | 统一表达模块内部 helper，生成只含自然语言的 Reply LLM 输入 | event, state, appraisalNarrative, memoryRecallNarrative, decisionNarrative, provider, model | ExpressionLlmRequest | 无 | implemented |
| `runExpressionLlm` | `src/pipeline/llmClient.ts` | 统一表达模块入口：内部组装自然语言 prompt 并调用 Reply LLM | input, config, onStream | `{ request, output }` | 可调用外部 endpoint | implemented |
| `runLlm` | `src/pipeline/llmClient.ts` | 调用 Reply LLM | request, config, simulateInput | ReplyOutput | 可调用外部 endpoint | implemented |
| `readReplyEventStream` | `src/pipeline/llmClient.ts` | 读取 Reply LLM 的 SSE 输出并累积为回复文本 | response, onStream | ReplyOutput-like object | 调用 onStream 更新 live trace | implemented |
| `normalizeReplyOutput` | `src/pipeline/llmClient.ts` | 将外部或模拟 Reply 输出归一化为 `reply` 和自然消息分段 | data, decision | ReplyOutput | 无 | implemented |
| `splitReplyIntoSegments` | `src/pipeline/llmClient.ts` | 按换行和标点把 `multi_turn`/`burst` 自然语言回复拆成多条聊天消息 | reply, rhythm, modelSegments? | string[] | 无 | implemented |
| `formatRoleTurnOutput` | `src/pipeline/conversationPipeline.ts` | 将主脑心理状态、记忆浮现、开口倾向和台词合成右侧 trace 展示文本 | roleTurn output | string | 无 | implemented |
| `buildFailedRoleTurnProbeTrace` | `src/pipeline/conversationPipeline.ts` | 心理探针失败时生成本地 trace，保证旁路审计失败不影响对话结果 | event, roleTurn, reason | `CognitiveModuleTrace<RoleTurnProbeResult>` | 无 | implemented |
| `buildNaturalLanguageSystemPrompt` | `server.mjs`, `vite.config.ts` | 为 DeepSeek 代理里的自然语言模块选择系统提示；`role_turn` 允许四段自然语言格式，`role_turn_probe` 只作旁路审计 | moduleName | string | 无 | implemented |
| `applyStateUpdates` | `src/pipeline/stateUpdater.ts` | 调用 State Update LLM 并写回状态 | state, event, replyOutput, context, llmConfig | nextState, StateDelta, stateUpdate | 写入记忆和状态 | implemented |
| `stateUpdatePlanFromNarrative` | `src/pipeline/stateUpdater.ts` | 将 State Update LLM 自然语言判断落成兼容写回壳，保留 narrative 作为语义主干 | narrative, fallback, event | StateUpdatePlan | 无 | implemented |
| `strengthenUserRelationshipMemoryForCurrentEvent` | `src/pipeline/stateUpdater.ts` | 把本轮实际事件、角色回复和上游自然语言判断合入当前用户关系记忆，避免旧印象覆盖新关系推进 | memory, event, replyOutput, context | StateUpdatePlan.userRelationshipMemory | 无 | implemented |
| `ensureMentionsCurrentEvent` | `src/pipeline/stateUpdater.ts` | 关系记忆摘要未提到本轮事件时，补入本轮事件前缀 | text, eventContent, prefix | string | 无 | implemented |
| `computeInteractionImpact` | `src/pipeline/stateUpdater.ts` | 汇总 Appraisal/Decision 的危险、触动、失态和突破外壳强度，用于长期记忆重要性和状态写回 | context | number | 无 | implemented |
| `evaluateRuntimeSignals` | `src/pipeline/runtimeSignalEvaluator.ts` | 本地生成 State Update 后的运行时信号快照，保留 trace 可观察性但不再同步调用外部 LLM | state, event, replyOutput, context, llmConfig | CognitiveModuleTrace<RuntimeSignalEvaluationResult> | 无外部调用 | implemented |
| `applyRuntimeSignalEvaluation` | `src/pipeline/runtimeSignalEvaluator.ts` | 将信号评估结果写回 runtime 并追加 trace 变化 | state, stateDelta, evaluation | nextState, StateDelta | 写入 runtime signals | implemented |
| `normalizeRuntimeSignalEvaluation` | `src/pipeline/runtimeSignalEvaluator.ts` | 将模型返回的信号评估结果归一化为稳定 UI 结构 | state, evaluation | RuntimeSignalEvaluationResult | 防止模型形状漂移导致 UI 崩溃 | implemented |
| `readEventStream` | `src/pipeline/cognitiveModuleClient.ts` | 读取认知模块 SSE 输出；自然语言模块返回 final 文本，结构化模块才解析 JSON | response, onStream | parsed module output | 调用 onStream 更新 live trace | implemented |
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
| `createRoomConversationHistoryKey` | `src/App.tsx` | 为当前角色房间时间线生成前端本地合并桶键 | dossierId | string | 无 | implemented |
| `createSharedConversationHistoryKey` | `src/App.tsx` | 为查看某个用户历史生成前端只读历史桶键 | historyKey | string | 无 | implemented |
| `createConversationSpeaker` | `src/App.tsx` | 将登录用户归一化为 pipeline 事件说话者身份 | user | `{ id, name }` | 无 | implemented |
| `readStoredConversationHistory` | `src/App.tsx` | 从 localStorage 读取指定历史桶 | historyKey | ChatMessage[]? | 读取 localStorage | implemented |
| `writeStoredConversationHistory` | `src/App.tsx` | 过滤临时心理流后，将指定历史桶截断写入 localStorage | historyKey, messages | void | 写入 localStorage | implemented |
| `createMindFlowChatMessage` | `src/chat/mindFlowMessages.ts` | 将一个 `MindFlowFrame` 转成中间栏临时系统消息 | frame | ChatMessage | 无 | implemented |
| `upsertMindFlowChatMessage` | `src/chat/mindFlowMessages.ts` | 将心理流帧插入或更新到当前消息列表，支持 streaming 过程中稳定刷新 | messages, frame | ChatMessage[] | 无 | implemented |
| `foldTransientMindFlowMessages` | `src/chat/mindFlowMessages.ts` | 按阶段折叠临时心理流消息；不传阶段时折叠全部心理流 | messages, phase? | ChatMessage[] | 无 | implemented |
| `filterPersistableConversationMessages` | `src/chat/mindFlowMessages.ts` | 过滤不应写入本地缓存和后台历史的 transient 消息；折叠后的 `mind_flow` 记录可以持久化 | messages | ChatMessage[] | 无 | implemented |
| `normalizeReplySegments` | `src/App.tsx` | 将 `ReplyOutput.segments` 归一化为中间栏可展示和可保存的多条消息内容 | replyOutput | string[] | 无 | implemented |
| `setMessagesForHistory` | `src/App.tsx` | 将消息更新写入指定 `conversationHistoryKey`，避免切任务或切用户串历史 | historyKey, updater | void | 更新 App state 和 localStorage | implemented |
| `loadConversationHistory` | `src/App.tsx` | 切换人物或登录后读取当前用户当前人物的后台中间栏历史，并在后台为空时回填本地缓存 | dossierId, historyKey, cachedMessages? | Promise<void> | 调用 `/api/persona-dossiers/:id/conversation-history` 并更新历史桶 | implemented |
| `loadConversationRoomHistory` | `src/App.tsx` | 读取当前角色房间时间线，合并展示所有用户与该角色的消息 | dossierId, historyKey, cachedMessages? | Promise<void> | 调用 `/api/conversation-histories?room=1` 并更新房间桶 | implemented |
| `loadSharedConversationHistorySummaries` | `src/App.tsx` | 登录用户读取当前人物下所有用户历史摘要 | dossierId | Promise<void> | 调用 `/api/conversation-histories` | implemented |
| `handleSelectSharedHistoryKey` | `src/App.tsx` | 登录用户选择某个用户历史后只读加载其当前人物消息；本地空缓存但摘要非空时会重新拉取 | historyKey, forceReload? | Promise<void> | 更新中间栏共享历史桶 | implemented |
| `persistConversationHistoryMessages` | `src/App.tsx` | 将本轮新增的用户消息、折叠心理流记录和角色回复追加保存到后台历史 | dossierId, messagesToSave | Promise<void> | 调用 `/api/persona-dossiers/:id/conversation-history` | implemented |
| `createRecordedMindFlowMessages` | `src/App.tsx` | 将本轮 `PipelineTrace.mindFlow` 按 pre/post 阶段整理成可持久化折叠聊天记录 | mindFlow frames | ChatMessage[] | 无 | implemented |
| `runEventActivity` | `src/pipeline/eventActivity.ts` | 运行非聊天事件活动 LLM，支持 streaming 和本地 fallback | event, state, progression, llmConfig, onStream? | `CognitiveModuleTrace<EventActivityResult>` | Cognitive Module Client | implemented |
| `formatEventActivityDetails` | `src/pipeline/eventActivity.ts` | 将事件活动结果整理为心理、动作、位移、关系、记忆和外显输出详情 | activity | string[] | 无 | implemented |
| `toggleMessageCollapsed` | `src/App.tsx` | 切换中间栏活动卡折叠/展开状态 | messageId | void | 更新当前显示历史桶 | implemented |
| `handleSend` | `src/App.tsx` | 对话发送主入口；私有桶持久化、房间桶展示，多人可见 | form event | Promise<void> | 运行 pipeline、保存历史、同步状态、记录审计 | implemented |
| `handleTriggerRoomEvent` | `src/App.tsx` | 非聊天现场事件触发入口，用文字构造 `room_event`/`scene_event`，校准当前现场后运行事件活动 LLM、派生当前持续活动并生成房间活动卡 | form event | Promise<void> | streaming 更新 `event_activity`、写短期记忆、`runtime.currentActivity`、房间历史和角色全局运行态 | implemented |
| `handleCheckCurrentActivity` | `src/App.tsx` | 触发事件旁的当前活动查看入口，推进真实时间并生成位置、移动状态和持续活动快照 | 无 | Promise<void> | 写入可折叠 `event_activity` 快照、同步全局运行态和房间历史 | implemented |
| `handleLegacyTraceToggle` | `src/App.tsx` | 切换右侧旧兼容管线显示状态，默认关闭评估/记忆/决策/表达/信号等派生视图 | checkbox change | void | 写 localStorage 并调整 activeStep | implemented |
| `buildConversationModuleCalls` | `src/App.tsx` | 将 `PipelineTrace` 转成可持久化的模块调用记录列表，可按开关过滤旧兼容视图 | trace, includeLegacyTrace | ConversationModuleCall[] | 无 | implemented |
| `syncConversationState` | `src/App.tsx` | 一轮对话完成后把角色最新状态写回全局对话运行态 | nextState, interaction | Promise<void> | 调用 `/api/persona-dossiers/:id/conversation-state` 并更新已叠加全局运行态的档案列表 | implemented |
| `formatGlobalSceneStatus` | `src/App.tsx` | 将当前角色全局场景、位置、移动状态和 runtime 心情摘要格式化给中间栏场景条 | state | string | 中间栏 scene strip | implemented |
| `formatActiveContextTags` | `src/App.tsx` | 将当前活动或注意力焦点整理成中间栏顶部短标签，避免把长期关切直接当作当前上下文展示 | state | string[] | 中间栏 active context chips | implemented |
| `compactContextTag` | `src/App.tsx` | 将当前上下文标签压缩成适合顶部小标签的短文本 | value | string | 无 | implemented |
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
| `exportConversationAuditEntries` | `src/App.tsx` | 管理员导出所选或全部用户输入输出记录 | scope | Promise<void> | 调用 `/api/conversation-audits/export` 并下载 JSON 文件 | implemented |
| `resetActiveDossierConversation` | `src/App.tsx` | 管理员重置当前角色的历史、运行态和对应审计，并同步清理当前消息桶与浏览器缓存 | 无 | Promise<void> | 调用 `/api/persona-dossiers/:id/reset-conversation` | implemented |
| `syncConversationHistoriesAfterAuditDeletion` | `src/App.tsx` | 审计删除后过滤前端内存消息桶和 localStorage 中同轮消息，防止旧缓存回填 | conversationAuditEntry | void | 更新 App state 和 localStorage | implemented |
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
| `readPersonaDossiers` | `serverSupport.mjs` | 读取后台共享多人档案，并叠加按 `dossierId` 保存的角色全局对话运行态 | user? | PersonaDossier[] | 读取 `.persona-dossiers.local.json` 和 `.conversation-states.local.json` | implemented |
| `upsertPersonaDossier` | `serverSupport.mjs` | 管理员新增或覆盖共享多人档案 | dossier, user | PersonaDossier | 写入 `.persona-dossiers.local.json` | implemented |
| `deletePersonaDossier` | `serverSupport.mjs` | 管理员删除共享多人档案 | dossierId | deleted flag | 写入 `.persona-dossiers.local.json` | implemented |
| `updatePersonaDossierPreview` | `serverSupport.mjs` | 登录用户提交 DeepSeek 生成的人物短预览并全局保存 | dossierId, previewSummary, user | dossier or error | 写入 `.persona-dossiers.local.json` | implemented |
| `updatePersonaDossierConversationState` | `serverSupport.mjs` | 登录用户对话后写回当前角色的全局运行态，并触发全局角色网络中的关系余波 | dossierId, nextState, interaction, user | dossier/dossiers or error | 写入 `.conversation-states.local.json` | implemented |
| `readConversationHistoryMessages` | `serverSupport.mjs` | 读取当前用户在指定人物上的中间栏消息历史 | dossierId, user | ChatMessage-like[] | 读取 `.conversation-histories.local.json` | implemented |
| `appendConversationHistoryMessages` | `serverSupport.mjs` | 追加保存当前用户在指定人物上的中间栏消息历史 | dossierId, messages, user | messages or error | 写入 `.conversation-histories.local.json` | implemented |
| `sanitizeConversationHistoryMessages` | `serverSupport.mjs` | 限制服务端保存的历史消息字段、长度和 speaker 枚举 | messages | message[] | 无 | implemented |
| `applyGlobalConversationStates` | `serverSupport.mjs` | 将角色全局运行态叠加到共享档案列表上，并兼容合并旧版用户私有运行态条目 | dossiers | PersonaDossier[] | 读取 `.conversation-states.local.json` | implemented |
| `writeGlobalConversationStates` | `serverSupport.mjs` | 保存被修改角色的全局运行态条目，并清理同一角色的旧版用户私有运行态覆盖层 | changedDossiers, user | void | 写入 `.conversation-states.local.json` | implemented |
| `buildGlobalConversationStateEntries` | `serverSupport.mjs` | 从 `.conversation-states.local.json` 建立按 `dossierId` 索引的全局运行态条目，优先使用新版全局条目 | entries, dossiers | Map | 兼容旧版用户私有运行态 | implemented |
| `mergeLegacyConversationStateEntries` | `serverSupport.mjs` | 将同一角色的旧版用户私有运行态合并为一个全局运行态读取结果 | dossier, entries | conversation state entry | 迁移兼容 | implemented |
| `createGlobalConversationStateEntryKey` | `serverSupport.mjs` | 为角色全局运行态生成稳定键 `global::dossier:<id>` | dossierId | string | `.conversation-states.local.json` | implemented |
| `propagateRelationshipInfluence` | `serverSupport.mjs` | 将一个角色的压缩互动余波写入全局运行态中与其有关系的其他角色 | dossiers, sourceIndex, interaction, user, now | PersonaDossier[] | 更新相关角色长期记忆和 relationship notes | implemented |
| `appendConversationAudit` | `serverSupport.mjs` | 记录登录用户的一次输入输出 | entry, user | ConversationAuditEntry | 写入 `.conversation-audits.local.json` | implemented |
| `readConversationAudits` | `serverSupport.mjs` | 管理员读取最近用户输入输出 | limit | ConversationAuditEntry[] | 读取 `.conversation-audits.local.json` | implemented |
| `exportConversationAudits` | `serverSupport.mjs` | 管理员导出所选或全部用户输入输出记录 | ids? | conversationAuditExport payload | 读取 `.conversation-audits.local.json` | implemented |
| `readConversationHistorySummaries` | `serverSupport.mjs` | 登录用户按人物只读读取所有用户历史摘要 | dossierId | ConversationHistorySummary[] | 读取 `.conversation-histories.local.json` | implemented |
| `readConversationHistoryMessagesByKey` | `serverSupport.mjs` | 登录用户按内部历史 key 只读读取某用户某人物消息 | dossierId, key | ChatMessage[] | 读取 `.conversation-histories.local.json` | implemented |
| `readConversationRoomMessages` | `serverSupport.mjs` | 登录用户读取某人物的房间时间线，合并同一 `dossierId` 下所有用户私有历史 | dossierId | ChatMessage[] | 读取 `.conversation-histories.local.json` | implemented |
| `deleteConversationArtifactsForAudit` | `serverSupport.mjs` | 删除审计记录对应的中间栏历史、短期记忆、长期记忆和关系记忆片段 | conversationAuditEntry | auditArtifactDeletionResult | 写 `.conversation-histories.local.json` 和 `.conversation-states.local.json` | implemented |
| `deleteConversationAudit` | `serverSupport.mjs` | 管理员删除单条用户输入输出审计记录并级联清理同轮历史/记忆 | auditId | deleted flag + artifact cleanup summary | 写 runtime JSON | implemented |
| `clearConversationAudits` | `serverSupport.mjs` | 管理员清空用户输入输出审计记录并级联清理关联历史/记忆 | 无 | deleted flag + artifact cleanup summary | 写 runtime JSON | implemented |
| `resetPersonaDossierConversationArtifacts` | `serverSupport.mjs` | 管理员按档案清理所有用户历史、角色全局运行态和对应审计记录，并返回共享档案底稿 | dossierId | dossier/dossiers + reset summary | 写 `.conversation-histories.local.json`、`.conversation-states.local.json` 和 `.conversation-audits.local.json` | implemented |
| `readAppUpdateStatus` | `serverSupport.mjs` | 检查本机 git 工作树当前提交和远端分支提交是否一致，并读取待更新提交摘要 | 无 | appUpdateStatus | 调用 git 命令读取本机、远端状态和提交说明 | implemented |
| `readPendingUpdateChanges` | `serverSupport.mjs` | 读取服务器当前提交到远端提交之间的提交数量、标题和正文摘要 | workdir, branch, currentCommit, remoteCommit | appUpdateChangeSummary | 调用 git fetch/rev-list/log | implemented |
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
| `longTermMemory[].sourceEventId` | `LongTermMemory` | `string?` | 长期记忆对应的一轮对话事件 ID，用于删除审计时清理同轮记忆 | stateUpdater | Server Support audit deletion | implemented |
| `relationshipMemory` | `CharacterState` | `RelationshipMemory[]` | 长期记忆中的关系记忆区，按当前用户保存自然语言印象、关系总结、证据和最近互动 | seed/builtin/stateUpdater | memoryRetrieval/promptBuilder/right panel | implemented |
| `relationshipMemory[].impressionSummary` | `RelationshipMemory` | `string` | 人物对该用户的自然语言印象，不使用数值评分 | stateUpdater | promptBuilder/right panel | implemented |
| `relationshipMemory[].relationshipSummary` | `RelationshipMemory` | `string` | 人物与该用户当前关系的自然语言总结，不使用数值评分 | stateUpdater | promptBuilder/right panel | implemented |
| `relationshipMemory[].history[].sourceEventId` | `RelationshipMemory.history` | `string?` | 关系记忆历史片段对应的一轮对话事件 ID，用于删除审计时清理同轮关系余波 | stateUpdater | Server Support audit deletion | implemented |
| `runtime.derivedMood` | `RuntimeState` | object | 由状态信号评估模块产出的当前心情摘要 | seed/runtimeSignalEvaluator | UI/promptBuilder | implemented |
| `runtime.signalProfiles` | `RuntimeState` | `Record<RuntimeSignalKey, RuntimeSignalProfile>` | UI 简化指标背后的自然语言考量，供统一表达模块组织上下文 | seed/generator/stateUpdater | promptBuilder/UI | implemented |
| `runtime.signalProfiles.*.cognitiveNarrative` | `RuntimeSignalProfile` | `string` | 状态信号背后的内在状态叙述，只描述属性和成因，不写回复指令 | seed/generator/stateUpdater | promptBuilder/UI | implemented |
| `scene` | `CharacterState` | `SceneState` | 当前场景 | seed/generator | UI/promptBuilder | implemented |
| `scene.cognitiveNarrative` | `SceneState` | `string` | 场景如何改变注意力、身体感和关系距离的自然语言叙述 | seed/generator | promptBuilder/UI | implemented |
| `location` | `CharacterState` | `CharacterLocation?` | 角色当前物理位置、速度、方向和地图上下文 | seed/builtin/manual/temporalSceneProgression | UI/promptBuilder | implemented |
| `location.label` | `CharacterLocation` | `string` | 人可读当前位置名称 | seed/builtin/manual | UI/promptBuilder | implemented |
| `location.address` | `CharacterLocation` | `string` | 当前位置地址或范围描述 | seed/builtin/manual | UI/promptBuilder | implemented |
| `location.region` | `CharacterLocation` | `string` | 位置所属城市/区县/世界区域 | seed/builtin/manual | UI/promptBuilder | implemented |
| `location.coordinate` | `CharacterLocation` | `{ lng: number; lat: number }?` | 经纬度坐标；当前仅作为种子/人工字段，未来可由国内地图服务解析 | seed/builtin/manual/mapService | UI/future map panel | implemented |
| `location.speedKmh` | `CharacterLocation` | `number` | 角色移动速度，单位 km/h | seed/builtin/manual | UI/promptBuilder | implemented |
| `location.headingDeg` | `CharacterLocation` | `number` | 角色移动方向角度 | seed/builtin/manual | UI/promptBuilder | implemented |
| `location.headingLabel` | `CharacterLocation` | `string` | 角色移动方向中文摘要 | seed/builtin/manual | UI/promptBuilder | implemented |
| `location.motionState` | `CharacterLocation` | enum | 停留、步行、骑行、驾车或未知 | seed/builtin/manual | UI/promptBuilder | implemented |
| `location.mapContext` | `CharacterLocation` | object? | 周边道路、地点、建筑和环境摘要 | seed/builtin/manual/mapService/temporalSceneProgression | UI/promptBuilder | implemented |
| `temporalSceneProgression` | `PipelineTrace` | `TemporalSceneProgression` | 本轮对话开始时场景/位置按真实当地时间和触发事件推进的记录 | conversationPipeline | Pipeline Debug Panel/Appraisal input | implemented |
| `temporalSceneProgression.schedulePhase` | `TemporalSceneProgression` | enum | 本轮生活阶段：睡眠、住处、工作、通勤、外出或 blocked | temporalScene | Pipeline Debug Panel | implemented |
| `temporalSceneProgression.locationPlausibility` | `TemporalSceneProgression` | `string` | 说明新场景为什么仍符合人物原地理范围，或为什么拒绝远距离瞬移 | temporalScene | Pipeline Debug Panel | implemented |
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
| `pipelineTrace.sceneContext` | `PipelineTrace` | `TemporalSceneProgression` | Event 后、Appraisal 前的时空场景推进结果 | temporalSceneProgression | Pipeline Debug Panel/audit | implemented |
| `pipelineTrace.mindFlow` | `PipelineTrace` | `MindFlowFrame[]` | 本轮说话前和说话后的心理、场景、动作和余波 streaming 帧集合 | conversationPipeline | App Shell chat history/Pipeline Debug Panel | implemented |
| `pipelineTrace.roleTurn` | `PipelineTrace` | `CognitiveModuleTrace<RoleTurnResult>` | 同步对话主脑 LLM 调用记录；Appraisal/Memory/Decision 兼容视图由它派生 | roleTurn | Pipeline Debug Panel/audit | implemented |
| `pipelineTrace.roleTurnProbe` | `PipelineTrace` | `CognitiveModuleTrace<RoleTurnProbeResult>?` | 默认关闭的旁路心理探针 trace；开启后只审计主脑决策路径、标签锁定风险和上下文噪声 | roleTurnProbe | Pipeline Debug Panel/audit | implemented |
| `roleTurnResult.innerStateNarrative` | `RoleTurnResult` | `string` | 主脑输出的心理状态段落：身体感、情绪、关系距离和控制感 | roleTurn | mindFlow/Appraisal view/State Update | implemented |
| `roleTurnResult.memoryNarrative` | `RoleTurnResult` | `string` | 主脑输出的记忆浮现段落：最近对话、关系余波或长期记忆如何在此刻浮上来 | roleTurn | mindFlow/Memory view/State Update | implemented |
| `roleTurnResult.decisionNarrative` | `RoleTurnResult` | `string` | 主脑输出的开口倾向段落：沉默、短答、追问、连续补充、转移、拒绝或失态的自然语言理由 | roleTurn | mindFlow/Decision view/State Update | implemented |
| `roleTurnResult.replyOutput` | `RoleTurnResult` | `ReplyOutput` | 主脑“说出口”段落归一化后的聊天台词和分段 | roleTurn | App Shell/history/State Update/audit | implemented |
| `roleTurnProbeResult.decisionPath` | `RoleTurnProbeResult` | `string` | 旁路审计说明主脑从身体状态、关系距离、记忆余波到开口选择的路径 | roleTurnProbe | Pipeline Debug Panel/audit | implemented |
| `roleTurnProbeResult.psychologicalEvidence` | `RoleTurnProbeResult` | `string` | 旁路审计区分真正影响回复的证据和只出现在 prompt 中的材料 | roleTurnProbe | Pipeline Debug Panel/audit | implemented |
| `roleTurnProbeResult.labelLockRisk` | `RoleTurnProbeResult` | `string` | 旁路审计说明人物稳定标签是否可能把表达锁成固定反应 | roleTurnProbe | Pipeline Debug Panel/audit | implemented |
| `roleTurnProbeResult.contextNoise` | `RoleTurnProbeResult` | `string` | 旁路审计说明重复内容、旧模块术语或过量候选是否污染上下文 | roleTurnProbe | Pipeline Debug Panel/audit | implemented |
| `roleTurnProbeResult.suggestedTrim` | `RoleTurnProbeResult` | `string` | 旁路审计给开发者的 prompt/context 裁剪建议，不给角色下一轮话术 | roleTurnProbe | Pipeline Debug Panel/audit | implemented |
| `mindFlowFrame.phase` | `MindFlowFrame` | `pre_speech/post_speech` | 区分发言前心理变化和发言后余波 | conversationPipeline | App Shell folding logic | implemented |
| `mindFlowFrame.kind` | `MindFlowFrame` | enum | 标识心理流内容类型：场景、内部状态、记忆、关系、动作、继续发言或收住 | conversationPipeline | App Shell display/verification | implemented |
| `formatRecentSituationSummaryForPrompt` | function | string | 生成过去 6 小时关系、状态和场景的自然语言摘要，供 Appraisal、Memory Recall、Decision 和表达模块共用 | conversationContext | cognitive modules/expression module | implemented |
| `runExpressionLlm` | function | `{ request, output }` | 统一表达模块：内部组装自然语言 Reply Prompt 并调用 Reply LLM，不作为独立 Prompt Builder 决策环节 | llmClient | conversationPipeline | implemented |
| `prompt` | `ExpressionLlmRequest` | `string` | 交给 Reply LLM 的自然语言上下文 | expressionModule | llmClient/UI | implemented |
| `outputContract` | `CognitiveModuleRequest` | `string` | 认知模块输出说明；同步对话认知模块使用自然语言说明，不要求 JSON 契约 | cognitive modules | cognitiveModuleClient/backend | implemented |
| `appraisal.narrative` | `AppraisalResult` | `string?` | Appraisal LLM 输出的自然语言事件评估，作为下游语义主干 | appraisal | Pipeline Debug Panel/downstream cognitive context | implemented |
| `appraisal.dangerState` | `AppraisalResult` | object | 判断角色是否处于心理、关系、现实处境、身份或边界暴露危险，并给出 0~1 强度、来源和理由 | appraisal | Response Decision/Pipeline Debug Panel | implemented |
| `appraisal.awarenessState` | `AppraisalResult` | object | 判断角色是否清醒以及还能否控制判断和表达，包含 `isClearHeaded`、`controlLevel` 和理由 | appraisal | Response Decision/Pipeline Debug Panel | implemented |
| `appraisal.responseNeed` | `AppraisalResult` | object | 判断当前事件是否需要角色回应及原因 | appraisal | Response Decision/Pipeline Debug Panel | implemented |
| `appraisal.replyRhythm` | `AppraisalResult` | `ReplyRhythm` | 兼容字段：初步回复节奏壳；同步语义以 `appraisal.narrative` 为主 | appraisal | Response Decision/Pipeline Debug Panel | implemented |
| `appraisal.emotionalImpact` | `AppraisalResult` | object | 判断对当事人的触动强度、击中的核心内容和原因 | appraisal | Response Decision/State Update | implemented |
| `appraisal.composureRisk` | `AppraisalResult` | object | 兼容字段：角色是否会失态、失态强度和原因 | appraisal | Response Decision/Pipeline Debug Panel | implemented |
| `appraisal.personaBreakRisk` | `AppraisalResult` | object | 兼容字段：是否短暂突破平常人设外壳进入失控式反应、强度和原因 | appraisal | Response Decision/Pipeline Debug Panel | implemented |
| `replyRhythm` | Core Types | `ReplyRhythm` | 回复节奏兼容枚举：`none` 不回应、`single` 单条回应、`multi_turn` 连续多条、`burst` 短句爆发；显式换行和模型分段优先 | Appraisal/Response Decision | Expression Module/Reply LLM context | implemented |
| `replyOutput.segments` | `ReplyOutput` | `string[]?` | Reply LLM 自然语言结果的本地分段；App Shell 用它生成多条角色消息 | llmClient | App Shell/State Updater | implemented |
| `memoryRecall.narrative` | `MemoryRecallResult` | `string?` | Memory Recall LLM 输出的自然语言召回判断，说明短期、关系/状态/场景摘要和长期记忆如何浮现 | memoryRetrieval | Pipeline Debug Panel/downstream cognitive context | implemented |
| `responseDecision.narrative` | `ResponseDecision` | `string?` | Response Decision LLM 输出的自然语言回应判断，作为表达模块的语义主干 | responseDecision | Pipeline Debug Panel/downstream cognitive context | implemented |
| `responseDecision.replyRhythm` | `ResponseDecision` | `ReplyRhythm` | 兼容字段：回复节奏壳；同步语义以 `responseDecision.narrative` 为主，显式换行和模型分段优先 | responseDecision | Expression Module/LLM Client | implemented |
| `responseDecision.shouldLoseComposure` | `ResponseDecision` | `boolean` | 兼容字段：本轮是否应表现为失态 | responseDecision | Expression Module/LLM Client | implemented |
| `responseDecision.shouldBreakPersona` | `ResponseDecision` | `boolean` | 兼容字段：本轮是否应短暂突破平常人设外壳进入失控式回应 | responseDecision | Expression Module/LLM Client | implemented |
| `stateUpdate.narrative` | `StateUpdatePlan` | `string?` | State Update LLM 输出的自然语言状态写回判断，用于关系记忆和长期记忆候选写入 | stateUpdater | Pipeline Debug Panel/downstream cognitive context | implemented |
| `runtimeSignalEvaluation.narrative` | `RuntimeSignalEvaluationResult` | `string?` | 本地运行时信号快照的可选自然语言叙事说明 | runtimeSignalEvaluator | Pipeline Debug Panel/downstream cognitive context | implemented |
| `memoryRecall.source` | `MemoryRecallResult` | `MemoryRecallSource` | 说明本次召回来自同步响应路径或未来异步生命路径 | memoryRetrieval | Decision/Expression Module/Pipeline Debug Panel | implemented |
| `memoryRecall.retrievalMode` | `MemoryRecallResult` | `"hybrid_relevance"` | 标识当前使用混合相关度召回，不是敏感词召回 | memoryRetrieval | Pipeline Debug Panel | implemented |
| `memoryRecall.naturalLanguageQuery` | `MemoryRecallResult` | `string` | 召回时放入自然语言候选清单的语义查询 | memoryRetrieval | Pipeline Debug Panel | implemented |
| `memoryRecall.longTermMemories[].factors` | `MemoryRecallResult` | `MemoryRecallFactor[]` | 兼容旧 UI 的可选分项原因；自然语言候选策略下通常为空数组 | memoryRetrieval | Pipeline Debug Panel/Decision/Expression Module | implemented |
| `stateUpdate.userRelationshipMemory` | `StateUpdatePlan` | object | State Update LLM 为当前说话用户生成的自然语言印象和关系总结 | stateUpdater | relationshipMemory writeback | implemented |
| `stateUpdate` | `PipelineTrace` | `CognitiveModuleTrace<StateUpdatePlan>` | State Update LLM 的完整调用记录 | stateUpdater | Pipeline Debug Panel | implemented |
| `runtimeSignalEvaluation` | `PipelineTrace` | `CognitiveModuleTrace<RuntimeSignalEvaluationResult>` | State Update 后本地运行时信号快照的完整 trace 记录 | runtimeSignalEvaluator | Pipeline Debug Panel | implemented |
| `pipelineStepProgress` | App state | `PipelineStepProgress` | 执行中某一步的输入、输出、状态和 transport，用于 live trace | conversationPipeline | App Shell | implemented |
| `eventInput.channel` | `EventInput` | `ConversationChannel?` | 本轮用户消息或现场事件的现实渠道 | App Shell / Conversation Pipeline | Role Turn/Event Activity/State Update/audit | implemented |
| `eventInput.channelLabel` | `EventInput` | `string?` | 渠道人类可读标签，例如“微信”“面对面”“现场事件” | App Shell / Conversation Channels | UI/Role Turn/shortTermMemory/audit | implemented |
| `conversationChannelOptions` | `src/core/conversationChannels.ts` | option[] | App Shell 渠道选择器候选，不包含内部 `scene_event` | Conversation Channels | App Shell composer | implemented |
| `pipelineStepProgress.mindFlow` | `PipelineStepProgress` | `MindFlowFrame?` | 当前进度附带的真实心理流 streaming 帧；折叠后可进入历史 | conversationPipeline | App Shell chat/history | implemented |
| `pipelineStepProgress.replyOutput` | `PipelineStepProgress` | `ReplyOutput?` | Reply LLM 完成时附带完整回复结果，让 App Shell 能先显示第一句再继续跑后置心理流 | conversationPipeline | App Shell live first reply | implemented |
| `chatMessage.messageType` | `ChatMessage` | `"normal" / "mind_flow" / "event_activity"?` | 标识中间栏消息是否为普通消息、心理流或事件活动 | App Shell/Mind Flow Messages | message list rendering/persistence filter | implemented |
| `chatMessage.channel` | `ChatMessage` | `ConversationChannel?` | 中间栏消息的现实渠道，服务端 sanitizer 会保留 | App Shell/serverSupport | message history/room timeline | implemented |
| `chatMessage.channelLabel` | `ChatMessage` | `string?` | 中间栏消息的渠道展示标签，服务端 sanitizer 会保留 | App Shell/serverSupport | message display/history | implemented |
| `chatMessage.collapsed` | `ChatMessage` | `boolean?` | 心理流或事件活动卡是否折叠 | App Shell | message list rendering | implemented |
| `chatMessage.details` | `ChatMessage` | `string[]?` | 折叠活动卡展开后展示的心理、动作、位移、关系或余波细节 | App Shell | message list rendering / event activity persistence | implemented |
| `chatMessage.transient` | `ChatMessage` | `boolean?` | 标识消息只用于当前轮展示，不应持久化 | Mind Flow Messages | localStorage/backend history filter | implemented |
| `chatMessage.mindFlow` | `ChatMessage` | object? | 保存心理流消息对应的帧 ID、阶段、类型和状态 | Mind Flow Messages | folding/upsert logic | implemented |
| `TraceDisplayProgress` | App Shell type | `Omit<PipelineStepProgress, "output"> & { output?: unknown }` | 右侧流程追踪面板的本地展示态，允许完成态 trace 保留带 `narrative` 的原始输出对象 | App Shell | Pipeline Debug Panel | implemented |
| `cognitiveModuleTrace.fallbackReason` | `CognitiveModuleTrace` | `string?` | 外部结构化输出无法解析时的回退原因，右侧流程追踪会展示 | cognitiveModuleClient | Pipeline Debug Panel | implemented |
| `generationMonitorStep` | Core type | `GenerationMonitorStep` | 右侧生成监视可选步骤：`dossierSummaryGeneration`、`dossierGeneration`、`sceneGeneration` | App Shell/generators | live trace UI | implemented |
| `role_turn_probe` | `CognitiveModuleName` | string literal | 旁路心理探针模块名；只审计已完成的 `role_turn`，不影响回复和状态 | App Shell `/api/deepseek-chat` | DeepSeek proxy | implemented |
| `event_activity` | `CognitiveModuleName` | string literal | 非聊天事件活动模块名；生成活动卡段落，不强制生成聊天台词 | App Shell `/api/deepseek-chat` | DeepSeek proxy / event activity | implemented |
| `dossier_summary_generation` | `CognitiveModuleName` | string literal | 人物短预览自然语言生成模块名，只写 `personaDossier.previewSummary` | App Shell `/api/deepseek-chat` | DeepSeek proxy | implemented |
| `liveTrace` | App state | `TraceDisplayState` | 同时保存对话流程和生成监视的实时输入、输出、状态 | conversation pipeline/generators/preview cache | right panel | implemented |
| `deepseekConnected` | App state | `boolean` | 顶部显示 DeepSeek 是否已有本地密钥并可作为真实 LLM 入口 | `/api/deepseek-config` / 测试连接 | App Shell | implemented |
| `deepseekStatus` | App state | `string` | DeepSeek 密钥保存和真实连接测试的人类可读状态 | `/api/deepseek-config` / `/api/deepseek-chat` | App Shell | implemented |
| `roleTurnProbeEnabled` | App state | `boolean` | 右侧 DeepSeek 设置中的心理探针开关；默认关闭，开启后传入 `debug.roleTurnProbeEnabled` | localStorage | App Shell / Conversation Pipeline | implemented |
| `roleTurnProbeStorageKey` | App constant | `string` | 心理探针开关的浏览器本地持久化键 | App Shell | localStorage | implemented |
| `legacyTraceVisible` | App state | `boolean` | 右侧 DeepSeek 设置中的旧兼容管线显示开关；默认关闭，打开后显示评估/记忆/决策/表达/信号等兼容视图 | localStorage | App Shell trace/audit module calls | implemented |
| `legacyTraceStorageKey` | App constant | `string` | 旧兼容管线显示开关的浏览器本地持久化键 | App Shell | localStorage | implemented |
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
| `roomConversationHistoryKey` | App derived state | `string` | 当前角色房间时间线本地桶键，由 `activeDossierId` 组成 | App Shell | room timeline | implemented |
| `eventTextInput` | App state | `string` | 非聊天现场事件文字输入，例如“杯子掉了” | App Shell | room event trigger | implemented |
| `conversationChannel` | App state | `ConversationChannel` | 当前发送消息使用的渠道选择 | App Shell | handleSend/runConversationPipeline | implemented |
| `isTriggeringEvent` | App state | `boolean` | 现场事件触发中的 UI 状态 | App Shell | event trigger form | implemented |
| `isCheckingActivity` | App state | `boolean` | 当前活动快照生成中的 UI 状态 | App Shell | current activity check button | implemented |
| `RuntimeState.currentActivity` | `CharacterState.runtime` | `RuntimeCurrentActivity?` | 未过期现场事件或 State Update 对聊天行动意图写回造成的持续活动，会影响后续真实时间场景推进 | Event Activity/State Updater/Temporal Scene | App Shell/Conversation Pipeline | implemented |
| `userConversationHistoryEntry` | `.conversation-histories.local.json` | object | 某个用户在某个档案上的中间栏消息历史 | `/api/persona-dossiers/:id/conversation-history` | App Shell chat panel | implemented |
| `roomConversationHistory` | `/api/conversation-histories?room=1` | `ChatMessage[]` | 同一角色下所有用户私有历史合并后的房间时间线 | Server Support | App Shell room timeline | implemented |
| `conversationHistorySummary` | `/api/conversation-histories` | object | 登录用户可见的某人物下用户历史摘要，包含用户、消息数和更新时间 | Server Support | App Shell shared history selector | implemented |
| `globalConversationStateEntry` | `.conversation-states.local.json` | object | 某个档案上的角色全局运行态覆盖层，包含 `scope: "global"` 和 `global::dossier:<id>` 键 | `/api/persona-dossiers/:id/conversation-state` | `readPersonaDossiers(user)` | implemented |
| `conversationAuditEntry.id` | ConversationAuditEntry | `string` | 单条审计记录 ID，用于管理员删除 | serverSupport | Admin audit UI/API | implemented |
| `conversationAuditEntry.conversationEventId` | ConversationAuditEntry | `string?` | 审计记录对应的 Pipeline `event.id`，用于删除时定位短期/长期/关系记忆 | App Shell/serverSupport | Admin audit deletion | implemented |
| `conversationAuditEntry.conversationHistoryMessageIds` | ConversationAuditEntry | `string[]?` | 审计记录对应的中间栏用户消息和角色消息 ID，用于删除时精确清理历史 | App Shell/serverSupport | Admin audit deletion | implemented |
| `conversationAuditEntry.userInput` | ConversationAuditEntry | `string` | 登录用户发送给虚拟人的输入 | App Shell | Admin audit UI | implemented |
| `conversationAuditEntry.personaOutput` | ConversationAuditEntry | `string` | 虚拟人回复或失败时为空 | App Shell | Admin audit UI | implemented |
| `conversationAuditEntry.moduleCalls` | ConversationAuditEntry | `ConversationModuleCall[]` | 一轮对话中每个 pipeline 模块的输入、输出、状态和 transport | App Shell | Admin audit UI/API | implemented |
| `selectedAuditIds` | App state | `string[]` | 管理员审计浮层中被选择用于导出的审计记录 ID | Admin audit UI | conversationAuditExport | implemented |
| `conversationAuditExport.scope` | conversationAuditExport payload | `"all" \| "selected"` | 标识导出文件来自全量导出还是所选导出 | `/api/conversation-audits/export` | downloaded JSON | implemented |
| `conversationAuditExport.entries` | conversationAuditExport payload | `ConversationAuditEntry[]` | 被导出的用户输入输出审计记录集合 | `.conversation-audits.local.json` | downloaded JSON | implemented |
| `conversationModuleCall.step` | ConversationModuleCall | `string` | 模块步骤键，例如 `memoryRecall`、`stateUpdate` | App Shell | Admin audit UI | implemented |
| `appUpdateStatus.available` | AppUpdateStatus | `boolean` | 服务器当前提交是否落后于远端分支 | `/api/app-update/status` | 左上角更新提示 | implemented |
| `appUpdateStatus.currentCommit` | AppUpdateStatus | `string` | VPS 当前 git 提交 SHA | serverSupport git command | 更新窗口 | implemented |
| `appUpdateStatus.remoteCommit` | AppUpdateStatus | `string` | GitHub 远端分支 SHA | serverSupport git command | 更新窗口 | implemented |
| `appUpdateStatus.pendingCommitCount` | AppUpdateStatus | `number` | 当前服务器提交到远端提交之间的待更新提交数 | serverSupport git command | 更新窗口“本次更新” | implemented |
| `appUpdateStatus.pendingCommits` | AppUpdateStatus | `AppUpdateCommit[]` | 待更新提交的短 SHA、标题和正文摘要列表 | serverSupport git command | 更新窗口“本次更新” | implemented |
| `appUpdateStatus.changesSummary` | AppUpdateStatus | `string` | 可读的更新摘要，用于按钮提示和更新窗口说明 | serverSupport git command | 左上角更新提示 | implemented |
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
| `/api/persona-dossiers` | GET | 登录用户读取后台共享多人档案，并叠加角色全局对话运行态 | 需要本项目登录会话 | implemented |
| `/api/persona-dossiers` | POST | 管理员新增或更新后台共享多人档案 | 需要管理员会话；写 `.persona-dossiers.local.json` | implemented |
| `/api/persona-dossiers/:id/preview` | POST | 登录用户提交 DeepSeek 已生成的人物短预览，全局保存到对应档案 | 需要登录会话；只允许写预览缓存，不允许改完整档案 | implemented |
| `/api/persona-dossiers/:id/conversation-history` | GET | 登录用户读取自己在某个人物上的中间栏消息历史 | 需要登录会话；只返回当前用户当前档案历史 | implemented |
| `/api/persona-dossiers/:id/conversation-history` | POST | 登录用户追加保存自己在某个人物上的中间栏消息历史 | 需要登录会话；写 `.conversation-histories.local.json` | implemented |
| `/api/conversation-histories` | GET | 登录用户按 `dossierId` 列出用户历史摘要，按 `dossierId + key` 只读读取某用户消息，或按 `room=1` 读取房间时间线 | 需要登录会话；只读 `.conversation-histories.local.json` | implemented |
| `/api/admin/conversation-histories` | GET | 兼容旧前端的共享角色历史读取别名 | 需要登录会话；只读 `.conversation-histories.local.json` | implemented |
| `/api/persona-dossiers/:id/conversation-state` | POST | 登录用户对话完成后写回该角色全局运行态，并向全局相关人物传播关系余波 | 需要登录会话；写入该人物共享记忆、runtime、scene 和 location | implemented |
| `/api/persona-dossiers/:id/reset-conversation` | POST | 管理员重置当前角色对话运行态，清理该档案全部用户历史、全局运行态和对应审计 | 需要管理员会话；不改共享档案底稿 | implemented |
| `/api/persona-dossiers/:id` | DELETE | 管理员删除后台共享多人档案 | 需要管理员会话；写 `.persona-dossiers.local.json` | implemented |
| `/api/conversation-audits` | POST | 登录用户记录一次输入输出和模块调用记录 | 需要登录会话；写 `.conversation-audits.local.json` | implemented |
| `/api/conversation-audits` | GET | 管理员读取所有用户输入输出和模块调用记录 | 需要管理员会话 | implemented |
| `/api/conversation-audits/export` | POST | 管理员导出所选记录或完整导出所有用户的所有输入输出审计记录 | 需要管理员会话；只读 `.conversation-audits.local.json` | implemented |
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
