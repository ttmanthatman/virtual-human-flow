# Module Parameter And Data Flow Review

本文档用于人工审核：逐项说明当前系统主要模块的输入参数、内部派生参数、输出参数，以及模块之间的数据如何流动。它不替代 `docs/SYSTEM_FLOW.md`；`SYSTEM_FLOW.md` 说明系统协作图，本文件说明参数级边界。

## 审核总览

当前系统有三条主要数据流：

1. 对话同步响应流：`App Shell -> Conversation Pipeline -> Role Turn -> Appraisal/Memory/Decision 兼容视图 -> State Update -> Runtime Signal Snapshot -> App Shell -> Server Support 持久化`。
2. 非聊天现场事件流：`App Shell -> Temporal Scene Progression -> Event Activity -> App Shell 活动卡 -> Server Support 持久化`。
3. 档案和场景生成流：`App Shell -> Generators -> Cognitive Module Client -> DeepSeek Proxy -> Generators 归一化 -> Profile Scene Consistency -> App Shell -> Server Support 共享档案持久化`。
4. 登录、审计、历史和部署流：`App Shell -> Vite Dev Proxy 或 Production Server -> Server Support -> liao Chatroom / runtime JSON files / git working tree / DeepSeek API`。

## 共享核心数据对象

### `LlmConfig`

| 参数 | 类型 | 来源 | 用途 | 流向 |
| --- | --- | --- | --- | --- |
| `provider` | `"external"` | `seedState.defaultLlmConfig` 或 DeepSeek 配置读取 | 标记当前只使用真实外部模型 | `runCognitiveModule`, `runLlm` |
| `model` | `string` | 默认 `deepseek-v4-flash`；配置接口可返回 | DeepSeek 请求模型名；`deepseek-reasoner` 会被归一化 | DeepSeek proxy |
| `endpoint` | `string` | `/api/deepseek-chat` | 前端 LLM 请求入口 | `fetch(config.endpoint)` |
| `authToken` | `string?` | 登录后写入 | Bearer token，保护需要登录的 LLM/API 请求 | Server auth |

### `CharacterState`

| 参数 | 类型 | 来源 | 用途 | 流向 |
| --- | --- | --- | --- | --- |
| `profile` | `CharacterProfile` | 种子、内置档案、生成器、角色全局运行态 | 人物稳定身份和表达材料 | UI、Role Turn、生成器、一致性检测 |
| `concerns` | `Concern[]` | 种子、内置档案、生成器、State Update | 当前关切清单；同步对话中只是自然语言背景 | Role Turn、State Update |
| `relationships` | `Record<string, Relationship>` | 种子、内置档案、State Update、关系余波 | 人物对用户或其他人物的关系 | Role Turn、Server relationship propagation |
| `shortTermMemory` | `ShortTermMemory[]` | State Update | 最近对话原文；Role Turn 默认取最近 6 小时最多 10 条 | Role Turn、Memory 兼容视图 |
| `longTermMemory` | `LongTermMemory[]` | 种子、生成器、State Update、关系余波 | 长期摘要记忆 | Role Turn、Memory 兼容视图 |
| `relationshipMemory` | `RelationshipMemory[]` | 种子、内置档案、State Update | 当前用户专属印象和关系总结 | Role Turn、Memory 兼容视图、右侧 UI |
| `runtime` | `RuntimeState` | 种子、生成器、State Update | 当前能量、情绪、注意力和活跃关切 | UI、Role Turn、Runtime Signal Snapshot |
| `scene` | `SceneState?` | 种子、内置档案、场景生成器、时间场景推进 | 当前场景语境 | UI、Role Turn、一致性检测 |
| `location` | `CharacterLocation?` | 种子、内置档案、管理员手动字段、时间场景推进 | 物理位置和地图语境 | UI、Role Turn |

### `CharacterProfile`

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 人物稳定 ID，用于人物关系和记忆引用。 |
| `name` | `string` | 人物显示名，也是回复 speakerName。 |
| `age` | `number?` | 年龄；生成器会限制到 1-120。 |
| `displaySummary` | `string` | 左侧短摘要，不应整段照抄用户原文。 |
| `background` | `string` | 稳定背景。 |
| `socialPersonaPattern` | `string?` | 此人在人群性格分布中的位置。 |
| `fullLifeStory` | `string?` | 从小到大的故事脉络。 |
| `lifeEvents` | `LifeEvent[]` | 分阶段经历、心理变化和关系变化。 |
| `personalityTraits` | `string[]` | UI 短标签。 |
| `personalitySummary` | `string` | 性格综合叙述。 |
| `personalityFacets` | `PersonalityFacet[]` | 性格面，包含证据、张力和表达方式。 |
| `speakingStyle` | `string` | 平常说话质感。 |
| `values` | `string[]` | 看重的东西。 |
| `boundaries` | `string[]` | 关系边界。 |
| `examples` | `{ situation, expectedReply }[]` | 类似情境表达样本，只作为自然语言材料。 |

### `LifeEvent`

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 经历 ID。 |
| `lifeStage` | `"childhood" \| "adolescence" \| "early_adulthood" \| "adulthood" \| "recent"` | 人生阶段。 |
| `ageRange` | `string` | 年龄范围。 |
| `title` | `string` | 经历标题。 |
| `summary` | `string` | 经历摘要。 |
| `psychologicalChange` | `string` | 心理结构变化。 |
| `relationshipChange` | `string` | 关系距离、信任或依附变化。 |
| `relatedPeople` | `string[]` | 相关人物。 |
| `emotionalValence` | `number` | 情绪方向，通常 -1 到 1。 |
| `importance` | `number` | 重要度，通常 0 到 1。 |

### `PersonalityFacet`

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `label` | `string` | 性格面名称。 |
| `summary` | `string` | 该性格面的摘要。 |
| `evidence` | `string[]` | 来源证据。 |
| `tension` | `string` | 内在张力。 |
| `expression` | `string` | 外在表达方式。 |

### `Concern`

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 关切 ID。 |
| `title` | `string` | 关切标题。 |
| `object` | `string?` | 关切对象，如某人或某事。 |
| `type` | `string` | 关切类型。 |
| `description` | `string` | 关切描述。 |
| `intensity` | `number` | 强度，归一化到 0-1。 |
| `valence` | `number` | 情绪方向，归一化到 -1 到 1。 |
| `arousal` | `number` | 唤醒度，归一化到 0-1。 |
| `triggers` | `string[]` | 生成档案时留下的自然语言线索；同步对话不再用它做本地关键词触发。 |
| `possibleResolutions` | `string[]` | 可能缓解方式。 |
| `lastActivatedAt` | `string?` | 最近激活时间。 |
| `createdAt` | `string` | 创建时间。 |
| `decayRate` | `number` | 衰减率。 |
| `status` | `"active" \| "dormant" \| "resolved"` | 当前状态。 |

### `Relationship`

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `targetId` | `string` | 关系对象 ID。 |
| `targetName` | `string` | 关系对象名称。 |
| `familiarity` | `number` | 熟悉度，0-1。 |
| `trust` | `number` | 信任，0-1。 |
| `affection` | `number` | 情感倾向，-1 到 1。 |
| `tension` | `number` | 张力，0-1。 |
| `lastInteractionAt` | `string?` | 最近互动时间。 |
| `recentTone` | `string` | 最近关系气氛。 |
| `unresolvedIssues` | `string[]` | 未解决问题。 |
| `notes` | `string[]` | 自然语言备注。 |

### `ShortTermMemory`

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 短期记忆 ID。 |
| `timestamp` | `string` | 发生时间。 |
| `speakerId` | `string` | 说话者 ID。 |
| `speakerName` | `string` | 说话者名称。 |
| `content` | `string` | 原文内容。 |
| `eventId` | `string` | 所属事件 ID。 |

