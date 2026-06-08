# Memory Retrieval Context Pack

## 边界

Memory Retrieval 负责把事件、自然语言评估、说话者关系和记忆库转成自然语言候选清单，再交给 Memory Recall LLM 复判记忆 ID。它不负责最终是否回应、角色台词生成或状态写回。

## 相关文件

- `src/pipeline/memoryRetrieval.ts`
- `src/pipeline/appraisal.ts`
- `src/pipeline/promptBuilder.ts`
- `src/pipeline/stateUpdater.ts`
- `src/core/types.ts`
- `docs/modules/conversation-pipeline.md`

## 输入输出

- 输入：`EventInput`、`AppraisalResult`、`CharacterState`、`LlmConfig`。
- 内部派生：`naturalLanguageQuery`、`MemoryRetrievalContext`、自然语言候选清单、`MemoryCandidate`。
- 输出：归一化后的 `MemoryRecallResult`，包含被选短期/长期记忆和召回理由。

## 不变量

- Memory Recall 不是敏感词召回；本地不再用词面或六因子公式排序记忆。
- 候选清单必须以自然语言呈现短期上下文和长期/关系记忆候选，让 LLM 判断哪些会自然浮现。
- Memory Recall LLM 只选择记忆 ID，完整记忆内容由本地候选表回填。
- `relationshipMemory` 必须作为长期记忆候选参与召回。
- 未来异步生命路径应复用召回上下文，只改变 `memoryRecallSource`。

## 查询线索

- `rg -n "Memory Retrieval|hybridMemoryRetrieval|memoryRecall|naturalLanguageQuery|relationshipMemory" docs/AI_NAMING_REGISTRY.md docs/SYSTEM_FLOW.md`
- `rg -n "createMemoryRetrievalContext|buildNaturalCandidateList|createMemoryCandidates|normalizeMemoryRecallResult|relationshipMemory" src/pipeline src/core/types.ts`

## 验证

- 召回逻辑改动：`npm run build`
- 关系记忆参与召回或写回：`npm run verify:user-relationship-memory`
- 结构化输出容错：`npm run verify:cognitive-fallback`
