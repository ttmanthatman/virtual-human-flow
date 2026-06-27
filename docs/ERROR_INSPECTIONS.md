# Error Inspections

本文档记录用户指出错误后的勘验、根因和流程修正。目的不是追责，而是防止同类错误反复出现。

## 错误精髓摘要

每轮启动时优先读本节，而不是通读全部历史记录。下面的详细勘验只在遇到相似问题、需要查证证据或准备合并摘要时读取。

- 文档、版本、提交和推送也是产品行为。完成一个 reviewable step 时，不能只看实现是否完成；必须检查版本号、验证、提交、推送和最终状态是否都落地。
- 外部登录源不能写死单一路径或单一响应形状；liao 这类独立站点改登录 API 时，本项目必须用 live 探针确认当前路径，并用契约验证覆盖新旧响应归一化、路径回退和账号密码失败不误回退。
- 站内更新提示不能只显示“有新版本”和提交 SHA；状态接口、前端浮窗和提交信息必须共同提供可读变更摘要，说明修改了什么、改进了什么。
- 站内更新按钮不能把权限门禁写成原生禁用状态；发现新版本时按钮应保持可点击并进入登录/管理员校验反馈，否则未登录、登录态未恢复或权限状态漂移时会表现成“按钮坏了”。
- 用户指出错误时，先判断错误发生的边界：规则理解、实现边界、验证标准、权限视角、记录粒度、上下文承接，不能直接跳到修代码。
- 修复长期记忆、历史、档案或角色状态时，必须先分清共享底稿、用户私有消息历史、角色全局运行态、管理员只读观察入口，避免把隔离和可观察性混成一件事。
- 当产品要求“同一角色全局对应多个用户历史”时，写入仍按 `userId + dossierId` 进当前用户私有桶，但浏览入口要按 `dossierId` 只读列出/读取所有用户历史；不能被管理员专属门禁或前端空缓存挡住。
- Reply LLM 的边界必须保持纯自然语言：只接收自然语言语境，只输出角色台词；结构化契约、字段名、调试外壳和工程术语不能进入角色表达链路。
- 同步对话的认知模块不能靠本地关键词、正则、数值阈值或 JSON 字段替 LLM 做关系/状态判断；Appraisal、Memory Recall、Decision 和 State Update 的语义主干必须是自然语言 narrative，兼容字段只能服务 UI/审计/持久化。
- 重复表白、亲密推进、拒绝越界和承诺兑现要按关系递进承接；最近角色台词可以作为上下文，但表达模块必须避免机械照抄上一轮完整回复。
- 人物属性、场景叙述和状态信号只能描述内在状态、成因、身体感、注意力和关系距离，不能写成“应该怎么回复”的直接话术指令。
- 角色真实性验证不能只看单轮台词是否像设定，还要看跨场景承接、承诺兑现、危险处理、照护行为、拒绝越界和重大事件的情绪权重。
- 场景真实性必须随人物所在地真实时间和对话触发推进：工作、睡眠、通勤、住处和外出都要受人物职业、地理位置和世界观约束；未来计划或远距离地点不能让人物瞬移。
- 连续回复不能只在 Appraisal/Decision 里有 `multi_turn/burst` 参数；Reply 输出、分段归一化、UI 展示、历史保存和审计都要承接，否则用户仍只会看到一条短回复。
- 重大事件的余波必须跨轮承接：长期记忆、关系记忆、运行时信号、Appraisal 和 Decision 都要保留冲击权重；不能让下一轮普通邀约或工作场景把角色压回“礼貌工作状态”。
- 重大事件余波也要识别事实澄清：孩子/家人安全被澄清时，直接现实危险必须下降，但被戏弄、失信、确认需求和关系愤怒仍要承接；不能在“严重余波”规则里无限复读旧危险指令。
- 后台“删除记录”不能只删除可见审计条目；如果记录已经写入用户历史、角色短期/长期记忆或关系记忆，删除语义必须说明并级联清理关联运行态，且验证要覆盖这些 runtime 文件。
- 后台删除审计后，前端不能把 localStorage 旧历史当作回填来源重新写回服务器；登录用户历史以服务端返回为准，返回空历史时必须同步清空内存消息桶和浏览器缓存。
- 真实 LLM 的结构化输出必须有确定性归一化和 fallback，验证要覆盖模型形状漂移、截断、不可解析 JSON 以及 UI 是否仍能继续工作。
- 同步对话 pipeline 不能让多个模块重复评估并覆盖同一份 runtime 状态；State Update 负责落盘和 runtime 展示信号写入，Runtime Signal Evaluation 只保留本地快照和 trace，不再同步外部复判覆盖。
- 严重余波升级不能只看 `energy/valence` 或“强烈负面/痛苦/警报”等标签；必须能在近期同一关系的短期记忆、关系记忆、长期记忆或召回叙述里找到重大事件证据。
- 短期上下文必须有时间感和说话者边界；跨天、跨用户或非同一角色的历史不能被写成“刚才说过”，也不能进入当前角色的自然短期浮现。
- 消息必须带现实渠道和物理在场约束。微信、短信、电话、门外、面对面和现场事件不能混成“用户在房间里说话”；私密住处里的异常面对面输入应让人物意识到不合现实，而不是自然回复。
- 非聊天触发应输入现场事件本身，而不是让用户手动输入时间跳转。真实时间只用来校准角色当前生活现场，事件活动由 `eventActivity` 生成心理、动作、位移、关系和记忆。
- 现场事件如果产生持续行动，必须写入 `runtime.currentActivity` 并由时间场景推进优先承接；不能只把事件活动写进短期记忆，否则人物会记得电话却仍被 routine 拉回旧位置。
- `runtime.currentActivity` 不是写入后直到过期才不可变；后续对话中角色明确改变去向、孩子安全事实被更新或旧任务被新生活行动取代时，State Update 必须能覆盖/清理当前活动，避免旧“上班/通勤”继续支配位置。
- 中间栏当前上下文标签不能直接裸露档案长期关切；应优先显示当前活动或注意力焦点，长期关切留在侧栏详情，否则会把“高峰安检秩序/女儿放学没人接”这类背景心事误读成当下事件。
- 中间栏 streaming 的心理流必须来自真实 pipeline progress，并在折叠后保存为历史记录；不能只做回复后的假摘要，也不能刷新后消失。
- Reply LLM 的最终台词要剥离动作旁白和说话人标签；动作可以进心理流或 UI，但不能持久化进 `personaOutput` 当作真实聊天话语。
- 弹窗、侧栏、记录列表这类受限容器必须同时验证“内容很多”时的可滚动性；grid/flex 子项需要明确 `min-height: 0` 或可分配高度，避免父级裁剪掉内容。
- 错误记录要合并成可复用原则。新错误优先更新本摘要；只有出现新的错误类别、需要保留关键证据或修复路径时，才新增详细勘验。相同类别的后续错误应合并摘要或补一条短证据，不无限累加。

## 2026-06-27 liao 账号不能登录本聊天室

### 用户指出的问题

用户指出本聊天室不能再使用 `liao.xiaogushi.us` 的账号登录，并要求后续支持从 liao 直接跳转到本项目、本项目也能跳回聊天室。

### 错误类型

- 外部契约漂移：本项目仍固定请求 liao 旧 `/api/login`，而 liao 当前前端已改为 `/api/auth/login`。
- 响应形状假设过窄：旧代码只认顶层 `success/token/userId/isAdmin`，没有兼容当前 `{ token, account }`。
- 衔接入口缺失：App Shell 没有显式跳回 liao 的入口，也没有识别从 liao 跳转过来的登录意图。

### 根因

live 探针显示 `https://liao.xiaogushi.us/api/login` 在 2026-06-27 返回 404 `Not found`，而 `https://liao.xiaogushi.us/api/auth/login` 返回登录接口语义响应。之前的验证只覆盖本项目本地会话与权限门禁，没有覆盖上游 liao 登录路径、响应形状或真实站点契约。

### 修正

1. `loginWithLiaoChatroom` 优先请求 `/api/auth/login`，仅在 404/405 时回退旧 `/api/login`；401 账号密码失败不回退，保留真实错误。
2. 新增 liao 登录响应归一化，兼容当前 `{ token, account }` 和旧顶层用户字段，再创建本项目本地 session；上游 token 仍不返回前端。
3. App Shell 顶部和登录浮窗增加 `liao.xiaogushi.us` 跳转入口；URL 带 `?from=liao` 或 `?login=liao` 时自动打开登录浮窗。

### 新增验证标准

- `npm run verify:liao-auth-bridge` 覆盖当前 liao 响应形状、旧路径 fallback、账号密码失败不 fallback。
- 登录问题排查时先用不含真实账号密码的 live 探针确认上游路径和错误形状，再修改本项目代理。

## 2026-06-12 现场事件活动没有变成持续行动

### 用户指出的问题

用户指出触发事件里的时间和行动没有真正影响人物说话与位置：孙小雅接到领导催她快去上班的电话后，后续仍像停在家里鞋柜旁边。用户进一步要求记住“人可以是一直在动的”，并在触发事件旁边增加查看人物现在在做什么的功能。

### 错误类型

- 状态承接错误：事件活动卡记录了心理、动作和位移，但没有写成可被后续时间推进读取的持续活动。
- 诊断边界错误：审计能看到主脑召回了领导电话，所以不能简单归咎于 Memory Recall；真正断点在活动意图没有进入 `runtime`。
- 可观察性缺失：中间栏只能看到事件活动，不知道当前全局人物到底在做什么、是否已经开始移动。

### 根因

`eventActivity` 生成的自然语言活动被写入短期记忆和房间活动卡，但 `advanceSceneForCurrentTime` 只读取时钟、地点和人物职业 routine。郑州安检员在 14:xx 的 routine 会被判断为 home，于是即使角色心理知道刚才领导来电，场景校准仍把她留在住处。记忆系统提供了“刚才发生了什么”，但位置和行动系统没有“她现在正在做什么”的状态层。

### 修正

1. 新增 `RuntimeCurrentActivity` / `runtime.currentActivity`，记录持续活动的状态、摘要、来源事件、开始时间、预期有效期、位置和移动信息。
2. `handleTriggerRoomEvent` 在 `runEventActivity` 完成后调用 `deriveCurrentActivityFromEventActivity`，把紧急上班、移动、休息或普通现场处理写入角色全局运行态。
3. `advanceSceneForCurrentTime` 在 routine 前优先读取未过期 `runtime.currentActivity`；紧急上班会先进入准备出门，几分钟后进入通勤，再回到工作责任，不再停在鞋柜旁边。
4. App Shell 在触发事件旁新增“查看现在”，用 `internal_trigger` 推进真实时间并把 `formatCurrentActivitySnapshot` 的位置、移动状态和当前活动保存成折叠活动卡。
5. 后续补充：同步对话里的 State Update 自然语言写回也能替换旧 `runtime.currentActivity`。当最近对话显示女儿已被接到、角色说自己出门去小区门口烧烤店会合时，系统把旧“去上班”持续活动替换为附近生活会合活动；“查看现在”触发的场景推进也会用近期短期记忆校正未过期旧活动。
6. 后续补充：中间栏顶部上下文标签改为展示当前活动/注意力焦点，不再重复左侧长期关切，避免把档案背景当成当下现场。

### 新增验证标准

