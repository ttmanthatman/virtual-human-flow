# System Flow

本文档说明系统如何运作、数据如何流动、模块之间如何调用。它既给用户看，也给 AI 后续开发使用。

## 当前阶段

当前已建立第一版本地 MVP：三栏工作台展示分组多人档案、人物状态、当前位置、聊天室、流程追踪和生成监视。系统能根据用户素材预览人物档案和配套场景，并在发送消息后展示多模块 LLM 数据流。

开发工作流已改为模块上下文包模式。每轮先读轻量启动文档、错误精髓摘要和 `docs/modules/<module>.md`，再用 `rg` 从 `docs/AI_NAMING_REGISTRY.md` 与本文档中抽取本模块相关片段。只有跨模块协作、权限边界、数据流、部署路径或广域架构变化时，才全量阅读并更新本文档。

当前系统已接入登录和权限边界。未登录用户可以看到完整工作台界面，但发送消息、切换档案、生成或应用档案、保存 DeepSeek 密钥、测试 DeepSeek、查看审计等操作会打开登录浮窗。登录账号来自 `LIAO_CHATROOM_ORIGIN` 配置的聊天室用户；本项目只调用 liao 聊天室 `/api/login` 校验用户名和密码，不保存密码，不修改聊天室数据。

管理员权限沿用 liao 聊天室登录结果里的 `isAdmin`。只有管理员可以新增、保存、删除或应用共享多人档案，也可以修改档案分组；普通登录用户可以读取、选择和使用管理员保存的共享档案。用户对话时产生的中间栏消息仍按 `userId + dossierId` 隔离：前端切换人物时通过 `/api/persona-dossiers/:id/conversation-history` 加载中间栏消息，发送后写入 `.conversation-histories.local.json`。服务端角色运行态通过 `/api/persona-dossiers/:id/conversation-state` 按 `dossierId` 写入 `.conversation-states.local.json` 的全局角色条目；短期记忆、长期记忆、runtime 状态、关系变化、对各用户的关系印象、scene 和 location 都由同一个人物共享，不覆盖 `.persona-dossiers.local.json` 中的共享底稿。

系统启动时会合并 `builtinPersonaDossiers.mjs` 中的内置全局档案和 `.persona-dossiers.local.json` 中管理员保存的共享档案。当前内置 14 个档案：7 个“马可福音10”人物和 7 个“郑州市”人物；每个档案都包含人物、从小到大的关键经历、心理变化、关系变化、熟人关系、场景、分组和位置属性。管理员删除内置档案时不会改源码，而是在运行时存储里记录 tombstone。

人物档案显示分成预览和详细。详细档案直接来自 `CharacterProfile` 的 `fullLifeStory`、`lifeEvents`、`personalityFacets` 和 `relationships`；预览短文由 DeepSeek 生成，不由源码手写。角色缺少 `personaDossier.previewSummary` 时，UI 显示“预览生成中”并在左侧档案卡显示扫光动画；登录用户打开该角色后，前端调用 DeepSeek 生成短预览，再通过 `/api/persona-dossiers/:id/preview` 全局保存。短预览生成和管理员人物/场景生成使用独立生成状态，不设置聊天 `isRunning`，因此生成过程中仍可发送对话。

后台会记录每个登录用户的一次输入、虚拟人输出和本轮对话的模块调用记录，并在新审计记录里保存本轮 `conversationEventId` 和中间栏消息 ID，作为删除同轮运行态的锚点。审计记录写入 `.conversation-audits.local.json`，中间栏历史写入 `.conversation-histories.local.json`，角色全局对话运行态写入 `.conversation-states.local.json`，共享档案写入 `.persona-dossiers.local.json`；这些都是运行时文件，被 `.gitignore` 忽略。中间栏临时心理流来自 `PipelineStepProgress.mindFlow`，只在当前轮 streaming 展示和折叠，不写入后台历史。只有管理员可以通过 `/api/conversation-audits` 读取、删除单条或清空审计，也可以通过 `/api/conversation-audits/export` 导出所选记录或完整导出所有用户的所有输入输出审计记录；删除审计时会级联清理同轮中间栏消息、短期记忆、长期记忆和关系记忆片段，前端同步清理当前消息桶和 localStorage，避免旧缓存回填。管理员还可以通过 `/api/admin/conversation-histories` 按人物查看各用户中间栏历史，并通过 `/api/persona-dossiers/:id/reset-conversation` 将当前角色恢复到共享档案底稿，同时清理该角色所有用户历史、全局运行态和对应审计。

重要约束：Reply LLM 只接收自然语言上下文，只生成角色说出口的话。不能把 JSON、字段名、输出契约、工程术语或类似编程语言的内容混进这一步。

认知模块是另一类 LLM 调用。Appraisal、Memory Recall、Decision、State Update 都是独立的脑区式 LLM 模块；它们可以根据模块需要使用自然语言或结构化输出，因为它们不是角色台词生成器，而是系统内部的判断模块。

真实 LLM 的结构化输出必须先经过确定性归一化，再交给下游模块；自然语言输出则保留为 narrative，并用兼容字段承接旧下游。Memory Recall 和 State Update 等结构化模块有出口归一化层，用来处理数组缺失、关系对象变成字符串、未知 memory id 或枚举漂移等情况。如果外部结构化 JSON 被截断或无法解析，Cognitive Module Client 会记录 `fallbackReason` 并使用本地候选结果继续流程，不能让用户对话卡死。归一化层不能改变 Reply LLM 的自然语言边界，它只保护内部认知模块的数据契约。

Reply LLM 的自然语言结果也要过台词边界归一化：开头括号动作旁白和说话人标签会被剥离，最终写入聊天历史、状态更新和审计的 `ReplyOutput.reply` 只保留角色实际说出口的话。

Memory Recall 不是敏感词召回。当前同步路径先在本地构建自然语言候选清单，包含短期上下文、长期记忆和关系记忆候选，再交给 Memory Recall LLM 复判；Memory Recall LLM 只选择短期/长期记忆 ID，不输出完整短期记忆、长期记忆摘要或召回因子，完整内容由本地候选表回填。短期上下文只取同一说话者/本角色在短时间窗内的消息，跨天或其他用户历史不会被描述成“刚才”。未来异步生命路径也复用同一套召回上下文，只是 `source` 从 `sync_response` 变成 `async_life`。

左侧 UI 里的 DeepSeek 预览、性格标签、能量、情绪、情绪倾向、唤醒度和当前位置是给人快速观察的摘要。它们由 DeepSeek 预览缓存、State Update 确定性写入的 runtime 展示信号、种子档案或管理员维护字段提供，不由 Reply LLM 直接控制台词。Runtime Signal Evaluation 在同步对话里只保留本地快照和 trace，不再调用外部 LLM 覆盖 State Update 刚写入的 runtime。提交给 Reply LLM 的是 `fullLifeStory`、`lifeEvents`、`socialPersonaPattern`、`personalitySummary`、`personalityFacets`、`relationships`、`runtime.signalProfiles.*.cognitiveNarrative`、`scene.cognitiveNarrative`、`characterLocation` 和 `mapContext` 等自然语言综合描述。

