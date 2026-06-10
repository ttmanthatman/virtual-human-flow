# Persona Dossiers Context Pack

## 边界

Persona Dossiers 负责多人档案、分组、内置档案、共享档案、人物素材解读、场景素材解读、短预览缓存和人物场景一致性检测。它不负责普通对话 pipeline 的每步认知判断。

## 相关文件

- `builtinPersonaDossiers.mjs`
- `src/App.tsx`
- `src/pipeline/generators.ts`
- `src/pipeline/profileSceneConsistency.ts`
- `src/core/types.ts`
- `serverSupport.mjs`
- `docs/modules/app-shell.md`
- `docs/modules/server-support.md`

## 输入输出

- 输入：管理员人物素材、场景素材、内置档案规格、共享档案 JSON、角色全局对话运行态。
- 输出：`PersonaDossier[]`、`CharacterState` 预览、`previewSummary`、一致性检测结果、共享档案写入；对话时的实时 `scene/location` 可由 Conversation Pipeline 的 `temporalSceneProgression` 在角色全局运行态里推进，不改共享底稿。

## 不变量

- 人物档案和场景作为一个 `personaDossier` 成组保存和切换。
- 共享档案里的初始场景/位置是起点，不代表角色永远固定在同一场景；对话运行态可以按当地真实时间和触发事件在同一地理范围内推进场景。
- 详细档案来自结构化状态，短预览来自 DeepSeek 缓存路径，不在源码手写预览摘要。
- 人物/场景预览必须经过独立 LLM 解读，再确定性归一化。
- 应用人物或场景前必须运行人物场景一致性检测；硬冲突需要扭曲时空密码。
- 删除内置档案写 tombstone，不改源码内置列表。

## 查询线索

- `rg -n "personaDossier|sharedPersonaDossier|builtinPersonaDossier|generationPreview|dossierInterpretation|sceneInterpretation|profileSceneConsistency|distortionPassword" docs/AI_NAMING_REGISTRY.md docs/SYSTEM_FLOW.md`
- `rg -n "PersonaDossier|createDossier|generateDossierFromDescription|generateSceneFromDescription|evaluateProfileSceneConsistency|previewSummary" builtinPersonaDossiers.mjs src serverSupport.mjs`

## 验证

- 档案、生成或一致性改动：`npm run build`
- 全局角色运行态相关：`npm run verify:global-conversation-state`
- 历史加载或管理员查看相关：`npm run verify:conversation-message-history`
