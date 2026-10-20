# Agent guide

This repo is the npm package `create-cf-static-site`. Humans: start with
[README.md](README.md).

| Path | What it is |
| --- | --- |
| `bin/create.mjs` | The CLI: copies `template/`, sets the Worker name, runs `npm install` |
| `template/` | The project users get. Its [AGENTS.md](template/AGENTS.md) is what *their* agents read, and its rules apply to any change inside it |
| `LICENSE` | MIT. Published with the package, and copied into every new project by the CLI |
| `package.json` → `files` | What gets published. The `!` entries keep build output and `.env` out |

## Rules

1. **The CLI uses Node built-ins only.** No dependencies.
2. **Keep the CLI and template in step.** The CLI rewrites
   `const NAME = "static-site";` in `template/cloudflare.config.ts` and `name`
   in `template/package.json`, and renames `template/_gitignore` to
   `.gitignore` (npm never publishes a `.gitignore`). If you change those, change
   `bin/create.mjs` too. The Worker name rule lives in one place:
   `WORKER_NAME_PATTERN` in `template/scripts/lib/build-output.mjs`.
3. **`DOMAINS` in `template/cloudflare.config.ts` stays empty.** Users must
   pick their own domains.
4. **`template/.github/` doesn't run in this repo.** GitHub only reads the
   root `.github/`.
5. **Never run `npm publish`.** Publishing is a human step.

## Verify your change

```sh
make smoke       # scaffold a project, run its tests and build
make pack-check  # check what would be published
```

If you edited `template/.github/`, also run `actionlint` on it if available.