- `npm run verify:temporal-scene-and-reply-segments` 增加郑州安检员收到“领导催快来上班”事件后的持续活动断言：1 分钟内进入准备出门，几分钟后进入通勤，不允许继续静止在鞋柜旁边。
- `npm run verify:temporal-scene-and-reply-segments` 增加烧烤店会合对话断言：旧上班活动必须被附近会合移动替换；即使只点击“查看现在”，场景和注意力也不能再显示上班/通勤。

## 2026-06-12 渠道缺失、现场事件误作时间触发、心理流未持久

### 用户指出的问题

用户指出三个真实性断点：用户给回到家后的孙小雅发消息时，系统不区分面对面、短信、微信、电话或门外，导致人物像在普通聊天室里自然回复；事件触发仍是输入时间，而用户真正需要输入的是“杯子掉了”这类现场事件；中间栏 streaming 的心理活动需要是真实探针/主脑过程并做记录，而不是出完消息后的装饰摘要。

### 错误类型

- 现实边界错误：对话事件缺少渠道字段，主脑无法判断说话者是否物理在场。
- 触发模型错误：非聊天事件被设计成时间跳转入口，而不是现场环境事件入口。
- 记录粒度错误：心理流只被当作当前轮 UI 动画，没有作为可回看的运行记录进入历史。

### 修正

1. 新增 `ConversationChannel`、渠道选择器和 `conversationChannels` helper，把渠道标签和物理在场约束写入 `EventInput`、`ChatMessage`、`roleTurn` prompt、审计输入和短期记忆。
2. 将时间输入框替换为现场事件文字输入，`handleTriggerRoomEvent` 构造 `room_event`/`scene_event`，真实时间只用于校准当前现场。
3. 将折叠后的 `mind_flow` 消息作为非 transient 历史记录保存，服务端 sanitizer 保留 `messageType/details/channelLabel`。
4. 新增默认关闭的“显示旧兼容管线”开关，隐藏评估、记忆召回、回应决策、表达和信号等兼容视图，避免它们继续被误认为当前主脑路径。

### 新增验证标准

- `npm run verify:mind-flow-streaming` 验证微信渠道会进入主脑 prompt 和短期记忆，私密场景中的面对面输入会触发异常在场约束。
- `npm run verify:temporal-scene-and-reply-segments` 验证现场事件文字进入 `eventActivity` prompt。
- `npm run verify:conversation-message-history` 验证渠道标签和折叠心理流会被历史保存和房间时间线读取。

## 2026-06-11 王佳宁重复表白后机械复读

### 用户指出的问题

用户提供 admin 与王佳宁聊天记录：第一次表白后王佳宁回复“你这话我当没听见。赶紧收收，店里人多嘴杂的。”；中间用户又提出帮忙；随后用户用更长、更认真的话再次表白并提出处男女朋友，王佳宁仍原样复读同一句拒绝。用户进一步要求每个 pipeline 环节去掉关键词触发，由 LLM 用自然语言评估，并让 Prompt Builder 与 Reply LLM 合并为统一表达模块。

### 错误类型

- 模块职责错误：本地关键词/正则和结构化 JSON 字段抢先决定触动、路由、状态写回，LLM 只是在填结构。
- 上下文承接错误：短期记忆把上一轮角色台词原样放进 Reply 上下文，但表达模块没有“承接而非照抄”的约束。
- 架构边界错误：Prompt Builder 被当成独立 pipeline 环节展示，实际它应只是 Reply LLM 前的自然语言上下文整合。

### 根因

Appraisal 先用 concern triggers 做本地命中；Decision 又用 severe/casual/child-safety 等本地正则和数值阈值做路由修正；Memory Recall 要求 LLM 复判 ID；State Update 要求结构化 JSON delta。最后 Reply Prompt 带入最近角色原话却缺少防复读承接，导致同一关系事件递进时模型容易把上一句拒绝当成最佳模板复用。

### 修正

1. Appraisal、Memory Recall、Response Decision 和 State Update 改为自然语言 LLM 输出，不再要求同步对话认知模块输出 JSON 字段。
2. Memory Recall 使用最近 6 小时最多 10 条短期对话，加过去 6 小时关系、状态和场景摘要；长期/关系记忆作为自然语言候选，是否浮现由 LLM narrative 决定。
3. Prompt Builder 并入统一表达模块 `runExpressionLlm`，pipeline 不再把 Prompt Builder 当独立决策环节；表达上下文要求承接上一轮边界但避免照抄完整台词。
4. State Update 用自然语言状态写回驱动关系记忆和长期记忆候选写入；兼容数值只服务 UI 展示。
5. 同步时间场景推进不再用用户原话关键词触发移动或阻止瞬移；对话引发的行动意图交给 LLM 模块自然语言判断。

### 新增验证标准

- `npm run verify:mind-flow-streaming` 验证 Appraisal、Memory Recall、Decision 和 State Update 可用自然语言 SSE 输出驱动完整心理流和回复分段。
- `npm run verify:user-relationship-memory` 验证 State Update 的自然语言叙述写入当前用户关系记忆，不依赖 JSON delta 字段。
- `npm run build` 覆盖统一表达模块和自然语言认知链的类型/生产构建。

## 2026-06-11 同角色多用户历史查看为空

### 用户指出的问题

用户登录 admin，切换到孙小雅后选择查看 Qoo 的聊天历史，中间栏没有显示内容；用户进一步明确产品语义应是“一个角色全局对应多个用户”，也就是任一用户都可以看到其他用户与这个角色的聊天。

### 错误类型

- 权限视角错误：历史查看仍被实现和文档描述成管理员专属观察入口，没有承接“登录用户共享只读查看”的新产品边界。
- 前端缓存错误：选择某个历史时，如果本地共享历史桶已经存在为空数组，后续不会根据服务端摘要重新拉取，容易把真实存在的历史显示成空。
- 验证标准错误：已有验证覆盖了服务端管理员读取和私有写入隔离，但没有覆盖同一角色下多个用户历史都能被共享只读入口读取。

### 根因

此前为了防止用户串线，把默认中间栏历史严格按当前 `userId + dossierId` 加载，这是写入边界的正确做法；但读取入口没有从“管理员审查”升级为“同角色多用户共享只读浏览”。前端还用历史 key 做缓存命中，只要本地有空数组就跳过请求，导致后续即使 Qoo 在该角色下已有历史，也可能继续展示空中间栏。

### 修正

1. 新增登录用户可用的 `/api/conversation-histories`，按 `dossierId` 列出所有用户历史摘要，按 `dossierId + key` 只读读取某个用户消息；旧 `/api/admin/conversation-histories` 保留兼容但同样只要求登录。
2. App Shell 将管理员历史选择器改成共享角色历史选择器，所有登录用户可见；查看其他用户历史时禁用发送，切回“我的历史”后才能写入自己的消息桶。
3. 选择历史时，如果本地缓存为空但服务端摘要显示该用户有消息，会强制重新拉取，避免空缓存挡住真实历史。

### 新增验证标准

- `npm run verify:admin-history-and-module-audit` 增加同一角色下 Qoo 和 Yuki 两个用户历史都能被按 key 只读读取的断言，同时保留当前用户普通历史读取不串到他人消息的断言。

## 2026-06-11 同步 pipeline 模块重复复判并让普通邀约误升级

### 用户指出的问题

用户指出 Appraisal、Memory Recall、State Update、Runtime Signal Evaluation 和 Response Decision 存在职责重叠：规则/确定性层已经完成大部分判断，LLM 模块常被用作复判或润色；Runtime Signal Evaluation 又在 State Update 之后覆盖刚写入的 `runtime`；普通邀约会被 severe 标签硬抬成失态路线。用户还指出 Reply prompt 过大、同步 LLM 调用串行导致延迟叠加。

### 错误类型

- 模块职责错误：状态写回和运行时信号展示重复拥有同一份 `runtime` 写权限。
- 上下文边界错误：过期短期记忆和跨人物记忆会进入当前轮自然语境。
- 验证标准错误：只验证严重余波不会被抹平，没有验证 severe-looking 标签缺少近期重大事件证据时不能误升级。

### 根因

此前为了防止重大事件余波被普通邀约抹平，把 `stabilizeDecisionForCurrentState` 写成主要依赖 runtime 标签和低能量阈值；而 Runtime Signal Evaluation 又是外部 LLM 复判，可能生成和 State Update 不一致的标签/摘要，导致下一轮被标签误导。短期记忆格式化统一写“刚才”，没有按事件时间和说话者过滤。Reply LLM 虽要求只输出台词，但出口没有剥离动作旁白。

### 修正

1. 新增 `conversationContext`，统一短期对话窗口、说话者格式和 Reply 台词清理。
2. `Runtime Signal Evaluation` 改成本地读取 State Update 已写入的 runtime 快照，不再同步调用外部 LLM。
3. State Update 同步写入一致的 `energy/derivedMood/signalProfiles` 文案，避免标签和摘要互相矛盾。
4. Response Decision 的严重余波升级新增近期重大事件证据门槛。

### 新增验证标准

- `npm run verify:severe-state-continuity` 增加 severe-looking runtime 但无近期重大事件证据时不能升级爆发的断言。
- `npm run verify:temporal-scene-and-reply-segments` 增加 Reply 输出剥离括号动作旁白的断言。
- `npm run verify:mind-flow-streaming` 增加同步对话不再外部调用 `runtime_signal_evaluation` 的断言。

## 2026-06-10 孙小雅安全澄清后陷入旧危险循环且审计删除不级联

### 用户指出的问题

Qoo 和孙小雅对话里，Qoo 先制造“女儿在车上/看不见”的危险感，后面又澄清“女儿在家，已经写完作业”。孙小雅随后面对“周末一起去爬山吗？”仍复读“你下来，指给我看”，像陷入发疯循环。用户同时指出后台删除的记录并没有真正删除。

### 错误类型

- 上下文承接错误：严重余波规则只会防止降权，没有识别“安全澄清”会改变事实层。
- 回复生成边界错误：Prompt 同时带入重复旧台词、关系余波和记忆浮现，但缺少“事实已经澄清”的自然语言承接。
- 删除语义错误：审计删除只删 `.conversation-audits.local.json`，没有级联清理 `.conversation-histories.local.json` 和 `.conversation-states.local.json` 中的同轮历史与记忆。

### 根因

审计显示，Appraisal/Decision 仍把“周末爬山”解释为对女儿安全威胁的漠视，Reply prompt 里重复出现上一轮“你下来，指给我看”，State Update 和 Runtime Signal 又继续写入极高危险态。删除方面，审计记录、消息历史和角色运行态是三个独立 runtime 文件；原删除 API 只维护审计文件，角色仍会从历史和全局运行态里读到已删除互动的余波。

### 修正

1. 新增 `safetyContinuity` 判断孩子安全澄清和澄清后的普通话题错位。
2. Appraisal/Decision/Prompt/State Update 都承接“直接危险下降，但关系愤怒仍在”的事实层，避免继续走旧危险爆发路由。
3. 长期记忆和关系历史写入 `sourceEventId`；审计记录保存 `conversationEventId` 和 `conversationHistoryMessageIds`。
4. 删除单条或清空审计时，级联清理同轮中间栏消息、角色短期记忆、长期记忆、关系证据和关系历史。

### 新增验证标准

- `npm run verify:severe-state-continuity` 增加安全澄清和澄清后普通邀约场景，验证不会回到旧危险循环。
- `npm run verify:admin-history-and-module-audit` 增加删除审计级联清理历史和运行态记忆的断言。

## 2026-06-10 虚拟人物固定场景且连续回复不可见

### 用户指出的问题