对话开始后，系统不再把人物固定在档案初始场景。Conversation Pipeline 会先运行本地 `temporalSceneProgression`：根据 `CharacterState.location` 推断时区，用该地真实当前时间判断人物更可能在工作、通勤、住处、睡眠或临时外出场景，再把 `scene/location` 推进为同一地理范围内的自然现场。对话可以触发离开原场景，但只允许同城或同区域内合理移动；触发后的场景会写入角色全局运行态，刷新后和其他用户读取同一人物时都会承接。普通下一轮消息会先保持最近对话触发的移动或临时场景一段合理时间，不会立刻被 routine 拉回工作模板；超过合理时间后，routine 仍可继续推进上班、睡眠、通勤和回家。未来邀约不会立刻移动，跨城/跨国或世界观不可能的地点会被记录为 blocked 场景上下文，不会瞬移。

人物属性、状态信号和场景叙述只描述内部倾向、形成原因、身体感、关系距离和注意力落点，不能写成“回复应如何”“不要如何”“用什么话术”这类直接指令。Reply Prompt 的作用是把这些自然语言材料过一遍，让回复从人物整体状态中长出来，而不是让某个单独指标指挥台词风格。

人物档案和场景预览也属于认知模块，不是本地字符串拼接。这里的“预览”指管理员应用前的待应用预览：人物档案预览通过 Dossier Interpretation LLM 将用户素材拆成展示摘要、生平事件、长期记忆、人性/人格、标签、关切和状态信号；场景预览通过 Scene Interpretation LLM 将用户素材拆成场景摘要、状态影响和人物影响。预览应用时写入的是 LLM 解读后的结构化状态，而不是用户原文。左侧人物短预览是另一条 DeepSeek 缓存路径：它只生成 `personaDossier.previewSummary`，不改详细档案。

人物档案和场景设置作为 `personaDossier` 成组保存。左侧可以按 `personaDossierGroup` 分组展示、新建、切换和删除档案；切换档案时人物状态、人物素材、场景素材和位置属性一起切换。应用人物或场景预览前，Profile Scene Consistency LLM 会判断人物与场景是否处于同一世界观、时代和社会语境；现代人物进入古代场景这类硬冲突需要输入本地“扭曲时空密码”才能继续。

DeepSeek 接入必须关闭思考模式。应用固定使用真实 DeepSeek 本地代理和 `deepseek-v4-flash`，不再暴露模拟语言模型选项。代理层对所有 DeepSeek Chat Completions 请求显式传入 `thinking: { type: "disabled" }`，不发送 `reasoning_effort`，并把 `deepseek-reasoner` 纠正为 `deepseek-v4-flash`。

流程追踪面板不是事后 dump。每个模块开始时会自动切换到当前步骤，并显示该模块的输入、流式输出和状态。右侧面板分为对话流程和生成监视两组，生成监视覆盖人物短预览、人物档案生成和场景生成。每个步骤都必须让用户能分清“发给模块的输入”和“模块返回的输出”。

## 总体工作流

```mermaid
flowchart TD
    A[用户描述架构意图] --> B[AI 读取前置文档]
    B --> ES[AI 读取错误精髓摘要]
    ES --> MOD[确定本轮模块边界]
    MOD --> PACK[读取 docs/modules 对应模块包]
    PACK --> LOOKUP[rg 查询命名表和系统流相关片段]
    LOOKUP --> C[AI 检查 Git 状态]
    C --> D{架构是否清楚}
    D -- 否 --> E[提问或启用 grill-me]
    E --> A
    D -- 是 --> F[调研类似项目和经验]
    F --> I[实现最小可验证变更]
    I --> GP{模块包是否变化}
    GP -- 是 --> GPACK[更新 docs/modules 模块包]
    GP -- 否 --> NAMES{是否新增或改名}
    GPACK --> NAMES
    NAMES -- 是 --> G[更新命名登记表相关片段]
    NAMES -- 否 --> FLOW{协作或数据流是否变化}
    G --> FLOW
    FLOW -- 是 --> H[更新系统流程文档]
    FLOW -- 否 --> V[同步递增 package 版本号]
    H --> V
    V --> J[本地验证]
    J --> K[Git 提交留底]
    K --> L[同步到 GitHub]
    L --> M{是否需要部署}
    M -- 是 --> N[备份线上配置]
    N --> O[只部署 <production-domain>]
    O --> P[记录回滚方式]
    M -- 否 --> Q[等待下一步]
    P --> Q
```

## 文档和代码关系

```mermaid
flowchart LR
    DM[DEVELOPMENT_METHOD.md] --> WORK[每轮开发动作]
    MI[docs/modules 模块上下文包] --> WORK
    NR[AI_NAMING_REGISTRY.md 相关片段] --> WORK
    SF[SYSTEM_FLOW.md 相关片段] --> WORK
    MPR[MODULE_PARAMETER_FLOW_REVIEW.md] --> WORK
    EI[ERROR_INSPECTIONS.md 顶部摘要] --> WORK
    WORK --> CODE[代码和配置]
    CODE --> MI
    CODE --> NR
    CODE --> SF
    CODE --> MPR
    CODE --> EI
    CODE --> VER[package.json/package-lock.json 版本同步]
    VER --> GIT[Git 提交]
    GIT --> GH[GitHub 远程仓库]
    GH --> WAIT[等待站内管理员更新]
    WAIT --> VPS[<production-domain> 部署]
```

`docs/MODULE_PARAMETER_FLOW_REVIEW.md` 是参数级人工审核清单：它逐项列出共享数据对象字段、模块入参/输出、内部派生参数和跨模块流向。`docs/SYSTEM_FLOW.md` 继续负责系统协作图和架构叙述；当模块参数或模块间数据流变化时，两个文件应同步更新。

## 生产部署路径

```mermaid
flowchart TD
    G[推送 GitHub main] --> CHECK[左上角 /api/app-update/status 自动检查]
    CHECK --> NEW{远端提交不同?}
    NEW -- 否 --> IDLE[显示已是最新]
    NEW -- 是 --> ADMIN[管理员点击更新服务器]
    ADMIN --> API[POST /api/app-update/run]
    API --> VERIFY[校验管理员会话和 APP_UPDATE_WORKDIR]
    VERIFY --> CLEAN[检查 git 工作树干净]
    CLEAN --> PULL[git fetch + git pull --ff-only]
    PULL --> INSTALL[npm ci]
    INSTALL --> BUILD[npm run build]
    BUILD --> RESTART[PM2 或自定义命令重启]
    RESTART --> SRV[server.mjs: 服务前端和 DeepSeek API]
    SRV --> PM2[PM2 <production-pm2-name>: 127.0.0.1:<production-port>]
    PM2 --> NGINX[Nginx <production-domain>.conf]
    NGINX --> SITE[<production-url>]
    SRV --> KEY[.deepseek.local.json: 线上本地密钥文件]
    SRV --> DS[DeepSeek API]
    PM2 --> HEALTH[health check: 127.0.0.1:<production-port>/health]
```

生产不再由 GitHub Actions push 自动部署。服务器通过 `APP_UPDATE_WORKDIR` 指向 VPS 上的 git clone 工作树，左上角自动检查远端分支是否有新提交；只有管理员可以触发 `/api/app-update/run`。更新过程会在站内窗口显示步骤、stdout/stderr 和进度。`LIAO_CHATROOM_ORIGIN`、`APP_UPDATE_WORKDIR`、`APP_UPDATE_PM2_NAME` 或 `APP_UPDATE_RESTART_COMMAND` 等生产环境变量留在 VPS，不写入仓库。

