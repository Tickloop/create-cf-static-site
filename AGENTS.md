# Agent guide

Instructions for coding agents working in this repo. Humans: start with
[README.md](README.md).

This is a **skeleton for static sites on Cloudflare's free tier**: the site is
served by Workers Static Assets, heavy media lives in R2, GitHub Actions
deploys, and Terraform provisions the infrastructure. It has no server code by
design.

```
PR push      → checks → make preview PREVIEW_NAME=pr-N → cf previews deploy --prebuilt → URL comment
push to main → checks → make deploy                    → cf deploy --prebuilt          → production
human, local → make media-sync                         → rclone → R2 media bucket (cdn.<domain>)
human, local → make infra-plan / infra-apply           → Terraform → R2 bucket, cdn domain, cache/WAF rules
```

## Rules (read before changing anything)

1. **Always go through `make`.** Every CI step is a Make target, so local runs
   and CI behave the same. Run `make help` to list them.
2. **Never run `cf build`, `cf dev`, `cf init`, or `cf deploy` / `cf previews deploy`
   without `--prebuilt`.** Without it, `cf` runs "automatic configuration",
   which installs Wrangler and rewrites project files. This project packages its
   own Build Output (`scripts/package-output.mjs`) and always deploys with
   `--prebuilt`.
3. **Do not add Wrangler or Vite.** The only runtime dependency is the `cf`
   CLI, pinned to an exact version in `package.json`.
4. **`site.json` is the single source of truth** for `project_name`, `domain`
   and `cdn_subdomain`. `cloudflare.config.ts` imports it, and Terraform reads it
   with `-var-file=../site.json`. A new key needs a matching variable in
   `infra/variables.tf` and an update to `tests/project-config.test.mjs`.
5. **Secrets live only in `.env` (local) and GitHub secrets (CI).** Never
   print, log, commit, or echo them. Never pass them on a command line you
   show the user.
6. **Infrastructure changes need human approval.** You may run
   `make infra-validate`, `make infra-test` and `make infra-plan`. Show the plan
   and wait for the human to approve before you run `make infra-apply`. CI never
   runs Terraform apply.
7. **Media never goes in git or `dist/`.** Large files go in `media/`
   (gitignored), are uploaded with `make media-sync`, and are referenced by the
   absolute URL from `make infra-output` (`media_base_url`). `make check` fails
   on any file over 25 MiB.
8. **Destructive media operations need explicit consent.** `make media-prune`
   deletes R2 objects. Run `make media-prune-dry`, show the output, and only
   run `make media-prune CONFIRM=yes` if the human asks you to.
9. **Some tasks are human-only:** accounts, payment, API tokens, R2 keys,
   GitHub secrets, buying or moving a domain. They're listed in
   [docs/HUMAN_SETUP.md](docs/HUMAN_SETUP.md). When you're blocked on one, name
   the exact step and stop. Don't work around it.

## File map

