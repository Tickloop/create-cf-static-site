# Everything in this file is created only once site.json has a domain.
# Prerequisite: the domain is an active zone in this Cloudflare account
# (docs/HUMAN_SETUP.md, "Add a domain").
#
# The site's own custom domain is NOT managed here: `cf deploy` attaches it from
# cloudflare.config.ts (`domains`), so the Worker and its domain deploy together.

data "cloudflare_zone" "site" {
  count = local.has_domain ? 1 : 0

  filter = {
    name = local.zone_name
  }
}

# cdn.<domain> → media bucket, proxied through Cloudflare's cache.
resource "cloudflare_r2_custom_domain" "media" {
  count = local.has_domain ? 1 : 0

  account_id  = var.account_id
  bucket_name = cloudflare_r2_bucket.media.name
  domain      = local.cdn_hostname
  zone_id     = data.cloudflare_zone.site[0].id
  enabled     = true
  min_tls     = "1.2"
}

# Cache all media at the edge and drop query strings from the cache key, so
# `?anything=random` can't force a billable R2 read on every request.
#
# A zone has one ruleset per phase. If this zone already has cache rules from
# the dashboard, import that ruleset instead of creating a second one
# (AGENTS.md, "Troubleshooting").
resource "cloudflare_ruleset" "media_cache" {
  count = local.has_domain ? 1 : 0

  zone_id     = data.cloudflare_zone.site[0].id
  name        = "${var.project_name} media cache"
  description = "Edge-cache R2 media on ${local.cdn_hostname}; ignore query strings"
  kind        = "zone"
  phase       = "http_request_cache_settings"

  rules = [{
    ref         = "media_cache"
    description = "Cache media on ${local.cdn_hostname}"
    expression  = "(http.host eq \"${local.cdn_hostname}\")"
    action      = "set_cache_settings"
    action_parameters = {
      cache    = true
      edge_ttl = { mode = "override_origin", default = var.media_edge_ttl_seconds }
      # Browsers follow the Cache-Control set at upload (MEDIA_CACHE_CONTROL in the Makefile).
      browser_ttl = { mode = "respect_origin" }
      cache_key = {
        custom_key = {
          query_string = { exclude = { all = true } }
        }
      }
    }
  }]
}

# Optional hotlink protection: block media embedded by other sites. Empty
# Referer is allowed, so direct links and privacy-focused browsers still work.
resource "cloudflare_ruleset" "media_hotlink" {
  count = local.hotlink_rules ? 1 : 0

  zone_id     = data.cloudflare_zone.site[0].id
  name        = "${var.project_name} media hotlink protection"
  description = "Block cross-site embedding of ${local.cdn_hostname}"
  kind        = "zone"
  phase       = "http_request_firewall_custom"

  rules = [{
    ref         = "media_hotlink"
    description = "Block hotlinked media on ${local.cdn_hostname}"
    expression = join(" and ", [
      "(http.host eq \"${local.cdn_hostname}\")",
      "(http.referer ne \"\")",
      "not (${join(" or ", [for prefix in local.allowed_refs : "starts_with(http.referer, \"${prefix}\")"])})",
    ])
    action = "block"
  }]
}
