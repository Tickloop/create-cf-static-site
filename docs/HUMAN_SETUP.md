# Human setup checklist

These steps need a person: an account, a domain, an API token and GitHub
secrets. An agent can run everything else (see [AGENTS.md](../AGENTS.md)). Do
them in order. Steps 1–5 get the site live on your domain. Step 6 adds CI/CD.

Legend: 🧑 = only you can do it · 🤖 = an agent can run it once the 🧑 steps before it are done.

---

## 1. Install tools 🧑

| Tool | Why | Install |
| --- | --- | --- |
| fnm + Node 24 | runs `cf` and the build scripts | `fnm install` (reads `.nvmrc`) then `fnm use` |
| git, make, rsync | repo, task runner, example build | preinstalled on macOS and Linux |

Then run `make install` (🤖), which installs the pinned `cf` CLI into `node_modules/`.

## 2. Cloudflare account and domain 🧑

1. Sign up at <https://dash.cloudflare.com/sign-up> (Free plan). No payment
   method needed.
2. **Put your domain on Cloudflare.** Either buy one under **Domain
   Registration**, which puts it on Cloudflare automatically, or open
   [**Domains**](https://dash.cloudflare.com/?to=/:account/domains/overview) →
   **Onboard a domain** → Free plan, then change the nameservers at your
   registrar to the two Cloudflare shows. If DNSSEC is on at the old
   registrar, turn it off and wait 24–48 hours before changing nameservers.
   Wait until the domain shows **Active**. A subdomain site such as
   `blog.example.com` needs `example.com` on Cloudflare.
3. **Account ID:** press Cmd/Ctrl+K, type "Copy account ID" and pick the result.

## 3. API token 🧑

One token, used on your machine and in CI.

**Manage Account → Account API Tokens → Create Token**, then create a custom
token with two permission policies:

**Policy 1:** resources = your account

| Permission | Access | Used for |
| --- | --- | --- |
| Workers Scripts | Write | deploys and previews |

**Policy 2:** click **+ Add policy**, resources = your domain's zone

| Permission | Access | Used for |
| --- | --- | --- |
| Zone | Read | finding the zone for each domain |
| DNS | Write | DNS records for the site's hostnames |
| Workers Routes | Write | attaching the domains to the Worker |
| Zone Settings | Write | only for the one-time `make https` in step 5; remove it afterwards if you like |

Skip IP filtering and the expiry date, then click **Continue to summary** →
**Create Token** and copy it. It's shown only once.

> Permission names in the dashboard change from time to time ("Write" used to
> be "Edit"). If a command fails with a permission error, the error names
> what's missing. Add it and re-run.

## 4. Create `.env` 🧑

```sh
cp .env.example .env
```

Fill in `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. Use plain
`KEY=value` lines with no quotes, because Make reads the file literally.
`.env` is gitignored, so it never gets committed.

## 5. Go live 🤖 → check 🧑

1. 🤖 Set `NAME` and `DOMAINS` at the top of `cloudflare.config.ts`, for
   example `["example.com", "www.example.com"]` or `["blog.example.com"]`.
   Pick the name carefully: renaming later creates a second Worker.
2. 🧑 Check **DNS → Records** for old records on those hostnames, for example
   from a previous host. Deploying replaces them: `cf` asks first when run in
   a terminal, but CI replaces them without asking.
3. 🤖 `make deploy` uploads the site and attaches the domains. Cloudflare
   creates the DNS records and certificates. The first certificate can take
   a few minutes.
4. 🤖 `make https ZONE=example.com` (once per zone) redirects `http://` to
   `https://` and requires TLS 1.2. These are zone-wide settings. To click it
   instead: **SSL/TLS → Edge Certificates** → turn on **Always Use HTTPS** and
   set **Minimum TLS Version** to 1.2.
5. 🧑 Open each domain in a browser.

## 6. GitHub CI/CD 🧑

1. Create a GitHub repo and push this project to `main`.
2. Repo → **Settings → Secrets and variables → Actions → New repository
   secret**. Add `CLOUDFLARE_API_TOKEN` (the token from step 3) and
   `CLOUDFLARE_ACCOUNT_ID`.
3. Optional: **Settings → Rules → Rulesets** to require PRs and a passing
   `deploy` check on `main`. On GitHub Free this needs a public repo.

What runs where (`.github/workflows/deploy.yml`):

| Event | Result |
| --- | --- |
| PR opened / pushed | tests → Worker Preview → URL comment on the PR |
| PR closed (merged or not) | the PR's preview is deleted |
| Push to `main` | tests → production deploy |
| PR from a fork or Dependabot | tests and build only (they get no secrets) |