## 当前 MVP 同步响应路径

```mermaid
flowchart TD
    U[用户在对话区输入消息] --> AUTH{是否已登录}
    AUTH -- 否 --> LOGIN[打开登录浮窗]
    AUTH -- 是 --> E[事件输入]
    E --> A[评估模块: 判断事件触发关切]
    A --> M[记忆召回模块: 本地候选 + LLM只选择ID]
    M --> D[回应决策模块: 判断是否回应和回应姿态]
    D --> P[Prompt Generator: 生成自然语言回复上下文 + 位置语境]
    P --> R[DeepSeek Flash Reply LLM: 只生成角色台词]
    R --> S[状态更新模块: 判断状态和记忆变化]
    S --> G[信号评估模块: 评估能量/情绪/情绪倾向/唤醒度]
    G --> W[确定性写回: clamp/append/commit]
    W --> C[聊天室显示回复]
    W --> T[流程追踪面板显示每个模块输入/输出/状态]
    W --> AUDIT[后台审计: 记录用户输入和虚拟人输出]
    A -. 流式输出 .-> T
    M -. 流式输出 .-> T
    D -. 流式输出 .-> T
    R -. 流式输出 .-> T
    S -. 流式输出 .-> T
    G -. 流式输出 .-> T
```

## 登录与权限路径

```mermaid
flowchart TD
    A[未登录用户看到工作台] --> B{用户发起操作}
    B -- 查看界面 --> C[允许查看]
    B -- 发送/切换/保存/审计/测试 --> D[打开登录浮窗]
    D --> E[提交用户名和原密码]
    E --> F[Server Support: POST liaoChatroom /api/login]
    F --> G{liao 返回 success?}
    G -- 否 --> H[显示登录失败]
    G -- 是 --> I[createLocalSession: 生成本项目 token]
    I --> J[App Shell 保存 authToken/authUser]
    J --> K{isAdmin?}
    K -- 是 --> L[可维护共享档案和查看审计]
    K -- 否 --> M[可选择共享档案和对话]
```

本项目的本地 `authSession` 存在内存中，服务重启后需要重新登录。上游 liao token 不返回前端，也不写入仓库；用户密码只在登录请求中转发给 `LIAO_CHATROOM_ORIGIN` 配置的 liao 聊天室校验。

## 记忆召回路径

```mermaid
flowchart TD
    E[事件输入] --> Q[合成 naturalLanguageQuery]
    A[事件评估输出] --> N[认知模块输出归一化]
    N --> Q
    C[激活关切] --> Q
    R[说话者关系] --> Q
    Q --> S[长期记忆本地混合排序]
    L[长期记忆库] --> S
    S --> F[召回因子: 自然语言相关/关切/关系/情绪/近期/词面]
    F --> M[Memory Recall LLM 只选择记忆ID]
    B[短期记忆最近几轮] --> M
    M --> H[本地回填短期记忆和长期记忆摘要/factors]
    H --> O[MemoryRecallResult]
    O --> D[回应决策]
    O --> P[Prompt Generator]
    X[未来异步生命路径] -. 复用召回上下文 .-> Q
```

本地混合排序只是候选层，不是最终心理判断。它的责任是避免把整个历史粗暴塞给模型，同时避免只按敏感词命中决定召回。Memory Recall LLM 可以提升“没有词面命中但语义相关”的记忆，也可以压低“只是撞词但语义无关”的记忆。

## 生成预览路径

```mermaid
flowchart TD
    A[用户输入人物或场景素材] --> B{预览类型}
    B -- 人物档案 --> D[人物档案解读 LLM]
    B -- 场景 --> E[场景解读 LLM]
    D --> D1[分类: 生平事件/长期记忆/人性人格/标签/关切/状态信号]
    E --> E1[分类: 场景摘要/状态影响/人物影响]
    D -. 流式输出 .-> MONITOR[右侧生成监视]
    E -. 流式输出 .-> MONITOR
    D1 --> F[确定性归一化: 限长/补 ID/clamp/去原文整段]
    E1 --> F
    F --> G[左侧显示摘要预览]
    G --> H{用户是否应用}
    H -- 否 --> J[保留原状态]
    H -- 是 --> K[人物场景一致性检测 LLM]
    K --> L{是否硬冲突}
    L -- 否 --> I[写入当前 personaDossier 状态]
    L -- 是 --> M[要求输入扭曲时空密码]
    M -- 正确 --> I
    M -- 错误或取消 --> J
```

## 人物短预览缓存路径

```mermaid
flowchart TD
    A[登录用户选中角色] --> B{是否已有 previewSummary}
    B -- 有 --> C[左侧显示 DeepSeek 预览]
    B -- 无 --> D[显示 预览生成中]
    D --> ANIM[左侧档案卡扫光动画]
    D --> E[调用 /api/deepseek-chat 生成短预览]
    E -. 流式输出 .-> TRACE[右侧生成监视: 输入/输出/状态]
    E --> F[POST /api/persona-dossiers/:id/preview]
    F --> STORE[.persona-dossiers.local.json]
    STORE --> C
```

## 多人档案路径

```mermaid
flowchart TD
    BUILTIN[builtinPersonaDossiers.mjs] --> MERGE[Server Support 合并档案]
    STORE[.persona-dossiers.local.json] --> MERGE
    MERGE --> A[左栏分组多人档案列表]
    A --> GROUP[按 personaDossier.groupName 分组]
    GROUP --> B{用户操作}
    B -- 新建/保存/删除/改分组/应用预览 --> ADMIN{是否管理员}
    ADMIN -- 否 --> BLOCK[阻止修改或打开登录浮窗]
    ADMIN -- 是 --> C[写入后台 sharedPersonaDossier]
    B -- 切换 --> LOGIN{是否已登录}
    LOGIN -- 否 --> POP[打开登录浮窗]
    LOGIN -- 是 --> D[读取 personaDossier.state]
    C --> STORE
    C --> TOMBSTONE[内置档案删除时记录 deletedBuiltinDossierIds]
    TOMBSTONE --> STORE
    USERSTORE[.conversation-states.local.json] --> OVERLAY[叠加角色全局运行态]
    HISTSTORE[.conversation-histories.local.json] --> CHATLOAD[加载当前用户当前人物历史]
    HISTSTORE --> ADMINHIST[管理员按人物列出/读取用户历史]
    MERGE --> READ[登录用户读取全局可用档案]
    READ --> OVERLAY
    OVERLAY --> D
    D --> H[左栏人物/场景/位置输入同步切换]
    D --> CHATLOAD
    D --> ADMINHIST
    CHATLOAD --> CHATUI[中间栏对话历史]
    ADMINHIST --> CHATUI
    H --> I[聊天室后续使用当前档案状态]
    I --> J[对话 pipeline 产出 nextState]
    I --> SAVEHIST[POST /api/persona-dossiers/:id/conversation-history]
    SAVEHIST --> HISTSTORE
    J --> K[POST /api/persona-dossiers/:id/conversation-state]
    K --> USERSTORE
    K --> R[查找全局运行态中与当前角色有关联的其他 personaDossier]
    R --> N[写入全局压缩关系余波]
    N --> USERSTORE
```

