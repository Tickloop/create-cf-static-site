# --- From site.json (shared with cloudflare.config.ts; passed via -var-file) ---

variable "project_name" {
  description = "Worker name and prefix for resource names. Set in site.json."
  type        = string

  validation {
    # 3–40 chars leaves room for "-media" (R2 limit 63) and for preview
    # hostnames "<preview>-<worker>.<subdomain>.workers.dev" (DNS label limit 63).
    condition     = can(regex("^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$", var.project_name))
    error_message = "project_name must be 3-40 chars of lowercase letters, digits and hyphens, not starting or ending with a hyphen."
  }
}

variable "domain" {
  description = "Site hostname, e.g. example.com. Empty until you own a domain on Cloudflare. Set in site.json."
  type        = string

  validation {
    condition     = var.domain == "" || can(regex("^([a-z0-9]([a-z0-9-]*[a-z0-9])?\\.)+[a-z]{2,}$", var.domain))
    error_message = "domain must be empty or a lowercase hostname such as example.com."
  }
}

variable "cdn_subdomain" {
  description = "Media is served from <cdn_subdomain>.<domain>. Set in site.json."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9]([a-z0-9-]*[a-z0-9])?$", var.cdn_subdomain))
    error_message = "cdn_subdomain must be a single DNS label, e.g. cdn."
  }
}

# --- From the environment (TF_VAR_account_id, set by the Makefile from .env) ---

variable "account_id" {
  description = "Cloudflare account ID."
  type        = string

  validation {
    condition     = can(regex("^[0-9a-f]{32}$", var.account_id))
    error_message = "account_id must be a 32-character hex Cloudflare account ID (CLOUDFLARE_ACCOUNT_ID in .env)."
  }
}

# --- Tunables (override in terraform.tfvars) ---

variable "zone_name" {
  description = "Cloudflare zone containing domain. Defaults to domain; set it when domain is a subdomain (e.g. domain = blog.example.com, zone_name = example.com)."
  type        = string
  default     = ""
}

variable "media_bucket_location" {
  description = "Optional R2 location hint: wnam, enam, weur, eeur, apac or oc. Null lets Cloudflare choose."
  type        = string
  default     = null

  validation {
    condition     = var.media_bucket_location == null || contains(["wnam", "enam", "weur", "eeur", "apac", "oc"], coalesce(var.media_bucket_location, "none"))
    error_message = "media_bucket_location must be null or one of wnam, enam, weur, eeur, apac, oc."
  }
}

variable "media_edge_ttl_seconds" {
  description = "How long Cloudflare's edge caches media. Longer = fewer billable R2 reads. Purge the cache after replacing a file in place."
  type        = number
  default     = 2592000 # 30 days

  validation {
    condition     = var.media_edge_ttl_seconds >= 60
    error_message = "media_edge_ttl_seconds must be at least 60."
  }
}

variable "enable_hotlink_protection" {
  description = "Block media requests whose Referer is another site. Requests with no Referer (direct visits, privacy tools) are always allowed."
  type        = bool
  default     = false
}

variable "hotlink_allowed_referer_prefixes" {
  description = "Extra Referer prefixes allowed to embed media, e.g. [\"https://myapp.example.org/\"]. The site's own origins are always allowed."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for prefix in var.hotlink_allowed_referer_prefixes : startswith(prefix, "https://") && endswith(prefix, "/")])
    error_message = "Each prefix must start with https:// and end with / (so https://a.com/ can't match https://a.com.evil/)."
  }
}
