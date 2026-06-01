# 虚拟人的心流 MVP

本仓库用于逐步搭建“虚拟人的心流”MVP。当前阶段先建立开发方法、前置文档和版本回溯机制，后续每次开发前必须先读取 `docs/` 中的前置文档。

## 当前规则

1. 开发前先读前置文档；如果文档缺失，先补文档。
2. 任何变量名、函数名、模块名、数据字段名，都登记到 `docs/AI_NAMING_REGISTRY.md`。
3. 每一步调用关系、数据流、模块协作方式，都更新到 `docs/SYSTEM_FLOW.md`。
4. 每次可运行或可解释的改动后，建立 Git 提交，确保可回溯。
5. 不把密码、Token、私钥、VPS 登录信息写入仓库。
6. 涉及部署时，只允许操作 `ok.xiaogushi.us` 对应内容，不动同一 VPS 上其他站点或服务。
7. 遇到架构意图不清楚、权限缺失、资源缺失时，先问用户，不猜。

## 文档入口

- `docs/DEVELOPMENT_METHOD.md`: 项目协作和开发流程。
- `docs/AI_NAMING_REGISTRY.md`: 给 AI 使用的命名与关系登记表。
- `docs/SYSTEM_FLOW.md`: 给用户和 AI 共同阅读的系统调用、数据流和架构图。
- `docs/RESEARCH_NOTES.md`: 动手前调研过的相近项目、原理和踩坑。

## 本地运行

```bash
npm install
npm run dev
```

打开 `http://127.0.0.1:5173/`。

## 当前 MVP

当前版本是一个本地可运行的三栏工作台：

- 左侧：角色状态、关切、一键人物档案生成、一键场景生成。
- 中间：聊天室。
- 右侧：pipeline trace，展示 `Event -> Appraisal LLM -> Memory Recall LLM -> Decision LLM -> Reply Prompt -> Reply Output -> State Update LLM -> State Delta`。

当前 LLM 默认为 mock adapter，只用于没有真实 API 时演示流程。正式架构中，每个认知步骤都必须调用 LLM：Appraisal、Memory Recall、Decision、State Update 都是独立的 LLM 模块。

角色回复这一步是例外中的硬规则：Reply LLM 只接收自然语言上下文，只生成角色说出口的话，不混入 JSON、字段名、输出约束或类似编程语言的内容。结构化状态更新由后续 State Update LLM 模块单独判断。
