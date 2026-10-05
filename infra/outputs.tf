output "media_bucket_name" {
  description = "R2 bucket that `make media-sync` uploads to."
  value       = cloudflare_r2_bucket.media.name
}

output "media_base_url" {
  description = "Prefix for media URLs in your HTML."
  value       = local.has_domain ? "https://${local.cdn_hostname}" : "https://${cloudflare_r2_managed_domain.media.domain}"
}

output "site_url" {
  description = "Production URL once a domain is attached; before that, the workers.dev URL printed by `make deploy`."
  value       = local.has_domain ? "https://${var.domain}" : null
}
