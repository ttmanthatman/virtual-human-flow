# Research Notes

本文档记录动手前的相近项目、原理和踩坑。后续每次引入新架构或新技术时继续追加。

## 2026-06-01 MVP 前调研

### 参考方向

1. Generative Agents
   - 来源：https://arxiv.org/abs/2304.03442
   - 结论：可信虚拟行为不是只靠一次 LLM 回复，而是靠 observation、memory、reflection、planning 的组合。对本项目的启发是：先把外部状态和记忆召回做成可观察 pipeline。

2. MemGPT
   - 来源：https://arxiv.org/abs/2310.08560
   - 结论：长对话不能把所有历史直接塞进 prompt，需要分层记忆和上下文管理。对本项目的启发是：MVP 先区分短期原文和长期摘要。

3. OCC / Appraisal 情绪模型
   - 来源：https://pmc.ncbi.nlm.nih.gov/articles/PMC4243519/
   - 结论：情绪更适合被看成事件与情境的评估结果，而不是一个全局 mood 数字。对本项目的启发是：用 `concern` 和 `relationship` 做核心状态，`derivedMood` 只是派生量。

4. ReAct
   - 来源：https://arxiv.org/abs/2210.03629
   - 结论：推理和行动交替有助于让系统可解释、可追踪。对本项目的启发是：把 Event、Appraisal LLM、Memory Recall LLM、Decision LLM、Reply Prompt、Reply Output、State Update LLM、State Delta 逐步展示。

5. OpenAI Structured Outputs / Responses API
   - 来源：https://platform.openai.com/docs/guides/structured-outputs
   - 来源：https://platform.openai.com/docs/api-reference/responses
   - 结论：认知模块接入真实 LLM 时应优先使用 JSON Schema / Structured Outputs，而不是只靠提示词要求模型输出 JSON。Reply LLM 不使用结构化输出约束。

## 当前落地取舍

| 方向 | 当前选择 | 原因 |
| --- | --- | --- |
| 记忆 | 短期原文 + 长期摘要 | 先做可观察闭环，不急着引入向量库 |
| 情绪 | `concern` + `relationship` + `derivedMood` | 避免把心理状态压成一个数字 |
| 主动性 | 暂未实现异步后台 | 先完成同步响应路径 |
| LLM | mock adapter + external endpoint 输入框 | 没有 API Key 和后端前，先保证数据流可见；正式判断逻辑必须走 LLM |
| UI | 三栏工作台 | 用户需要直观看到状态、聊天和 pipeline |

## 2026-06-01 Prompt Generator 修正

用户指出：不能把结构化语言和自然语言混在同一个 prompt 里直接交给 LLM，否则会污染虚拟人的输出风格。

当前修正：

- Reply LLM 永远只接收自然语言上下文，只生成角色台词。
- Appraisal、Memory Recall、Decision、State Update 都是独立认知模块，正式架构下每一步都调用 LLM。
- 新增 `Prompt Generator` 概念，把认知模块输出翻译成自然语言回复上下文。
- State Update LLM 在回复生成之后单独判断结构化状态变化。
- 当前无真实 API 时使用 mock adapter 让界面可跑；它只是占位，不代表正式判断逻辑。