内置档案和管理员保存的多人档案都是全局可用共享底稿。普通用户选择它之后可以对话使用；中间栏消息会保存到 `.conversation-histories.local.json` 中当前 `userId + dossierId` 条目，切换人物时重新读取。登录用户历史以服务端返回为准；如果服务端返回空历史，前端必须清空内存消息桶和 localStorage，不能把旧缓存再写回服务器。对话产生的短期记忆、长期记忆、runtime 状态、关系变化、场景和位置会写回 `.conversation-states.local.json` 中当前 `dossierId` 的全局角色条目。系统不让不同用户共享中间栏聊天历史，但会让所有用户读取同一人物的同一份角色记忆和场景状态。为了让熟人关系在角色网络中产生影响，后台把压缩后的关系余波写给全局运行态里相关人物，不把用户原始长对话全文扩散给其他用户的中间栏历史或共享底稿。

## 对话审计路径

```mermaid
flowchart TD
    U[登录用户发送消息] --> PIPE[同步对话 pipeline]
    PIPE --> OUT[虚拟人输出或失败信息]
    OUT --> AUDIT[POST /api/conversation-audits]
    PIPE --> MODULES[模块调用记录: event/appraisal/memory/decision/prompt/reply/state/signals/delta]
    MODULES --> AUDIT
    AUDIT --> STORE[.conversation-audits.local.json]
    ADMIN[管理员点击输入输出审计] --> READ[GET /api/conversation-audits]
    READ --> STORE
    READ --> UI[右侧审计浮层展示每个用户输入输出和模块调用]
    UI --> EXPORTSEL[选择记录后 POST /api/conversation-audits/export]
    ADMIN --> EXPORTALL[完整导出所有用户所有记录]
    EXPORTALL --> EXPORTAPI[POST /api/conversation-audits/export]
    EXPORTSEL --> EXPORTAPI
    EXPORTAPI --> STORE
    EXPORTAPI --> JSON[下载 JSON 导出文件]
    UI --> DELONE[DELETE /api/conversation-audits/:id]
    UI --> CLEAR[DELETE /api/conversation-audits]
    ADMIN --> RESET[POST /api/persona-dossiers/:id/reset-conversation]
    DELONE --> STORE
    CLEAR --> STORE
    DELONE --> HISTSTORE[.conversation-histories.local.json 清理同轮消息]
    DELONE --> STATESTORE[.conversation-states.local.json 清理同轮记忆]
    CLEAR --> HISTSTORE
    CLEAR --> STATESTORE
    RESET --> HISTSTORE
    RESET --> STATESTORE
    RESET --> STORE
    RESET --> BASE[共享档案底稿保持不变]
    USER[普通用户] -. 请求读取 .-> DENY[403: 只有管理员可以执行此操作]
```

## 生成预览写回边界

```mermaid
flowchart TD
    A[Dossier Interpretation LLM] --> B[profile.displaySummary]
    A --> C[profile.fullLifeStory/lifeEvents/socialPersonaPattern]
    A --> C2[profile.personalitySummary/personalityFacets]
    A --> D[concerns]
    A --> E[longTermMemory]
    A --> F[runtime.signalProfiles]
    S[Scene Interpretation LLM] --> T[scene]
    S --> U[runtime attention/mood/signalProfiles]
    S --> V[scene-derived concerns]
    S --> W[longTermMemory]
    S --> X[personalityTraitTags/personalityFacetUpdates]
    B --> Z[CharacterState preview]
    C --> Z
    C2 --> Z
    D --> Z
    E --> Z
    F --> Z
    T --> Z
    U --> Z
    V --> Z
    W --> Z
    X --> Z
```

## 模块级流程图

以下流程图按 `docs/AI_NAMING_REGISTRY.md` 的模块登记表逐一展开。每张图只说明该模块自己的输入、内部步骤、输出和主要下游，方便逐个检查边界。

### App Shell

```mermaid
flowchart TD
    U["浏览器用户"] --> UI["App Shell: 三栏工作台"]
    UI --> AUTH["authToken/authUser 登录状态"]
    UI --> DOS["多人档案状态: dossiers/activeDossierId"]
    DOS --> GROUPS["groupedDossiers 分组渲染"]
    DOS --> LOCUI["LocationCard 位置显示"]
    UI --> CFG["DeepSeek 配置状态"]
    UI --> CHAT["聊天输入和消息列表"]
    AUTH --> GATE["权限门禁: 未登录弹窗 / 非管理员只读档案"]
    GATE --> CHAT
    GATE --> DOS
    CHAT --> PIPE["runConversationPipeline"]
    PIPE --> TRACE["liveTrace / activeTrace"]
    PIPE --> STATE["next CharacterState"]
    STATE --> DOS
    PIPE --> AUDIT["POST /api/conversation-audits"]
    TRACE --> PANEL["右侧流程追踪面板"]
    CFG --> PANEL
    UI --> PREVIEW["人物/场景预览操作"]
    PREVIEW --> GEN["Generators / Profile Scene Consistency"]
    UI --> ADMIN["管理员审计浮层: 查看/删除/清空"]
```

### Core Types

```mermaid
flowchart TD
    TYPES["Core Types"] --> STATE["CharacterState / PersonaDossier"]
    TYPES --> LOCATION["CharacterLocation / mapContext"]
    TYPES --> EVENT["EventInput"]
    TYPES --> TRACE["PipelineTrace / CognitiveModuleTrace"]
    TYPES --> MEMORY["ShortTermMemory / LongTermMemory / MemoryRecallResult"]
    TYPES --> LLM["LlmConfig / CognitiveModuleRequest / ExpressionLlmRequest"]
    STATE --> MODULES["全 pipeline 模块共享接口"]
    LOCATION --> STATE
    EVENT --> MODULES
    TRACE --> UI["App Shell trace 展示"]
    LLM --> CLIENTS["Cognitive Module Client / LLM Client"]
```

### Seed State

```mermaid
flowchart TD
    SEED["Seed State"] --> PROFILE["默认人物档案: 林安"]
    SEED --> CONCERNS["初始关切"]
    SEED --> REL["初始关系档案"]
    SEED --> MEM["初始长期记忆"]
    SEED --> RUNTIME["初始 runtime signals"]
    SEED --> SCENE["初始场景"]
    SEED --> LOCATION["初始位置: 雨夜工作室"]
    PROFILE --> APP["App 初次加载"]
    CONCERNS --> APP
    REL --> APP
    MEM --> APP
    RUNTIME --> APP
    SCENE --> APP
    LOCATION --> APP
```

### Cognitive Module Client

