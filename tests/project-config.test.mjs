// Guards the real project files (not fixtures): cloudflare.config.ts and the
// example site must stay deployable.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import configExport from "../cloudflare.config.ts";
import { resolveWorkerConfig } from "../scripts/lib/build-output.mjs";
import { checkDist } from "../scripts/lib/dist-checks.mjs";

const production = await resolveWorkerConfig(configExport, { isPreview: false });
const preview = await resolveWorkerConfig(configExport, { isPreview: true });

describe("cloudflare.config.ts", () => {
	it("uses one Worker name that fits a preview hostname", () => {
		// Preview URLs are <preview>-<name>.<subdomain>.workers.dev, and a DNS
		// label is at most 63 characters.
		assert.equal(preview.name, production.name);
		assert.match(production.name, /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/);
	});

	it("attaches custom domains in production only", () => {
		// A preview listing them would move the live domains onto the preview.
		assert.deepEqual(preview.domains, []);
		for (const hostname of production.domains) assert.match(hostname, /^([a-z0-9-]+\.)+[a-z]{2,}$/);
	});
});

describe("example site", () => {
	it("passes the dist checks as-is (site/ is copied verbatim to dist/)", () => {
		assert.deepEqual(checkDist("site", production), []);
	});
});