### `LongTermMemory`

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 长期记忆 ID。 |
| `summary` | `string` | 摘要，不保存长原文。 |
| `relatedPeople` | `string[]` | 相关人物。 |
| `relatedConcerns` | `string[]` | 相关关切 ID。 |
| `emotionalValence` | `number` | 情绪方向，-1 到 1。 |
| `emotionalIntensity` | `number` | 情绪强度，0-1。 |
| `createdAt` | `string` | 创建时间。 |
| `lastAccessedAt` | `string?` | 最近访问时间。 |
| `importance` | `number` | 重要度，0-1。 |

### `RelationshipMemory`

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 关系记忆 ID。 |
| `targetUserId` | `string` | 当前登录用户对应的稳定说话者 ID。 |
| `targetUserName` | `string` | 当前登录用户展示名。 |
| `impressionSummary` | `string` | 人物对该用户的自然语言印象。 |
| `relationshipSummary` | `string` | 人物与该用户当前关系总结。 |
| `evidence` | `string[]` | 形成印象的证据。 |
| `lastInteractionSummary` | `string` | 最近互动留下的关系余波。 |
| `updatedAt` | `string` | 更新时间。 |
| `history` | `{ id, summary, createdAt }[]` | 历史关系摘要，服务端和 State Update 会截断保留最近项。 |

### `RuntimeState` 和 `RuntimeSignalProfile`

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `runtime.attentionFocus` | `string?` | 当前注意力焦点。 |
| `runtime.energy` | `number` | UI 能量值，0-1。 |
| `runtime.derivedMood.valence` | `number` | 情绪倾向，-1 到 1。 |
| `runtime.derivedMood.arousal` | `number` | 唤醒度，0-1。 |
| `runtime.derivedMood.label` | `string` | UI 情绪标签。 |
| `runtime.signalProfiles.energy/mood/valence/arousal` | `RuntimeSignalProfile` | 四项观察信号背后的自然语言考量。 |
| `runtime.activeConcernIds` | `string[]` | 当前活跃关切 ID。 |
| `runtime.lastActiveAt` | `string` | 最近运行时间。 |
| `RuntimeSignalProfile.label` | `string` | 指标标签。 |
| `RuntimeSignalProfile.summary` | `string` | 指标摘要。 |
| `RuntimeSignalProfile.considerations` | `string[]` | 形成指标的因素。 |
| `RuntimeSignalProfile.cognitiveNarrative` | `string` | 只描述内部状态，不写回复指令。 |

### `SceneState`

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 场景 ID。 |
| `title` | `string` | 场景标题。 |
| `description` | `string` | 场景短描述。 |
| `atmosphere` | `string` | 氛围。 |
| `visibleCues` | `string[]` | 可见线索。 |
| `activeObjects` | `string[]` | 参与互动的物件。 |
| `sensoryProfile` | `string` | 感官环境。 |
| `interactionPressure` | `string` | 场景带来的互动压力。 |
| `cognitiveNarrative` | `string` | 场景如何影响注意力、身体感和关系距离。 |

### `CharacterLocation`

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `label` | `string` | 位置名称。 |
| `address` | `string` | 地址或范围描述。 |
| `region` | `string` | 区域。 |
| `coordinate.lng` | `number?` | 经度。 |
| `coordinate.lat` | `number?` | 纬度。 |
| `speedKmh` | `number` | 速度，km/h。 |
| `headingDeg` | `number` | 方向角度。 |
| `headingLabel` | `string` | 方向中文摘要。 |
| `motionState` | `"stationary" \| "walking" \| "riding" \| "driving" \| "unknown"` | 运动状态。 |
| `mapContext.nearbyRoads` | `string[]?` | 附近道路。 |
| `mapContext.nearbyPlaces` | `string[]?` | 附近地点。 |
| `mapContext.nearbyBuildings` | `string[]?` | 附近建筑。 |
| `mapContext.environmentSummary` | `string?` | 环境摘要。 |
| `mapContext.source` | `"seed" \| "manual" \| "map_service"` | 地图语境来源。 |
| `mapContext.resolvedAt` | `string` | 地图语境解析时间。 |
| `updatedAt` | `string` | 位置更新时间。 |
| `source` | `"seed" \| "manual" \| "map_service"` | 位置字段来源。 |

### `PersonaDossier`

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 档案 ID。 |
| `title` | `string` | 左栏显示标题。 |
| `groupName` | `string` | 分组名。 |
| `state` | `CharacterState` | 绑定的人物、场景、位置和状态。 |
| `dossierDescription` | `string` | 管理员输入的人物素材。 |
| `sceneDescription` | `string` | 管理员输入的场景素材。 |
| `previewSummary` | `string?` | DeepSeek 生成的短预览。 |
| `previewGeneratedAt` | `string?` | 短预览生成时间。 |
| `previewStatus` | `"pending" \| "generating" \| "ready" \| "failed"` | 短预览状态。 |
| `createdAt` | `string` | 创建时间。 |
| `updatedAt` | `string` | 更新时间。 |
| `isBuiltin` | `boolean?` | 是否为内置全局档案。 |

### Pipeline 数据对象

