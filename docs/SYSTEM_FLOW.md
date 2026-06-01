# System Flow

本文档说明系统如何运作、数据如何流动、模块之间如何调用。它既给用户看，也给 AI 后续开发使用。

## 当前阶段

当前已建立第一版本地 MVP：三栏工作台展示人物状态、聊天室和 pipeline debug。系统能一键根据描述生成人物档案，一键生成场景，并在发送消息后展示 Event 到 LLM Output 再到 State Delta 的完整数据流。

重要约束：结构化 pipeline 数据不能直接拼进最终 LLM prompt。`Prompt Generator` 必须先把结构化结果翻译成自然语言上下文，再交给 LLM。结构化 JSON 输出约束单独作为 `outputContract` 保留，真实后端应通过 Structured Outputs 或等价机制应用。

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

## 当前 MVP 同步响应路径

```mermaid
flowchart TD
    U[用户在 Chat 输入消息] --> E[EventInput]
    E --> A[runAppraisal: 事件触发关切]
    A --> M[retrieveMemory: 召回短期和长期记忆]
    M --> D[decideResponse: 是否回应和回应姿态]
    D --> P[generateNaturalPromptRequest: 生成自然语言上下文]
    P --> L{runLlm}
    L -- simulated --> S[本地模拟结构化 JSON]
    L -- external endpoint --> X[外部 LLM 服务]
    S --> O[LlmOutput]
    X --> O
    O --> W[applyStateUpdates: 写回状态和记忆]
    W --> C[聊天室显示回复]
    W --> T[Pipeline Trace 面板显示每一步]
```

## 当前 UI 结构

```mermaid
flowchart LR
    LEFT[左侧 State/Dossier/Scene] --> PIPE[Conversation Pipeline]
    CHAT[中间 Chat] --> PIPE
    PIPE --> TRACE[右侧 Pipeline Trace]
    TRACE --> JSON[Event/Appraisal/Memory/Decision/Prompt Generator/LLM Output/State Delta]
    LEFT --> GEN1[Generate Dossier]
    LEFT --> GEN2[Generate Scene]
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
| 场景生成 | initialized | 基于描述生成 scene，目前为规则版 |
| 同步对话路径 | initialized | Event -> Appraisal -> Memory -> Decision -> Prompt Generator -> LLM Output -> State Delta |
| 真实 LLM 接入 | pending | 当前为 simulated adapter；后续需要后端代理和 API Key |
| 异步生命路径 | pending | Memory Consolidation、Concern Decay、Internal Monologue、Proactive Scheduler 尚未实现 |
