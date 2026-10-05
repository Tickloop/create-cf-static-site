# What this costs

**Short version:** serving the site is free. Only R2 media can produce a bill,
and the skeleton's defaults are designed to keep it inside the free tier.
Prices below are Cloudflare's published rates as of 2026. Check
<https://developers.cloudflare.com/r2/pricing/> before relying on them.

| Item | Free allowance | Beyond free | Risk |
| --- | --- | --- | --- |
| Static asset requests (the site) | Unlimited | — | None |
| Worker invocations | 100k/day | Workers Paid $5/mo | None: an assets-only Worker never invokes a script |
| R2 storage | 10 GB-month | ~$0.015 / GB-month | Low: 100 GB ≈ $1.35/mo |
| R2 Class B ops (reads) | 10M / month | ~$0.36 / million | **The main one** (see below) |
| R2 Class A ops (writes, lists) | 1M / month | ~$4.50 / million | Low: `media-sync` only uploads changed files |
| R2 egress | Free | Free | None. This is the big difference from S3 |
| Domain | — | At-cost registration (~$10/yr for .com) | Fixed |

## How R2 read costs pile up, and the guard for each

1. **Cache-busting query strings.** By default, `cdn.example.com/a.jpg?x=<random>`
   would skip the cache and read R2 every time. *Guard:* the media cache rule
   (`infra/domain.tf`) removes query strings from the cache key and keeps
   media at the edge for 30 days (`media_edge_ttl_seconds`).
2. **The uncached `r2.dev` URL.** Every request is a billable read, and the
   URL is rate-limited. *Guard:* OpenTofu disables `r2.dev` as soon as a
   domain is set.
3. **Hotlinking.** Other sites embed your media and spend your read
   allowance. *Guard:* `enable_hotlink_protection = true`.
4. **Video scrubbing.** Range requests can mean many reads for one viewer. The
   edge cache absorbs most of them. For heavy video, look at Cloudflare Stream.

Worst realistic case: a bot making 100M uncached requests costs about $32. That's
annoying but bounded, and the billing alert from HUMAN_SETUP step 2 catches it.

## Paid add-ons to leave off

Cache Reserve (adds R2-style charges), Argo, Images transformations, Stream,
Load Balancing, Workers Paid. Nothing in this skeleton needs them.

## Limits worth knowing (Free plan)

- Static assets: 20,000 files per deployment, 25 MiB per file. `make check`
  enforces both.
- `_headers`: 100 rules. Also enforced by `make check`.
- WAF custom rules: 5. Cache rules: 10. The skeleton uses at most one of each.
- Cloudflare's terms restrict serving large amounts of video or big files
  through the CDN from ordinary origins. Serving them from R2 is the allowed
  route. Check the current Service-Specific Terms if video will make up most
  of your traffic.