| 对象 | 参数 | 类型 | 说明 |
| --- | --- | --- | --- |
| `EventInput` | `id` | `string` | 事件 ID，由 pipeline 生成。 |
| `EventInput` | `type` | enum | 事件类型；当前对话为 `user_message`。 |
| `EventInput` | `timestamp` | `string` | 事件时间。 |
| `EventInput` | `speakerId` | `string?` | 当前登录用户稳定 ID。 |
| `EventInput` | `speakerName` | `string?` | 当前登录用户展示名。 |
| `EventInput` | `roomId` | `string?` | 当前固定为 `main_room`。 |
| `EventInput` | `content` | `string` | 用户输入内容。 |
| `EventInput` | `channel` | `ConversationChannel?` | 消息或事件渠道，例如 `wechat`、`sms`、`phone`、`face_to_face`、`outside_door`、`scene_event`。 |
| `EventInput` | `channelLabel` | `string?` | 渠道人类可读标签，进入主脑 prompt、审计和短期记忆。 |
| `EventInput` | `metadata` | `Record<string, unknown>?` | 预留元数据。 |
| `RoleTurnResult` | `narrative` | `string?` | 主脑心理状态、记忆浮现和开口倾向的合成摘要。 |
| `RoleTurnResult` | `innerStateNarrative` | `string` | 主脑输出的心理状态段落；当前 Appraisal 兼容视图由此派生。 |
| `RoleTurnResult` | `memoryNarrative` | `string` | 主脑输出的记忆浮现段落；当前 Memory 兼容视图由此派生。 |
| `RoleTurnResult` | `decisionNarrative` | `string` | 主脑输出的开口倾向段落；当前 Decision 兼容视图由此派生。 |
| `RoleTurnResult` | `replyOutput` | `ReplyOutput` | 主脑“说出口”段落归一化后的台词和分段。 |
| `AppraisalResult` | `narrative` | `string?` | 当前同步主路径中由 `roleTurn.innerStateNarrative` 派生；旧独立 Appraisal LLM 保留为兼容路径。 |
| `AppraisalResult` | `eventId` | `string` | 对应事件 ID。 |
| `AppraisalResult` | `speakerRelationship` | `Relationship?` | 当前说话者关系兼容字段。 |
| `AppraisalResult` | `activatedConcerns` | array | 兼容字段；同步路径不再由本地关键词激活关切。 |
| `AppraisalResult` | `eventSalience` | `number` | 兼容字段，保留给 UI 和写回壳。 |
| `AppraisalResult` | `appraisalSummary` | `string` | 兼容摘要，当前等同或承接 narrative。 |
| `MemoryRecallResult` | `narrative` | `string?` | 当前同步主路径中由 `roleTurn.memoryNarrative` 派生；旧独立 Memory Recall LLM 保留为兼容路径。 |
| `MemoryRecallResult` | `source` | `"sync_response" \| "async_life"?` | 召回来源。 |
| `MemoryRecallResult` | `retrievalMode` | `"hybrid_relevance"?` | 当前召回模式。 |
| `MemoryRecallResult` | `naturalLanguageQuery` | `string?` | 合成的自然语言召回语境。 |
| `MemoryRecallResult` | `shortTermContext` | `ShortTermMemory[]` | 最近 6 小时最多 10 条对话上下文。 |
| `MemoryRecallResult` | `longTermMemories` | array | 长期记忆和关系记忆候选；供 UI/审计展示，不代表 LLM ID 选择。 |
| `MemoryRecallFactor` | `name` | enum | 兼容字段；自然语言候选策略下通常为空数组。 |
| `MemoryRecallFactor` | `score` | `number` | 因子分数。 |
| `MemoryRecallFactor` | `reason` | `string` | 因子理由。 |
| `ResponseDecision` | `narrative` | `string?` | 当前同步主路径中由 `roleTurn.decisionNarrative` 派生；旧独立 Response Decision LLM 保留为兼容路径。 |
| `ResponseDecision` | `shouldRespond` | `boolean` | 是否回应。 |
| `ResponseDecision` | `responseMode` | `ResponseMode` | 兼容字段；不再作为硬编码语义路由。 |
| `ResponseDecision` | `delaySeconds` | `number?` | 兼容字段。 |
| `ResponseDecision` | `rationale` | `string` | 决策理由兼容字段，当前承接 narrative。 |
| `ExpressionLlmRequest` | `provider` | `"external"` | 回复 LLM 提供方。 |
| `ExpressionLlmRequest` | `model` | `string` | 回复模型。 |
| `ExpressionLlmRequest` | `prompt` | `string` | 旧表达 helper 的自然语言回复上下文；当前同步主路径中 `trace.llmRequest.prompt` 保存 `roleTurn.request.prompt` 供审计。 |
| `ReplyOutput` | `reply` | `string` | 角色最终说出口的话。 |
| `EventActivityResult` | `psychologicalActivity` | `string` | 非聊天事件触发后的心理/身体活动。 |
| `EventActivityResult` | `action` | `string` | 非聊天事件触发后的动作或停顿。 |
| `EventActivityResult` | `movement` | `string` | 非聊天事件触发后的位移或位置约束。 |
| `EventActivityResult` | `relationshipShift` | `string` | 非聊天事件对房间关系距离的影响。 |
| `EventActivityResult` | `memoryNote` | `string` | 非聊天事件写入短期记忆的余味。 |
| `EventActivityResult` | `externalOutput` | `string` | 外显输出；可为空，不等同于聊天回复。 |
| `ChatMessage` | `channel` | `ConversationChannel?` | 中间栏消息渠道；用于刷新后保留现实媒介。 |
| `ChatMessage` | `channelLabel` | `string?` | 中间栏显示的渠道标签。 |
| `ChatMessage` | `messageType` | `"normal" / "mind_flow" / "event_activity"?` | 中间栏消息类型；心理流和现场事件使用活动卡展示。 |
| `ChatMessage` | `collapsed` | `boolean?` | 活动卡是否折叠。 |
| `ChatMessage` | `details` | `string[]?` | 折叠活动卡展开后展示的心理、动作、位移、关系或余波细节。 |
| `StateUpdatePlan` | `concernUpdates` | array | 关切变化计划。 |
| `StateUpdatePlan` | `relationshipUpdates` | array | 关系变化计划。 |
| `StateUpdatePlan` | `newConcerns` | array | 新关切计划；当前归一化后主要保留结构。 |
| `StateUpdatePlan` | `userRelationshipMemory` | object? | 对当前用户的印象和关系总结。 |
| `StateUpdatePlan` | `internalStateNote` | `string` | 没说出口但进入长期记忆候选的内心余波。 |
| `StateUpdatePlan` | `narrative` | `string?` | State Update LLM 的自然语言写回判断；关系记忆和长期记忆写回主干。 |
| `RuntimeSignalEvaluationResult` | `energy` | `number` | 评估后的能量。 |
| `RuntimeSignalEvaluationResult` | `derivedMood` | object | 评估后的情绪方向、唤醒度和标签。 |
| `RuntimeSignalEvaluationResult` | `signalProfiles` | record | 四项指标的自然语言说明。 |
| `RuntimeSignalEvaluationResult` | `rationale` | `string` | 信号评估理由。 |
| `StateDelta` | `concernChanges` | `string[]` | 已写回的关切变化摘要。 |
| `StateDelta` | `relationshipChanges` | `string[]` | 已写回的关系变化摘要。 |
| `StateDelta` | `memoryWrites` | `string[]` | 已写入的记忆摘要。 |
| `StateDelta` | `runtimeChanges` | `string[]` | 已写回的运行态变化摘要。 |
| `PipelineTrace` | `event/roleTurn/roleTurnProbe?/appraisal/memoryRecall/decision/llmRequest/llmOutput/stateUpdate/runtimeSignalEvaluation/stateDelta` | mixed | 一轮对话完整审计链；`roleTurnProbe` 默认关闭且只作旁路审计。 |
| `PipelineStepProgress` | `step/status/input/output/error/transport` | mixed | 右侧流程追踪实时显示参数。 |

## 模块参数说明

### App Shell: `src/App.tsx`

责任：三栏工作台、登录态、档案选择、对话发送、生成预览、审计展示、站内更新 UI。

