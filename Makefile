# Static site skeleton — run `make help` to list targets.
# Every CI step calls a target here, so local runs and CI behave the same.

SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := help

# Local config and secrets (copy .env.example → .env). Optional because CI sets
# the same variables from GitHub secrets instead.
-include .env
# cf reads these from the environment.
export CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_API_TOKEN

# --- Settings -----------------------------------------------------------------

TF ?= terraform
# --no-install: always run the version pinned in package.json, never a download.
CF := npx --no-install cf
GIT_SHA := $(shell git rev-parse --short HEAD 2>/dev/null || echo unknown)
PROJECT_NAME := $(shell node -p "require('./site.json').project_name")

R2_ENDPOINT := https://$(CLOUDFLARE_ACCOUNT_ID).r2.cloudflarestorage.com
PREVIEW_RESULT := .cloudflare/preview-result.json
INFRA := $(TF) -chdir=infra
TF_PLAN := tfplan
MEDIA_DIR := media
# Browser caching for uploaded media. Replacing a file under the same name
# serves the old copy until this expires, so prefer new names for new versions.
MEDIA_CACHE_CONTROL ?= public, max-age=86400

# Terraform: R2 state credentials, endpoint, and account ID for the provider.
TF_ENV = AWS_ACCESS_KEY_ID='$(TFSTATE_R2_ACCESS_KEY_ID)' \
	AWS_SECRET_ACCESS_KEY='$(TFSTATE_R2_SECRET_ACCESS_KEY)' \
	AWS_ENDPOINT_URL_S3='$(R2_ENDPOINT)' \
	TF_VAR_account_id='$(CLOUDFLARE_ACCOUNT_ID)'

# rclone remote "r2:" defined entirely by env vars, so no ~/.config/rclone edits.
RCLONE_ENV = RCLONE_CONFIG_R2_TYPE=s3 \
	RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
	RCLONE_CONFIG_R2_ACCESS_KEY_ID='$(MEDIA_R2_ACCESS_KEY_ID)' \
	RCLONE_CONFIG_R2_SECRET_ACCESS_KEY='$(MEDIA_R2_SECRET_ACCESS_KEY)' \
	RCLONE_CONFIG_R2_ENDPOINT='$(R2_ENDPOINT)' \
	RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true
RCLONE_FLAGS = --exclude .gitkeep --exclude .DS_Store \
	--header-upload 'Cache-Control: $(MEDIA_CACHE_CONTROL)' --stats-one-line -v

.PHONY: help install build build-preview check test serve deploy preview preview-url clean \
	media-sync media-sync-dry media-prune media-prune-dry \
	infra-bootstrap infra-init infra-plan infra-apply infra-terraform infra-output infra-fmt infra-validate infra-test

help: ## List targets
	@grep -hE '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

# --- Site ---------------------------------------------------------------------

install: ## Install pinned dependencies (cf)
	@echo "==> Installing dependencies"
	npm ci

build: ## Build dist/, check it, and package production Build Output
	@echo "==> Building site into dist/"
	npm run -s build:site
	@$(MAKE) -s check
	@echo "==> Packaging production Build Output"
	node scripts/package-output.mjs

build-preview: ## Same as build, but packaged as a Worker Preview
	@echo "==> Building site into dist/"
	npm run -s build:site
	@$(MAKE) -s check
	@echo "==> Packaging preview Build Output"
	node scripts/package-output.mjs --preview

check: ## Validate dist/ (required files, CF limits, _headers, internal links)
	@echo "==> Checking dist/"
	node scripts/check-dist.mjs dist

test: ## Run unit tests
	@echo "==> Running unit tests"
	npm test

serve: build ## Serve dist/ on http://localhost:8788 (no CF 404/trailing-slash handling)
	@echo "==> Serving dist/ at http://localhost:8788 (Ctrl+C to stop)"
	python3 -m http.server --directory dist 8788

deploy: guard-CLOUDFLARE_API_TOKEN guard-CLOUDFLARE_ACCOUNT_ID build ## Deploy production
	@echo "==> Deploying $(PROJECT_NAME) ($(GIT_SHA)) to production"
	$(CF) deploy --prebuilt --message "$(GIT_SHA)"

preview: guard-CLOUDFLARE_API_TOKEN guard-CLOUDFLARE_ACCOUNT_ID guard-PREVIEW_NAME build-preview ## Deploy a preview: make preview PREVIEW_NAME=pr-12
	@echo "==> Deploying preview '$(PREVIEW_NAME)'"
	$(CF) previews deploy --prebuilt "$(PREVIEW_NAME)" | tee $(PREVIEW_RESULT)
	@echo "==> Preview URL: $$(node scripts/preview-url.mjs $(PREVIEW_RESULT))"

preview-url: ## Print the URL from the last `make preview`
	@node scripts/preview-url.mjs $(PREVIEW_RESULT)

clean: ## Remove build output
	@echo "==> Removing dist/, .cloudflare/ and infra/$(TF_PLAN)"
	rm -rf dist .cloudflare infra/$(TF_PLAN)

# --- Media (R2) ---------------------------------------------------------------
# The bucket name comes from Terraform state, so run `make infra-apply` first.

# Fails on an empty name: `rclone sync media r2:` would target the whole account.
RESOLVE_MEDIA_BUCKET = bucket="$$($(TF_ENV) $(INFRA) output -raw media_bucket_name)"; \
	if [ -z "$$bucket" ]; then echo "ERROR: no media bucket in Terraform outputs. Run 'make infra-apply' first."; exit 1; fi

