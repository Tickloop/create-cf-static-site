# Static site → Cloudflare Worker. Run `make help` to list targets.
# CI calls these same targets, so local runs and CI behave the same.

SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := help

# Local secrets (copy .env.example → .env). Optional because CI sets the same
# variables from GitHub secrets instead.
-include .env
# cf reads these from the environment.
export CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_API_TOKEN

# MARK: Settings

# Where `npm run build:site` writes the finished site (Hugo: public, CRA: build).
DIST ?= dist
# --no-install: always run the version pinned in package.json, never a download.
CF := npx --no-install cf
GIT_SHA := $(shell git rev-parse --short HEAD 2>/dev/null || echo unknown)
PREVIEW_RESULT := .cloudflare/preview-result.json

.PHONY: help install test build build-preview deploy preview preview-url preview-delete https clean

help: ## List targets
	@grep -hE '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

# MARK: Build

install: ## Install the pinned cf CLI
	npm ci

test: ## Unit tests for the deploy scripts
	npm test

build: ## Build the site, check it, and package it for production
	npm run -s build:site
	node scripts/package-output.mjs $(DIST)

build-preview: ## Same as build, packaged as a Worker Preview
	npm run -s build:site
	node scripts/package-output.mjs $(DIST) --preview

# MARK: Deploy

deploy: guard-CLOUDFLARE_API_TOKEN guard-CLOUDFLARE_ACCOUNT_ID build ## Deploy production and attach DOMAINS from cloudflare.config.ts
	$(CF) deploy --prebuilt --message "$(GIT_SHA)"

preview: guard-CLOUDFLARE_API_TOKEN guard-CLOUDFLARE_ACCOUNT_ID guard-PREVIEW_NAME build-preview ## Deploy a preview: make preview PREVIEW_NAME=pr-12
	$(CF) previews deploy --prebuilt "$(PREVIEW_NAME)" | tee $(PREVIEW_RESULT)
	@echo "Preview URL: $$(node scripts/preview-url.mjs $(PREVIEW_RESULT))"

preview-url: ## Print the URL from the last `make preview`
	@node scripts/preview-url.mjs $(PREVIEW_RESULT)

preview-delete: guard-CLOUDFLARE_API_TOKEN guard-CLOUDFLARE_ACCOUNT_ID guard-PREVIEW_NAME ## Delete a preview and its deployments: make preview-delete PREVIEW_NAME=pr-12
	node scripts/delete-preview.mjs "$(PREVIEW_NAME)"

# Zone-wide, so it also affects anything else on the zone. New zones default to
# serving plain http:// and accepting TLS 1.0.
https: guard-CLOUDFLARE_API_TOKEN guard-ZONE ## Once per zone: redirect http→https, require TLS 1.2 (make https ZONE=example.com)
	$(CF) zones settings edit always_use_https --zone "$(ZONE)" --body '{"value":"on"}'
	$(CF) zones settings edit min_tls_version --zone "$(ZONE)" --body '{"value":"1.2"}'

clean: ## Remove build output
	rm -rf $(DIST) .cloudflare

guard-%:
	@if [ -z "$($*)" ]; then echo "ERROR: $* is not set. Pass it on the command line (make <target> $*=...) or add it to .env (see .env.example)."; exit 1; fi
