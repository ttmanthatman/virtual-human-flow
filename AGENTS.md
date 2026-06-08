# Agent Instructions

This project has a mandatory development method. Every new AI coding session must follow it before changing code.

## Required Startup

Read the lightweight startup context first:

1. `README.md`
2. `docs/DEVELOPMENT_METHOD.md`
3. The "错误精髓摘要" section at the top of `docs/ERROR_INSPECTIONS.md`
4. The relevant module context pack under `docs/modules/`

Do not read all of `docs/AI_NAMING_REGISTRY.md` or `docs/SYSTEM_FLOW.md` by default. Use `rg` to load only the names, module rows, fields, and flows related to the requested module. Read the full registry or system flow only when the task changes cross-module collaboration, permissions, deployment, or broad architecture.

Then run `git status --short` and report whether there are uncommitted changes.

## Required Workflow

- Only work on the current requested module or boundary.
- If architecture intent is unclear, ask before implementing.
- If the user points out an error, perform the error inspection workflow in `docs/DEVELOPMENT_METHOD.md` and update `docs/ERROR_INSPECTIONS.md`.
- Register new names in `docs/AI_NAMING_REGISTRY.md`: modules, files, functions, fields, API routes, and external services.
- Update the relevant `docs/modules/` context pack when module ownership, source files, invariants, or verification commands change.
- Update `docs/SYSTEM_FLOW.md` whenever module collaboration or data flow changes.
- Run relevant verification before final response.
- Increment `package.json` and `package-lock.json` version for each completed reviewable step that affects product, code, runtime behavior, deployment, or important project docs.
- Create a git commit for each completed, reviewable step unless the user explicitly tells you not to commit.
- Push the current branch to GitHub after each completed commit unless the user explicitly tells you not to push.

## Secrets

Never commit secrets. Local DeepSeek credentials belong in `.deepseek.local.json`, which must stay ignored by git.