```mermaid
flowchart TD
    REQ["CognitiveModuleRequest"] --> CLIENT["runCognitiveModule"]
    CFG["LlmConfig"] --> CLIENT
    CLIENT --> CHECK{"endpoint 可用?"}
    CHECK -- "是" --> FETCH["POST /api/deepseek-chat"]
    FETCH --> STREAM{"SSE?"}
    STREAM -- "是" --> READ["readEventStream: 累积 delta / 解析 final JSON"]
    STREAM -- "否" --> JSON["response.json"]
    READ --> PARSE{"结构化 JSON 可解析?"}
    PARSE -- "否" --> FALLBACK["记录 fallbackReason + 使用 mockOutput"]
    PARSE -- "是" --> TRACE
    CHECK -- "否" --> MOCK["mockOutput"]
    JSON --> TRACE
    FALLBACK --> TRACE["CognitiveModuleTrace"]
    MOCK --> TRACE
    TRACE --> CALLER["Appraisal/Memory/Decision/State/Signals/Generators"]
```

### Appraisal

Appraisal 是回复前的状态裁判，不负责写回复。它输出结构化 `AppraisalResult`，同时保留自然语言 `narrative` 给记忆召回、右侧追踪和后续上下文阅读。评估重点包括：角色是否危险、是否清醒、是否需要回应、适合单条还是连续/爆发节奏、这句话对当事人的触动强度、是否失态、是否短暂突破平常人设外壳进入失控式反应。

```mermaid
flowchart TD
    E["EventInput"] --> LOCAL["本地候选: 触发词/对象/关系/强度/默认状态"]
    S["CharacterState"] --> LOCAL
    LOCAL --> MOCK["本地 fallback AppraisalResult"]
    E --> PROMPT["组装结构化 Appraisal LLM prompt"]
    S --> PROMPT
    PROMPT --> CLIENT["Cognitive Module Client"]
    MOCK --> CLIENT
    CLIENT --> RAW["LLM AppraisalResult"]
    RAW --> NORM["normalizeAppraisalResult"]
    NORM --> OUT["稳定 AppraisalResult: danger/awareness/need/rhythm/impact/composure/personaBreak"]
    OUT --> MEM["Memory Retrieval"]
    OUT --> DECISION["Response Decision"]
    OUT --> TRACE["流程追踪"]
```

### Memory Retrieval

```mermaid
flowchart TD
    E["EventInput"] --> CTX["createMemoryRetrievalContext"]
    A["appraisalNarrative"] --> CTX
    S["CharacterState"] --> CTX
    CTX --> QUERY["naturalLanguageQuery"]
    S --> LTM["longTermMemory"]
    QUERY --> LIST["buildNaturalCandidateList"]
    LTM --> LIST
    S --> REL["relationshipMemory 候选"]
    REL --> LIST
    LIST --> PROMPT["Memory Recall LLM 复判 ID"]
    S --> STM["shortTermMemory 最近几轮"]
    STM --> PROMPT
    PROMPT --> CLIENT["Cognitive Module Client"]
    CLIENT --> RAW["LLM MemoryRecallResult"]
    RAW --> NORM["normalizeMemoryRecallResult"]
    NORM --> OUT["稳定 MemoryRecallResult"]
    OUT --> DECISION["Response Decision"]
    OUT --> PROMPTGEN["Prompt Generator"]
```

### Response Decision

Response Decision 消费 `EventInput`、完整 `AppraisalResult`、召回叙述和 `CharacterState` 运行时信号，把状态评估翻译为回复路由：是否回应、回应模式、单条/连续多条/短句爆发、是否失态、是否突破平常人设外壳。它仍不写角色台词；Prompt Generator 会把路由转成自然语言语境交给 Reply LLM。若角色处在极低能量、强烈负面、震惊、麻木或崩溃边缘，而 LLM 把新的普通邀约/工作安排判成低影响礼貌回应，`stabilizeDecisionForCurrentState` 还必须从近期短期记忆、关系记忆、长期记忆或召回叙述中看到同一关系里的重大事件证据，才会把路由确定性调回失态或爆发式承接；仅有 severe 标签或疲惫状态不能触发爆发。

```mermaid
flowchart TD
    E["EventInput"] --> PROMPT["组装结构化 Decision prompt"]
    A["AppraisalResult"] --> PROMPT["组装结构化 Decision prompt"]
    M["memoryRecallNarrative"] --> PROMPT
    S["CharacterState + runtime signal narrative"] --> PROMPT
    S --> MOCK["ResponseDecision fallback"]
    PROMPT --> CLIENT["Cognitive Module Client"]
    MOCK --> CLIENT
    CLIENT --> RAW["LLM ResponseDecision"]
    RAW --> NORM["normalizeResponseDecision"]
    NORM --> STABLE["stabilizeDecisionForCurrentState"]
    STABLE --> OUT["shouldRespond / responseMode / replyRhythm / shouldLoseComposure / shouldBreakPersona / delaySeconds / rationale"]
    OUT --> PROMPTGEN["Prompt Generator"]
    OUT --> TRACE["流程追踪"]
```

### Prompt Generator

```mermaid
flowchart TD
    E["EventInput"] --> PG["generateNaturalPromptRequest"]
    S["CharacterState"] --> PG
    A["appraisalNarrative"] --> PG
    M["memoryRecallNarrative"] --> PG
    D["decisionNarrative"] --> PG
    PG --> P1["人格/价值/边界/表达样本"]
    PG --> P2["场景和 runtime cognitiveNarrative"]
    PG --> P3["关切/关系/记忆/近期对话"]
    PG --> P4["characterLocation + mapContext"]
    P1 --> PROMPT["自然语言 Reply Prompt"]
    P2 --> PROMPT
    P3 --> PROMPT
    P4 --> PROMPT
    PROMPT --> REQ["ExpressionLlmRequest"]
    REQ --> LLM["LLM Client"]
```

### LLM Client

```mermaid
flowchart TD
    REQ["ExpressionLlmRequest: 只有自然语言 prompt"] --> CLIENT["runLlm"]
    CFG["LlmConfig"] --> CLIENT
    CLIENT --> FETCH["POST /api/deepseek-chat moduleName=reply_generation"]
    FETCH --> STREAM{"SSE?"}
    STREAM -- "是" --> READ["readReplyEventStream"]
    STREAM -- "否" --> JSON["response.json"]
    READ --> OUT["ReplyOutput.reply"]
    JSON --> OUT
    OUT --> SEG["normalize ReplyOutput.segments"]
    SEG --> CHAT["聊天室显示；multi_turn/burst 可分成多条消息"]
    OUT --> STATE["State Updater"]
    OUT --> TRACE["流程追踪"]
```

### State Updater

```mermaid
flowchart TD
    S["当前 CharacterState"] --> PLAN["planStateUpdates"]
    E["EventInput"] --> PLAN
    R["ReplyOutput"] --> PLAN
    C["Appraisal/Memory/Decision narrative + impact levels"] --> PLAN
    PLAN --> CLIENT["State Update LLM JSON 出口"]
    CLIENT --> RAW["StateUpdatePlan raw"]
    RAW --> NORM["normalizeStateUpdatePlan"]
    NORM --> COMMIT["commitStateUpdates"]
    C --> COMMIT
    S --> COMMIT
    E --> COMMIT
    R --> COMMIT
    COMMIT --> STM["写入 shortTermMemory"]
    COMMIT --> LTM["按冲击强度写入 longTermMemory"]
    COMMIT --> RMEM["写入/强化 relationshipMemory 关系记忆区"]
    COMMIT --> REL["更新 relationships"]
    COMMIT --> CONCERN["更新 concerns"]
    COMMIT --> RUNTIME["写入 runtime.energy / derivedMood / signalProfiles"]
    COMMIT --> NEXT["nextState + StateDelta"]
    NEXT --> SIGNAL["Runtime Signal Evaluator"]
```

