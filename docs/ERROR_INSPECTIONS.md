# Error Inspections

本文档记录用户指出错误后的勘验、根因和流程修正。目的不是追责，而是防止同类错误反复出现。

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