media-sync: tool-rclone guard-MEDIA_R2_ACCESS_KEY_ID guard-MEDIA_R2_SECRET_ACCESS_KEY ## Upload new/changed media/ files to R2 (never deletes)
	@$(RESOLVE_MEDIA_BUCKET); \
		echo "==> Uploading new/changed files from $(MEDIA_DIR)/ to r2:$$bucket"; \
		$(RCLONE_ENV) rclone copy $(MEDIA_DIR) "r2:$$bucket" $(RCLONE_FLAGS)

media-sync-dry: tool-rclone guard-MEDIA_R2_ACCESS_KEY_ID guard-MEDIA_R2_SECRET_ACCESS_KEY ## Show what media-sync would upload
	@$(RESOLVE_MEDIA_BUCKET); \
		echo "==> Dry run: upload $(MEDIA_DIR)/ to r2:$$bucket"; \
		$(RCLONE_ENV) rclone copy $(MEDIA_DIR) "r2:$$bucket" $(RCLONE_FLAGS) --dry-run

media-prune-dry: tool-rclone guard-MEDIA_R2_ACCESS_KEY_ID guard-MEDIA_R2_SECRET_ACCESS_KEY ## Show what media-prune would upload AND delete
	@$(RESOLVE_MEDIA_BUCKET); \
		echo "==> Dry run: mirror $(MEDIA_DIR)/ to r2:$$bucket (deletes remote extras)"; \
		$(RCLONE_ENV) rclone sync $(MEDIA_DIR) "r2:$$bucket" $(RCLONE_FLAGS) --dry-run

media-prune: tool-rclone guard-MEDIA_R2_ACCESS_KEY_ID guard-MEDIA_R2_SECRET_ACCESS_KEY ## Mirror media/ to R2, DELETING remote files missing locally (CONFIRM=yes)
	@if [ "$(CONFIRM)" != "yes" ]; then \
		echo "ERROR: media-prune deletes R2 objects that aren't in $(MEDIA_DIR)/."; \
		echo "       Run 'make media-prune-dry' first, then 'make media-prune CONFIRM=yes'."; \
		exit 1; \
	fi
	@$(RESOLVE_MEDIA_BUCKET); \
		echo "==> Mirroring $(MEDIA_DIR)/ to r2:$$bucket (deleting remote extras)"; \
		$(RCLONE_ENV) rclone sync $(MEDIA_DIR) "r2:$$bucket" $(RCLONE_FLAGS)

# --- Infrastructure (Terraform, run locally — never from CI) ------------------

infra-bootstrap: guard-CLOUDFLARE_API_TOKEN guard-CLOUDFLARE_ACCOUNT_ID guard-TFSTATE_BUCKET ## One-time: create the private R2 bucket for Terraform state
	@echo "==> Ensuring state bucket '$(TFSTATE_BUCKET)' exists"
	@if $(CF) r2 buckets get "$(TFSTATE_BUCKET)" >/dev/null 2>&1; then \
		echo "    already exists"; \
	else \
		$(CF) r2 buckets create --name "$(TFSTATE_BUCKET)"; \
	fi

infra-init: tool-$(TF) guard-TFSTATE_BUCKET guard-TFSTATE_R2_ACCESS_KEY_ID guard-TFSTATE_R2_SECRET_ACCESS_KEY guard-CLOUDFLARE_ACCOUNT_ID ## Connect Terraform to its R2 state
	@echo "==> Initialising Terraform (state: r2://$(TFSTATE_BUCKET)/$(PROJECT_NAME)/terraform.tfstate)"
	@$(TF_ENV) $(INFRA) init -input=false \
		-backend-config=backend.hcl \
		-backend-config="bucket=$(TFSTATE_BUCKET)" \
		-backend-config="key=$(PROJECT_NAME)/terraform.tfstate"

infra-plan: infra-init guard-CLOUDFLARE_API_TOKEN ## Preview infra changes (saved to infra/tfplan)
	@echo "==> Planning infra changes"
	@$(TF_ENV) $(INFRA) plan -input=false -var-file=../site.json -out=$(TF_PLAN)

infra-apply: guard-CLOUDFLARE_API_TOKEN ## Apply the plan saved by infra-plan
	@if [ ! -f infra/$(TF_PLAN) ]; then echo "ERROR: no saved plan. Run 'make infra-plan' and review it first."; exit 1; fi
	@echo "==> Applying infra/$(TF_PLAN)"
	@$(TF_ENV) $(INFRA) apply -input=false $(TF_PLAN)
	@rm -f infra/$(TF_PLAN)

infra-terraform: guard-ARGS ## Run a terraform command with credentials, e.g. ARGS="state list"
	@echo "==> $(TF) $(ARGS)"
	@$(TF_ENV) $(INFRA) $(ARGS)

infra-output: ## Show infra outputs (media bucket, media base URL)
	@$(TF_ENV) $(INFRA) output

infra-fmt: tool-$(TF) ## Format Terraform files
	@echo "==> Formatting infra/"
	$(INFRA) fmt -recursive

infra-validate: tool-$(TF) ## Check formatting and validate (no credentials needed)
	@echo "==> Validating infra/"
	$(INFRA) init -backend=false -input=false >/dev/null
	$(INFRA) fmt -check -recursive
	$(INFRA) validate

infra-test: tool-$(TF) ## Run Terraform tests against a mocked provider (no credentials needed)
	@echo "==> Testing infra/"
	$(INFRA) init -backend=false -input=false >/dev/null
	$(INFRA) test

# --- Guards -------------------------------------------------------------------

guard-%:
	@if [ -z "$($*)" ]; then echo "ERROR: $* is not set. Pass it on the command line (make <target> $*=...) or add it to .env (see .env.example)."; exit 1; fi

tool-%:
	@command -v $* >/dev/null || { echo "ERROR: '$*' is not installed. See docs/HUMAN_SETUP.md, step 1."; exit 1; }