| 函数或状态 | 参数 | 说明 | 输出或副作用 |
| --- | --- | --- | --- |
| `createConversationHistoryKey` | `user`, `dossierId` | 将当前用户和当前档案合成前端历史桶 key。未登录时使用 `guest`。 | `user-*::dossier-*` 字符串。 |
| `createRoomConversationHistoryKey` | `dossierId` | 为同一角色的房间时间线生成前端本地合并桶 key。 | `room::dossier-*` 字符串。 |
| `createConversationSpeaker` | `user` | 将登录用户归一化为 pipeline 说话者。 | `{ id: "user:<id-or-name>", name }`。 |
| `createSharedConversationHistoryKey` | `historyKey` | 查看单个用户历史时创建本地只读桶。 | `shared-history::<historyKey>`。 |
| `readStoredConversationHistory` | `historyKey` | 从 localStorage 读取前端缓存。 | `ChatMessage[]` 或 `undefined`。 |
| `writeStoredConversationHistory` | `historyKey`, `messages` | 把消息截断到 `maxConversationHistoryMessages` 后写入 localStorage。 | localStorage 副作用。 |
| `createPersonaDossier` | `state`, `dossierDescription`, `sceneDescription`, `title?` | 创建本地档案对象。 | `PersonaDossier`。 |
| `authHeaders` | `token`, `extra` | 组装 API headers。 | 包含 Bearer token 的 headers。 |
| `setMessagesForHistory` | `historyKey`, `updater` | 更新指定历史桶。 | React state + localStorage。 |
| `requireLogin` | `action` | 操作前登录检查。 | 未登录打开登录浮窗并写错误。 |
| `requireAdmin` | `action` | 操作前管理员检查。 | 非管理员写错误。 |
| `loadSharedDossiers` | `token` | GET `/api/persona-dossiers` 读取共享档案，并叠加角色全局运行态。 | 更新 `dossiers/state/description`。 |
| `persistPersonaDossier` | `dossier` | POST `/api/persona-dossiers` 保存共享档案。 | 后台写 `.persona-dossiers.local.json`。 |
| `ensureDossierPreview` | `dossier` | 生成缺失的短预览。 | 调 `/api/deepseek-chat` 流式生成，再 POST `/preview` 全局保存。 |
| `syncConversationState` | `nextState`, `interaction` | 对话后保存当前人物的全局运行态。 | POST `/conversation-state`，服务端写 `.conversation-states.local.json`。 |
| `loadConversationHistory` | `dossierId`, `historyKey`, `cachedMessages?` | 切换人物或登录后读取消息历史。 | GET `/conversation-history`，必要时回填缓存。 |
| `loadConversationRoomHistory` | `dossierId`, `historyKey`, `cachedMessages?` | 读取当前角色房间时间线。 | GET `/api/conversation-histories?dossierId=...&room=1`，写房间本地桶。 |
| `loadSharedConversationHistorySummaries` | `dossierId` | 登录用户读取当前人物下所有用户历史摘要。 | GET `/api/conversation-histories?dossierId=...`。生产服务和开发代理均已实现；旧 `/api/admin/conversation-histories` 保留兼容。 |
| `handleSelectSharedHistoryKey` | `historyKey`, `forceReload?` | 登录用户选择某个用户历史，只读查看其当前人物消息；本地空缓存但摘要非空时会重新拉取。 | GET `dossierId + key`，写共享只读历史桶。 |
| `persistConversationHistoryMessages` | `dossierId`, `messagesToSave` | 对话后保存中间栏消息。 | POST `/conversation-history`。 |
| `handleLogin` | form event | POST `/api/auth/login`，保存 token 和用户。 | localStorage + React auth state。 |
| `handleLogout` | 无 | POST `/api/auth/logout` 并清理本地登录态。 | 清空 auth state。 |
| `recordConversationAudit` | `entry` | 保存一轮对话最终输入、输出和模块调用。 | POST `/api/conversation-audits`。 |
| `loadConversationAudits` | 无 | 管理员读取审计。 | GET `/api/conversation-audits`。 |
| `deleteConversationAuditEntry` | `auditId` | 管理员删除单条审计。 | DELETE `/api/conversation-audits/:auditId`。 |
| `clearConversationAuditEntries` | 无 | 管理员清空审计。 | DELETE `/api/conversation-audits`。 |
| `checkAppUpdate` | 无 | 检查站内更新状态。 | GET `/api/app-update/status`。 |
| `handleRunAppUpdate` | 无 | 管理员触发站内更新。 | POST `/api/app-update/run` 并消费 SSE。 |
| `consumeUpdateEvent` | SSE event text | 解析更新 SSE。 | 更新进度和日志。 |
| `appendUpdateLog` | `entry` | 追加更新日志并截断。 | React state。 |
| `updateMonitorProgress` | `PipelineStepProgress` | 写入右侧流程追踪或生成监视。 | 更新 `activeStep/liveTrace`。 |
| `updateActiveDossier` | `patch` | 更新当前档案局部字段。 | React state。 |
| `handleSelectDossier` | `dossier` | 切换当前档案。 | 同步人物、素材、预览和错误状态。 |
| `handleCreateDossier` | 无 | 管理员新建空档案。 | 本地追加并保存后台。 |
| `handleDeleteDossier` | `id` | 管理员删除档案。 | DELETE 后更新本地列表。 |
| `handleDossierDescriptionChange` | `value` | 管理员修改人物素材。 | 更新素材和当前档案。 |
| `handleSceneDescriptionChange` | `value` | 管理员修改场景素材。 | 更新素材和当前档案。 |
| `handleDossierGroupChange` | `value` | 管理员修改分组。 | 更新当前档案 `groupName`。 |
| `handleSaveDeepseekConfig` | 无 | 管理员保存 DeepSeek key。 | POST `/api/deepseek-config`，服务端写 `.deepseek.local.json`。 |
| `handleTestDeepseekConfig` | 无 | 测试 DeepSeek。 | POST `/api/deepseek-chat`。 |
| `handleSend` | form event | 对话发送主入口。 | 运行 pipeline、保存历史、同步状态、记录审计。 |
| `handleTriggerRoomEvent` | form event | 非聊天现场事件触发入口。 | 根据文字构造 `room_event`/`scene_event`，调 `advanceSceneForCurrentTime` 校准当前现场后运行 `runEventActivity`，streaming 更新 `event_activity` 活动卡，并写短期记忆、房间历史和角色全局运行态。 |
| `handleGenerateDossier` | 无 | 管理员生成档案预览。 | 调 `generateDossierFromDescription`。 |
| `handleApplyDossier` | 无 | 应用人物预览。 | 调 `applyCandidateState`。 |
| `handleGenerateScene` | 无 | 管理员生成场景预览。 | 调 `generateSceneFromDescription`。 |
| `handleApplyScene` | 无 | 应用场景预览。 | 调 `applyCandidateState`。 |
| `applyCandidateState` | `candidate`, `target`, `bypassDistortionPassword?` | 应用前运行人物场景一致性检测。 | 可能打开扭曲时空门禁，或提交候选状态。 |
| `commitCandidateState` | `candidate`, `target`, `consistency?` | 真正写入候选状态。 | 更新当前档案并异步保存。 |
| `handleConfirmDistortionPassword` | 无 | 校验扭曲时空密码后继续应用。 | 调 `commitCandidateState`。 |
| `handleReset` | 无 | 重置工作台到 seed。 | 重建本地档案，登录时再读后台共享档案。 |
| `readNaturalLanguageEventStream` | `response`, `onStream?` | 读取自然语言 SSE。 | 返回最终文本。 |
| `buildConversationModuleCalls` | `trace` | 把 `PipelineTrace` 转为持久审计模块调用。 | `ConversationModuleCall[]`。 |

### Conversation Pipeline: `src/pipeline/conversationPipeline.ts`

| 参数 | 类型 | 来源 | 说明 |
| --- | --- | --- | --- |
| `content` | `string` | `handleSend` 的输入框 | 用户本轮消息。 |
| `channel` | `ConversationChannel` | App Shell 渠道选择器 | 本轮消息渠道，进入 `EventInput`、主脑 prompt、短期记忆和审计。 |
| `state` | `CharacterState` | 当前档案叠加角色全局运行态后的状态 | 所有认知模块的基础上下文。 |
| `llmConfig` | `LlmConfig` | App Shell | LLM 入口、模型和 token。 |
| `speaker.id` | `string` | `createConversationSpeaker` | 当前登录用户稳定 ID。 |
| `speaker.name` | `string` | `createConversationSpeaker` | 当前登录用户展示名。 |
| `onProgress` | callback? | App Shell | 将每步输入、输出和状态推送到右侧面板。 |

输出：`{ nextState, trace }`。`nextState` 回到 App Shell 并保存到角色全局运行态；`trace` 显示在右侧并保存到审计。

数据流顺序：`content -> event -> temporalSceneProgression -> roleTurn -> appraisal/memory/decision compatibility traces -> replyOutput -> stateUpdate narrative -> runtimeSignalEvaluation -> stateDelta -> nextState/trace`。

### Cognitive Module Client: `src/pipeline/cognitiveModuleClient.ts`

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `request.moduleName` | `CognitiveModuleName` | 当前认知模块名。 |
| `request.inputMode` | `"natural_language" \| "structured_context"` | 模型输入模式。 |
| `request.outputMode` | `"natural_language" \| "structured_json"` | 模型输出模式。同步对话认知模块使用 `natural_language`；结构化生成/兼容模块可 fallback。 |
| `request.prompt` | `string` | 发给 DeepSeek proxy 的用户 prompt。 |
| `request.outputContract` | `string?` | 输出说明；同步对话模块这里是自然语言标准，不是 JSON 契约。 |
| `config` | `LlmConfig` | 外部 endpoint、模型和认证 token。 |
| `mockOutput` | generic | 本地兜底输出。 |
| `options.onStream` | callback? | 流式输出回调。 |

输出：`CognitiveModuleTrace<TOutput>`，包含 `request/output/transport/fallbackReason`。自然语言模块读取 SSE `final` 文本；如果仍使用结构化输出的生成/兼容模块遇到 JSON 截断或无法解析，使用 `mockOutput` 并记录 `fallbackReason`。

