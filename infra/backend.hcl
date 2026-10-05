# R2 compatibility settings for the S3 backend. No secrets here: bucket and key
# are passed by the Makefile, credentials and endpoint come from AWS_* env vars.
region                      = "auto"
use_path_style              = true
skip_credentials_validation = true
skip_region_validation      = true
skip_requesting_account_id  = true
skip_metadata_api_check     = true
skip_s3_checksum            = true
