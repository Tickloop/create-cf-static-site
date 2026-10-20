# create-cf-static-site: the npm package that scaffolds template/.
# Run `make help` to list targets.

SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := help

# Where `make smoke` scaffolds its throwaway project.
SMOKE_DIR := $(shell mktemp -u /tmp/cf-static-site-smoke.XXXXXX)

.PHONY: help install smoke pack-check

help: ## List targets
	@grep -hE '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install: ## Install the template's pinned cf CLI, to work on the template in place
	@echo "Installing template dependencies..."
	npm --prefix template ci

smoke: ## Scaffold a throwaway project, then run its tests and build
	@echo "Scaffolding into $(SMOKE_DIR)..."
	node bin/create.mjs $(SMOKE_DIR) --name smoke-test
	@echo "Setting a placeholder domain (the template ships with none)..."
	node -e 'const fs = require("fs"); const p = process.argv[1]; fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace("const DOMAINS: string[] = [];", "const DOMAINS = [\"example.com\"];"))' $(SMOKE_DIR)/cloudflare.config.ts
	@echo "Running the project's tests and build..."
	$(MAKE) -C $(SMOKE_DIR) test build
	@echo "Smoke test passed. Removing $(SMOKE_DIR)..."
	rm -rf $(SMOKE_DIR)

pack-check: ## List the files `npm publish` would upload, without uploading
	@echo "Files in the package tarball:"
	npm pack --dry-run
