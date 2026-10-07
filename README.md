# Static site → Cloudflare Worker

Deploys any pre-built static site (plain HTML, Astro, Hugo, Vite/React, ...) to
a Cloudflare Worker and serves it on your domain or subdomain, for free. A
domain on Cloudflare is required: production has no `workers.dev` address.

- **Build:** any command that writes a folder of files (`dist/` by default).
- **Deploy:** the [`cf` CLI](https://developers.cloudflare.com/cf/) uploads the
  folder as Workers Static Assets and attaches your domains. No Wrangler, Vite,
  Terraform or R2.
- **CI/CD:** every PR gets a preview URL comment, closing the PR deletes the
  preview, and every push to `main` deploys to production.

```
PR push      → make test → make preview        → preview URL comment on the PR
PR closed    →             make preview-delete → preview removed
push to main → make test → make deploy         → production, on the domains in cloudflare.config.ts
```

## Getting started

1. Do the one-time setup in **[docs/HUMAN_SETUP.md](docs/HUMAN_SETUP.md)**:
   a Cloudflare account, your domain on Cloudflare, one API token.
2. Set `NAME` and `DOMAINS` at the top of `cloudflare.config.ts`.
3. Deploy:

   ```sh
   fnm use && make install
   make deploy
   ```

Using a coding agent? It reads [AGENTS.md](AGENTS.md).

## Use your own site generator

The pipeline only needs `npm run build:site` to write the finished site to a
folder. The example "generator" just copies `site/` to `dist/`.

1. Point `build:site` in `package.json` at your build:
   - Astro: `"astro build"` · Vite: `"vite build"` · Hugo: `"hugo --minify"`
     (also install Hugo in `.github/workflows/deploy.yml`)
2. If it writes somewhere other than `dist/`, set `DIST` in the `Makefile`
   (Hugo: `public`, Create React App: `build`, Next.js static export: `out`).
3. Single-page app (React, Vue, ...)? Set `notFoundHandling:
   "single-page-application"` in `cloudflare.config.ts`, so deep links load
   the app instead of a 404.
4. Move `site/_headers` and `site/robots.txt` (and `site/404.html` unless it's a
   single-page app) into the generator's static folder, then delete `site/`.
5. If it emits content-hashed files, give that path
   `Cache-Control: public, max-age=31536000, immutable` in `_headers`.

## Commands

Run `make help` for the full list.

| Command | Does |
| --- | --- |
| `make build` | Build the site, check it, package it for `cf` |
| `make test` | Unit tests for the deploy scripts |
| `make deploy` | Deploy production and attach `DOMAINS` (CI does this on `main`) |
| `make preview PREVIEW_NAME=x` | Deploy a preview (CI does this on PRs) |
| `make preview-delete PREVIEW_NAME=x` | Delete a preview (CI does this when a PR closes) |
| `make https ZONE=example.com` | Once per zone: redirect `http://` to `https://`, require TLS 1.2 |

## Costs and limits

Free. On the Workers Free plan, static asset requests are free and unlimited,
and an assets-only Worker never runs billable code, so the account needs no
payment method. The only cost is the domain.

Limits: 20,000 files per deploy and 25 MiB per file. `make build` checks both.
Anything bigger (video, large downloads) needs another host; this skeleton
deliberately has none.
