import { defineConfig } from "cf/config";

// MARK: Per-site settings

// Worker name. Renaming it after the first deploy creates a second Worker and
// leaves the old one (and its domains) running until you delete it.
const NAME = "static-site";

// Hostnames that serve the site, apex or subdomain. Each one's zone must be
// active on this Cloudflare account. Empty = only <NAME>.<subdomain>.workers.dev.
const DOMAINS = ["lavavite.com", "www.lavavite.com"];

// MARK: Worker

// Assets-only Worker: there is no `entrypoint`, so every request is served from
// static assets, which are free and unlimited.
//
// Nothing builds this project through Wrangler or Vite. scripts/package-output.mjs
// evaluates this config and writes Build Output for `cf deploy --prebuilt`.
// Keeping this file committed also stops `cf` from running "automatic
// configuration", which would install Wrangler and rewrite project files.
export default defineConfig(({ isPreview }) => ({
	worker: {
		name: NAME,
		compatibilityDate: "2026-10-01",
		assets: {
			// /about → about.html or about/index.html, with canonical redirects.
			htmlHandling: "auto-trailing-slash",
			// Unknown paths get the nearest 404.html with a 404 status. A
			// single-page app (React, Vue, ...) needs "single-page-application".
			notFoundHandling: "404-page",
		},
		// workers.dev stays on: PR preview URLs are served from it.
		workersDev: true,
		previewUrls: true,
		// Each production deploy makes the Worker's custom domains match this list,
		// creating DNS records and certificates. Previews must never claim them.
		domains: isPreview ? [] : DOMAINS,
	},
}));