### Role Turn: `src/pipeline/roleTurn.ts`

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `event` | `EventInput` | 本轮用户事件。 |
| `state` | `CharacterState` | 提供人物档案、场景、位置、runtime、短期记忆、长期记忆和关系记忆。 |
| `llmConfig` | `LlmConfig` | LLM 配置。 |
| `onStream` | callback? | 主脑自然语言输出流式回调。 |

内部派生：`buildRoleTurnPrompt` 将人物稳定背景、成长经历、性格面、表达样本、当前场景、当前位置、runtime narrative、消息渠道与物理在场约束、最近 6 小时直接对话、过去 6 小时关系/状态/场景摘要、长期记忆候选、关系记忆候选和用户原话组织为同一个自然语言心理回合。

输出：`CognitiveModuleTrace<RoleTurnResult>`。`output.innerStateNarrative`、`output.memoryNarrative`、`output.decisionNarrative` 分别派生 Appraisal/Memory/Decision 兼容视图；`output.replyOutput` 进入聊天历史、State Update 和审计。

### Role Turn Probe: `src/pipeline/roleTurn.ts`

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `event` | `EventInput` | 本轮用户事件。 |
| `state` | `CharacterState` | 与 `roleTurn` 相同的场景感知状态，仅供审计理解角色和场景。 |
| `roleTurn` | `CognitiveModuleTrace<RoleTurnResult>` | 已完成的人物主脑输入和输出。 |
| `llmConfig` | `LlmConfig` | LLM 配置。 |
| `onStream` | callback? | 探针自然语言输出流式回调。 |

输出：`CognitiveModuleTrace<RoleTurnProbeResult>`。它只解释主脑决策路径、关键心理证据、标签锁定风险、上下文噪声和建议裁剪；只进入 `PipelineTrace.roleTurnProbe`、右侧 trace 和模块审计，不进入 `ReplyOutput`、State Update、关系记忆或长期记忆。

### Event Activity: `src/pipeline/eventActivity.ts`

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `event` | `EventInput` | 非聊天现场/环境事件，当前由 App Shell 构造 `room_event` 并用 `scene_event` 渠道标记。 |
| `state` | `CharacterState` | 已经过 `advanceSceneForCurrentTime` 推进后的场景感知状态。 |
| `progression` | `TemporalSceneProgression` | 本地真实时间/地理约束推进结果。 |
| `llmConfig` | `LlmConfig` | LLM 配置。 |
| `onStream` | callback? | 事件活动自然语言输出流式回调，App Shell 用它更新房间活动卡内容。 |

内部派生：`buildEventActivityPrompt` 将人物稳定背景、性格面、当前场景、位置、runtime、现场事件渠道约束、最近房间上下文、长期候选和当前时间/场景校准结果组织成一次非聊天活动回合。外部模型只需要自然语言输出六段：心理活动、动作、位移、关系变化、记忆变化、外显输出。

输出：`CognitiveModuleTrace<EventActivityResult>`。结果由 `formatEventActivityDetails` 转为可展开活动卡详情；`externalOutput` 可为空，不能强制进入聊天台词。

### Appraisal: `src/pipeline/appraisal.ts`

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `event` | `EventInput` | 本轮用户事件；当前主路径派生视图仍保留事件 ID。 |
| `state` | `CharacterState` | 提供 runtime 和旧兼容强度派生参考。 |
| `roleTurn` | `CognitiveModuleTrace<RoleTurnResult>` | 当前主路径的语义来源。 |

内部派生：当前同步主路径调用 `buildAppraisalTraceFromRoleTurn`，把 `roleTurn.innerStateNarrative` 放入 `AppraisalResult.narrative/appraisalSummary`，并生成 UI/写回兼容字段。旧 `runAppraisal` 独立 LLM 函数仍保留供实验和回滚。

输出：`CognitiveModuleTrace<AppraisalResult>`。`output.narrative` 是人物主脑心理状态段落；其他字段是兼容壳，用于 UI、trace 和状态写回。

### Memory Retrieval: `src/pipeline/memoryRetrieval.ts`

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `event` | `EventInput` | 本轮事件。 |
| `appraisal` | `AppraisalResult` | Appraisal 兼容 narrative，当前来自 `roleTurn.innerStateNarrative`。 |
| `state` | `CharacterState` | 短期记忆、长期记忆、关系记忆。 |
| `llmConfig` | `LlmConfig` | LLM 配置。 |
| `onStream` | callback? | 记忆召回流式输出。 |

内部派生参数：

| 参数 | 说明 |
| --- | --- |
| `retrievalContext.source` | 当前同步响应固定为 `sync_response`，未来异步生命路径可用 `async_life`。 |
| `naturalLanguageQuery` | 由事件内容、Appraisal narrative、过去 6 小时关系/状态/场景摘要和候选记忆合成。 |
| `shortTermContext` | 最近 6 小时最多 10 条同一用户/本角色对话。 |
| `recentSituationSummary` | 过去 6 小时关系、状态和场景摘要。 |
| `longTermMemoryCandidates` | `state.longTermMemory + relationshipMemory` 的自然语言候选，最多送入有限条。 |
| `fallbackNarrative` | 本地兜底自然语言，不按关键词选择记忆。 |

输出：当前同步主路径调用 `buildMemoryTraceFromRoleTurn`，返回 `CognitiveModuleTrace<MemoryRecallResult>`。`output.narrative` 来自 `roleTurn.memoryNarrative`；`shortTermContext` 和 `longTermMemories` 保留给 UI/审计，不代表 JSON ID 复判。旧 `retrieveMemory` 独立 LLM 函数仍保留供实验和回滚。

### Response Decision: `src/pipeline/responseDecision.ts`

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `roleTurn` | `CognitiveModuleTrace<RoleTurnResult>` | 当前主路径的开口倾向和最终台词来源。 |

内部派生：当前同步主路径调用 `buildDecisionTraceFromRoleTurn`，根据 `roleTurn.decisionNarrative`、最终台词是否为空和自然分行生成 `ResponseDecision` 兼容壳。旧 `decideResponse` 独立 LLM 函数仍保留供实验和回滚。

输出：`CognitiveModuleTrace<ResponseDecision>`。`output.narrative` 来自主脑开口倾向段落；`responseMode/replyRhythm` 等字段是兼容壳，不再做台词生成前的本地强制路由。

### Expression Module: `src/pipeline/llmClient.ts` + `src/pipeline/promptBuilder.ts`

当前同步主路径已由 Role Turn 取代表达模块。下面接口仍保留供旧验证、局部实验或未来单独台词生成路径使用。

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `event` | `EventInput` | 当前用户消息和说话者。 |
| `state` | `CharacterState` | 人物、场景、位置、记忆、关系和 runtime。 |
| `appraisalNarrative` | `string` | Appraisal 自然语言评估。 |
| `memoryRecallNarrative` | `string` | Memory Recall 自然语言召回判断。 |
| `decisionNarrative` | `string` | Response Decision 自然语言回应判断。 |
| `decision` | `ResponseDecision` | 兼容节奏字段和 narrative。 |
| `provider` | `"external"` | 固定外部模型。 |
| `model` | `string` | 模型名。 |

输出：`{ request, output }`。`request.prompt` 是自然语言上下文，只给旧 Reply LLM；`output` 是旧 Reply LLM 结果。Prompt Builder 是兼容 helper，不再作为当前同步 pipeline 的表达决策环节。

### Reply LLM Client: `src/pipeline/llmClient.ts`

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `request` | `ExpressionLlmRequest` | Expression Module 内部生成的自然语言请求。 |
| `config` | `LlmConfig` | endpoint、model、authToken。 |
| `simulateInput` | `{ event, state, decision }` | 非外部模式兜底输入；当前正式配置走外部。 |
| `onStream` | callback? | 回复流式输出。 |

输出：`ReplyOutput`。外部请求 body 固定包含 `moduleName: "reply_generation"`、`inputMode: "natural_language"`、`outputMode: "natural_language"`、`stream: true`。

