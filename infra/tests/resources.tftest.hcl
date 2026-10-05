# `make infra-test`: plans against a mocked Cloudflare provider, so it needs no
# credentials or network and is safe to run in CI.

mock_provider "cloudflare" {
  mock_data "cloudflare_zone" {
    defaults = {
      id = "0123456789abcdef0123456789abcdef"
    }
  }
}

variables {
  account_id    = "0123456789abcdef0123456789abcdef"
  project_name  = "my-site"
  domain        = ""
  cdn_subdomain = "cdn"
}

run "without_domain_uses_r2_dev_only" {
  command = plan

  assert {
    condition     = cloudflare_r2_bucket.media.name == "my-site-media"
    error_message = "media bucket should be named <project_name>-media"
  }
  assert {
    condition     = cloudflare_r2_managed_domain.media.enabled
    error_message = "r2.dev must be enabled while there is no custom domain"
  }
  assert {
    condition     = length(cloudflare_r2_custom_domain.media) == 0 && length(cloudflare_ruleset.media_cache) == 0
    error_message = "no zone resources may be created without a domain"
  }
  assert {
    condition     = output.site_url == null
    error_message = "site_url should be null without a domain"
  }
}

run "with_domain_moves_media_behind_cache" {
  command = plan

  variables {
    domain = "example.com"
  }

  assert {
    condition     = !cloudflare_r2_managed_domain.media.enabled
    error_message = "r2.dev must be disabled once cdn.<domain> exists (it bypasses the cache)"
  }
  assert {
    condition     = cloudflare_r2_custom_domain.media[0].domain == "cdn.example.com"
    error_message = "media custom domain should be cdn.<domain>"
  }
  assert {
    condition     = cloudflare_ruleset.media_cache[0].rules[0].expression == "(http.host eq \"cdn.example.com\")"
    error_message = "cache rule must target only the media hostname"
  }
  assert {
    condition     = cloudflare_ruleset.media_cache[0].rules[0].action_parameters.cache_key.custom_key.query_string.exclude.all
    error_message = "cache key must ignore query strings"
  }
  assert {
    condition     = length(cloudflare_ruleset.media_hotlink) == 0
    error_message = "hotlink protection is opt-in"
  }
  assert {
    condition     = output.media_base_url == "https://cdn.example.com" && output.site_url == "https://example.com"
    error_message = "outputs should use the custom domain"
  }
}

run "subdomain_site_looks_up_parent_zone" {
  command = plan

  variables {
    domain    = "blog.example.com"
    zone_name = "example.com"
  }

  assert {
    condition     = data.cloudflare_zone.site[0].filter.name == "example.com"
    error_message = "zone lookup should use zone_name when set"
  }
  assert {
    condition     = cloudflare_r2_custom_domain.media[0].domain == "cdn.blog.example.com"
    error_message = "media hostname should be under the site domain"
  }
}

run "hotlink_protection_allows_own_origins_and_extras" {
  command = plan

  variables {
    domain                           = "example.com"
    enable_hotlink_protection        = true
    hotlink_allowed_referer_prefixes = ["https://partner.org/"]
  }

  assert {
    condition = cloudflare_ruleset.media_hotlink[0].rules[0].expression == join(" and ", [
      "(http.host eq \"cdn.example.com\")",
      "(http.referer ne \"\")",
      "not (starts_with(http.referer, \"https://example.com/\") or starts_with(http.referer, \"https://www.example.com/\") or starts_with(http.referer, \"https://partner.org/\"))",
    ])
    error_message = "hotlink rule expression is wrong"
  }
}

run "hotlink_protection_is_ignored_without_domain" {
  command = plan

  variables {
    enable_hotlink_protection = true
  }

  assert {
    condition     = length(cloudflare_ruleset.media_hotlink) == 0
    error_message = "hotlink rules need a zone"
  }
}

run "rejects_invalid_project_name" {
  command = plan

  variables {
    project_name = "My_Site"
  }

  expect_failures = [var.project_name]
}

run "rejects_invalid_domain" {
  command = plan

  variables {
    domain = "https://example.com"
  }

  expect_failures = [var.domain]
}

run "rejects_unanchored_referer_prefix" {
  command = plan

  variables {
    hotlink_allowed_referer_prefixes = ["https://partner.org"]
  }

  expect_failures = [var.hotlink_allowed_referer_prefixes]
}
