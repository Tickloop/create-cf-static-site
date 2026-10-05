import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parsePreviewResult, previewUrl } from "../scripts/lib/preview-result.mjs";

describe("parsePreviewResult", () => {
	it("parses JSON surrounded by log lines", () => {
		const output = `Uploading...\n{"type":"preview","preview_urls":["https://a.workers.dev"]}\nDone.\n`;
		assert.deepEqual(parsePreviewResult(output).preview_urls, ["https://a.workers.dev"]);
	});

	it("fails when there is no JSON", () => {
		assert.throws(() => parsePreviewResult("Error: not authenticated"), /no JSON object/);
	});
});

describe("previewUrl", () => {
	it("prefers the stable preview URL over the per-deployment URL", () => {
		const result = { preview_urls: ["https://pr-1-site.acct.workers.dev"], deployment_urls: ["https://abc123-site.acct.workers.dev"] };
		assert.equal(previewUrl(result), "https://pr-1-site.acct.workers.dev");
	});

	it("accepts URL objects and falls back to deployment URLs", () => {
		assert.equal(previewUrl({ preview_urls: [{ url: "https://p.workers.dev" }] }), "https://p.workers.dev");
		assert.equal(previewUrl({ preview_urls: [], deployment_urls: ["https://d.workers.dev"] }), "https://d.workers.dev");
	});

	it("ignores non-https entries and fails when none remain", () => {
		assert.throws(() => previewUrl({ preview_urls: ["http://insecure", null], deployment_urls: "nope" }), /no https preview URL/);
	});
});
