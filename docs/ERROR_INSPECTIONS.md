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

本次配置目标是：新版本 push 到 GitHub `main` 后，GitHub Actions 自动构建并同步到 `ok.xiaogushi.us` VPS，不再依赖手动部署。

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
5. 重新 push 后验证 GitHub Actions run #2 和 run #3 成功，公网 `/health` 返回 `OK`，PM2 `ok-xiaogushi-us` online。
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

当前自动部署已经可用，但它仍依赖 GitHub Actions secrets 和 VPS 上的 deploy key。如果以后轮换 VPS、换 SSH 用户、改端口或迁移仓库，需要同步更新 GitHub secrets、VPS `authorized_keys` 和 `docs/DEPLOYMENT_AUTOMATION.md`。

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

用户打开 `https://ok.xiaogushi.us/` 后看到：

```text
502 Bad Gateway
nginx/1.24.0 (Ubuntu)
```

故障发生在 `ce1dead feat: add liao auth and audit logging` 推送并触发自动部署之后。

### 错误现象

公网 `curl https://ok.xiaogushi.us/` 复现 502。nginx 仍在响应，但上游 `127.0.0.1:4174` 的 Node/PM2 服务不可用。

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
