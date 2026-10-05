import { defineConfig } from "cf/config";
// site.json is the single source of truth for site identity. OpenTofu reads the
// same file (`-var-file=../site.json`), so names and domains can't drift apart.
import site from "./site.json" with { type: "json" };

// Assets-only Worker: there is no `entrypoint`, so every request is served from
// static assets. Static asset requests are free and unlimited — no Worker
// invocations are billed.
//
// Nothing builds this project through Wrangler or Vite. scripts/package-output.mjs
// evaluates this config and writes Build Output for `cf deploy --prebuilt`.
// Keeping this file committed also stops `cf` from running "automatic
// configuration", which would install Wrangler and rewrite project files.
/** Pure so tests can exercise it with any site.json values. */
export function workerConfig(siteConfig: typeof site, { isPreview }: { isPreview: boolean }) {
	return {
		name: siteConfig.project_name,
		compatibilityDate: "2026-10-01",
		assets: {
			// /about → about.html or about/index.html, with canonical redirects.
			htmlHandling: "auto-trailing-slash",
			// Unknown paths serve the nearest 404.html with a 404 status.
			notFoundHandling: "404-page",
		},
		// workers.dev stays on: PR preview URLs are served from it.
		workersDev: true,
		previewUrls: true,
		// Previews must never claim the production domain.
		domains: !isPreview && siteConfig.domain ? [siteConfig.domain] : [],
	} as const;
}

export default defineConfig(({ isPreview }) => ({ worker: workerConfig(site, { isPreview }) }));