### State Updater: `src/pipeline/stateUpdater.ts`

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `state` | `CharacterState` | 更新前状态。 |
| `event` | `EventInput` | 当前事件。 |
| `replyOutput` | `ReplyOutput` | 角色回复或沉默。 |
| `context.appraisal` | `AppraisalResult` | 评估结果。 |
| `context.memoryRecall` | `MemoryRecallResult` | 召回结果。 |
| `context.decision` | `ResponseDecision` | 回应决策。 |
| `llmConfig` | `LlmConfig` | LLM 配置。 |
| `onStream` | callback? | 状态更新流式输出。 |

输出：`{ nextState, stateDelta, stateUpdate }`。`stateUpdate.output.narrative` 是 LLM 自然语言写回判断；`nextState` 是兼容写回后的状态；`stateDelta` 是写回摘要。

兼容写回包括：追加本轮短期记忆、把 State Update narrative 写入长期记忆候选、写入或更新 `relationshipMemory`、把上游自然语言判断合入关系印象、重算活跃关切、energy、derivedMood 和 `signalProfiles`。Runtime Signal Evaluator 只读取这些结果生成 trace 快照，不再覆盖 State Update 写入的 runtime。

### Runtime Signal Evaluator: `src/pipeline/runtimeSignalEvaluator.ts`

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `state` | `CharacterState` | State Update 后的状态。 |
| `event` | `EventInput` | 当前事件。 |
| `replyOutput` | `ReplyOutput` | 角色回复。 |
| `context.stateUpdatePlan` | `StateUpdatePlan` | 状态更新计划。 |
| `llmConfig` | `LlmConfig` | 保留在接口中兼容调用方；同步路径不再用它调用外部 LLM。 |
| `onStream` | callback? | 信号评估流式输出。 |

输出：`CognitiveModuleTrace<RuntimeSignalEvaluationResult>`。其中 `output` 是 State Update 后 runtime 的本地快照，`transport` 为本地/模拟 trace 语义，不发外部 DeepSeek 请求。随后 `applyRuntimeSignalEvaluation(state, stateDelta, evaluation)` 归一化并重放同一份快照到 `runtime`，用于保持 trace 和最终状态格式一致。

### Generators: `src/pipeline/generators.ts`

#### `generateDossierFromDescription`

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `description` | `string` | 管理员输入的人物素材。 |
| `current` | `CharacterState` | 当前人物状态，用于背景和 fallback。 |
| `llmConfig` | `LlmConfig` | LLM 配置。 |
| `onProgress` | callback? | 生成监视进度。 |

输出：`CharacterState` 预览。内部要求 Dossier Interpretation LLM 输出 `name/age/displaySummary/stableBackground/socialPersonaPattern/fullLifeStory/lifeEvents/personalityTraits/personalitySummary/personalityFacets/speakingStyle/values/boundaries/examples/concerns/longTermMemories/attentionFocus/derivedMood/signalProfiles`。

#### `generateSceneFromDescription`

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `description` | `string` | 管理员输入的场景素材。 |
| `current` | `CharacterState` | 当前人物状态。 |
| `llmConfig` | `LlmConfig` | LLM 配置。 |
| `onProgress` | callback? | 生成监视进度。 |

输出：`CharacterState` 预览。内部要求 Scene Interpretation LLM 输出 `scene/newConcerns/longTermMemories/personalityTraitTags/personalityFacetUpdates/attentionFocus/derivedMood/signalProfiles`。

归一化规则：生成器会限长、补 ID、clamp 数值、去重列表、避免展示字段整段照抄原文，并把新关切和长期记忆写入预览状态。

### Profile Scene Consistency: `src/pipeline/profileSceneConsistency.ts`

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `state` | `CharacterState` | 候选人物与场景组合。 |
| `llmConfig` | `LlmConfig` | LLM 配置。 |

输出：`ProfileSceneConsistencyResult`，包含 `compatible/confidence/severity/summary/mismatchReasons/requiresDistortionPassword`。如果 `severity` 是 `hard_mismatch`，必须要求扭曲时空密码。

### Seed State: `src/data/seedState.ts`

| 导出 | 参数 | 说明 | 流向 |
| --- | --- | --- | --- |
| `seedState` | `CharacterState` | 默认林安人物、关切、关系、记忆、runtime、场景和位置。 | App 初始档案、重置、新建档案模板。 |
| `seedMessages` | `ChatMessage[]` | 初始系统消息。 | 中间栏消息初始值。 |
| `defaultLlmConfig` | `LlmConfig` | 默认 DeepSeek flash 代理配置。 | App Shell。 |

### Builtin Persona Dossiers: `builtinPersonaDossiers.mjs`

| 函数 | 参数 | 说明 | 输出 |
| --- | --- | --- | --- |
| `createDossier` | `spec` | 将内置规格转换成 `PersonaDossier`。 | 内置档案条目。 |
| `createConcern` | `specId`, concern tuple, `index` | 生成关切。 | `Concern`。 |
| `createLifeEvents` | `specId`, `items` | 生成生平经历。 | `LifeEvent[]`。 |
| `createPersonaRelationships` | `items` | 生成熟人关系 map。 | `Record<string, Relationship>`。 |
| `createLocation` | location tuple | 生成位置和地图上下文。 | `CharacterLocation`。 |
| `buildSignalProfiles` | `spec` | 生成四项 runtime 信号说明。 | `Record<RuntimeSignalKey, RuntimeSignalProfile>`。 |

输出常量 `builtinPersonaDossiers` 被 `serverSupport.readBasePersonaDossiers` 合并到共享档案底稿。

### Server Support: `serverSupport.mjs`

| 函数 | 参数 | 说明 | 输出或副作用 |
| --- | --- | --- | --- |
| `createLocalSession` | `liaoUser` | 将 liao 登录返回转换成本项目本地会话。 | `{ token, user, expiresAt }`，写内存 `authSessions`。 |
| `destroyLocalSession` | `token` | 删除本地会话。 | 内存副作用。 |
| `getRequestSession` | `request` | 从 Authorization Bearer token 读会话。 | session 或 `undefined`。 |
| `requireSession` | `request`, `response` | 登录保护。 | session 或 401。 |
| `requireAdminSession` | `request`, `response` | 管理员保护。 | session 或 401/403。 |
| `loginWithLiaoChatroom` | `username`, `password` | 调 liao `/api/login`。不保存密码。 | liao user payload。 |
| `readPersonaDossiers` | `user?` | 读取内置 + 共享档案，可叠加角色全局运行态。 | `PersonaDossier[]`。 |
| `upsertPersonaDossier` | `dossier`, `user` | 管理员保存共享档案。 | 写 `.persona-dossiers.local.json`。 |
| `deletePersonaDossier` | `dossierId` | 删除共享档案；内置档案用 tombstone。 | 写 `.persona-dossiers.local.json`。 |
| `updatePersonaDossierPreview` | `dossierId`, `previewSummary`, `user` | 保存全局短预览。 | 写 `.persona-dossiers.local.json`。 |
| `updatePersonaDossierConversationState` | `dossierId`, `nextState`, `interaction`, `user` | 保存当前角色全局运行态，并传播关系余波。 | 写 `.conversation-states.local.json`。 |
| `readConversationHistoryMessages` | `dossierId`, `user` | 读取当前用户当前人物消息历史。 | `ChatMessage[]`。 |
| `readConversationHistorySummaries` | `dossierId` | 管理员列出某人物下所有用户历史摘要。 | summary list。 |
| `readConversationHistoryMessagesByKey` | `dossierId`, `key` | 管理员按 key 读取某用户某人物消息。 | `ChatMessage[]`。 |
| `readConversationRoomMessages` | `dossierId` | 合并同一角色下所有用户私有历史，生成房间时间线。 | 去重并按时间排序的 `ChatMessage[]`。 |
| `appendConversationHistoryMessages` | `dossierId`, `messages`, `user` | 追加保存消息历史。 | 写 `.conversation-histories.local.json`。 |
| `appendConversationAudit` | `entry`, `user` | 保存输入、输出、状态和模块调用。 | 写 `.conversation-audits.local.json`。 |
| `readConversationAudits` | `limit=200` | 读取最近审计。 | 审计列表。 |
| `deleteConversationAudit` | `auditId` | 删除单条审计。 | 写审计文件。 |
| `clearConversationAudits` | 无 | 清空审计。 | 写审计文件。 |
| `readAppUpdateStatus` | 无 | 读取 git 当前提交、远端提交和版本。 | `AppUpdateStatus`。 |
| `streamAppUpdate` | `response` | SSE 执行 fetch/pull/npm ci/build/restart。 | 更新日志 SSE。 |
| `sendJson` | `response`, `statusCode`, `data` | JSON 响应工具。 | HTTP response。 |
| `readJsonBody` | `request` | 读取 JSON body。 | parsed object。 |
| `isSameToken` | `a`, `b` | 安全比较 token。 | boolean。 |