用户指出虚拟人物回复仍不真实，像一直处在固定场景里；人物应该随着所在地真实时间上班、睡觉、通勤或移动，也应该能被对话触发离开原场景。同时，连续多条消息没有在中间栏出现，崩溃时也被压成短回复。

### 错误类型

- 实现边界错误：场景只来自档案/手动应用，没有在同步对话路径里按真实时间推进。
- 模块通信错误：`replyRhythm` 已有 `multi_turn/burst`，但 Reply 输出和 App Shell 消息历史没有承接为多条消息。
- 验证标准错误：之前验证了严重余波路由，没有验证当地时间下的场景变化、地理约束和连续回复展示。

### 根因

系统把“人物在哪儿”当成档案初始值，而不是每轮对话前都要更新的运行态；同时把“连续回复”停留在决策层字段，没有让 Reply LLM 用自然换行表达，也没有把输出分段归一化成多条 `ChatMessage`。因此用户看到的仍是一条短消息和一个长期不变的场景。

### 修正

1. 新增 `temporalSceneProgression`，在 Event 后、Appraisal 前根据角色位置时区、真实当地时间、人物职业/生活节奏和对话触发推进 `scene/location`。
2. 场景推进只允许同区域内合理移动；未来计划不移动，白宫等远距离/不现实地点会进入 blocked 场景上下文而不是瞬移。
3. Reply prompt 用自然语言允许连续补充、追问、解释或短句失控时换行表达，不引入 JSON 或字段名。
4. `llmClient` 将自然语言回复归一化为 `replyOutput.segments`，App Shell 按分段展示和保存多条角色消息，审计仍保留完整 `personaOutput`。

### 新增验证标准

- 新增 `npm run verify:temporal-scene-and-reply-segments`，验证郑州人物在当地上班/睡眠时间进入合理场景、未来爬山邀约不瞬移、立即去白宫被阻止，以及 `multi_turn/burst` 输出会产生多条消息分段。

## 2026-06-10 王佳宁重大噩耗后仍能按普通邀约继续工作

### 用户指出的问题

王佳宁刚收到“被辞退、家人被绑架且可能遇害”的极端坏消息后，用户再次发出“周末一起去爬山吗？”邀约，她仍回复“周末的事再说吧，我先盯会儿单”，表现得像还能继续正常工作。

### 错误类型

- 上下文承接错误：上一轮运行时信号已经是极低能量、强烈负面、震惊痛苦，但下一轮 Appraisal/Decision 把“爬山邀约”按表面低相关事件处理。
- 状态写回边界错误：State Update LLM 给出的 `userRelationshipMemory` 复用了旧的“同事，工作配合尚可”印象，没有把本轮极端冲击写进关系记忆。
- 验证标准错误：之前只验证关系记忆会写入，没有验证重大事件会覆盖旧的礼貌关系摘要，也没有验证严重余波下普通邀约不能走普通工作回复路由。

### 根因

对话管线把重大事件拆散在多个模块里：Runtime Signal Evaluator 能识别痛苦，但 Appraisal/Decision 只拿到较弱的整体状态 label；State Updater 在没有 `concernUpdates` 时把 internal state note 写成低重要性长期记忆；关系记忆完全信任 LLM 输出，缺少“本轮事件必须入记忆”的确定性保护。于是第二轮虽然召回到了噩耗，决策仍把邀约解释成“低威胁、维持基本礼仪”。

### 修正

1. Appraisal 和 Decision prompt 现在读取完整 runtime signal narrative 和近期对话，明确普通闲聊/邀约也要按当前严重余波的错位感评估。
2. Response Decision 增加严重状态连续性归一化：当角色处于极低能量/强烈负面余波，用户发来普通邀约或工作安排，而 LLM 仍判成低影响礼貌回应时，确定性转为失态/爆发式回应路由。
3. State Update 根据 Appraisal/Decision 冲击强度把重大事件写成高重要性、高情绪强度长期记忆，并强制把本轮极端事件写进当前用户关系记忆。
4. Runtime Signal prompt 明确“外表克制”不能被写成“内在平稳”。

### 新增验证标准

- 新增 `npm run verify:severe-state-continuity`，用假 LLM 复现“严重坏消息后模型仍给普通邀约路由”的情况，验证长期记忆、关系记忆和回应决策都保留重大事件余波。

## 2026-06-10 发现新版本但更新服务器按钮不能点击

### 用户指出的问题

用户在生产 `0.3.3` 检测到 GitHub 远端 `0.3.4` 后，更新窗口右下角“更新服务器”按钮不能点击，导致站内手动更新无法继续。

### 错误类型

- 权限反馈边界错误：前端把 `!isAdmin` 放进按钮 `disabled` 条件，导致未登录、登录态尚未恢复或管理员状态漂移时，用户无法点击按钮触发登录浮窗或权限提示。
- 验证标准错误：之前只验证 `/api/app-update/status` 能发现新版本和展示摘要，没有验证“发现新版本但当前浏览器没有管理员态”时按钮仍能给出可操作反馈。

### 根因

更新窗口同时承担“发现新版本”和“管理员执行更新”两个职责。实现时把管理员权限当成按钮可点击性的前置条件，而不是让 `handleRunAppUpdate` 内部的 `requireAdmin` 统一处理。这样后端状态即使返回 `available: true`，前端也可能因为本地 `authUser?.isAdmin` 为假而把按钮直接置灰，用户没有任何恢复路径。

### 修正

1. “更新服务器”按钮只在没有可用更新或正在更新时禁用，不再因 `!isAdmin` 禁用。
2. 点击后继续复用 `requireAdmin("更新服务器")`，未登录时打开登录浮窗，非管理员时显示权限提示。
3. 新增 `npm run verify:update-button-clickable`，用 Playwright mock `0.3.3 -> 0.3.4` 更新状态，断言未登录时按钮仍可点击。

### 新增验证标准

- 以后改站内更新 UI 时，必须验证“有新版本 + 未登录/管理员态未恢复”这条路径，确保按钮提供登录或权限反馈，而不是原生禁用。

## 2026-06-10 左上角更新提示缺少变更说明

### 用户指出的问题

用户指出点击左上角“更新”时，系统能检查到有更新，但没有说明更新了什么；这需要前端和提交时配合，提交时要总结说明修改内容和改进点。

### 错误类型

- 实现边界错误：更新状态接口只比较当前提交和远端提交，没有把待更新提交说明作为接口输出。
- UI 信息不足：更新浮窗只展示版本、当前提交、远端提交和分支，管理员无法在更新前判断风险和收益。
- 发布流程标准不足：提交信息虽然有短句格式要求，但没有明确它会成为站内更新说明的数据源。

### 根因

站内手动更新路径把“是否有新版本”和“如何执行更新”做成了闭环，但没有覆盖“用户为什么应该更新”。之前验证只检查 `/api/app-update/status` 能返回状态、更新窗口能触发 SSE 过程，没有检查发现新版本时是否能看到修改内容和改进点。

### 修正

1. `/api/app-update/status` 在发现远端提交后读取 `current..remote` 的提交数量、标题和正文摘要。
2. 更新浮窗新增“本次更新”区域，展示待更新提交说明；读取失败时提示提交说明缺失。
3. 部署文档、系统流、模块包和命名表明确：提交信息必须写清楚修改内容和改进点，因为它会直接成为站内更新说明。

### 新增验证标准

- 以后改站内更新、版本提示、提交发布流程时，必须验证“有新版本”状态下 UI 能展示可读变更摘要，而不只验证 SHA 差异。

## 2026-06-10 管理员审计记录很多时不能上下滚动

### 用户指出的问题

用户用管理员登录后点击右侧“查看记录”，审计记录很多，但列表不能上下滚动。

### 错误类型

- UI 容器约束错误：审计浮层限制了最大高度并隐藏溢出，但内部记录列表没有形成独立滚动区域。
- 验证标准错误：已有管理员审计验证覆盖了接口和模块调用记录保存，没有覆盖“记录很多时管理员能实际浏览完整列表”。

### 根因

`.audit-modal` 是 grid 容器，只有 `max-height` 和 `overflow: hidden`；`.audit-list` 虽然设置了 `overflow-y: auto`，但作为 grid 子项没有 `min-height: 0` 和可收缩行约束。记录很多时列表按内容高度展开到一万多像素，父级再把超出部分裁掉，因此列表本身没有可滚动空间。

### 修正

1. 审计浮层改为 `auto minmax(0, 1fr)` 两行布局，让顶部栏固定、记录列表占剩余空间。
2. `.audit-list` 增加 `min-height: 0`，允许它在受限高度内收缩并使用内部滚动。
3. 新增 `npm run verify:audit-modal-scroll`，用真实样式构造 60 条审计记录，验证列表可滚动且浮层不被内容撑爆。

### 新增验证标准

- 以后改弹窗、右侧面板、审计列表或大段记录显示时，必须验证大量内容下的滚动行为，而不只验证数据能读取。

## 2026-06-08 孙小雅回复机械化且场景承接失真

### 用户指出的问题

用户提供 Qoo 与孙小雅在 `ok.xiaogushi.us` 上的对话，指出孙小雅的回复“不真实，不是正常人的回复”。典型表现包括：对“说好一起吃饭看电影买玩具”持续用“你们去吧”回避；在醉酒表白、女儿被围、医院受伤等高情绪事件里仍大量使用“嗯”“谢了”“你好好养着，我走了”；甚至在医院场景复用“行，你拦着。我带孩子先走”，把已经结束的打斗动作错误带入新场景。

### 错误类型

- 场景状态承接错误：角色没有稳定区分“安检口工作中”“去学校路上”“医院病床前”等阶段，导致旧动作和旧策略泄漏到新场景。
- 回复策略过拟合错误：人物设定里的“简短、明确、有边界”被模型压成机械短句，盖过了具体事件应有的情绪、判断和行动。
- 关系边界表达错误：角色可以拒绝 Qoo 的越界要求，但正常人会说明原因、处理风险或表达最低限度关切，而不是连续复读“我走了”。
- 母亲行为真实性错误：女儿被围、被打、受惊时，角色应该把注意力、身体动作和语言优先级集中到女儿安全、求助、报警、医务处理上；当前输出像是在执行“保持距离”的单一模板。
- 审计诊断不足：仅凭用户贴出的聊天记录，本地不能直接看到线上每轮 Appraisal、Memory Recall、Decision、Reply Prompt、State Update 的真实输入输出，因此不能判定具体是哪一个模块先把上下文带偏。

### 根因

从当前仓库可见的初始档案看，孙小雅的设定强调“高警觉、高边界感、安检口指令感、对孩子柔软”。这些设定合理，但 Reply Prompt 仍会把说话风格、场景、位置、关系记忆、决策姿态合并成一次自然语言提示；当 Decision 给出 `short_avoidance` 或关系记忆累计为高警惕时，Reply LLM 容易把“边界强”和“话少”理解成所有场景都冷淡省略。更深一层的问题是当前对话管线没有显式的叙事阶段一致性检查，也没有在 Reply 后验证回复是否违反刚发生事件的物理状态和人类常识。

这类问题之前不容易发现，是因为验证主要覆盖数据隔离、审计保存和自然语言边界，没有覆盖“高压角色在跨场景连续互动中是否能像真人一样承接承诺、危险、照护和拒绝”。

### 残留风险

