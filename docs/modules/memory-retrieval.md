# Memory Retrieval Context Pack

## 边界

Memory Retrieval 现在主要负责把事件、人物主脑心理状态、最近 6 小时短期对话、过去 6 小时关系/状态/场景摘要和长期/关系记忆候选转成自然语言召回候选语境，供 `roleTurn` 在同一个人物心理回合里判断哪些记忆会自然浮现。旧 Memory Recall LLM 入口仍保留供实验或回滚；本模块不负责最终是否回应、角色台词生成或状态写回。

## 相关文件

- `src/pipeline/memoryRetrieval.ts`
- `src/pipeline/roleTurn.ts`
- `src/pipeline/appraisal.ts`
- `src/pipeline/promptBuilder.ts`
- `src/pipeline/stateUpdater.ts`
- `src/core/types.ts`
- `docs/modules/conversation-pipeline.md`

## 输入输出

- 输入：`EventInput`、`roleTurn.innerStateNarrative` 或旧 `appraisalNarrative`、`CharacterState`、`LlmConfig`。
- 内部派生：`naturalLanguageQuery`、最近 6 小时短期上下文、过去 6 小时关系/状态/场景摘要、长期/关系记忆候选清单。
- 输出：主路径里 `MemoryRecallResult.narrative` 来自 `roleTurn.memoryNarrative`；旧 `retrieveMemory` 路径仍可返回 LLM 自然语言召回判断。`shortTermContext` 保留最近 6 小时最多 10 条对话；`longTermMemories` 是供审计/UI 展示的候选，不再代表 JSON ID 复判结果。

## 不变量

- Memory Recall 不是敏感词召回；本地不再用词面或六因子公式排序记忆。
- 候选清单必须以自然语言呈现短期上下文、过去 6 小时关系/状态/场景摘要和长期/关系记忆候选，让 `roleTurn` 判断哪些会自然浮现。
- 旧 Memory Recall LLM 只输出自然语言判断，不输出 JSON、字段名、候选 ID 或代码式结构。
- `relationshipMemory` 必须作为长期记忆候选参与召回。
- 长期记忆是否写入由 State Update 的自然语言评估决定；Memory Recall 只负责当前这一刻浮现什么。
- 未来异步生命路径应复用召回上下文，只改变 `memoryRecallSource`。

## 查询线索

- `rg -n "Memory Retrieval|hybridMemoryRetrieval|memoryRecall|naturalLanguageQuery|relationshipMemory" docs/AI_NAMING_REGISTRY.md docs/SYSTEM_FLOW.md`
- `rg -n "runRoleTurn|buildMemoryTraceFromRoleTurn|retrieveMemory|formatRecentSituationSummaryForPrompt|selectRecentDialogueMemories|createLongTermCandidates|relationshipMemory" src/pipeline src/core/types.ts`

## 验证

- 召回逻辑改动：`npm run build`
- 关系记忆参与召回或写回：`npm run verify:user-relationship-memory`
- 结构化输出容错：`npm run verify:cognitive-fallback`
