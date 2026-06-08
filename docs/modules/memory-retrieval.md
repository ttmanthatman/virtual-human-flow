# Memory Retrieval Context Pack

## 边界

Memory Retrieval 负责把事件、评估、当前关切、说话者关系和记忆库转成混合召回候选，再交给 Memory Recall LLM 复判。它不负责最终是否回应、角色台词生成或状态写回。

## 相关文件

- `src/pipeline/memoryRetrieval.ts`
- `src/pipeline/appraisal.ts`
- `src/pipeline/promptBuilder.ts`
- `src/pipeline/stateUpdater.ts`
- `src/core/types.ts`
- `docs/modules/conversation-pipeline.md`

## 输入输出

- 输入：`EventInput`、`AppraisalResult`、`CharacterState`、`LlmConfig`。
- 内部派生：`naturalLanguageQuery`、`MemoryRetrievalContext`、`RankedMemoryCandidate`、`memoryRecallFactor`。
- 输出：归一化后的 `MemoryRecallResult`，包含被选短期/长期记忆和召回理由。

## 不变量

- Memory Recall 不是敏感词召回；词面命中只能是一个因子。
- 候选排序必须同时参考自然语言相关度、关切、关系、情绪显著、近期性和词面线索。
- Memory Recall LLM 只选择记忆 ID 和短理由，完整记忆内容由本地候选表回填。
- `relationshipMemory` 必须作为长期记忆候选参与召回。
- 未来异步生命路径应复用召回上下文，只改变 `memoryRecallSource`。

## 查询线索

- `rg -n "Memory Retrieval|hybridMemoryRetrieval|memoryRecall|naturalLanguageQuery|memoryRecallFactor|relationshipMemory" docs/AI_NAMING_REGISTRY.md docs/SYSTEM_FLOW.md`
- `rg -n "createMemoryRetrievalContext|rankLongTermMemoryCandidates|scoreLongTermMemory|normalizeMemoryRecallResult|relationshipMemory" src/pipeline src/core/types.ts`

## 验证

- 召回逻辑改动：`npm run build`
- 关系记忆参与召回或写回：`npm run verify:user-relationship-memory`
- 结构化输出容错：`npm run verify:cognitive-fallback`
