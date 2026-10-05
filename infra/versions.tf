terraform {
  required_version = ">= 1.10"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.26"
    }
  }

  # State lives in a private R2 bucket via its S3-compatible API. Bucket, key,
  # endpoint and credentials are supplied by the Makefile (`make infra-init`),
  # and the R2-specific settings by backend.hcl.
  backend "s3" {}
}

# Authenticates with CLOUDFLARE_API_TOKEN from the environment (.env via Make).
provider "cloudflare" {}
