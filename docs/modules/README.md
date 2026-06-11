# Module Context Packs

本目录是每轮开发的低 token 入口。先根据用户请求选择一个模块包，再按包里的文件清单和查询线索读取上下文。

模块包不是新的真相源。源码、`docs/AI_NAMING_REGISTRY.md`、`docs/SYSTEM_FLOW.md` 和专项审核文档仍是最终依据；模块包只负责让 AI 少加载无关内容。

## 使用规则

1. 先确定本轮只处理的模块或边界。
2. 读取对应模块包。
3. 用模块包里的关键词通过 `rg` 查询命名表、系统流和源码。
4. 如果模块包缺失，先补最小模块包，再继续开发。
5. 如果任务横跨多个模块，只读取直接相关的模块包，并在回复里说明边界。
6. 如果改动改变模块边界、相关文件、不变量或验证命令，更新对应模块包。

## 当前模块包

| 模块包 | 适用任务 |
| --- | --- |
| `app-shell.md` | 三栏 UI、前端状态、右侧 trace、生成监视、左侧档案交互 |
| `conversation-pipeline.md` | 一轮同步响应路径、Role Turn 人物主脑、兼容认知视图、状态更新 |
| `memory-retrieval.md` | Role Turn 召回候选、自然语言查询、长期/关系记忆候选 |
| `server-support.md` | 服务端 API、运行时 JSON、共享/私有存储、审计、历史 |
| `persona-dossiers.md` | 多人档案、内置档案、人物/场景生成、一致性检测 |
| `auth-permissions.md` | 登录、liao 校验、本地 session、管理员权限和用户隔离 |
| `deployment-update.md` | 站内手动更新、生产服务、GitHub push 和 VPS 更新边界 |

如果不确定该读哪个包，先用 `rg -n "关键词" docs/modules src docs` 找最接近的模块，再决定是否需要用户确认。
