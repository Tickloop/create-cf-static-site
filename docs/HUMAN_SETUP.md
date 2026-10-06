# Human setup checklist

These steps need a person: accounts, payment details, API tokens, and DNS.
An agent can run everything else (see [AGENTS.md](../AGENTS.md)). Do them in
order. Steps 1–8 get you a live site on `*.workers.dev`. Step 9 adds a domain
whenever you're ready.

Legend: 🧑 = only you can do it · 🤖 = an agent can run it once the 🧑 steps before it are done.

---

## 1. Install tools 🧑

| Tool | Why | Install |
| --- | --- | --- |
| fnm + Node 24 | runs `cf` and the build scripts | `fnm install` (reads `.nvmrc`) then `fnm use` |
| Terraform ≥ 1.10 | provisions R2 + zone rules | <https://developer.hashicorp.com/terraform/install> (macOS: `brew install hashicorp/tap/terraform`) |
| rclone | syncs `media/` to R2 | <https://rclone.org/install/> |
| git, make, python3 | repo, task runner, `make serve` | usually preinstalled |

Then run `make install` (🤖), which installs the pinned `cf` CLI into `node_modules/`.

## 2. Cloudflare account 🧑

1. Sign up at <https://dash.cloudflare.com/sign-up> (Free plan).
2. **Workers & Pages** → pick your `workers.dev` subdomain. Your site will be
   `https://<project_name>.<subdomain>.workers.dev` until you add a domain.
3. **R2 Object Storage** → enable R2. Cloudflare asks for a payment method even
   on the free tier, because R2 bills for usage above the free allowance.
4. **Manage Account → Billing → Billable Usage / Notifications**: add a usage
   alert. R2 has no spending cap, so this is your early warning. See
   [COSTS.md](COSTS.md).
5. Copy your **Account ID** (Workers & Pages overview, right sidebar).

## 3. Create `.env` 🧑

```sh
cp .env.example .env
```

Set `CLOUDFLARE_ACCOUNT_ID`. Use plain `KEY=value` lines with no quotes,
because Make reads the file literally. `.env` is gitignored, so never commit it.

## 4. Local "operator" API token 🧑

This token is used on your machine by Terraform and for manual deploys. CI gets a
separate, smaller token in step 8.

**My Profile → API Tokens → Create Token → Custom token**:

| Scope | Permission | Needed for |
| --- | --- | --- |
| Account | Workers R2 Storage: Edit | buckets, r2.dev, custom media domain |
| Account | Workers Scripts: Edit | `make deploy` from your machine |
| Zone *(add in step 9)* | Zone: Read | looking up your zone |
| Zone *(add in step 9)* | DNS: Edit | `cdn.` and site custom domains |
| Zone *(add in step 9)* | Cache Rules: Edit | media cache rule |
| Zone *(add in step 9)* | Zone WAF: Edit | optional hotlink rule |
| Zone *(add in step 9)* | Workers Routes: Edit | attaching the site domain |

Limit it to your account (and, later, your zone). Put it in `.env` as
`CLOUDFLARE_API_TOKEN`.

> Permission names in the dashboard occasionally change. If a command fails
> with an authentication or permission error, the error names the missing
> permission. Add it to the token and re-run.

## 5. Terraform state bucket 🧑 + 🤖

1. 🤖 `make infra-bootstrap` creates the private `TFSTATE_BUCKET` (default
   `tfstate`). It's safe to re-run.
2. 🧑 **R2 → Manage API tokens → Create Account API token**:
   - Permission: **Object Read & Write**
   - Specify bucket: **only** the state bucket
   - Copy the **Access Key ID** and **Secret Access Key** (shown once) into
     `.env` as `TFSTATE_R2_ACCESS_KEY_ID` / `TFSTATE_R2_SECRET_ACCESS_KEY`.

## 6. Provision infrastructure 🤖 → review 🧑

1. 🤖 `make infra-plan` saves a plan to `infra/tfplan` and prints it.
2. 🧑 Read the plan. Without a domain it should only create the media bucket
   and enable its `r2.dev` URL.
3. 🤖 `make infra-apply` applies exactly that saved plan.
4. 🤖 `make infra-output` prints `media_bucket_name` and `media_base_url`.

## 7. Media upload key + first deploy 🧑 + 🤖

1. 🧑 Create another **R2 Account API token**: Object Read & Write, scoped to
   **only** the media bucket from step 6. Put its keys in `.env` as
   `MEDIA_R2_ACCESS_KEY_ID` / `MEDIA_R2_SECRET_ACCESS_KEY`.
2. 🤖 Put a file in `media/`, run `make media-sync-dry`, then `make media-sync`.
3. 🤖 `make deploy` creates the Worker and prints its `workers.dev` URL. Do
   this once before opening any PR: previews attach to an existing Worker.

## 8. GitHub CI/CD 🧑

1. Create a GitHub repo and push this project to `main`.
2. **Create the CI token** (My Profile → API Tokens → Custom token):
   - Account → **Workers Scripts: Edit**
   - *(after step 9)* Zone → **Workers Routes: Edit**, **DNS: Edit**, **Zone: Read**
     for your zone, so `cf deploy` can attach the site's custom domain.
3. Repo → **Settings → Secrets and variables → Actions**, add the secrets:
   - `CLOUDFLARE_API_TOKEN`: the CI token, **not** the operator token
   - `CLOUDFLARE_ACCOUNT_ID`
4. Optional: **Settings → Environments → production**. Add required
   reviewers if you ever want a manual gate. The deploy workflow already uses
   this environment.
5. Recommended: **Settings → Branches → protect `main`**, require PRs and the
   `Checks` jobs to pass.

What runs where:

| Event | Workflow | Result |
| --- | --- | --- |
| PR opened / pushed | `preview.yml` | checks → Worker Preview → URL comment on the PR |
| Push to `main` | `deploy.yml` | checks → production deploy |
| PR from a fork | `preview.yml` | checks only (forks get no secrets) |

## 9. Add a domain (whenever you're ready) 🧑 + 🤖

1. 🧑 **Get a domain.** The simplest route is **Domain Registration → Register
   Domains** in the Cloudflare dashboard, which charges at cost and puts the
   zone on Cloudflare automatically. Bought elsewhere? Then **Add a site** →
   Free plan → change the nameservers at your registrar to the two Cloudflare
   gives you. Wait until the zone shows **Active**.
2. 🧑 Add the **Zone** permissions from step 4 to the operator token and from
   step 8 to the CI token, scoped to this zone.
3. 🤖 Set `"domain": "example.com"` in `site.json`. For a subdomain site such
   as `blog.example.com`, also set `zone_name = "example.com"` in
   `infra/terraform.tfvars`.
4. 🤖 Update media references in your HTML from the `r2.dev` URL to
   `https://cdn.<domain>/...`. The next step **disables** `r2.dev`, which is
   uncached and rate-limited.
5. 🤖 `make infra-plan` → 🧑 review → 🤖 `make infra-apply`. This creates
   `cdn.<domain>`, the media cache rule, and turns off `r2.dev`.
6. 🤖 Commit and merge to `main`. `cf deploy` attaches `<domain>` to the Worker.
7. 🧑 Optional: set `enable_hotlink_protection = true` in
   `infra/terraform.tfvars` and re-apply.
