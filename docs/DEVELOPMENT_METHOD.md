# Development Method

本文档是本项目的硬性开发流程。目标是少猜、少返工、可回溯，并控制长期上下文成本。

## 每轮启动

1. 读取 `README.md`、本文档、`docs/AI_NAMING_REGISTRY.md`、`docs/SYSTEM_FLOW.md`。
2. 运行 `git status --short`，向用户报告是否有未提交变更。
3. 明确本轮只处理的模块或边界；架构意图不清楚时先问。
4. 涉及新架构、新外部服务或高风险取舍时，先做必要调研并把结论写入文档。

## 改动规则

- 只改本轮请求范围内的代码和文档。
- 新增或改名的模块、文件、函数、字段、API 路由、外部服务，登记到 `docs/AI_NAMING_REGISTRY.md`。
- 模块协作、数据流、权限边界或部署路径变化，更新 `docs/SYSTEM_FLOW.md` 和相关 Mermaid 图。
- 不提交密码、Token、私钥、VPS 登录信息；本地 DeepSeek 凭据只放 `.deepseek.local.json`。
- 部署只操作 `<production-domain>` 对应站点、配置、进程和目录。

## 错误勘验

用户指出错误时，先勘验再修复，并更新 `docs/ERROR_INSPECTIONS.md`。

勘验必须回答：

- 错误发生在哪个边界、模块或流程？
- 属于规则理解错误、实现边界错误，还是验证标准错误？
- 根因是什么，之前为什么没发现？
- 同类问题是否残留在代码、文档、UI、测试、命名表或流程图里？
- 这次新增了什么验证项防止复发？

## 收尾清单

每个完成的 reviewable step 都必须可回溯：

1. 如果改动会影响产品、代码、接口、运行时行为、部署或重要文档，递增 `package.json` 和 `package-lock.json` 里的版本号。
2. 运行相关验证；至少对代码改动运行 `npm run build` 或更窄的等价验证。
3. 提交前检查 `git diff --check` 和 `git status --short`。
4. 创建 Git 提交；除非用户明确要求，不跳过提交。
5. 推送当前分支到 GitHub；除非用户明确要求不推送，不再等待额外 push 指令。

提交信息使用清晰短句，例如：

```text
docs: tighten development workflow
feat: add conversation state model
fix: sync app version before release
```

## GitHub 和部署

- 本地仓库应与 GitHub 远程保持同步；每个完成并提交的 reviewable step 默认推送当前分支。首次创建或推送新远端前确认仓库名称、可见性和认证方式。
- 生产不随 GitHub push 自动部署；站内管理员通过 `/api/app-update/run` 手动更新。
- 部署前备份即将修改的线上配置，部署后记录提交、版本、服务位置、验证结果和回滚方式。

## Grill-me 触发

当用户描述的是大模块且数据所有权、状态流向、调用链或 MVP 范围不清楚时，启用连续追问，直到边界、输入输出和验收标准明确。
