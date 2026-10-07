import assert from "node:assert/strict";
import { truncateSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { LIMITS, checkDist, listFiles } from "../scripts/lib/dist-checks.mjs";
import { MINIMAL_SITE, makeTree } from "./helpers.mjs";

const STATIC_SITE = { assets: { notFoundHandling: "404-page" } };
const SPA = { assets: { notFoundHandling: "single-page-application" } };

describe("listFiles", () => {
	it("lists nested files as POSIX paths", () => {
		assert.deepEqual(listFiles(makeTree(MINIMAL_SITE)).sort(), Object.keys(MINIMAL_SITE).sort());
	});
});

describe("checkDist", () => {
	it("passes a complete static site", () => {
		assert.deepEqual(checkDist(makeTree(MINIMAL_SITE), STATIC_SITE), []);
	});

	it("fails clearly when the directory is missing", () => {
		assert.deepEqual(checkDist("/nonexistent", STATIC_SITE), ["/nonexistent/ does not exist. Run the site build first."]);
	});

	it("requires index.html", () => {
		const { "index.html": _, ...site } = MINIMAL_SITE;
		assert.deepEqual(checkDist(makeTree(site), STATIC_SITE), ["missing index.html"]);
	});

	it("requires 404.html for 404-page handling and points single-page apps at the fix", () => {
		const { "404.html": _, ...site } = MINIMAL_SITE;
		const errors = checkDist(makeTree(site), STATIC_SITE);
		assert.equal(errors[0], "missing 404.html");
		assert.match(errors[1], /single-page-application/);
	});

	it("lets a single-page app skip 404.html", () => {
		assert.deepEqual(checkDist(makeTree({ "index.html": "<div id=root></div>", "assets/app.js": "" }), SPA), []);
	});

	it("rejects files over the 25 MiB asset limit", () => {
		const dir = makeTree(MINIMAL_SITE);
		writeFileSync(join(dir, "video.mp4"), "");
		truncateSync(join(dir, "video.mp4"), LIMITS.maxFileBytes + 1);
		assert.deepEqual(checkDist(dir, STATIC_SITE), ["video.mp4 is 25.0 MiB (limit 25 MiB)"]);
	});

	it("doesn't count control files like _headers as assets", () => {
		const files = Object.fromEntries(Array.from({ length: LIMITS.maxFiles - 4 }, (_, i) => [`p/${i}.txt`, ""]));
		const dir = makeTree({ ...MINIMAL_SITE, ...files, _headers: "", _redirects: "" });
		assert.deepEqual(checkDist(dir, STATIC_SITE), []);
		writeFileSync(join(dir, "one-too-many.txt"), "");
		assert.deepEqual(checkDist(dir, STATIC_SITE), [`${LIMITS.maxFiles + 1} files exceeds the ${LIMITS.maxFiles} file limit`]);
	});
});
