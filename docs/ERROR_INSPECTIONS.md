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
