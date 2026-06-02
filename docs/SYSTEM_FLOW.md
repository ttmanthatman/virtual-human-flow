# System Flow

本文档说明系统如何运作、数据如何流动、模块之间如何调用。它既给用户看，也给 AI 后续开发使用。

## 当前阶段

当前已建立第一版本地 MVP：三栏工作台展示多人档案、人物状态、聊天室和流程追踪。系统能根据用户素材预览人物档案和配套场景，并在发送消息后展示多模块 LLM 数据流。

重要约束：Reply LLM 只接收自然语言上下文，只生成角色说出口的话。不能把 JSON、字段名、输出契约、工程术语或类似编程语言的内容混进这一步。

认知模块是另一类 LLM 调用。Appraisal、Memory Recall、Decision、State Update 都是独立的脑区式 LLM 模块；它们可以用结构化输入/输出约束，因为它们不是角色台词生成器，而是系统内部的判断模块。

Memory Recall 不是敏感词召回。触发词可以作为线索，但记忆浮现必须同时参考自然语言相关度、当前关切、说话者关系、情绪显著、近期性和词面线索。当前同步路径先在本地构建混合召回候选，再交给 Memory Recall LLM 复判；未来异步生命路径也复用同一套召回上下文，只是 `source` 从 `sync_response` 变成 `async_life`。

左侧 UI 里的性格标签、能量、情绪、情绪倾向、唤醒度是给人快速观察的摘要。它们由专门的 Runtime Signal Evaluation LLM 模块评估，不由 Reply LLM 直接控制台词。提交给 Reply LLM 的是 `personalitySummary`、`personalityFacets`、`runtime.signalProfiles.*.cognitiveNarrative`、`scene.cognitiveNarrative` 等自然语言综合描述。

人物属性、状态信号和场景叙述只描述内部倾向、形成原因、身体感、关系距离和注意力落点，不能写成“回复应如何”“不要如何”“用什么话术”这类直接指令。Reply Prompt 的作用是把这些自然语言材料过一遍，让回复从人物整体状态中长出来，而不是让某个单独指标指挥台词风格。

人物档案和场景预览也属于认知模块，不是本地字符串拼接。人物档案预览通过 Dossier Interpretation LLM 将用户素材拆成展示摘要、长期记忆、人性/人格、标签、关切和状态信号；场景预览通过 Scene Interpretation LLM 将用户素材拆成场景摘要、状态影响和人物影响。预览应用时写入的是 LLM 解读后的结构化状态，而不是用户原文。

人物档案和场景设置作为 `personaDossier` 成组保存。左侧可以新建、切换和删除档案；切换档案时人物状态、人物素材和场景素材一起切换。应用人物或场景预览前，Profile Scene Consistency LLM 会判断人物与场景是否处于同一世界观、时代和社会语境；现代人物进入古代场景这类硬冲突需要输入本地“扭曲时空密码”才能继续。

DeepSeek 接入必须关闭思考模式。应用固定使用真实 DeepSeek 本地代理和 `deepseek-v4-flash`，不再暴露模拟语言模型选项。代理层对所有 DeepSeek Chat Completions 请求显式传入 `thinking: { type: "disabled" }`，不发送 `reasoning_effort`，并把 `deepseek-reasoner` 纠正为 `deepseek-v4-flash`。

流程追踪面板不是事后 dump。每个模块开始时会自动切换到当前步骤，并显示该模块的输入、流式输出和状态。每个步骤都必须让用户能分清“发给模块的输入”和“模块返回的输出”。

## 总体工作流

```mermaid
flowchart TD
    A[用户描述架构意图] --> B[AI 读取前置文档]
    B --> C[AI 检查 Git 状态]
    C --> D{架构是否清楚}
    D -- 否 --> E[提问或启用 grill-me]
    E --> A
    D -- 是 --> F[调研类似项目和经验]
    F --> G[更新命名登记表]
    G --> H[更新系统流程文档]
    H --> I[实现最小可验证变更]
    I --> J[本地验证]
    J --> K[Git 提交留底]
    K --> L[同步到 GitHub]
    L --> M{是否需要部署}
    M -- 是 --> N[备份线上配置]
    N --> O[只部署 ok.xiaogushi.us]
    O --> P[记录回滚方式]
    M -- 否 --> Q[等待下一步]
    P --> Q
```

## 文档和代码关系

```mermaid
flowchart LR
    DM[DEVELOPMENT_METHOD.md] --> WORK[每轮开发动作]
    NR[AI_NAMING_REGISTRY.md] --> WORK
    SF[SYSTEM_FLOW.md] --> WORK
    WORK --> CODE[代码和配置]
    CODE --> NR
    CODE --> SF
    CODE --> GIT[Git 提交]
    GIT --> GH[GitHub 远程仓库]
    GH --> VPS[ok.xiaogushi.us 部署]
```