运行时文件参数：

| 文件 | 数据 | 说明 |
| --- | --- | --- |
| `.persona-dossiers.local.json` | `{ dossiers, deletedBuiltinDossierIds }` | 管理员共享档案和内置档案 tombstone。 |
| `.conversation-states.local.json` | `{ entries }` | 当前用户 + 当前档案的私有人物运行态。 |
| `.conversation-histories.local.json` | `{ entries }` | 当前用户 + 当前档案的中间栏消息。 |
| `.conversation-audits.local.json` | `{ entries }` | 输入输出审计和模块调用。 |
| `.deepseek.local.json` | `{ apiKey, endpoint, model, savedAt }` | DeepSeek 本地密钥文件，必须保持 git ignored。 |

### Production Server: `server.mjs`

生产服务参数来自 HTTP request、环境变量、运行时 JSON 文件和 `dist/`。

| 路由 | 方法 | 入参 | 权限 | 输出 |
| --- | --- | --- | --- | --- |
| `/health` | GET/HEAD | 无 | 无 | `OK`。 |
| `/api/auth/session` | GET | Bearer token? | 无 | `{ authenticated, user }`。 |
| `/api/auth/login` | POST | `{ username, password }` | 无 | `{ success, token, user, expiresAt }`。 |
| `/api/auth/logout` | POST | Bearer token? | 无 | `{ success: true }`。 |
| `/api/persona-dossiers` | GET | Bearer token | 登录 | `{ dossiers }`。 |
| `/api/persona-dossiers` | POST | `{ dossier }` | 管理员 | `{ dossier }`。 |
| `/api/persona-dossiers/:id/preview` | POST | `{ previewSummary }` | 登录 | `{ dossier }` 或 error。 |
| `/api/persona-dossiers/:id/conversation-state` | POST | `{ state, interaction }` | 登录 | `{ dossier, dossiers }` 或 error。 |
| `/api/persona-dossiers/:id/conversation-history` | GET | path `id` | 登录 | `{ messages }`。 |
| `/api/persona-dossiers/:id/conversation-history` | POST | `{ messages }` | 登录 | `{ messages }`。 |
| `/api/admin/conversation-histories` | GET | query `dossierId`, optional `key` | 管理员 | `{ summaries }` 或 `{ messages }`。 |
| `/api/persona-dossiers/:id` | DELETE | path `id` | 管理员 | `{ deleted }`。 |
| `/api/conversation-audits` | POST | audit entry | 登录 | `{ entry }`。 |
| `/api/conversation-audits` | GET | 无 | 管理员 | `{ entries }`。 |
| `/api/conversation-audits` | DELETE | 无 | 管理员 | `{ deleted }`。 |
| `/api/conversation-audits/:auditId` | DELETE | path `auditId` | 管理员 | `{ deleted }`。 |
| `/api/deepseek-config` | GET | 无 | 无 | `{ apiKeySaved, endpoint, model }`。 |
| `/api/deepseek-config` | POST | `{ apiKey, model }` | 管理员 | 保存 key。 |
| `/api/app-update/status` | GET | 无 | 无 | `AppUpdateStatus`。 |
| `/api/app-update/run` | POST | Bearer token | 管理员 | SSE 更新日志。 |
| `/api/deepseek-chat` | POST | `model/moduleName/inputMode/outputMode/prompt/outputContract?/stream?` | 登录 | JSON 或 SSE。 |
| static fallback | GET/HEAD | pathname | 无 | `dist/` 静态文件或 `index.html`。 |

环境变量参数：

| 参数 | 说明 |
| --- | --- |
| `PORT` | 生产服务端口，默认 `4174`。 |
| `HOST` | 生产监听地址，默认 `127.0.0.1`。 |
| `DEEPSEEK_API_KEY` | 可作为 `.deepseek.local.json` 外的运行时密钥来源。 |
| `LIAO_CHATROOM_ORIGIN` | liao 聊天室登录源。 |
| `APP_UPDATE_WORKDIR` | VPS git 工作目录。 |
| `APP_UPDATE_BRANCH` | 更新分支，默认 `main`。 |
| `APP_UPDATE_RESTART_COMMAND` | 自定义重启命令。 |
| `APP_UPDATE_PM2_NAME` / `PRODUCTION_PM2_NAME` | PM2 进程名。 |

### Vite Dev Proxy: `vite.config.ts`

开发代理复用大部分生产 API 和 DeepSeek proxy 参数。当前文件包含 auth、persona dossiers、conversation state/history、shared conversation histories、conversation audits、DeepSeek config、app update、DeepSeek chat 等路由。生产服务和开发代理都提供 `/api/conversation-histories`，并保留 `/api/admin/conversation-histories` 作为兼容别名。

DeepSeek proxy 参数：

| 参数 | 来源 | 说明 |
| --- | --- | --- |
| `body.model` | 前端请求 | 请求模型；`deepseek-reasoner` 被改成 `deepseek-v4-flash`。 |
| `body.moduleName` | 前端请求 | 模块名，用来决定非结构化回复是否包装成 `{ reply }`。 |
| `body.inputMode` | 前端请求 | 透传记录，目前 proxy 主要使用 `prompt`。 |
| `body.outputMode` | 前端请求 | `structured_json` 或 `natural_language`。 |
| `body.prompt` | 前端请求 | 发给 DeepSeek 的用户消息。 |
| `body.outputContract` | 前端请求 | 结构化 JSON 模块的系统约束补充。 |
| `body.stream` | 前端请求 | 是否流式。 |
| `apiKey` | `.deepseek.local.json` 或环境变量 | Authorization Bearer。 |
| `thinking` | proxy 固定 | `{ type: "disabled" }`，关闭思考模式。 |
| `response_format` | proxy 派生 | 结构化模块为 `json_object`，自然语言为 `text`。 |
| `temperature` | proxy 固定 | `0.4`。 |
| `max_tokens` | proxy 派生 | 结构化 `2600`，自然语言 `700`。 |

### Core Utils: `src/core/utils.ts`

| 函数 | 参数 | 说明 | 输出 |
| --- | --- | --- | --- |
| `clamp` | `value`, `min`, `max` | 数值夹紧。 | number。 |
| `makeId` | `prefix` | 生成随机 ID。 | `${prefix}_...`。 |
| `nowIso` | 无 | 当前 ISO 时间。 | string。 |
| `round` | `value` | 保留两位小数。 | number。 |

### Verification Scripts

| 脚本 | 入参 | 验证边界 |
| --- | --- | --- |
| `scripts/verify-cognitive-module-fallback.mjs` | 无 | 结构化 SSE JSON 截断时认知模块 fallback。 |
| `scripts/verify-global-conversation-state.mjs` | 无 | 用户 A 写入角色运行态后，用户 B 和全局读取都能承接；中间栏消息仍按用户隔离。 |
| `scripts/verify-conversation-message-history.mjs` | 无 | 消息历史按用户和档案保存读取。 |
| `scripts/verify-admin-history-and-module-audit.mjs` | 无 | 共享角色历史查看和管理员模块审计记录。 |
| `scripts/verify-user-relationship-memory.mjs` | 无 | 当前用户关系印象记忆写入和回填关系备注。 |
| `scripts/verify-temporal-scene-and-reply-segments.mjs` | 无 | 时间场景推进、现场事件活动 streaming/解析、回复分段和动作旁白清洗。 |