- 其他高边界、话少、工作压力大的角色也可能被压成“嗯/行/你忙你的”式模板。
- 当用户用动作叙述快速改变场景时，角色可能复用上一场景的行动目标。
- 当用户进行情感勒索、辱骂或索要儿童陪伴时，角色的拒绝可能只表现为冷处理，没有体现成人边界和安全判断。
- 如果线上审计没有被取回，仍无法精准定位是 Decision、Prompt、Reply 还是 State Update 首先失真。

### 新增验证标准

- 复盘此类问题时，必须查看对应线上审计的完整模块链，而不是只看最终回复。
- 需要新增面向角色真实性的对话样例验证：承诺兑现、拒绝越界、儿童安全、受伤就医、跨场景切换。
- Reply 输出后应检查是否存在明显场景错位、重复同一句、对重大事件无反应、把母亲/职业/身体伤势常识压扁成单一边界策略。

## 2026-06-03 管理员无法查看指定用户和人物历史，且缺少模块级审计

### 用户指出的问题

用户用管理员登录后点击“孙小雅”，中间栏仍看不到用户 Qoo 和该人物的聊天记录。用户还要求分析 Qoo 反馈的“已经答应去吃饭，最后还是不去”；如果没有历史记录，要修改保存机制，保存用户和角色的所有互动，以及每个模块的每次调用。

### 错误类型

- 权限视角错误：中间栏历史读取路径只按“当前登录用户 + 当前人物”读取。管理员虽然能看输入输出审计，但没有“查看某个用户在某个人物下历史”的入口。
- 记录粒度错误：`.conversation-histories.local.json` 保存中间栏消息，`.conversation-audits.local.json` 只保存输入和输出，没有保存每个 pipeline 模块的输入、输出、状态和 transport。
- 可诊断性错误：当角色前后决策不一致时，无法回看是 Memory Recall 没召回、Decision 改了姿态、Prompt 缺少承诺上下文，还是 State Update 没把承诺写入状态。
- 环境数据缺失：当前本地运行目录没有 `.conversation-histories.local.json`、`.conversation-states.local.json` 或 `.conversation-audits.local.json`，因此本机无法直接复盘 Qoo 与“孙小雅”的线上历史。

### 根因

上一版为了保护用户隔离，把中间栏历史严格限制为当前用户读取，这是普通用户的正确边界，但没有给管理员提供只读检查入口。审计侧只记录最终输入/输出，导致管理员即使知道某轮回复，也无法看到每个认知模块怎样一步步产生结果。之前没有发现，是因为验证只覆盖“不同用户不能互相看到历史”，没有覆盖“管理员需要按人物查看某个用户历史”和“审计必须保留模块调用链”。

### 修正

1. 新增管理员只读接口 `/api/admin/conversation-histories`：
   - 传 `dossierId` 时列出该人物下所有用户历史摘要。
   - 传 `dossierId + key` 时读取该用户与该人物的中间栏消息。
2. 中间栏新增管理员“查看用户历史”选择器；管理员可在当前人物下切换查看 Qoo 等用户的历史，查看其他用户历史时输入框禁用，避免把管理员消息写入被查看用户历史。
3. 审计记录新增 `moduleCalls`，保存一轮对话的事件、评估、记忆召回、回应决策、回应提示词、回应输出、状态更新、信号评估和状态变化的输入/输出/状态/transport。
4. 管理员审计弹层新增模块调用详情，便于以后定位“答应了又不去”到底是哪一步丢失或改写了上下文。

### 新增验证标准

- 新增 `npm run verify:admin-history-and-module-audit`：
  - 伪造 Qoo 与某人物的历史，验证管理员能列出并按 key 读取。
  - 伪造模块调用记录，验证 `.conversation-audits.local.json` 会保留模块调用内容。
- 以后涉及历史隔离时，必须同时验证普通用户隔离和管理员只读观察入口。
- 以后涉及角色行为复盘时，必须能从审计记录看到每个 pipeline 模块调用，而不只看到最终输入输出。

## 2026-06-03 人物没有区分当前说话用户和关系印象

### 用户指出的问题

用户指出人物不仅要区分是谁在和它说话，还要生成对这个用户的印象，影响关系；长期记忆中要开辟关系记忆区，专门写关系和印象，并在右侧 pipeline 下方展示对该用户的印象和关系。

### 错误类型

- 事件身份错误：`runConversationPipeline` 仍把所有用户消息写成固定 `user_b / 当前对话者`，登录用户身份没有进入认知 pipeline。
- 记忆结构错误：长期记忆只有通用 `longTermMemory`，没有专门面向当前用户的关系印象区。
- 表达上下文错误：Reply LLM 只能看到旧的关系表和普通记忆，无法稳定参考“她对这个登录用户的具体印象”。
- UI 可观测性错误：右侧流程面板只能看模块 trace，看不到当前用户对应的关系印象是否生成和变化。

### 根因

上一版把“对话历史/运行态按用户隔离”落到了持久化层，但前端发送消息时没有把 `authUser` 归一化为事件说话者；状态更新仍只维护旧的数值关系变化和普通长期记忆。这样不同登录用户虽然不会共享持久化状态，但人物大脑内部仍缺少“这个用户是谁、我怎么看他/她”的自然语言记忆结构。

### 修正

1. 前端新增 `createConversationSpeaker`，把登录用户转成稳定 `speaker.id` 和展示名；pipeline 事件使用该身份，不再写死 `user_b`。
2. `CharacterState` 新增 `relationshipMemory`，作为长期记忆中的关系记忆区，按 `targetUserId` 保存 `impressionSummary`、`relationshipSummary`、`evidence`、`lastInteractionSummary` 和历史摘要。
3. State Update LLM 输出契约新增 `userRelationshipMemory`，要求对当前说话用户生成自然语言印象和关系总结，不使用数值评分。
4. 写回时更新 `relationshipMemory`，并把自然语言关系摘要同步到 `relationships[targetUserId].recentTone/notes`，让后续关系判断能受影响。
5. Memory Recall 将 `relationshipMemory` 转为长期记忆候选；Prompt Generator 直接注入当前用户的印象、关系、最近互动和证据。
6. 右侧 pipeline 下方新增“对当前用户的印象”展示区，显示当前登录用户对应的印象、关系、最近互动和证据。

### 新增验证标准

- 新增 `npm run verify:user-relationship-memory`：模拟 State Update LLM 返回当前用户关系印象，验证写入 `relationshipMemory`、按用户 ID 定位、字段为自然语言结构，并影响 `relationships` 的自然语言备注。
- 以后涉及人物对用户关系、身份隔离或长期记忆结构时，必须验证 `speakerId` 来自登录用户，而不是固定占位用户。

## 2026-06-03 切换人物没有加载已保存的中间栏历史

### 用户指出的问题

用户指出“切换人物时没有加载历史对话”，并要求如果历史对话没有保存，就修改代码保存历史记录。

### 错误类型

- 实现边界错误：上一版只把中间栏消息写入浏览器 `localStorage`，没有服务端历史接口；换设备、重新登录或从后台档案重新加载时，没有可靠来源可读。
- 验证标准错误：新增的 `verify:conversation-history-isolation` 只验证了角色运行态不会跨用户泄露，没有验证中间栏 `ChatMessage` 是否保存、读取和按人物切换。
- 命名边界错误：上一版把“conversation history isolation”主要落在角色状态上，没有把“中间栏消息历史”和“角色内部运行态”拆成两条持久化路径。

### 根因

前端 `conversationHistories` 是按 `conversationHistoryKey` 分桶的内存/localStorage 缓存，但切换人物时只从本地桶读取；服务端只有 `.conversation-states.local.json` 保存角色状态，没有 `.conversation-histories.local.json` 保存消息列表。因此后台虽然能记住角色短期记忆和 runtime，但 UI 中间栏没有可加载的持久消息历史。

### 修正

1. 新增 `.conversation-histories.local.json`，按 `userId + dossierId` 保存中间栏消息历史，并加入 `.gitignore`。
2. 新增 `GET/POST /api/persona-dossiers/:id/conversation-history`，分别用于读取和追加当前用户当前人物的历史消息。
3. 前端切换人物或登录后，会先显示本地缓存，再从后台加载该人物历史；如果后台为空但本地有缓存，会回填保存到后台。
4. 发送消息成功后，会把用户消息和角色回复追加保存到后台；流程失败时至少保存用户已发送的消息。
5. 文档和命名表明确区分 `userConversationHistory`（中间栏消息）与 `userConversationState`（角色运行态）。

### 新增验证标准

- 新增 `npm run verify:conversation-message-history`：验证同用户同人物能读取保存消息，不同人物和不同用户都读不到。
- 以后涉及中间栏消息、切换人物、登录后恢复历史时，必须验证消息历史保存和读取，而不只验证角色状态。
- `.conversation-histories.local.json` 必须保持 ignored，不能提交用户消息。

## 2026-06-03 对话历史按任务和用户隔离失败

### 用户指出的问题

用户指出两个问题：

- 点击不同任务时，中间栏对话历史没有跟着切换。
- 不同用户对同一个人的聊天历史是全局的，对所有用户可见。

### 错误类型

- 实现边界错误：前端只有一个全局 `messages` state，`activeDossierId` 切换时只替换人物状态和素材，不替换中间栏消息列表。
- 架构边界错误：服务端 `/api/persona-dossiers/:id/conversation-state` 把对话产生的短期记忆、长期记忆、runtime 和关系变化写回 `.persona-dossiers.local.json` 的共享档案，导致其他用户读取同一角色时会拿到这些对话运行态。
- 文档诱导错误：`README.md` 和 `docs/SYSTEM_FLOW.md` 明确写着“同一角色所有用户消息都会影响之后状态”，后续实现会自然沿着这个错误边界继续扩大。

### 根因

系统把“共享人物档案底稿”和“用户对某个角色的对话运行态”混成了一份数据。共享底稿应该由管理员维护，并允许所有用户读取；但中间栏消息、短期记忆、长期记忆和一轮对话后形成的状态变化属于当前用户和当前任务的历史，不应该写回全局档案。

之前没有发现，是因为验证只覆盖了“对话完成后状态能保存”和“共享档案能读取”，没有覆盖两个关键矩阵：

- 同一用户切换不同 `dossierId` 时，中间栏历史应不同。
- 不同用户读取同一 `dossierId` 时，不应看到彼此的对话状态。

### 修正

1. 前端新增 `conversationHistoryKey = user + dossier`，中间栏消息历史改为 `conversationHistories` 分桶，并持久化到 localStorage 对应历史桶。
2. 服务端新增 `.conversation-states.local.json`，保存按 `userId + dossierId` 隔离的私有角色运行态。
3. `GET /api/persona-dossiers` 现在先读取共享档案，再叠加当前登录用户自己的私有运行态。
4. `POST /api/persona-dossiers/:id/conversation-state` 不再覆盖 `.persona-dossiers.local.json`；它只写当前用户的私有运行态，并且关系余波也只传播到当前用户自己的角色网络。
5. `.conversation-states.local.json` 加入 `.gitignore`，和 DeepSeek 密钥、共享档案、审计运行时文件一样不提交。

### 新增验证标准

- 新增 `npm run verify:conversation-history-isolation`：在临时运行目录中写入用户 A 的角色对话状态，验证用户 A 能读到、用户 B 和共享档案都读不到。
- 以后涉及对话历史、角色状态保存或档案读取时，必须验证 `userId + dossierId` 隔离。
- 文档中不能再把普通用户对话运行态描述为全局共享档案的一部分。
- 前端切换档案时，中间栏消息必须跟着 `activeDossierId` 切换。

