# System Flow

本文档说明系统如何运作、数据如何流动、模块之间如何调用。它既给用户看，也给 AI 后续开发使用。

## 当前阶段

当前已建立第一版本地 MVP：三栏工作台展示人物状态、聊天室和流程追踪。系统能一键根据描述生成人物档案，一键生成场景，并在发送消息后展示多模块 LLM 数据流。

重要约束：Reply LLM 只接收自然语言上下文，只生成角色说出口的话。不能把 JSON、字段名、输出契约、工程术语或类似编程语言的内容混进这一步。

认知模块是另一类 LLM 调用。Appraisal、Memory Recall、Decision、State Update 都是独立的脑区式 LLM 模块；它们可以用结构化输入/输出约束，因为它们不是角色台词生成器，而是系统内部的判断模块。

左侧 UI 里的性格标签、能量、情绪、情绪倾向、唤醒度是给人快速观察的摘要。它们由专门的 Runtime Signal Evaluation LLM 模块评估，不由 Reply LLM 直接控制台词。提交给 Reply LLM 的是 `personalitySummary`、`personalityFacets`、`runtime.signalProfiles.*.cognitiveNarrative`、`scene.cognitiveNarrative` 等自然语言综合描述。

人物属性、状态信号和场景叙述只描述内部倾向、形成原因、身体感、关系距离和注意力落点，不能写成“回复应如何”“不要如何”“用什么话术”这类直接指令。Reply Prompt 的作用是把这些自然语言材料过一遍，让回复从人物整体状态中长出来，而不是让某个单独指标指挥台词风格。

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
    B[本地 npm run build] --> D[生成 dist]
    D --> S[上传到 /var/www/ok.xiaogushi.us/app]
    S --> N[server.mjs: 服务前端和 DeepSeek API]
    N --> P[PM2 ok-xiaogushi-us: 127.0.0.1:4174]
    P --> X[Nginx ok.xiaogushi.us.conf]
    X --> U[https://ok.xiaogushi.us]
    N --> K[.deepseek.local.json: 线上本地密钥文件]
    N --> A[DeepSeek API]
```

## 当前 MVP 同步响应路径

```mermaid
flowchart TD
    U[用户在对话区输入消息] --> E[事件输入]
    E --> A[评估模块: 判断事件触发关切]
    A --> M[记忆召回模块: 判断哪些记忆浮现]
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

## 生成预览路径

```mermaid
flowchart TD
    A[用户输入人物或场景描述] --> B[生成预览]
    B --> C{预览类型}
    C -- 人物档案 --> D[补齐 personalitySummary/personalityFacets/concerns/runtimeSignalProfiles]
    C -- 场景 --> E[补齐 sensoryProfile/interactionPressure/cognitiveNarrative]
    D --> F[左侧显示预览]
    E --> F
    F --> G{用户是否应用}
    G -- 是 --> H[写入当前角色状态或场景]
    G -- 否 --> I[保留原状态]
```

## 当前 UI 结构

```mermaid
flowchart LR
    LEFT[左侧状态/人物档案/场景] --> PIPE[对话流程]
    CHAT[中间对话] --> PIPE
    PIPE --> TRACE[右侧流程追踪]
    TRACE --> JSON[事件/评估/记忆/决策/回应提示词/回应输出/状态更新/信号评估/状态变化]
    LEFT --> GEN1[生成人物档案]
    LEFT --> GEN2[生成场景]
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
| GitHub 账号 | known | 用户主页为 `ttmanthatman`，仓库名未确认 |
| VPS | known | 仅允许后续部署 `ok.xiaogushi.us` 对应内容 |
| 域名 | known | `ok.xiaogushi.us` |

## 当前模块状态

| 模块 | 状态 | 说明 |
| --- | --- | --- |
| 开发方法 | initialized | 已建立规则文档 |
| 命名登记 | initialized | 已建立 AI 用命名表 |
| 系统流程 | initialized | 已建立初始工作流图 |
| MVP 业务模块 | initialized | 已实现本地可运行的三栏工作台 |
| 人物档案生成 | initialized | 基于描述生成 profile 和 concerns，目前为规则版 |
| 人物档案预览 | initialized | 先显示人物档案预览，用户确认后应用 |
| 场景生成 | initialized | 基于描述生成 scene，目前为规则版 |
| 场景预览 | initialized | 先显示场景预览，用户确认后应用 |
| 同步对话路径 | initialized | 事件 -> 评估 -> 记忆召回 -> 回应决策 -> 回应提示词 -> 回应输出 -> 状态更新 -> 信号评估 -> 状态变化 |
| 真实 LLM 接入 | initialized | 当前固定使用本地 DeepSeek 代理、`deepseek-v4-flash`、根目录密钥文件、关闭思考模式和流式输出；UI 不提供模拟语言模型 |
| 流程追踪输入输出 | initialized | 每个模块都有输入、输出、状态；执行时自动切换当前模块 |
| 生产部署 | initialized | `ok.xiaogushi.us` 通过 nginx 反代 PM2 进程 `ok-xiaogushi-us`，线上目录 `/var/www/ok.xiaogushi.us/app` |
| 异步生命路径 | pending | Memory Consolidation、Concern Decay、Internal Monologue、Proactive Scheduler 尚未实现 |

## 部署记录

| 时间 | 提交/版本 | 域名 | 目录 | 进程 | 备份 | 验证 |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-06-01 | `2a4b378` 后续生产服务补丁 | `https://ok.xiaogushi.us` | `/var/www/ok.xiaogushi.us/app` | PM2 `ok-xiaogushi-us` | `/root/ok.xiaogushi.us-backups/20260601103603` | HTTPS 首页、`/api/deepseek-config`、DeepSeek SSE、浏览器完整对话链路通过 |
