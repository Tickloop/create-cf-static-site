locals {
  has_domain    = var.domain != ""
  zone_name     = var.zone_name != "" ? var.zone_name : var.domain
  cdn_hostname  = "${var.cdn_subdomain}.${var.domain}"
  media_bucket  = "${var.project_name}-media"
  site_origins  = ["https://${var.domain}/", "https://www.${var.domain}/"]
  allowed_refs  = concat(local.site_origins, var.hotlink_allowed_referer_prefixes)
  hotlink_rules = local.has_domain && var.enable_hotlink_protection
}

# Public media bucket (images, video, downloads). The site itself is NOT stored
# here; it's served by Workers Static Assets (see cloudflare.config.ts).
resource "cloudflare_r2_bucket" "media" {
  account_id = var.account_id
  name       = local.media_bucket
  location   = var.media_bucket_location

  # Renaming project_name would otherwise plan to replace (delete) the bucket.
  lifecycle {
    prevent_destroy = true
  }
}

# r2.dev URL: public access only until a custom domain exists. It's
# rate-limited, uncached and bypasses zone rules, so it is switched off as soon
# as cdn.<domain> takes over, which keeps billable reads behind the cache.
resource "cloudflare_r2_managed_domain" "media" {
  account_id  = var.account_id
  bucket_name = cloudflare_r2_bucket.media.name
  enabled     = !local.has_domain
}