## 2026-06-03 Memory Recall 结构化 JSON 截断导致对话卡住

### 用户指出的问题

用户点击“王佳宁”并连续输入两次消息后，第二次流程卡在“记忆召回”，输入栏下方显示红色错误：`Unterminated string in JSON at position 4052 (line 161 column 15)`。用户怀疑第一次流程可能没有走完，导致第二次接收信息出错。

### 错误类型

- 实现边界错误：`runCognitiveModule` 虽然接收本地 `mockOutput` 作为 fallback，但外部结构化 JSON 解析失败时直接抛错，没有使用 fallback 继续流程。
- 验证标准错误：之前只验证了正常流式输出和页面展示，没有验证“DeepSeek 返回截断 JSON”这种真实 LLM 常见失败形态。
- 运行时韧性不足：Vite/生产代理在流结束后解析结构化 JSON 时没有捕获解析失败，可能让前端只看到半截流和裸 `JSON.parse` 错误。

### 根因

Memory Recall 的输入会带上短期记忆、长期记忆候选、关系和关切。第二轮对话比第一轮上下文更长，外部模型更容易返回较长结构化 JSON；一旦输出被截断，`readEventStream` 会在没有 `final` 的情况下解析累积文本，最终触发 `Unterminated string`。这和“第一次流程没走完”不是同一个根因；第一次如果正在写回或生成，会增加上下文变化和时序压力，但真正让第二次卡死的是结构化输出解析层没有兜底。

### 修正

1. `CognitiveModuleTrace` 新增 `fallbackReason`，记录外部结构化输出无法解析的原因。
2. `runCognitiveModule` 在结构化 JSON 解析失败时使用传入的 `mockOutput` 继续流程，并把 fallback 原因推送到右侧流程追踪。
3. Conversation Pipeline 和历史 trace 展示会把 `fallbackReason` 与实际输出一起显示，用户能看见发生过回退。
4. Memory Recall prompt/contract 收紧输出长度：短期记忆最多 4 条，长期记忆最多 5 条，reason 使用短句。
5. Vite 和生产 DeepSeek 代理捕获流式结构化 JSON 解析失败，并通过 SSE error 明确返回；结构化输出 token 上限从 1400 提高到 2600，降低截断概率。
6. 后续复查确认同步 pipeline 已经逐个 `await` 模块，没有把多个模块合成一次提交；但 Memory Recall 让 LLM 输出完整短期记忆和长期记忆摘要是不合理的。已改为 LLM 只返回记忆 ID、分数和短理由，完整记忆内容、summary 和 factors 由本地候选表回填。

### 新增验证标准

- 新增 `npm run verify:cognitive-fallback`：伪造未闭合 SSE JSON，验证 `runCognitiveModule` 不抛错，而是返回 fallback output 和 `fallbackReason`。
- 以后涉及结构化认知模块、SSE、DeepSeek 代理或 Memory Recall 时，必须验证坏 JSON 不会中断整轮对话。
- Memory Recall LLM 输出契约必须保持为 ID 选择结果，不能要求模型复述完整短期记忆、长期记忆摘要或 factors。
- 右侧流程追踪必须能展示 fallback 原因，避免“静默降级”。

## 2026-06-03 完成功能后未同步版本号

### 用户指出的问题

用户指出上一轮已经完成并推送了人物档案和全局角色状态改动，但左上角版本号没有跟着改变。这说明硬性工作流里缺少明确的版本同步要求。

### 错误类型

- 规则理解错误：AI 把 Git 提交当成唯一可回溯标识，忽略了 UI 版本号也是用户判断站点是否更新的重要信号。
- 实现边界错误：`appVersionLabel` 来源于 `package.json`，但收尾流程没有要求同步修改 `package.json` 和 `package-lock.json`。
- 验证标准错误：上一轮验证了构建、页面和 Git 状态，没有验证版本号是否随 reviewable step 增加。

### 根因

开发方法里只写了“建立 Git 提交”，没有把“递增 package 版本号”列为提交前硬检查。由于站内更新状态同时展示 Git 远端差异和 UI 版本，版本号滞后会让用户误判线上是否真的拿到新版本。

### 修正

1. 将版本从 `0.2.1` 递增到 `0.2.2`，同步 `package.json` 和 `package-lock.json`。
2. 精简 `docs/DEVELOPMENT_METHOD.md`，并在收尾清单中新增版本同步硬规则。
3. 更新 `README.md`、`AGENTS.md`、`docs/AI_NAMING_REGISTRY.md` 和 `docs/SYSTEM_FLOW.md`，让新会话和流程图都能看到版本同步要求。

### 新增验证标准

以后每个完成的 reviewable step 必须验证：

- `package.json` 和 `package-lock.json` 的版本号一致。
- 本轮如果影响产品、代码、运行时行为、部署或重要文档，版本号必须比上一提交递增。
- `npm run build` 后左上角 `appVersionLabel` 会读取新版本。
- final 前说明提交号和版本号。

## 2026-06-03 角色状态被做成用户会话副本

### 用户指出的问题

用户指出当前角色像是“每个角色对应一个用户都会有一个副本”，但正确边界应该是：一个角色对应所有用户的所有消息。用户和某个角色的一次聊天，应该能影响该角色之后面对任何用户的回应；如果其他角色与这个角色有关系，也应该能影响那些相关角色之后的回应。

用户同时指出人物档案不够丰满，人物预览不能由源码手写，必须由 DeepSeek 生成并全局保存。

### 错误类型

- 规则理解错误：AI 把“共享人物档案”理解成共享初始模板，而不是共享运行中的角色生命状态。
- 实现边界错误：前端 `runConversationPipeline` 后只更新浏览器内 `state` 和本地 `dossiers`，普通用户不会把短期记忆、长期记忆、runtime 和关系变化写回 `.persona-dossiers.local.json`。
- 验证标准错误：之前只验证了共享档案能读取、管理员能保存，没有验证普通用户对话后另一个用户是否会看到同一角色的新状态。

### 根因

早期 MVP 为了保护管理员维护的共享档案，过度收紧了写回权限：只有管理员可以保存完整档案，普通用户对话产生的状态被留在当前浏览器。这避免了误改档案，但破坏了“虚拟人是同一个人”的核心语义。

更深层的问题是系统缺少“全局角色状态写回”和“档案编辑写回”的分层。完整档案编辑确实应该只给管理员；但对话产生的角色生命状态属于运行时事实，应该允许登录用户写回同一个角色，并用窄接口限制写入范围。

### 修正

1. 新增 `/api/persona-dossiers/:id/conversation-state`，登录用户对话完成后写回同一个全局角色状态。
2. 后台写回时会查找与当前角色有关联的其他 `personaDossier`，向相关角色写入压缩后的关系余波记忆和 relationship note。
3. 新增 `/api/persona-dossiers/:id/preview`，只允许登录用户写入 DeepSeek 生成的人物短预览缓存，不开放完整档案编辑。
4. 左侧人物档案显示改为“预览 + 详细”：缺少 `previewSummary` 时显示“预览生成中”，详细档案展示 `fullLifeStory`、`lifeEvents`、心理变化、关系变化、性格面和人物关系。
5. 内置 14 个角色补充从小到大的关键经历、社会人格位置和熟人关系；预览摘要保持空，由 DeepSeek 懒生成后全局保存。

### 新增验证标准

以后涉及人物档案和对话状态必须验证：

- 普通登录用户对话后会调用 `/api/persona-dossiers/:id/conversation-state`，而不是只更新当前浏览器。
- 同一个角色不按用户 ID 建立副本；`.persona-dossiers.local.json` 中同 ID 角色只有一份运行时覆盖记录。
- 与当前角色有关联的其他角色会得到压缩关系余波，但不会扩散用户原始长对话全文。
- 人物短预览只能来自 DeepSeek 生成后的 `personaDossier.previewSummary`；缺失时 UI 显示“预览生成中”，源码不手写预览文案。
- Reply Prompt 使用详细生平、心理变化、关系变化和熟人关系作为自然语言语境，但 Reply LLM 仍只接收自然语言。

## 2026-06-01 Reply LLM 自然语言边界错误

### 用户指出的问题

用户指出 `Reply Prompt` 和 `Reply Output` 中仍然能看到非自然语言标签和结构化语言。

更早一层的问题是：AI 曾把 `outputContract` 和自然语言 prompt 放在同一个 Reply LLM 请求对象里。即使没有拼进 prompt 正文，这种对象边界仍然容易导致真实后端把结构化约束和自然语言一起提交给 Reply LLM。

用户明确的架构原则：

- Reply LLM 永远只接收自然语言。
- Reply LLM 只生成角色说出口的话。
- 结构化判断属于后续认知模块，例如 State Update LLM。
- Appraisal、Memory Recall、Decision、State Update 都应作为独立 LLM 模块运行。

### 错误现象

1. `ExpressionLlmRequest` 里还保留 `generatorNotes`。
2. `Reply Prompt` debug 面板显示了 `Natural Prompt Sent To Reply LLM` 和 `Generator Notes`。
3. `Reply Output` debug 面板用 JSON 外壳显示 `{ reply: "..." }`。
4. AI 的验证只检查 prompt 正文没有 JSON 字段，没有检查 UI 面板和请求对象是否也遵守“自然语言唯一边界”。

### 根因

AI 把“真实提交给 LLM 的 prompt 正文”和“用户在界面上看到的 Reply 步骤”当成了两件事处理。

这在普通工程调试里常见，但不符合本项目的核心目标：这个系统要模拟多脑区式认知流，`Reply Prompt` 和 `Reply Output` 本身就是用户理解架构边界的一部分。只要这里出现 debug 标签、JSON 外壳或字段名，就会混淆“表达脑区”和“认知脑区”的边界。

更深层根因：

- AI 先按常规软件工程习惯保留调试说明，而没有把“自然语言边界”提升为不可破坏的架构约束。
- 修复时只查了 prompt 内容，没有查数据对象、UI 呈现、文档命名和验证条件。
- 验证标准偏技术化，只问“是否没有 JSON key”，没有问“用户看到的这一步是否完全像自然语言思考/表达”。

### 修正

1. `Reply Prompt` 面板只显示自然语言 prompt 正文。
2. `Reply Output` 面板只显示角色回复文本。
3. 删除 `ExpressionLlmRequest.generatorNotes`。
4. `outputContract` 只允许存在于 `CognitiveModuleRequest`，不允许进入 Reply LLM 请求对象。
5. 保留认知模块的结构化 trace，但它们必须和 Reply LLM 明确分区。

### 新增验证标准

以后涉及 Reply LLM 的改动必须验证：

- Reply Prompt 视图没有 JSON、字段名、调试标题、output contract、generator notes。
- Reply Output 视图没有 JSON 外壳，只显示角色台词或自然语言沉默描述。
- `ExpressionLlmRequest` 类型中不包含结构化输出约束或调试说明。
- 结构化输出只存在于认知模块请求中。

### 流程修正

已在 `docs/DEVELOPMENT_METHOD.md` 增加“错误勘验规则”。之后用户指出错误时，AI 必须先做根因勘验，再修代码和文档。

## 2026-06-01 人物属性被写成回复指令

### 用户指出的问题

用户指出能量详情里出现“回复应短、轻、避开解释”这类句子。这不是人物属性描述，而是给 LLM 的直接话术指令。

用户进一步指出：如果直接让 LLM 这样回复，那么前面关于性格、关系、状态和场景的描述就失去意义。真正要做的是让回复从人物整体心理结构里自然长出来，而不是让某个 UI 指标变成台词控制杆。