重大事件写回有确定性保护：`computeInteractionImpact` 根据 Appraisal/Decision 的危险、触动、失态和突破外壳强度决定长期记忆重要性与情绪强度；`strengthenUserRelationshipMemoryForSevereEvent` 会把本轮噩耗、威胁、羞辱或伤害写进当前用户关系记忆，避免模型把关系摘要回退成旧的礼貌同事印象。

### Runtime Signal Evaluator

```mermaid
flowchart TD
    S["State after State Update"] --> EVAL["evaluateRuntimeSignals"]
    E["EventInput"] --> EVAL
    R["ReplyOutput"] --> EVAL
    C["StateUpdate narrative"] --> EVAL
    EVAL --> RAW["本地 RuntimeSignalEvaluationResult 快照"]
    RAW --> NORM["normalizeRuntimeSignalEvaluation"]
    NORM --> APPLY["applyRuntimeSignalEvaluation"]
    APPLY --> ENERGY["runtime.energy"]
    APPLY --> MOOD["runtime.derivedMood"]
    APPLY --> PROFILES["runtime.signalProfiles"]
    APPLY --> DELTA["追加 runtimeChanges"]
    DELTA --> FINAL["最终 nextState + StateDelta"]
```

### Conversation Pipeline

```mermaid
flowchart TD
    INPUT["用户消息 content"] --> EVENT["构造 EventInput"]
    EVENT --> PROGRESS1["emit event progress"]
    EVENT --> SCENE["advanceSceneForCurrentTime"]
    SCENE --> APPRAISAL["runAppraisal"]
    APPRAISAL --> MEM["retrieveMemory"]
    MEM --> DECISION["decideResponse"]
    DECISION --> PROMPT["generateNaturalPromptRequest"]
    PROMPT --> REPLY["runLlm"]
    REPLY --> UPDATE["applyStateUpdates"]
    UPDATE --> SIGNAL["evaluateRuntimeSignals"]
    SIGNAL --> APPLY["applyRuntimeSignalEvaluation"]
    APPLY --> RETURN["返回 nextState + PipelineTrace"]
    SCENE --> MIND["emit pre-speech mindFlow"]
    APPRAISAL --> MIND
    MEM --> MIND
    DECISION --> MIND
    REPLY --> FOLD["App Shell 折叠 pre-speech 心理流并显示第一句"]
    UPDATE --> POSTMIND["emit post-speech mindFlow"]
    SIGNAL --> POSTMIND
    APPLY --> POSTMIND
    SAFETY["safetyContinuity: 安全澄清/旧危险循环判断"] --> APPRAISAL
    SAFETY --> DECISION
    SAFETY --> PROMPT
    SAFETY --> UPDATE
    PROGRESS1 --> TRACE["onProgress liveTrace"]
    SCENE --> TRACE
    MIND --> CHAT["中间栏临时心理流"]
    POSTMIND --> CHAT
    FOLD --> CHAT
    APPRAISAL --> TRACE
    MEM --> TRACE
    DECISION --> TRACE
    REPLY --> TRACE
    UPDATE --> TRACE
    SIGNAL --> TRACE
```

### Generators

```mermaid
flowchart TD
    INPUT["用户人物/场景素材"] --> TYPE{"生成类型"}
    TYPE -- "人物档案" --> DOSSIER["generateDossierFromDescription"]
    TYPE -- "场景" --> SCENE["generateSceneFromDescription"]
    DOSSIER --> D_LLM["Dossier Interpretation LLM"]
    SCENE --> S_LLM["Scene Interpretation LLM"]
    D_LLM --> D_APPLY["applyDossierInterpretation"]
    S_LLM --> S_APPLY["applySceneInterpretation"]
    D_APPLY --> D_NORM["归一化 profile/concerns/memory/runtime"]
    S_APPLY --> S_NORM["归一化 scene/concerns/memory/runtime/profile影响"]
    D_NORM --> PREVIEW["CharacterState preview"]
    S_NORM --> PREVIEW
    PREVIEW --> CONSISTENCY["Profile Scene Consistency"]
    PREVIEW --> UI["左侧预览卡片"]
```

### Profile Scene Consistency

```mermaid
flowchart TD
    CAND["候选 CharacterState"] --> FALLBACK["本地硬冲突 fallback"]
    CAND --> PROMPT["人物 + 场景一致性 prompt"]
    PROMPT --> CLIENT["Profile Scene Consistency LLM"]
    FALLBACK --> CLIENT
    CLIENT --> RAW["ProfileSceneConsistencyResult raw"]
    RAW --> NORM["normalizeProfileSceneConsistency"]
    NORM --> GATE{"requiresDistortionPassword?"}
    GATE -- "否" --> APPLY["应用候选状态"]
    GATE -- "是" --> PASSWORD["打开扭曲时空密码门禁"]
    PASSWORD --> APPLY
    NORM --> TRACE["系统消息/一致性说明"]
```

### DeepSeek Local Proxy

```mermaid
flowchart TD
    BROWSER["浏览器请求"] --> ROUTE{"API 路由"}
    ROUTE -- "GET /api/deepseek-config" --> READCFG["读取 .deepseek.local.json 或环境变量状态"]
    ROUTE -- "POST /api/deepseek-config" --> ADMIN{"管理员会话?"}
    ADMIN -- "否" --> DENY["401/403"]
    ADMIN -- "是" --> WRITECFG["保存本地密钥文件"]
    ROUTE -- "POST /api/deepseek-chat" --> SESSION{"登录会话?"}
    SESSION -- "否" --> DENY
    SESSION -- "是" --> NORMALIZE["normalizeDeepseekModel"]
    NORMALIZE --> BODY["组装 Chat Completions body"]
    BODY --> THINKING["强制 thinking.disabled"]
    THINKING --> DEEPSEEK["DeepSeek API"]
    DEEPSEEK --> STREAM{"stream=true?"}
    STREAM -- "是" --> SSE["streamDeepseek 转发 text/event-stream"]
    STREAM -- "否" --> JSON["返回 JSON"]
    READCFG --> RESP["响应前端"]
    WRITECFG --> RESP
    SSE --> RESP
    JSON --> RESP
```

### Server Support

```mermaid
flowchart TD
    REQ["认证/档案/审计 API request"] --> SUPPORT["serverSupport.mjs"]
    SUPPORT --> LIAO["liaoChatroom /api/login"]
    SUPPORT --> SESS["内存 authSession"]
    SUPPORT --> BUILTIN["builtinPersonaDossiers.mjs"]
    SUPPORT --> DOS[".persona-dossiers.local.json"]
    SUPPORT --> USTATE[".conversation-states.local.json"]
    SUPPORT --> UHIST[".conversation-histories.local.json"]
    SUPPORT --> AUD[".conversation-audits.local.json"]
    LIAO --> SESS
    SESS --> PERM["requireSession / requireAdminSession"]
    BUILTIN --> MERGE["readPersonaDossiers 合并内置和共享档案"]
    USTATE --> OVERLAY["叠加角色全局运行态"]
    UHIST --> CHATHIST["读取/追加当前用户中间栏历史"]
    UHIST --> ADMINHIST["管理员读取指定人物下用户历史"]
    PERM --> DOS
    PERM --> USTATE
    PERM --> UHIST
    PERM --> AUD
    DOS --> MERGE
    MERGE --> OVERLAY
    OVERLAY --> APP["App Shell 当前用户档案"]
    CHATHIST --> APP
    ADMINHIST --> APP
    AUD --> ADMINUI["管理员审计 UI"]
```