## 参数级数据流

### 对话发送到状态保存

1. 用户输入框 `input` 和渠道选择器 `conversationChannel` 进入 `handleSend`。
2. `handleSend` 用 `activeConversationSpeaker` 生成 `speaker.id/name`，把带 `channel/channelLabel` 的用户消息写入当前用户私有历史桶和本地房间时间线桶。
3. `runConversationPipeline` 接收 `content/channel/state/llmConfig/speaker/debug/onProgress`，生成带渠道的 `EventInput`。
4. `advanceSceneForCurrentTime` 根据人物位置时区和真实时间推进 `scene/location`。
5. `runRoleTurn` 接收 `event/sceneAwareState/llmConfig`，一次性输出 `RoleTurnResult.innerStateNarrative/memoryNarrative/decisionNarrative/replyOutput`。
6. `buildAppraisalTraceFromRoleTurn`、`buildMemoryTraceFromRoleTurn` 和 `buildDecisionTraceFromRoleTurn` 生成兼容 trace，供 UI、审计和 State Update 读取。
7. `ReplyOutput.reply` 来自 `roleTurn` 的“说出口”段落，并剥离开头动作旁白和说话人标签；`replyOutput.segments` 由本地分段生成。
8. State Updater 接收 `state/event/replyOutput/context/llmConfig`，输出自然语言 `StateUpdatePlan.narrative` 和兼容壳，写回 `nextState` 和 `StateDelta`。
9. Runtime Signal Evaluator 接收 `stateAfterUpdate/event/replyOutput/context/llmConfig`，输出四项观察信号快照；值来自 State Update 已写入的 `nextState.runtime`。
10. 如果 `debug.roleTurnProbeEnabled` 为真，`runRoleTurnProbe` 在 `stateDelta` 完成后旁路审计；关闭时不调用。
11. `handleSend` 把折叠后的真实心理流记录和回复消息写入当前用户私有历史桶和本地房间时间线桶；当前 UI 继续使用 streaming 时生成的折叠卡。
12. `persistConversationHistoryMessages` POST 当前用户和当前档案消息到 `.conversation-histories.local.json`，其中包含渠道标签、折叠心理流详情和回复；随后房间读取可通过 `readConversationRoomMessages` 聚合所有用户。
13. `syncConversationState` POST `nextState + interaction` 到 `.conversation-states.local.json`，并在当前用户范围内传播关系余波。
14. `recordConversationAudit` POST `PipelineTrace` 派生的 `moduleCalls` 到 `.conversation-audits.local.json`。

### 现场事件到活动卡

1. 用户在中间栏 `eventTextInput` 输入现场事件文字并提交，例如“杯子掉了”。
2. `handleTriggerRoomEvent` 构造 `room_event` `EventInput`，并设置 `channel: "scene_event"` / `channelLabel: "现场事件"`，不把它当作用户聊天消息。
3. `advanceSceneForCurrentTime(state,event)` 先按角色所在地真实时间校准可信 `scene/location/runtime.attentionFocus`。
4. `handleTriggerRoomEvent` 先插入一条临时 `event_activity` 房间消息。
5. `runEventActivity(event,sceneAwareState,progression,llmConfig,onStream)` 调用事件活动 LLM；`onStream` 持续更新该活动卡内容。
6. LLM 完成后，`formatEventActivityDetails` 把心理、动作、位移、关系、记忆和外显输出整理为可展开详情。
7. App Shell 将临时卡替换为折叠活动卡，写入短期记忆、当前用户私有历史和角色全局运行态。
8. 之后 `readConversationRoomMessages(dossierId)` 会把这条活动卡合并进房间时间线，供其他用户或未来虚拟人承接。

### 人物档案生成到共享保存

1. 管理员编辑 `dossierDescription`。
2. `handleGenerateDossier` 调 `generateDossierFromDescription(description,current,llmConfig,onProgress)`。
3. Dossier Interpretation LLM 输出结构化档案解释。
4. 生成器归一化字段，产生 `dossierPreview: CharacterState`。
5. 管理员点击应用，`applyCandidateState` 调 `evaluateProfileSceneConsistency(candidate,llmConfig)`。
6. 如果硬冲突，`consistencyGate` 等待 `distortionPassword`。
7. 通过后 `commitCandidateState` 更新当前 `PersonaDossier.state/title/updatedAt`。
8. `persistPersonaDossier` POST `{ dossier }` 到 `.persona-dossiers.local.json`。

### 场景生成到共享保存

1. 管理员编辑 `sceneDescription`。
2. `handleGenerateScene` 调 `generateSceneFromDescription(description,current,llmConfig,onProgress)`。
3. Scene Interpretation LLM 输出结构化场景解释。
4. 生成器把 `scene/newConcerns/longTermMemories/personalityTraitTags/personalityFacetUpdates/runtime` 合入预览状态。
5. 应用路径与人物档案相同：一致性检测、可能门禁、提交当前档案、保存共享档案。

### 登录和权限

1. `handleLogin` POST `{ username, password }` 到 `/api/auth/login`。
2. Server Support 调 `LIAO_CHATROOM_ORIGIN/api/login` 校验。
3. `createLocalSession` 生成本地 token、`AuthUser` 和过期时间。
4. 前端把 token 存入 localStorage，并写入 `llmConfig.authToken`。
5. 后续需要登录或管理员的接口通过 `requireSession` / `requireAdminSession` 检查 Bearer token。

### DeepSeek 调用

1. `roleTurn`、State Update、生成器或旧兼容 Reply LLM 通过 `config.endpoint` POST `/api/deepseek-chat`。
2. 请求 body 包含 `model/moduleName/inputMode/outputMode/prompt/outputContract?/stream?`。
3. proxy 读取 `.deepseek.local.json` 或 `DEEPSEEK_API_KEY`。
4. proxy 组装 DeepSeek Chat Completions：system message、user prompt、`response_format`、`thinking: disabled`、`stream`。
5. 非流式时返回 JSON、自然语言文本或旧 reply `{ reply }`；流式时发送 `{ delta }`，结束时发送 `{ final }`。
6. 结构化输出解析失败时，proxy 发送 error；`runCognitiveModule` 对结构化模块使用 fallback。

## 人工审核重点

| 审核点 | 应看参数 |
| --- | --- |
| Role Turn 是否充分使用自然语言上下文 | `roleTurn.request.prompt`、`RoleTurnResult` 四段自然语言、`replyOutput.reply`。 |
| 用户隔离是否正确 | `speaker.id`、`createConversationHistoryKey`、`createConversationHistoryEntryKey`、`.conversation-states.local.json` entries。 |
| 关系印象是否按当前用户保存 | `StateUpdatePlan.userRelationshipMemory.targetUserId`、`RelationshipMemory.targetUserId`。 |
| 记忆召回是否不是敏感词过滤 | `roleTurn.request.prompt` 内的最近对话/长期候选、`MemoryRecallResult.naturalLanguageQuery`、`longTermMemories`。 |
| 生成档案是否照抄原文 | `compactText/isRawCopy`、`displaySummary/background/fullLifeStory`。 |
| 场景和人物是否同世界观 | `ProfileSceneConsistencyResult.severity/requiresDistortionPassword`。 |
| 审计是否能复盘模块链 | `PipelineTrace`、`ConversationModuleCall.input/output/status/transport`。 |
| 开发和生产 API 是否同步 | `server.mjs` 与 `vite.config.ts` 路由表，尤其共享角色历史和管理员审计接口。 |