## 生产部署路径

```mermaid
flowchart TD
    G[推送 GitHub main] --> GA[GitHub Actions productionAutoDeploy]
    GA --> BUILD[npm ci + npm run build]
    BUILD --> PKG[打包 dist/server/package files]
    PKG --> UPLOAD[SSH 上传 release archive 到 VPS /tmp]
    UPLOAD --> BACKUP[备份 /var/www/ok.xiaogushi.us/app]
    BACKUP --> EXTRACT[解压新版本到 /var/www/ok.xiaogushi.us/app]
    EXTRACT --> INSTALL[npm ci --omit=dev]
    INSTALL --> SRV[server.mjs: 服务前端和 DeepSeek API]
    SRV --> PM2[PM2 ok-xiaogushi-us: 127.0.0.1:4174]
    PM2 --> NGINX[Nginx ok.xiaogushi.us.conf]
    NGINX --> SITE[https://ok.xiaogushi.us]
    SRV --> KEY[.deepseek.local.json: 线上本地密钥文件]
    SRV --> DS[DeepSeek API]
    PM2 --> HEALTH[health check: 127.0.0.1:4174/health]
```

生产自动部署由 `.github/workflows/deploy-production.yml` 执行，触发条件是 `main` 分支 push 或 GitHub Actions 手动触发。工作流使用 GitHub Actions secrets 里的 SSH 凭据进入 VPS，但只允许操作 `/var/www/ok.xiaogushi.us/app`、`/root/ok.xiaogushi.us-backups` 和 PM2 进程 `ok-xiaogushi-us`。线上 `.deepseek.local.json` 不由 GitHub Actions 上传或覆盖。

## 当前 MVP 同步响应路径

```mermaid
flowchart TD
    U[用户在对话区输入消息] --> E[事件输入]
    E --> A[评估模块: 判断事件触发关切]
    A --> M[记忆召回模块: 混合相关度候选 + LLM复判]
    M --> D[回应决策模块: 判断是否回应和回应姿态]
    D --> P[Prompt Generator: 生成自然语言回复上下文]
    P --> R[DeepSeek Flash Reply LLM: 只生成角色台词]
    R --> S[状态更新模块: 判断状态和记忆变化]
    S --> G[信号评估模块: 评估能量/情绪/情绪倾向/唤醒度]
    G --> W[确定性写回: clamp/append/commit]
    W --> C[聊天室显示回复]
    W --> T[流程追踪面板显示每个模块输入/输出/状态]
    A -. 流式输出 .-> T
    M -. 流式输出 .-> T
    D -. 流式输出 .-> T
    R -. 流式输出 .-> T
    S -. 流式输出 .-> T
    G -. 流式输出 .-> T
```

## 记忆召回路径

```mermaid
flowchart TD
    E[事件输入] --> Q[合成 naturalLanguageQuery]
    A[事件评估输出] --> Q
    C[激活关切] --> Q
    R[说话者关系] --> Q
    Q --> S[长期记忆本地混合排序]
    L[长期记忆库] --> S
    S --> F[召回因子: 自然语言相关/关切/关系/情绪/近期/词面]
    F --> M[Memory Recall LLM 复判]
    B[短期记忆最近几轮] --> M
    M --> O[MemoryRecallResult]
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
    D --> D1[分类: 长期记忆/人性人格/标签/关切/状态信号]
    E --> E1[分类: 场景摘要/状态影响/人物影响]
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

## 多人档案路径

```mermaid
flowchart TD
    A[左栏多人档案列表] --> B{用户操作}
    B -- 新建 --> C[创建 personaDossier: 空人物素材 + 空场景素材 + 待配置状态]
    B -- 切换 --> D[读取 personaDossier.state]
    B -- 删除 --> E{是否最后一个}
    E -- 是 --> F[阻止删除]
    E -- 否 --> G[移除档案并切换到剩余档案]
    D --> H[左栏人物/场景输入同步切换]
    H --> I[聊天室后续使用当前档案状态]
    I --> J[对话状态更新写回当前 personaDossier]
```

## 生成预览写回边界

```mermaid
flowchart TD
    A[Dossier Interpretation LLM] --> B[profile.displaySummary]
    A --> C[profile.personalitySummary/personalityFacets]
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
    D --> Z
    E --> Z
    F --> Z
    T --> Z
    U --> Z
    V --> Z
    W --> Z
    X --> Z
```

## 当前 UI 结构

```mermaid
flowchart LR
    LEFT[左侧状态/人物档案/场景] --> PIPE[对话流程]
    CHAT[中间对话] --> PIPE
    PIPE --> TRACE[右侧流程追踪]
    TRACE --> JSON[事件/评估/记忆/决策/回应提示词/回应输出/状态更新/信号评估/状态变化]
    LEFT --> DOS[多人档案: 新建/切换/删除]
    LEFT --> GEN1[生成人物档案]
    LEFT --> GEN2[生成场景]
    GEN1 --> FIT[人物场景一致性检测]
    GEN2 --> FIT