### 错误现象

1. `runtime.signalProfiles.energy.llmContext` 使用了“回复应……”这种直接指令。
2. 其他状态信号也有“不要写成”“让她”“用短停顿”等命令式话语。
3. 场景字段 `scene.llmContext` 也有“让回复……”的倾向。
4. Reply Prompt 虽然已经加入性格材料，但仍然更像把模块结果拼成可执行指令，没有充分强调“先完整过一遍人物性格，再综合状态生成回复”。

### 根因

AI 把“给人看的状态详情”“给 Prompt Generator 的认知叙述”和“给 Reply LLM 的生成任务”混成了一层。

字段名 `llmContext` 本身也诱导了这个错误：它让 AI 以为这里可以写面向 LLM 的行为控制语句，而不是人物内部状态的自然语言描述。

更深层的问题是 AI 仍按普通角色扮演提示词习惯工作，把能量、情绪、情绪倾向、唤醒度当成风格控制参数；但本项目的设计哲学是，情绪和表达是由事件评估、关系、记忆、性格、身体状态和场景共同构成的结果。

### 参考依据

用户引用的 OCC / Psychological Construction 方向调研强调：情绪不是一个单独触发器，而是情境意义、想法、感受、倾向和表达共同构成的结果。本项目应把状态信号作为综合状态的观察入口，而不是回复风格指令。

### 修正

1. 将 `llmContext` 改名为 `cognitiveNarrative`。
2. 清理 `seedState`、`generators`、`stateUpdater` 中 runtime signal 和 scene 的命令式话语。
3. Runtime signal 和 Scene 现在只描述内部状态、成因、身体感、注意力落点和关系距离。
4. Reply Prompt 现在先完整过一遍性格、价值、边界、表达样本，再综合场景、状态、关切、关系和记忆。
5. 更新命名登记表、系统流程和调研笔记，明确属性叙述不能写成回复指令。

### 新增验证标准

以后涉及人物属性、状态信号、场景和 Reply Prompt 的改动必须验证：

- `RuntimeSignalProfile` 和 `SceneState` 不出现 `llmContext` 这种暗示指令的字段名。
- 属性详情中不能出现“回复应……”“不要写……”“用……体现……”这类直接台词控制语句。
- Reply Prompt 必须包含完整人格层：`personalitySummary`、`personalityFacets`、`values`、`boundaries`、表达样本。
- Reply Prompt 可以说明最终只显示角色台词，但不能让单个指标绕过完整人格和情境综合。

## 2026-06-01 开发方法和 Git 回溯未严格执行

### 用户指出的问题

用户指出本轮开发必须严格按照 `docs/DEVELOPMENT_METHOD.md` 执行，并追问“这一步 git 了吗”。实际情况是：完成 DeepSeek 接入、信号评估模块和 UI 验证后，AI 没有立即提交 Git 版本，也没有主动说明未提交原因。

### 错误类型

- 规则理解错误：AI 把“实现完成 + 验证通过”当作本轮完成，没有把“完成小步骤必须形成可回溯版本”作为硬性收尾动作。
- 实现边界错误：新增模块、函数、API 路由和外部服务后，没有同步完整登记到 `docs/AI_NAMING_REGISTRY.md`。
- 验证标准错误：验证了构建、浏览器 UI 和无密钥失败路径，但没有验证开发流程本身是否满足“文档同步 + Git 提交”。

### 根因

AI 按通用 Codex 工作习惯结束在“代码可运行、测试通过、告知用户”，而本项目的固定方法明确要求每个完成的小步骤都要 Git 留底。之前缺少根目录 `AGENTS.md` 这类新对话入口，导致新开对话时只有 README 里提到开发方法，但不是所有 AI 会自动把它当成强制启动规则。

### 为什么之前验证没有发现

验证清单只覆盖了用户功能：中文标签、信号评估模块、DeepSeek 代理、构建和浏览器表现。没有把以下流程项列为验收条件：

- 是否已读前置文档。
- 是否检查并报告 Git 状态。
- 是否更新命名登记表和系统流程。
- 是否提交可回溯版本。

### 修正

1. 新增根目录 `AGENTS.md`，要求任何新 AI 会话先读 README、开发方法、命名登记和系统流程，并检查 Git 状态。
2. 在 `docs/AI_NAMING_REGISTRY.md` 补登记 Runtime Signal Evaluator、DeepSeek Local Proxy、相关函数、PipelineTrace 字段和 API 路由。
3. 将本条错误勘验写入 `docs/ERROR_INSPECTIONS.md`。
4. 本轮修正后立即创建 Git 提交，保证 DeepSeek 接入和方法论修正可回溯。

### 新增验证标准

以后每轮 final 前必须检查：

- `git status --short` 是否仍有本轮应提交的变更。
- 若有未提交变更，必须说明原因；若本轮目标已完成，应提交。
- 新增模块、函数、API 路由、外部服务是否登记到 `docs/AI_NAMING_REGISTRY.md`。
- 架构或数据流变化是否同步到 `docs/SYSTEM_FLOW.md`。

## 2026-06-01 DeepSeek 思考模式和流程追踪不可见

### 用户指出的问题

用户接入 DeepSeek 后，不清楚是否开启了 thinking 模式；发送默认消息“周末一起去爬山吗？”后页面长时间等待，刷新后看不到生成过程。右侧流程追踪点击模块后，也看不清显示的是输入还是输出。

### 错误类型

- 规则理解错误：AI 以为选择非 reasoning 模型已经足够，但 DeepSeek 文档说明 thinking toggle 默认 enabled，必须显式关闭。
- 实现边界错误：流程追踪只展示最终 trace，没有执行中状态；模块输入和输出混在同一个 JSON 视图里。
- 验证标准错误：之前只验证了最终页面无报错，没有验证真实 DeepSeek 全链路时用户能看到中间过程。

### 根因

DeepSeek 代理层没有显式传入 `thinking: { type: "disabled" }`，也没有处理流式返回。前端 pipeline 是一个整体 `await runConversationPipeline`，只有整个流程完成后才写入 `activeTrace`，所以任何一个外部 LLM 步骤慢或失败，用户看到的都是“运行中”，无法知道卡在哪个模块。

### 修正

1. DeepSeek 代理层对所有请求强制 `thinking: { type: "disabled" }`，不发送 `reasoning_effort`。
2. 如果模型名为 `deepseek-reasoner`，自动改为 `deepseek-v4-flash`。
3. `/api/deepseek-chat` 支持 SSE 流式返回；代理只转发 `content`，忽略 reasoning 内容。
4. `runConversationPipeline` 增加 `onProgress`，每个模块开始时发送输入，输出流到达时更新输出，完成后记录状态。
5. 右侧流程追踪分为输入、输出、状态三块，并在执行时自动切换当前模块。

### 新增验证标准

以后涉及外部 LLM 和流程追踪必须验证：

- DeepSeek 请求体包含 `thinking: { type: "disabled" }`，且不会使用 `deepseek-reasoner`。
- `/api/deepseek-chat` 在 `stream: true` 时返回 `text/event-stream`。
- 默认消息“周末一起去爬山吗？”在真实 DeepSeek 外部接口模式下不会空白或卡死。
- 流程追踪每个模块都能看见输入、输出和状态。

## 2026-06-01 人物和场景预览绕过 LLM 解读

### 用户指出的问题

用户指出：左边栏改写人物档案后点击“预览”，新增文字不应该原封不动展示，而应该由 LLM 重新解读。LLM 需要判断哪些内容写入长期记忆、哪些属于人性/人格部分，并更新标签内容。个人展示只显示摘要，不显示长段原文。场景也是一样，用户输入需要经过 LLM，和状态相关的内容写入状态，可能影响人物的内容也要更新。

### 错误类型

- 规则理解错误：AI 把人物和场景“预览”当成本地规则生成，而没有把它纳入多脑区式 LLM 认知流程。
- 实现边界错误：`generators.ts` 直接把用户原文写入 `profile.background`、`scene.description` 和 `scene.cognitiveNarrative`，导致展示层和长期状态都可能泄漏原始输入。
- 验证标准错误：之前只验证了能生成预览，没有验证“预览是否由 LLM 重新解读”“展示是否为摘要”“场景是否会写入状态和人物影响”。

### 根因

生成预览模块早期只是 MVP 占位规则函数，但后续 DeepSeek 接入后没有回头补齐它的认知边界。文档里仍把人物档案生成和场景生成描述为“规则版”，这会诱导后续开发继续沿用字符串拼接，而不是把用户素材送入独立 LLM 模块做语义分类。

更深层的问题是 AI 把“用户写了一段素材”误当作“用户给出了最终档案文本”。本项目的真实意图是让系统模拟虚拟人的内部理解过程：素材要先被解释成长期记忆、人性/人格、状态信号、场景压力和人物影响，再由确定性写回层归一化。

### 修正

1. `generateDossierFromDescription` 改为异步调用 `dossier_interpretation` LLM 模块，输出展示摘要、长期记忆、人性/人格、标签、关切和状态信号。
2. `generateSceneFromDescription` 改为异步调用 `scene_interpretation` LLM 模块，输出场景摘要、状态影响、人物影响、长期记忆和新关切。
3. 新增 `profile.displaySummary`，左侧个人展示和人物预览只显示摘要，不再显示长段原始背景。
4. 场景预览从 `SceneState` 改为 `CharacterState` 预览，应用时写入完整状态，而不只是替换 `scene`。
5. `generators.ts` 增加归一化层：限制展示文本长度、补 ID、clamp 数值，并避免完整用户原文进入展示字段。
6. 更新命名登记表和系统流程图，明确人物/场景预览是 LLM 解读模块。

### 新增验证标准

以后涉及人物档案或场景预览必须验证：

- 点击预览会调用对应的 LLM 模块：`dossier_interpretation` 或 `scene_interpretation`。
- 人物展示使用 `profile.displaySummary`，不能直接展示用户输入长段原文。
- 人物解读能更新 `longTermMemory`、`personalityFacets`、`personalityTraits`、`concerns` 和 `runtime.signalProfiles`。
- 场景解读应用后不只更新 `scene`，还要能更新 `runtime`、`concerns`、`longTermMemory` 或人物标签/特性。
- 流程图和命名登记必须同步反映新的 LLM 解读路径。

## 2026-06-01 DeepSeek 仍暴露模拟模式和连接状态不清楚

### 用户指出的问题

用户追问 DeepSeek 是否按官方接入文档实现，并要求不开启思考模式、选择 flash。如果已经保存 API Key，右上角应直接显示已经连接 DeepSeek；同时去掉模拟语言模型选项，一切测试都来真的。

### 错误类型

- 实现边界错误：代理层已经关闭 thinking 并纠正 reasoner 模型，但 App Shell 仍然保留“模拟语言模型 / 外部接口”的 provider 下拉框。
- 验证标准错误：之前验证了真实 DeepSeek 可以跑通，却没有把“UI 不能再暴露模拟模式”和“已保存密钥要在右上角显示连接状态”列为验收项。
- 文档残留错误：README、System Flow 和 Research Notes 仍把 mock adapter 描述成当前默认或当前选择，容易让后续对话误以为模拟模式仍可作为正常路径。

### 根因

AI 把 DeepSeek 代理能力修好了，但没有把用户新的产品语义同步贯穿到入口配置、顶部状态、默认配置和文档。也就是说，后端接入已经偏向真实调用，但前端仍保留早期原型阶段的 provider 抽象，造成“代码能真跑，但用户看不出系统是否真跑”的问题。