| Path | What it is |
| --- | --- |
| `site.json` | Site identity shared by cf and Terraform |
| `cloudflare.config.ts` | Worker config: assets-only, 404/trailing-slash handling, domain (prod only) |
| `site/` | Example site source. Replace it with your generator's source |
| `scripts/build-site.mjs` | Example "generator" (copies `site/` → `dist/`). The swap point |
| `scripts/package-output.mjs`, `scripts/lib/build-output.mjs` | `dist/` → `.cloudflare/output/v0` (cf Build Output) |
| `scripts/check-dist.mjs`, `scripts/lib/dist-checks.mjs` | Pre-deploy checks on `dist/` |
| `scripts/preview-url.mjs`, `scripts/lib/preview-result.mjs` | Extracts the preview URL for the PR comment |
| `tests/*.test.mjs` | Unit tests (`make test`, Node's built-in runner, no deps) |
| `infra/` | Terraform: media bucket, r2.dev, `cdn.` domain, cache + hotlink rules |
| `infra/tests/` | Terraform tests against a mocked provider (`make infra-test`) |
| `.github/workflows/` | `checks.yml` (reusable), `preview.yml` (PRs), `deploy.yml` (main) |
| `.github/actions/setup/` | Node + `npm ci`, shared by the workflows |
| `media/` | Local media to upload. Gitignored except `.gitkeep` |
| `docs/HUMAN_SETUP.md` | Everything a human must do, in order |
| `docs/COSTS.md` | What can cost money and which guard covers it |

## Verify your change

Run all of these before you say a change is done. None of them need credentials.

```sh
make test            # unit tests
make build           # site build + dist checks + Build Output packaging
make infra-validate  # terraform fmt -check + validate
make infra-test      # terraform tests (mocked provider)
```

If you edited `.github/`, also run `actionlint` if it's available. To check
what `cf` will upload without uploading it, run
`npx --no-install cf deploy --prebuilt --dry-run` after `make build`.

To discover `cf` commands, use `npx --no-install cf cli search "<task>"`
rather than chaining `--help` calls. Keep search queries free of names, IDs
and domains.

## Common tasks

### Swap in a real static site generator

The pipeline only needs `npm run build:site` to write a finished site to
`dist/`, with `index.html` and `404.html` at its root.

1. Install the generator and point `build:site` in `package.json` at it:
   - Astro: `npm i astro`, `"build:site": "astro build"` (writes `dist/` by default)
   - Vite: `"build:site": "vite build"` (plain Vite, **not** `@cloudflare/vite-plugin`)
   - Hugo: `"build:site": "hugo --minify --destination dist"`. Also install Hugo
     in `.github/actions/setup/action.yml`.
2. Move `site/_headers`, `site/robots.txt` and `site/404.html` into the
   generator's static/public folder, or recreate them there.
3. Delete `site/` and `scripts/build-site.mjs`, and remove the
   "example site" test in `tests/project-config.test.mjs`.
4. If the generator emits content-hashed assets, give that path
   `Cache-Control: public, max-age=31536000, immutable` in `_headers`.
5. Run the checks in "Verify your change". `make check` will flag broken
   internal links the generator produced.

### Change headers or redirects

Edit `_headers`, which `make check` validates. For redirects, add a
`_redirects` file: Cloudflare supports 2,000 static and 100 dynamic rules. It
isn't validated by `make check`, so test it on a preview.

### Add the domain

Follow [docs/HUMAN_SETUP.md, step 9](docs/HUMAN_SETUP.md#9-add-a-domain-whenever-youre-ready).
The human does steps 1–2. You can do the rest, but stop at the plan review
in step 5.

### Use media in the site

Upload with `make media-sync`, then reference
`<media_base_url>/<path inside media/>`. The URL changes from `r2.dev` to
`cdn.<domain>` when a domain is added. If a file is replaced under the same
name, the cache keeps serving the old copy until the TTL expires. Prefer new
filenames, or purge the URL (`npx --no-install cf cli search "purge cache by url"`).

### Upgrade `cf`

`cf` is beta, and its Build Output format can change.

1. Bump the exact version in `package.json`, then run `npm install`.
2. In a temp dir, put an `index.html` in `public/`, run `cf init .` and then
   `cf build`, and compare `.cloudflare/output/v0/` with what
   `scripts/lib/build-output.mjs` writes. Update it and its tests if they differ.
3. Run "Verify your change", then `npx --no-install cf deploy --prebuilt --dry-run`.

### Rename the project

Changing `project_name` after the first apply creates a **new** Worker, a new
media bucket (blocked by `prevent_destroy` on the old one) and a new state key.
Stop and ask the human first. They need to choose between migrating state
(`make infra-terraform ARGS="..."`) and starting fresh.

### Add server-side logic

Out of scope. This skeleton is assets-only on purpose, and
`scripts/lib/build-output.mjs` refuses `entrypoint`/`env`. Adding logic means
switching to `cf`'s Vite-based Worker setup, which changes rules 2 and 3.
Discuss it with the human before starting.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `make preview` fails because the Worker doesn't exist | Previews attach to an existing Worker. Run `make deploy` once (HUMAN_SETUP step 7) |
| `infra-apply`: ruleset for phase already exists | The zone already has dashboard cache or WAF rules. Import it: `make infra-terraform ARGS="import 'cloudflare_ruleset.media_cache[0]' 'zones/<zone_id>/<ruleset_id>'"`, then re-plan |
| `infra-init` says the backend configuration changed | `project_name` or `TFSTATE_BUCKET` changed. See "Rename the project". Don't pass `-reconfigure` blindly, because that starts from empty state |
| `cf` asks about `--mode` | This project's Build Output records no mode. Never pass `--mode` |
| `This build output is for a Preview` | Production was deployed from preview output. `make deploy` rebuilds, so use it rather than raw `cf` |
| Media 404s after adding a domain | `r2.dev` is disabled once a domain is set. Update URLs to `cdn.<domain>` |
| PR got checks but no preview | The PR is from a fork or Dependabot, which get no secrets by design |
| Old previews pile up | `cf` (beta) has no preview-delete command yet. They're harmless. Check `cf cli search "delete preview"` after upgrades |
| 401/403 from Cloudflare | The token is missing a permission. Ask the human to add it (HUMAN_SETUP steps 4 and 8) |