### Production Server

```mermaid
flowchart TD
    REQ["生产 HTTP request"] --> SERVER["server.mjs"]
    SERVER --> ROUTE{"路径类型"}
    ROUTE -- "/health" --> HEALTH["返回 OK"]
    ROUTE -- "/api/auth/*" --> AUTH["Server Support: liao 登录 + 本地会话"]
    ROUTE -- "/api/persona-dossiers" --> DOS["Server Support: 共享档案读写"]
    ROUTE -- "/api/conversation-audits" --> AUD["Server Support: 输入输出审计"]
    ROUTE -- "/api/deepseek-config" --> CFG["读取/写入 .deepseek.local.json"]
    ROUTE -- "/api/deepseek-chat" --> DS["代理 DeepSeek API"]
    ROUTE -- "静态资源" --> STATIC["serveStatic dist 文件"]
    ROUTE -- "SPA fallback" --> HTML["返回 dist/index.html"]
    CFG --> RESP["HTTP response"]
    AUTH --> RESP
    DOS --> RESP
    AUD --> RESP
    DS --> RESP
    STATIC --> RESP
    HTML --> RESP
    HEALTH --> RESP
```

### Manual VPS Update

```mermaid
flowchart TD
    UI["左上角版本区域"] --> STATUS["GET /api/app-update/status"]
    STATUS --> DIFF{"currentCommit != remoteCommit?"}
    DIFF -- "否" --> OK["显示已是最新"]
    DIFF -- "是" --> CHANGES["读取 current..remote 提交摘要"]
    CHANGES --> BADGE["显示有新版本和本次更新"]
    BADGE --> ADMIN{"当前用户是管理员?"}
    ADMIN -- "否" --> READONLY["只显示状态"]
    ADMIN -- "是" --> RUN["POST /api/app-update/run"]
    RUN --> AUTH["requireAdminSession"]
    AUTH --> GIT["git fetch + git pull --ff-only"]
    GIT --> INSTALL["npm ci"]
    INSTALL --> BUILD["npm run build"]
    BUILD --> RESTART["PM2/自定义命令重启"]
    RUN -. "SSE 日志/进度" .-> UI
```

### Deployment Automation Runbook

```mermaid
flowchart TD
    DOC["docs/DEPLOYMENT_AUTOMATION.md"] --> USER["用户/AI 查看部署说明"]
    USER --> TRIGGER["确认站内管理员触发"]
    USER --> ENVS["确认 APP_UPDATE_* 环境变量"]
    USER --> BOUNDARY["确认 VPS git 工作树和 PM2 边界"]
    USER --> ROLLBACK["查看回滚方法"]
    TRIGGER --> DEPLOY["Manual VPS Update"]
    ENVS --> DEPLOY
    BOUNDARY --> DEPLOY
    ROLLBACK --> INCIDENT["部署失败或需要回滚时使用"]
```

## 当前 UI 结构

```mermaid
flowchart LR
    TOP[左上角版本/GitHub 链接 + 更新状态 + 登录状态] --> LEFT
    LEFT[左侧分组档案/状态/位置/人物档案/场景] --> PIPE[对话流程]
    CHAT[中间对话] --> PIPE
    PIPE --> TRACE[右侧流程追踪]
    TRACE --> JSON[事件/评估/记忆/决策/回应提示词/回应输出/状态更新/信号评估/状态变化]
    LEFT --> MONITOR[右侧生成监视]
    MONITOR --> GENJSON[人物短预览/人物档案/场景生成输入输出状态]
    TRACE --> AUDIT[管理员输入输出和模块调用审计]
    CHAT --> ADMINHIST[管理员用户历史选择器]
    TOP --> LOGIN[登录浮窗]
    TOP --> UPDATE[服务器更新浮窗]
    LEFT --> DOS[多人档案: 分组/新建/切换/删除]
    LEFT --> GEN1[生成人物档案]
    LEFT --> GEN2[生成场景]
    GEN1 --> FIT[人物场景一致性检测]
    GEN2 --> FIT
```

左上角版本信息由 App Shell 读取 `package.json` 的 `version` 生成 `appVersionLabel`，并链接到 GitHub 仓库 `<owner>/<repo>`。`package.json` 和 `package-lock.json` 的版本号是提交前硬性同步项；每个完成的 reviewable step 都必须递增，避免 Git 提交已经变化但 UI 仍显示旧版本。每个完成并提交的 reviewable step 默认推送当前分支到 GitHub，除非用户明确要求不推送。同一区域会定期调用 `/api/app-update/status` 检查 VPS 当前提交与远端提交是否一致；如果发现新版本，状态接口还会读取 `current..remote` 的待更新提交数量、标题和正文摘要。普通用户只看到提示，管理员可以在更新浮窗看到“本次更新”说明并触发 `/api/app-update/run`。更新浮窗显示提交摘要、进度条和服务端命令日志。提交信息必须写清楚修改内容和改进点，因为它会直接成为站内更新说明。

## 待确认 MVP 架构问题

开始写业务代码前，需要确认以下信息：

1. MVP 第一版要让用户看到什么可运行结果？
2. 虚拟人的核心能力是什么：对话、记忆、情绪、任务执行、声音、形象，还是其中一部分？
3. 第一版是否需要登录系统？
4. 第一版数据是否需要长期保存？
5. 是否必须接入大模型 API？如果是，使用哪个供应商？
6. 是否已有 UI 草图、流程图或前一段对话内容？
7. GitHub 仓库名称和可见性是什么？

## 当前外部资源

| 资源 | 状态 | 说明 |
| --- | --- | --- |
| liao 聊天室用户源 | known | 可读取公开前端脚本确认 `/api/login` 返回 token/user/isAdmin；本项目只用它校验登录，不修改聊天室数据 |
| GitHub 账号 | known | 用户主页为 `<github-owner>` |
| GitHub 仓库 | known | `<owner>/<repo>`，`main` 分支 push 只同步代码，不自动部署 |
| VPS | known | 仅允许后续部署 `<production-domain>` 对应内容 |
| 域名 | known | `<production-domain>` |
| 国内地图服务 | pending | 尚未选型和接入；当前位置字段来自种子或人工维护 |

## 当前模块状态

