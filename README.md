# Static site skeleton for Cloudflare

Serves static sites from Cloudflare's free tier, the Cloudflare equivalent of
S3 + CloudFront:

- **Site** → Workers Static Assets: free, unlimited requests, atomic deploys,
  preview URLs.
- **Heavy media** → an R2 bucket on `cdn.<domain>`, edge-cached, with free egress.
- **CI/CD** → GitHub Actions: every PR gets a preview URL comment, and every
  push to `main` deploys to production.
- **Infra** → Terraform (state in R2): bucket, CDN domain, cache and hotlink rules.

Works with any static site generator. Anything that writes to `dist/` works,
and the example site is plain HTML. The only dependency is the
[`cf` CLI](https://developers.cloudflare.com/cf/). Wrangler and Vite aren't used.

```
PR push      → make test + make build → make preview → Worker Preview → URL comment on PR
push to main → make test + make build → make deploy  → production
you, locally → make media-sync  (media/ → R2)   ·   make infra-plan / infra-apply  (Terraform)
```

## Getting started

1. Do the one-time setup in **[docs/HUMAN_SETUP.md](docs/HUMAN_SETUP.md)**:
   Cloudflare account, tokens, GitHub secrets, and later a domain.
2. Build and check locally:

   ```sh
   fnm use && make install
   make test build serve     # http://localhost:8788
   ```

3. Push to `main` to deploy.

Using a coding agent? It reads [AGENTS.md](AGENTS.md), which covers the
rules, the file map, how to verify changes and common tasks.

## Commands

Run `make help` for the full list.

| Command | Does |
| --- | --- |
| `make build` | Build `dist/`, validate it, package cf Build Output |
| `make test` | Unit tests |
| `make serve` | Serve `dist/` locally |
| `make deploy` | Deploy production (CI does this on `main`) |
| `make preview PREVIEW_NAME=x` | Deploy a preview (CI does this on PRs) |
| `make media-sync[-dry]` | Upload new/changed `media/` files to R2 |
| `make media-prune[-dry]` | Mirror `media/` to R2, deleting remote extras (`CONFIRM=yes`) |
| `make infra-plan` / `infra-apply` | Review, then apply, infrastructure changes |
| `make infra-validate` / `infra-test` | Terraform checks (no credentials needed) |

## Where things are configured

| What | Where |
| --- | --- |
| Project name, domain, CDN subdomain | `site.json` (read by both cf and Terraform) |
| Worker behaviour (404s, trailing slashes) | `cloudflare.config.ts` |
| Response headers | `site/_headers` |
| Infra tunables (cache TTL, hotlink, bucket region) | `infra/terraform.tfvars` |
| Secrets | `.env` locally (from `.env.example`), GitHub secrets in CI |

## Costs

The site is free. R2 media is the only thing that can bill, and the defaults
keep it in the free tier. Details and guards: [docs/COSTS.md](docs/COSTS.md).
