# Agent guide

Instructions for coding agents working in this repo. Humans: start with
[README.md](README.md).

This repo deploys a **pre-built static site to a Cloudflare Worker** (Workers
Static Assets, free tier) and attaches its domains. GitHub Actions deploys.
There is no server code, Terraform or R2, by design.

```
PR push      → make test → make preview PREVIEW_NAME=pr-N → cf previews deploy --prebuilt → URL comment
push to main → make test → make deploy                    → cf deploy --prebuilt (+ DOMAINS) → production
```

## Rules (read before changing anything)

1. **Always go through `make`.** Every CI step is a Make target, so local runs
   and CI behave the same. Run `make help` to list them.
2. **Never run `cf build`, `cf dev`, `cf init`, or `cf deploy` / `cf previews deploy`
   without `--prebuilt`.** Without it, `cf` runs "automatic configuration",
   which installs Wrangler and rewrites project files. This project packages its
   own Build Output (`scripts/package-output.mjs`) and always deploys with
   `--prebuilt`.
3. **Keep it lean.** Don't add Wrangler, Vite, Terraform, or anything that
   needs a payment method (R2, Workers Paid). The only dependency is the `cf`
   CLI, pinned to an exact version in `package.json`.
4. **`cloudflare.config.ts` is the only site config:** `NAME`, `DOMAINS` and
   asset handling. Renaming `NAME` after the first deploy creates a second
   Worker, so ask the human first.
5. **A `DOMAINS` change goes live on the next production deploy.** `cf` makes
   the Worker's custom domains match the list. Outside a terminal (CI, or an
   agent's shell) it also replaces existing DNS records for those hostnames and
   moves them off other Workers without asking. Confirm any `DOMAINS` change
   with the human, and don't run `make deploy` for one without their approval.
6. **`make https` changes zone-wide settings.** Run it only when the human asks.
7. **Secrets live only in `.env` (local) and GitHub secrets (CI).** Never
   print, log, commit, or echo them. Never pass them on a command line you
   show the user.
8. **Some tasks are human-only:** the account, the domain, the API token,
   GitHub secrets. They're listed in [docs/HUMAN_SETUP.md](docs/HUMAN_SETUP.md).
   When you're blocked on one, name the exact step and stop. Don't work around it.

## File map

| Path | What it is |
| --- | --- |
| `cloudflare.config.ts` | `NAME`, `DOMAINS`, 404/trailing-slash handling. Domains are production-only |
| `site/` | Example site source. Replace it with your generator's source |
| `package.json` → `build:site` | The swap point: any command that writes the site to `DIST` (`Makefile`) |
| `scripts/package-output.mjs`, `scripts/lib/build-output.mjs` | Checks `DIST`, then writes `.cloudflare/output/v0` (cf Build Output) |
| `scripts/lib/dist-checks.mjs` | Pre-deploy checks: `index.html`, `404.html` (unless SPA), file count and size limits |
| `scripts/preview-url.mjs`, `scripts/lib/preview-result.mjs` | Extracts the preview URL for the PR comment |
| `tests/*.test.mjs` | Unit tests (`make test`, Node's built-in runner, no deps) |
| `.github/workflows/deploy.yml` | The only workflow: previews on PRs, production on `main` |
| `docs/HUMAN_SETUP.md` | Everything a human must do, in order |

## Verify your change

Run these before you say a change is done. Neither needs credentials.

```sh
make test   # unit tests
make build  # site build + dist checks + Build Output packaging
```

If you edited `.github/`, also run `actionlint` if it's available. To check
what `cf` will upload without uploading it, run
`npx --no-install cf deploy --prebuilt --dry-run` after `make build`.

To discover `cf` commands, use `npx --no-install cf cli search "<task>"`
rather than chaining `--help` calls. Keep search queries free of names, IDs
and domains.

## Common tasks

### Swap in a real static site generator

Follow [README.md → "Use your own site generator"](README.md#use-your-own-site-generator).
Then also remove the "example site" test in `tests/project-config.test.mjs`
and run "Verify your change".

### Change headers or redirects

Edit `_headers` in the site's static folder. For redirects, add a `_redirects`
file: Cloudflare supports 2,000 static and 100 dynamic rules. Neither is
validated locally, so test them on a preview.

### Add, change or remove a domain

Edit `DOMAINS` in `cloudflare.config.ts` (rule 5). The zone must be active on
the account and the token must cover it (HUMAN_SETUP steps 2–3). For a new
zone, offer `make https ZONE=<zone>` (rule 6). An empty list leaves existing
domains attached: `cf` only syncs domains when the list has some, so the human
removes the last one in **Workers & Pages → the Worker → Settings → Domains & Routes**.

### Upgrade `cf`

`cf` is beta, and its Build Output format can change.

1. Bump the exact version in `package.json`, then run `npm install`.
2. In a temp dir, put an `index.html` in `public/`, run `cf init .` and then
   `cf build`, and compare `.cloudflare/output/v0/` with what
   `scripts/lib/build-output.mjs` writes. Update it and its tests if they differ.
3. Run "Verify your change", then `npx --no-install cf deploy --prebuilt --dry-run`.

### Add server-side logic

Out of scope. This skeleton is assets-only on purpose, and
`scripts/lib/build-output.mjs` refuses `entrypoint`/`env`. Adding logic means
switching to `cf`'s Vite-based Worker setup, which changes rules 2 and 3.
Discuss it with the human before starting.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `make preview` fails because the Worker doesn't exist | Previews attach to an existing Worker. Run `make deploy` once (HUMAN_SETUP step 5) |
| Deploy fails attaching a domain: zone not found or 403 | The zone isn't active on this account, or the token lacks a zone permission (HUMAN_SETUP step 3) |
| `make build`: missing 404.html | Add a 404 page, or for a single-page app set `notFoundHandling: "single-page-application"` |
| `cf` asks about `--mode` | This project's Build Output records no mode. Never pass `--mode` |
| `This build output is for a Preview` | Production was deployed from preview output. `make deploy` rebuilds, so use it rather than raw `cf` |
| PR got a build but no preview | The PR is from a fork or Dependabot, or the repo has no `CLOUDFLARE_API_TOKEN` secret |
| Old previews pile up | `cf` (beta) has no preview-delete command yet. They're harmless. Check `cf cli search "delete preview"` after upgrades |
| 401/403 from Cloudflare | The token is missing a permission. Ask the human to add it (HUMAN_SETUP step 3) |