```

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
| 前置对话链接 | blocked | 链接打开后需要登录，AI 无法读取实际内容 |
| GitHub 账号 | known | 用户主页为 `ttmanthatman` |
| GitHub 仓库 | known | `ttmanthatman/virtual-human-flow`，`main` 分支 push 触发自动部署 |
| VPS | known | 仅允许后续部署 `ok.xiaogushi.us` 对应内容 |
| 域名 | known | `ok.xiaogushi.us` |

## 当前模块状态

| 模块 | 状态 | 说明 |
| --- | --- | --- |
| 开发方法 | initialized | 已建立规则文档 |
| 命名登记 | initialized | 已建立 AI 用命名表 |
| 系统流程 | initialized | 已建立初始工作流图 |
| MVP 业务模块 | initialized | 已实现本地可运行的三栏工作台 |
| 多人档案 | initialized | 左侧可新建、切换、删除 `personaDossier`；每个档案绑定人物状态和配套场景素材 |
| 人物档案生成 | initialized | 通过 Dossier Interpretation LLM 重新解读用户素材，生成 profile、concerns、longTermMemory 和 runtime 预览 |
| 人物档案预览 | initialized | 左侧只展示 `profile.displaySummary` 等摘要信息，用户确认后应用 |
| 场景生成 | initialized | 通过 Scene Interpretation LLM 重新解读用户素材，生成 scene、状态影响、人物影响、关切和记忆预览 |
| 场景预览 | initialized | 先显示场景摘要和状态影响预览，用户确认后应用完整状态 |
| 人物场景一致性检测 | initialized | Profile Scene Consistency LLM 判断人物和场景是否硬冲突；硬冲突需要扭曲时空密码继续 |
| 同步对话路径 | initialized | 事件 -> 评估 -> 记忆召回 -> 回应决策 -> 回应提示词 -> 回应输出 -> 状态更新 -> 信号评估 -> 状态变化 |
| 真实 LLM 接入 | initialized | 当前固定使用本地 DeepSeek 代理、`deepseek-v4-flash`、根目录密钥文件、关闭思考模式和流式输出；UI 不提供模拟语言模型 |
| 流程追踪输入输出 | initialized | 每个模块都有输入、输出、状态；执行时自动切换当前模块 |
| 生产部署 | initialized | `ok.xiaogushi.us` 通过 nginx 反代 PM2 进程 `ok-xiaogushi-us`，线上目录 `/var/www/ok.xiaogushi.us/app` |
| 生产自动部署 | initialized | GitHub Actions 在 `main` 分支新版本后自动构建、上传、备份、重启 PM2，并检查 `/health` |
| 异步生命路径 | pending | Memory Consolidation、Concern Decay、Internal Monologue、Proactive Scheduler 尚未实现；记忆召回上下文已预留 `async_life` 来源 |

## 部署记录

| 时间 | 提交/版本 | 域名 | 目录 | 进程 | 备份 | 验证 |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-06-01 | `2a4b378` 后续生产服务补丁 | `https://ok.xiaogushi.us` | `/var/www/ok.xiaogushi.us/app` | PM2 `ok-xiaogushi-us` | `/root/ok.xiaogushi.us-backups/20260601103603` | HTTPS 首页、`/api/deepseek-config`、DeepSeek SSE、浏览器完整对话链路通过 |
| 2026-06-01 | `2e15c71` LLM 解读人物和场景预览 | `https://ok.xiaogushi.us` | `/var/www/ok.xiaogushi.us/app` | PM2 `ok-xiaogushi-us` | `/root/ok.xiaogushi.us-backups/20260601153353` | 本地 build 通过；PM2 online；公网 HTTPS 首页和 `/api/deepseek-config` 通过；浏览器加载新摘要和预览按钮且无 console error |
| 2026-06-02 | `cff06e4` 多人档案、人物场景一致性和生产健康检查 | `https://ok.xiaogushi.us` | `/var/www/ok.xiaogushi.us/app` | PM2 `ok-xiaogushi-us` | `/root/ok.xiaogushi.us-backups/20260601160930` | 本地 build 通过；PM2 online；公网 `/health` 返回 OK；公网 `/api/deepseek-config` 返回 DeepSeek 已保存；Playwright 看到多人档案、预览人物档案、预览场景且无 console error |
| 2026-06-02 | `bc0d286` GitHub Actions 自动部署修复 | `https://ok.xiaogushi.us` | `/var/www/ok.xiaogushi.us/app` | PM2 `ok-xiaogushi-us` | `/root/ok.xiaogushi.us-backups/20260602035444.tgz` | GitHub Actions run #2 success；公网 `/health` 返回 OK；PM2 `ok-xiaogushi-us` online |