| 模块 | 状态 | 说明 |
| --- | --- | --- |
| 开发方法 | initialized | 已建立规则文档 |
| 命名登记 | initialized | 已建立 AI 用命名表 |
| 系统流程 | initialized | 已建立初始工作流图 |
| MVP 业务模块 | initialized | 已实现本地可运行的三栏工作台 |
| 多人档案 | initialized | 左侧可按 `personaDossierGroup` 分组、新建、切换、删除 `personaDossier`；每个档案绑定人物状态、配套场景素材和位置属性 |
| 内置人物档案 | initialized | `builtinPersonaDossiers.mjs` 提供 7 个“马可福音10”和 7 个“郑州市”全局初始档案 |
| 人物位置属性 | initialized | `CharacterState.location` 支持当前位置、速度、方向和周边地图上下文；初始来自 seed/manual，对话运行态可由 `temporalSceneProgression` 按真实当地时间推进 |
| 登录机制 | initialized | 用户来自 `LIAO_CHATROOM_ORIGIN` 配置的聊天室登录接口；未登录可看界面但操作会弹登录浮窗 |
| 权限控制 | initialized | `isAdmin` 用户可维护共享档案和查看审计；普通登录用户只可选择共享档案并对话 |
| 共享多人档案 | initialized | 管理员保存到 `.persona-dossiers.local.json`，所有登录用户可读取和使用 |
| 用户私有消息历史 | initialized | 登录用户发送对话后按 `userId + dossierId` 写入 `.conversation-histories.local.json`，切换人物时加载对应中间栏历史；连续回复会按 `replyOutput.segments` 写成多条角色消息；`mindFlow` 临时心理流会在当前轮折叠，不进入历史文件 |
| 管理员用户历史查看 | initialized | 管理员可在当前人物下列出所有用户历史摘要，并选择某个用户以只读方式查看该用户与该人物的中间栏历史 |
| 角色全局对话运行态 | initialized | 登录用户对话后按 `dossierId` 写入 `.conversation-states.local.json`，读取档案时叠加同一人物的全局记忆、runtime、scene 和 location |
| 当前角色重置 | initialized | 管理员通过 `/api/persona-dossiers/:id/reset-conversation` 清理该档案全部用户历史、全局运行态和对应审计；共享档案底稿不变，前端同步清理消息桶和 localStorage |
| 用户关系印象记忆 | initialized | `CharacterState.relationshipMemory` 作为长期记忆中的关系记忆区，按当前说话用户保存自然语言印象、关系总结、证据和最近互动，并进入召回、回复提示词和右侧展示 |
| 输入输出审计 | initialized | 登录用户对话后写入 `.conversation-audits.local.json`，包含用户输入、虚拟人输出、conversationEventId、history message ids 和每个 pipeline 模块的输入输出；仅管理员可查看、删除单条、清空、导出所选或完整导出所有用户所有记录；删除会级联清理同轮历史和角色运行态记忆 |
| 心理流 streaming | initialized | `PipelineTrace.mindFlow` 和 `PipelineStepProgress.mindFlow` 承接每轮说话前/说话后的心理、动作、场景和余波；App Shell 只把它作为临时聊天消息展示，第一句完成后折叠 pre-speech，整轮完成后折叠 post-speech |
| 人物档案生成 | initialized | 通过 Dossier Interpretation LLM 重新解读用户素材，生成 profile、concerns、longTermMemory 和 runtime 预览 |
| 人物档案预览 | initialized | 左侧只展示 `profile.displaySummary` 等摘要信息，用户确认后应用 |
| 生成监视 | initialized | 右侧展示人物短预览、人物档案和场景生成的输入、流式输出和状态；生成不阻塞聊天发送 |
| 场景生成 | initialized | 通过 Scene Interpretation LLM 重新解读用户素材，生成 scene、状态影响、人物影响、关切和记忆预览 |
| 场景预览 | initialized | 先显示场景摘要和状态影响预览，用户确认后应用完整状态 |
| 人物场景一致性检测 | initialized | Profile Scene Consistency LLM 判断人物和场景是否硬冲突；硬冲突需要扭曲时空密码继续 |
| 时间场景推进 | initialized | `temporalSceneProgression` 在 Event 后、Appraisal 前根据位置时区真实时间和对话触发，推进 `scene/location`，并拒绝未来计划瞬移或跨地理范围跳转 |
| 同步对话路径 | initialized | 登录用户身份 -> 事件 -> 时间场景推进 -> 评估 -> 记忆召回（含关系记忆区）-> 回应决策 -> 回应提示词（含当前用户印象）-> 回应输出/分段 -> 状态更新（写入关系印象）-> 信号评估 -> 状态变化 |
| 真实 LLM 接入 | initialized | 当前固定使用本地 DeepSeek 代理、`deepseek-v4-flash`、根目录密钥文件、关闭思考模式和流式输出；UI 不提供模拟语言模型 |
| 结构化输出回退 | initialized | 外部认知模块 JSON 截断或无法解析时记录 `fallbackReason`，使用本地候选结果继续对话 |
| 流程追踪输入输出 | initialized | 每个模块都有输入、输出、状态；执行时自动切换当前模块 |
| 生产部署 | initialized | `<production-domain>` 通过 nginx 反代 PM2 进程 `<production-pm2-name>`，线上目录 `<production-app-dir>` |
| 站内手动更新 | initialized | 左上角自动检查远端版本；管理员可触发 VPS git pull、npm ci、npm run build 和重启 |
| 国内地图服务 | pending | 尚未接入真实地图商；当前位置和地图上下文不能声称来自地图 API |
| 异步生命路径 | pending | Memory Consolidation、Concern Decay、Internal Monologue、Proactive Scheduler 尚未实现；记忆召回上下文已预留 `async_life` 来源 |

## 部署记录

| 时间 | 提交/版本 | 域名 | 目录 | 进程 | 备份 | 验证 |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-06-01 | `2a4b378` 后续生产服务补丁 | `<production-url>` | `<production-app-dir>` | PM2 `<production-pm2-name>` | `<production-backup-dir>/20260601103603` | HTTPS 首页、`/api/deepseek-config`、DeepSeek SSE、浏览器完整对话链路通过 |
| 2026-06-01 | `2e15c71` LLM 解读人物和场景预览 | `<production-url>` | `<production-app-dir>` | PM2 `<production-pm2-name>` | `<production-backup-dir>/20260601153353` | 本地 build 通过；PM2 online；公网 HTTPS 首页和 `/api/deepseek-config` 通过；浏览器加载新摘要和预览按钮且无 console error |
| 2026-06-02 | `cff06e4` 多人档案、人物场景一致性和生产健康检查 | `<production-url>` | `<production-app-dir>` | PM2 `<production-pm2-name>` | `<production-backup-dir>/20260601160930` | 本地 build 通过；PM2 online；公网 `/health` 返回 OK；公网 `/api/deepseek-config` 返回 DeepSeek 已保存；Playwright 看到多人档案、预览人物档案、预览场景且无 console error |
| 2026-06-02 | `62e0dda` GitHub Actions 自动部署触发优化 | `<production-url>` | `<production-app-dir>` | PM2 `<production-pm2-name>` | `<production-backup-dir>/20260602035631.tgz` | GitHub Actions run #3 success；公网 `/health` 返回 OK；PM2 `<production-pm2-name>` online |
| 2026-06-03 | `8680b6d` 站内管理员手动更新引导部署 | `<production-url>` | `<production-git-workdir>` | PM2 `<production-pm2-name>` | `<production-backup-dir>/bootstrap-20260603052126.tgz` | VPS deploy key 可读 private repo；线上目录切换为 git 工作树；PM2 版本 `0.2.1` online；公网 `/health` 和 `/api/app-update/status` 返回 200；Playwright 看到 `v0.2.1` 和“已是最新” |