### 修正

1. `defaultLlmConfig` 固定为 `provider: "external"`、`model: "deepseek-v4-flash"`、`endpoint: "/api/deepseek-chat"`。
2. App 顶部移除 provider 下拉框，改为 DeepSeek 连接状态胶囊；已保存密钥时显示“DeepSeek 已连接”。
3. 右侧设置固定显示 `deepseek-v4-flash` 和 `/api/deepseek-chat`，只允许保存或测试 DeepSeek 密钥。
4. TypeScript 配置类型移除用户可选的 `simulated` provider。
5. README、System Flow、Research Notes 和命名登记同步清理“当前默认 mock adapter”的残留说法。

### 新增验证标准

以后涉及 LLM 接入和 UI 配置必须验证：

- 页面上不能出现“模拟语言模型”选项。
- 顶部能根据 `/api/deepseek-config` 显示 DeepSeek 连接状态。
- 默认模型显示为 `deepseek-v4-flash`。
- 真实对话测试必须经过 `/api/deepseek-chat`，不能用模拟路径作为验收替代。

## 2026-06-02 完成本地提交后未同步 GitHub

### 用户指出的问题

用户指出：AI 似乎忘记 push 到 GitHub。

实际情况是，本地已经完成多人档案、人物场景一致性检测、扭曲时空密码门禁和右侧配置隐藏等改动，并形成提交，但最终没有执行 GitHub 远程同步。

### 错误类型

- 验证标准错误：最终检查只看了本地提交和工作区状态，没有检查本地分支是否领先 `origin/main`。
- 流程执行错误：`docs/DEVELOPMENT_METHOD.md` 和 `docs/SYSTEM_FLOW.md` 已明确“同步到 GitHub”，但 AI 在完成本地验证和提交后漏掉了 `git push`。

### 根因

AI 把“本地可回溯”误当成了“用户可在 GitHub 继续接手”。项目方法要求每个完成步骤既要本地 commit，也要在远程仓库同步；否则用户换机器或从 GitHub 查看时会看到旧版本。

之前的最终验收清单缺少两个动作：

1. 在提交后运行 `git status -sb`，确认本地分支与远程分支的 ahead/behind 状态。
2. 在需要同步时运行 `git push origin main`，并再次确认 `origin/main` 指向最新提交。

### 修正

1. 补充本错误勘验记录。
2. 单独提交该记录，保证流程错误本身可回溯。
3. 执行 `git push origin main`，把本地已完成提交同步到 GitHub。

### 新增验证标准

以后每次完成本地提交后必须验证：

- 运行 `git status -sb`，查看当前分支是否领先远程。
- 运行 `git log --oneline origin/main..HEAD`；如果存在本地未推送提交，必须 push，除非用户明确要求暂不推送。
- push 后再次运行 `git status -sb` 或等效命令，确认本地分支不再领先 `origin/main`。
- 最终回复必须明确说明 GitHub 是否已同步，以及同步到哪个分支。

## 2026-06-02 自动部署配置过程中的验证和凭据格式错误

### 用户指出的问题

用户要求总结刚才配置 GitHub Actions 自动部署过程中 AI 犯了哪些错误，以及以后如何避免。

本次配置目标是：新版本 push 到 GitHub `main` 后，GitHub Actions 自动构建并同步到 `<production-domain>` VPS，不再依赖手动部署。

### 错误现象

1. 第一次 GitHub Actions 自动部署失败在 `Upload release` 步骤。
2. 失败日志显示 runner 读取 SSH 私钥时报 `Load key "...": error in libcrypto`。
3. AI 在本地轮询 GitHub Actions 状态时，两次写了 CommonJS 脚本却使用 top-level `await`，导致本地监控脚本先报语法错误。
4. AI 把 `PRODUCTION_SSH_PORT=22` 也写成 GitHub secret，导致 Actions 日志里普通端口号被遮罩成 `***`，增加排障噪音。
5. 初版 workflow 没有排除纯文档变更，虽然最终补了 `paths-ignore`，但这本应在自动部署设计阶段就考虑到，避免部署记录文档 push 造成重复部署。

### 错误类型

- 验证标准错误：AI 只验证了本地 build、YAML 解析和 secret 是否存在，没有在首次 push 前验证“GitHub runner 能否正确还原并使用 SSH 私钥”。
- 实现边界错误：多行私钥作为普通 Actions secret 传入 shell 环境变量，格式稳定性不足；应该从一开始就用 base64 单行格式或成熟 SSH action。
- 流程执行错误：监控脚本本身没有先跑通，导致排查过程多产生两次无关错误。
- 运维设计疏漏：端口号这类非敏感常量不应放进 secret；纯文档变更不应触发生产部署。

### 根因

AI 把“本地能用这把 SSH key 登录 VPS”误当成了“GitHub Actions runner 一定能以同样格式使用 secret 里的私钥”。这忽略了 CI secret 注入的格式边界：多行文本经过 secret、环境变量、shell `printf`、OpenSSH 读取链路时，任何换行或末尾字符处理不稳都会导致私钥解析失败。

第二个根因是 AI 把自动部署当成一次性配置任务，而没有把它当成一个需要先设计失败路径的运维系统。自动部署不仅要会成功，还要避免误触发、便于排障、减少 secret 遮罩带来的日志噪音。

第三个根因是临时调试脚本写得太快。项目本身是 ESM，Node 临时脚本又用 `--input-type=commonjs`，但脚本里保留了 top-level `await`，说明 AI 没有先把辅助工具自身当成验收对象。

### 为什么之前验证没有发现

本地验证覆盖了：

- `npm run build`
- workflow YAML 解析
- GitHub secrets 名称存在
- VPS 免密 SSH 可用
- PM2 和目标目录存在

但缺少三项关键验证：

1. 在 GitHub runner 环境中实际解码/读取 SSH 私钥。
2. 首次 push 后立即按 job step 级别检查失败点，而不是只看最终失败状态。
3. 检查 workflow 触发条件是否会因为部署记录文档而重复触发。

### 修正

1. 将 `PRODUCTION_SSH_KEY` 改为 `PRODUCTION_SSH_KEY_B64`，在本地把部署私钥 base64 成单行 secret，在 workflow 中 `base64 --decode` 还原为 key 文件。
2. 删除旧的多行 `PRODUCTION_SSH_KEY` secret。
3. 删除 `PRODUCTION_SSH_PORT` secret，让端口使用 workflow 默认值 `22`，避免普通常量被日志遮罩。
4. workflow 增加 `paths-ignore`，纯 `docs/**` 和 `README.md` 变更不触发生产部署。
5. 重新 push 后验证 GitHub Actions run #2 和 run #3 成功，公网 `/health` 返回 `OK`，PM2 `<production-pm2-name>` online。
6. 部署成功后把最终部署记录写入 `docs/SYSTEM_FLOW.md`，并确认纯文档 commit 没有触发新的部署 run。

### 新增验证标准

以后配置或修改自动部署必须验证：

- SSH 私钥类 secret 优先使用 base64 单行格式，workflow 中显式解码后再使用。
- 只有真正敏感的值进入 GitHub secrets；端口号、目录名、PM2 进程名等常量放在 workflow `env` 或脚本常量里。
- 首次启用自动部署后必须检查 GitHub Actions 的 job step 结果，并记录成功 run URL。
- 修改 workflow 后必须验证 `paths-ignore` 或触发条件，避免纯文档变更造成生产重启。
- 用于排障的本地脚本也要先跑通；CommonJS 脚本不得使用 top-level `await`，除非改为 ESM。
- 最终验收同时包含 GitHub Actions 成功、公网 `/health`、PM2 online、最新备份路径和本地/远程 git 同步状态。

### 仍需注意

这条记录是旧 GitHub Actions 自动部署阶段的复盘。当前生产更新已改为站内管理员手动触发，后续不再以 GitHub Actions secrets 作为默认生产更新入口。

## 2026-06-02 发送消息后记忆召回阶段读取 undefined.length

### 用户指出的问题

用户点击“发送”后，输入框下方出现红色错误：

```text
Cannot read properties of undefined (reading 'length')
```

截图显示错误发生在发送默认消息“周末一起去爬山吗？”后，页面没有继续完成对话流程。

### 错误现象

复现后，右侧流程追踪停在“记忆召回 / 输入已发送”。Appraisal LLM 已返回输出，但该输出包含形状漂移：

- `speakerRelationship` 返回成字符串 `"current_conversation_partner"`，不是 `Relationship` 对象。
- `activatedConcerns` 中出现未知 concern id `waiting_for_project_reply`，不是当前状态里的标准 id。
- 下游 `memoryRetrieval` 在合成说话者关系摘要时读取 `appraisal.speakerRelationship.unresolvedIssues.length`，因为 `speakerRelationship` 不是对象，最终触发 `undefined.length`。

### 错误类型

- 实现边界错误：认知模块输出被当作强类型对象直接传给下游，但真实 LLM 的结构化 JSON 仍可能漏字段、错类型或 hallucinate id。
- 验证标准错误：之前验证了 happy path 和 build，没有用“坏结构化输出”作为回归输入验证模块边界。
- 架构假设错误：AI 假设 `outputContract` 足以保证真实 LLM 输出完全符合 TypeScript 类型，但这个假设不成立。

### 根因

`runCognitiveModule<TOutput>` 只负责调用外部 LLM 并把 JSON cast 成 `TOutput`。TypeScript 的类型只在编译期存在，不能证明真实模型返回的对象符合接口。

因此，Appraisal、Memory Recall、Decision、State Update 这些结构化认知模块都需要“模块出口归一化层”。此前只有 Runtime Signal Evaluation 有专门归一化，其他模块没有同等级别的保护。

### 为什么之前验证没有发现

之前的验证只覆盖：

- `npm run build`
- 浏览器中正常点击发送
- 线上 `/health`
- 页面无 console error

这些验证没有模拟真实 LLM 常见的结构漂移，例如：

- 对象字段返回成字符串。
- 数组字段缺失。
- 枚举值超出允许范围。
- concern id 或 relationship id 不在当前状态中。

因为没有这种坏输出回归，`speakerRelationship.unresolvedIssues.length` 这样的隐含假设就留在了代码里。

### 修正

1. `runAppraisal` 在返回前调用 `normalizeAppraisalResult`：
   - `speakerRelationship` 如果不是对象，就回退到当前说话者的关系档案。
   - `eventId` 强制使用当前事件 id。
   - `activatedConcerns` 只保留当前状态中已知的 concern id；如果全无有效项，回退到本地候选。
   - `matchedTriggers` 字符串或缺失时归一化为数组。
2. `retrieveMemory` 返回前调用 `normalizeMemoryRecallResult`：
   - `shortTermContext` 和 `longTermMemories` 保证为数组。
   - 空数组被视为合法判断，不误回退。
3. `decideResponse` 返回前调用 `normalizeResponseDecision`：
   - `responseMode` 必须落在 `ResponseMode` 枚举中，否则回退。
4. `applyStateUpdates` 的 LLM 计划返回前调用 `normalizeStateUpdatePlan`：
   - `concernUpdates`、`relationshipUpdates` 和 `newConcerns` 缺失时回退。
   - 空数组被视为合法判断。
   - 未知 concern id 被过滤。
