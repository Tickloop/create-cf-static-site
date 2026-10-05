// Guards the real project files (not fixtures): site.json, cloudflare.config.ts
// and the example site must stay deployable.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import configExport, { workerConfig } from "../cloudflare.config.ts";
import { resolveWorkerConfig } from "../scripts/lib/build-output.mjs";
import { checkDist } from "../scripts/lib/dist-checks.mjs";

const site = JSON.parse(readFileSync(new URL("../site.json", import.meta.url), "utf8"));

describe("site.json", () => {
	it("has exactly the keys OpenTofu declares as variables", () => {
		// `tofu -var-file=../site.json` only warns on undeclared keys, so a key added
		// here without a matching variable in infra/variables.tf would be silently ignored.
		assert.deepEqual(Object.keys(site).sort(), ["cdn_subdomain", "domain", "project_name"]);
	});
});

describe("cloudflare.config.ts", () => {
	it("names the Worker after site.json and passes the packager's validation", async () => {
		const worker = await resolveWorkerConfig(configExport, { isPreview: false });
		assert.equal(worker.name, site.project_name);
		assert.deepEqual(worker.domains, site.domain ? [site.domain] : []);
	});

	it("attaches the domain to production but never to previews", () => {
		const withDomain = { ...site, domain: "example.com" };
		assert.deepEqual(workerConfig(withDomain, { isPreview: false }).domains, ["example.com"]);
		assert.deepEqual(workerConfig(withDomain, { isPreview: true }).domains, []);
		assert.deepEqual(workerConfig({ ...site, domain: "" }, { isPreview: false }).domains, []);
	});
});

describe("example site", () => {
	it("passes the dist checks as-is (site/ is copied verbatim to dist/)", () => {
		assert.deepEqual(checkDist("site"), []);
	});
});
