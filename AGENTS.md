# Agent Instructions

This project has a mandatory development method. Every new AI coding session must follow it before changing code.

## Required Startup

Read these files first:

1. `README.md`
2. `docs/DEVELOPMENT_METHOD.md`
3. `docs/AI_NAMING_REGISTRY.md`
4. `docs/SYSTEM_FLOW.md`

Then run `git status --short` and report whether there are uncommitted changes.

## Required Workflow

- Only work on the current requested module or boundary.
- If architecture intent is unclear, ask before implementing.
- If the user points out an error, perform the error inspection workflow in `docs/DEVELOPMENT_METHOD.md` and update `docs/ERROR_INSPECTIONS.md`.
- Register new names in `docs/AI_NAMING_REGISTRY.md`: modules, files, functions, fields, API routes, and external services.
- Update `docs/SYSTEM_FLOW.md` whenever module collaboration or data flow changes.
- Run relevant verification before final response.
- Increment `package.json` and `package-lock.json` version for each completed reviewable step that affects product, code, runtime behavior, deployment, or important project docs.
- Create a git commit for each completed, reviewable step unless the user explicitly tells you not to commit.

## Secrets

Never commit secrets. Local DeepSeek credentials belong in `.deepseek.local.json`, which must stay ignored by git.