5. `memoryRetrieval` 内部读取 `unresolvedIssues` 前也增加数组判断，避免再次依赖裸 `.length`。
6. 更新命名登记和系统流程，明确结构化认知模块输出必须先归一化再进入下游。

### 新增验证标准

以后涉及认知模块结构化输出必须验证：

- Appraisal 输出中 `speakerRelationship` 为字符串时，发送流程仍能完成。
- `activatedConcerns` 包含未知 concern id 时，下游不会崩溃。
- Memory Recall / State Update 返回空数组时，应被当作合法判断，而不是错误。
- 页面点击默认消息后，流程能到达“状态变化 / 完成”，且不显示红色错误。
- 每个新增结构化认知模块都要有出口归一化层；不能只依赖 TypeScript 类型或 prompt 的 `outputContract`。

### 仍需注意

当前修正是确定性归一化，不是严格 JSON Schema 校验。后续如果更换支持 schema 的模型或代理层，应在 `/api/deepseek-chat` 侧增加 schema validation，让坏输出在模块边界就被重试或修复，而不是只靠前端归一化兜底。

## 2026-06-03 推送登录审计后线上 502

### 用户指出的问题

用户打开 `<production-url>/` 后看到：

```text
502 Bad Gateway
nginx/1.24.0 (Ubuntu)
```

故障发生在 `ce1dead feat: add liao auth and audit logging` 推送并触发自动部署之后。

### 错误现象

公网 `curl <production-url>/` 复现 502。nginx 仍在响应，但上游 `127.0.0.1:<production-port>` 的 Node/PM2 服务不可用。

本地按 GitHub Actions 原部署包清单复现：

```bash
tar --create --gzip --file release.tgz dist server.mjs package.json package-lock.json
tar --extract --gzip --file release.tgz --directory /tmp/release
cd /tmp/release
node server.mjs
```

得到：

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../serverSupport.mjs' imported from .../server.mjs
```

### 错误类型

- 实现边界错误：生产入口 `server.mjs` 新增了对 `serverSupport.mjs` 的运行时依赖，但自动部署的 release archive 清单没有同步更新。
- 验证标准错误：本地验证只跑了仓库完整工作树里的 `npm run build` 和 `npm run start`，没有用“部署归档内容”启动一次服务。
- 流程错误：推送后没有立即等待并核对 GitHub Actions 部署结果和公网 `/health`，导致用户先发现线上 502。

### 根因

`.github/workflows/deploy-production.yml` 的打包步骤仍是旧清单：

```text
dist server.mjs package.json package-lock.json
```

新增登录、共享档案和审计能力时，服务端公共逻辑被拆到 `serverSupport.mjs`，但 deployment package 没有包含它。GitHub Actions 解压新版本后，`server.mjs` 在 Node ESM import 阶段找不到 `serverSupport.mjs`，PM2 服务无法正常启动，nginx 反代因此返回 502。

### 为什么之前验证没有发现

之前验证运行在完整仓库目录中，`serverSupport.mjs` 本地存在，所以 `npm run build` 和本地生产服务都能通过。这个验证没有模拟 GitHub Actions 的发布包边界，也没有检查 tar 包内是否包含所有生产运行时文件。

更深层的问题是：生产服务入口文件新增依赖时，AI 只更新了代码和常规文档，没有把“生产归档清单”当成同等重要的模块协作边界。

### 修正

1. 修改 `.github/workflows/deploy-production.yml` 的 `Package release` 步骤，把 `serverSupport.mjs` 加入 release archive。
2. 同一步骤增加 `tar --list ... | grep -Fx serverSupport.mjs`，让 workflow 在归档缺少该运行时依赖时直接失败，而不是部署后才由 PM2 暴露。
3. 更新 `docs/SYSTEM_FLOW.md` 的生产部署路径，明确部署包包含 `server.mjs` 和 `serverSupport.mjs`。

### 新增验证标准

以后新增或移动生产服务端运行时文件时必须验证：

- GitHub Actions release archive 清单包含所有被 `server.mjs` 直接或间接 import 的本地文件。
- 本地至少跑一次“按 release archive 解压后启动 `node server.mjs`”的部署包边界验证。
- 推送触发生产部署后，必须等待 GitHub Actions 完成，并重新验证公网 `/health` 和首页。
- 生产部署 workflow 应在归档阶段检查关键运行时文件存在，不能只依赖 PM2 启动失败作为反馈。

### 仍需注意

当前生产部署包仍使用手写 tar 清单。后续如果服务端文件继续增多，应考虑改成明确的 `server/` 目录或生成部署 manifest，避免每次新增运行时文件都需要人工同步 tar 清单。

## 2026-06-03 功能更新后忘记升级左上角版本号

### 用户指出的问题

用户指出：每次更新后都应该变更左上角版本号，这次内置人物分组、位置属性和审计删除功能更新后，版本仍停在 `0.1.1`，本次应升级为 `0.2.0`，并且版本号也要写入工作流。

### 错误类型

- 流程错误：完成可回溯功能提交时，没有把版本号更新纳入收尾清单。
- 验证标准错误：浏览器验证确认了 UI 功能和页面可用，但没有检查左上角 `appVersionLabel` 是否反映新版本。
- 部署流程遗漏：GitHub Actions 没有显式记录和校验本次部署目标版本，只依赖 `package.json` 被前端读取。

### 根因

左上角版本号由 `src/App.tsx` 读取 `package.json` 的 `version` 生成，但实现功能时只关注了数据、权限、UI 和部署包边界，没有把版本提升视为功能完成的一部分。工作流也没有 `APP_VERSION` 这类显式目标版本，所以即使忘记更新版本号，构建仍会通过。

### 为什么之前验证没有发现

之前的验证覆盖了：

- `npm run build`
- 内置档案数量和分组
- release archive 启动健康检查
- 浏览器桌面和移动端冒烟

这些验证都没有断言页面左上角显示的版本号，也没有在工作流层比较 `package.json` 与 `package-lock.json` 的版本一致性。

### 修正

1. 将 `package.json` 和 `package-lock.json` 版本从 `0.1.1` 升级到 `0.2.0`。
2. 在 `.github/workflows/deploy-production.yml` 增加 `APP_VERSION: "0.2.0"`。
3. 在 GitHub Actions 中新增 `Verify app version` 步骤，校验 `APP_VERSION`、`package.json` 和 `package-lock.json` 根版本一致。
4. 更新命名登记、系统流程和部署自动化文档，明确 `APP_VERSION` 是部署版本校验边界。

### 新增验证标准

以后每次完成用户可见功能更新时必须验证：

- `package.json` 和 `package-lock.json` 根版本一致。
- 页面左上角 `appVersionLabel` 显示新版本。
- 若没有 GitHub Actions 部署 workflow，则确认部署文档没有残留 `APP_VERSION` workflow 约束。
- 本地 build 日志显示新版本对应的 package script，例如 `virtual-human-flow@0.2.0 build`。

## 2026-06-03 Public 仓库暴露生产信息

### 用户指出的问题

用户指出 GitHub 上的 README 暴露了服务器地址和私有部署信息。仓库当前是 public，用户原本想设为 private，但担心私有仓库会影响 AI 访问。

### 错误类型

- 隐私边界错误：把生产域名、部署目录、PM2 进程、反代配置、备份路径等运维细节写入 public repo 文档。
- 配置边界错误：自动部署 workflow 中硬编码了生产目录、备份目录、PM2 进程名和端口。
- 认证边界错误：登录用户源 origin 曾经作为默认值写在服务端代码里，而不是完全来自环境配置。

### 根因

AI 把 README 和 docs 当作团队内部运维 runbook 使用，没有根据仓库 public/private 状态调整信息粒度。部署文档可以记录“需要哪些配置”和“操作边界”，但不应该记录具体服务器地址、真实路径、真实进程名或上游登录站点。

### 修正

1. README 和部署文档中的生产信息改为占位符或泛化描述。
2. GitHub Actions workflow 的生产应用目录、备份目录、PM2 进程名、端口和登录源改为 GitHub Actions secrets。
3. 服务端登录源 `LIAO_CHATROOM_ORIGIN` 不再有硬编码默认值；未配置时登录接口直接失败。
4. 命名登记和系统流程同步改为泛化生产环境说明。

### 新增验证标准

以后提交或 push 到 public repo 前必须运行敏感信息搜索，至少覆盖：

- 生产域名、登录源域名、真实服务器路径、反代配置路径、PM2 进程名、固定生产端口。
- workflow 中是否存在 `PRODUCTION_*: /...`、真实 release 文件名或真实站点名。
- README/docs 是否把占位符写回成真实环境信息。

### 剩余风险

普通提交只能清理默认分支当前内容，不能自动抹掉 Git 历史、GitHub cached view、fork 或外部索引里曾经出现过的信息。如果这些信息已经公开过，下一步应考虑把 GitHub repo 设为 private；若要从 public 历史中彻底移除，需要做历史重写并 force push。若曾暴露过密码、token、私钥或可直接登录的凭据，必须立即轮换；本次勘验针对的是服务器地址和部署细节，不等同于凭据泄漏。

## 2026-06-03 GitHub 自动部署没有更新网站

### 用户指出的问题

用户指出 GitHub push 后网站没有自动更新，并进一步要求去掉 GitHub 自动更新网站的动作，改成站内检查新版本、管理员点击后由 VPS 拉取仓库更新。

### 错误类型

- 流程边界错误：隐私脱敏提交使用了 `[skip ci]`，这会阻止 GitHub Actions 自动部署；后续又把生产参数改成 secrets，自动部署链路已经不再适合继续作为默认更新路径。
- 产品边界错误：把“push 到 GitHub”直接等同于“生产网站更新”，让部署时机脱离管理员确认。
- 验证标准错误：push 后只确认了 git 远端同步，没有把“网站资源 hash 是否变成当前构建产物”作为验收项。

### 根因

早期为了快速部署，GitHub Actions 被设计成 push main 自动更新生产环境。但仓库改为 private、README 需要脱敏、生产配置需要从仓库挪到服务器环境后，自动部署的便利性开始和隐私/控制权冲突。尤其是 `[skip ci]` 用来避免隐私修复触发部署，却也让“推了代码就上线”的心智模型失效。

### 修正

1. 删除 `.github/workflows/deploy-production.yml`，GitHub push 不再自动更新网站。
2. 新增 `/api/app-update/status`，左上角自动检查 VPS 当前提交和 GitHub 远端提交是否一致。
3. 新增 `/api/app-update/run`，只有管理员可以触发 VPS 在 `APP_UPDATE_WORKDIR` 中执行 `git fetch`、`git pull --ff-only`、`npm ci`、`npm run build` 和重启命令。
4. 前端更新窗显示进度条和服务端命令日志。
5. 部署文档改为站内手动更新，并明确当前 tar 包部署需要一次人工引导成 git 工作树。

### 新增验证标准

以后涉及部署更新必须验证：

- GitHub push 是否只是同步代码，不能误触发生产部署。
- 左上角显示的版本号来自最新 `package.json`。
- `/api/app-update/status` 能返回当前提交、远端提交和是否有新版本。
- `/api/app-update/run` 必须要求管理员会话，普通用户不能执行。
- 如果生产目录不是 git 工作树，界面必须显示未配置，而不是假装可以更新。

### 仍需注意

站内更新功能本身需要先被部署到 VPS。若当前线上目录仍是旧 tar 包而不是 git clone，需要先手动完成一次引导部署，设置 `APP_UPDATE_WORKDIR` 和 PM2 重启命令后，后续才能由管理员在站内更新。
