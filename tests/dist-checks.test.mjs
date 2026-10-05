import assert from "node:assert/strict";
import { truncateSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
	LIMITS,
	candidateTargets,
	checkAssetLimits,
	checkDist,
	checkHeadersFile,
	checkRequiredFiles,
	extractLinks,
	findBrokenLinks,
	isInternalLink,
	listFiles,
} from "../scripts/lib/dist-checks.mjs";
import { MINIMAL_SITE, makeTree } from "./helpers.mjs";

describe("checkDist", () => {
	it("passes a valid site", () => {
		assert.deepEqual(checkDist(makeTree(MINIMAL_SITE)), []);
	});

	it("reports a missing directory instead of throwing", () => {
		assert.match(checkDist("/nonexistent/dist")[0], /does not exist/);
	});
});

describe("checkRequiredFiles", () => {
	it("requires index.html and 404.html", () => {
		assert.deepEqual(checkRequiredFiles(["index.html"]), ["missing required file: 404.html"]);
	});
});

describe("checkAssetLimits", () => {
	it("rejects files over 25 MiB", () => {
		const dir = makeTree({ "big.mp4": "" });
		truncateSync(join(dir, "big.mp4"), LIMITS.maxFileBytes + 1);
		assert.match(checkAssetLimits(dir, ["big.mp4"])[0], /big\.mp4 is 25\.0 MiB/);
	});

	it("allows a file of exactly 25 MiB", () => {
		const dir = makeTree({ "edge.bin": "" });
		truncateSync(join(dir, "edge.bin"), LIMITS.maxFileBytes);
		assert.deepEqual(checkAssetLimits(dir, ["edge.bin"]), []);
	});

	it("rejects more than the file-count limit, ignoring control files", () => {
		const files = Array.from({ length: LIMITS.maxFiles }, (_, i) => `f${i}`);
		const dir = makeTree(Object.fromEntries([...files, "_headers"].map((f) => [f, ""])));
		assert.deepEqual(checkAssetLimits(dir, [...files, "_headers"]), []);
		writeFileSync(join(dir, "extra"), "");
		assert.match(checkAssetLimits(dir, [...files, "extra"])[0], /exceeds the 20000 file limit/);
	});
});

describe("checkHeadersFile", () => {
	it("accepts rules, comments, blank lines and header detaching", () => {
		const text = "# comment\n/*\n  X-Frame-Options: DENY\n\n/assets/*\n  ! X-Frame-Options\n";
		assert.deepEqual(checkHeadersFile(text), []);
	});

	it("accepts absolute https:// patterns", () => {
		assert.deepEqual(checkHeadersFile("https://example.com/*\n  X-Robots-Tag: noindex\n"), []);
	});

	it("rejects a header before any URL pattern", () => {
		assert.match(checkHeadersFile("  X-Frame-Options: DENY\n")[0], /before any URL pattern/);
	});

	it("rejects patterns that don't start with / or https://", () => {
		assert.match(checkHeadersFile("assets/*\n  A: b\n")[0], /must start with/);
	});

	it("rejects header lines without a colon and invalid names", () => {
		const errors = checkHeadersFile("/*\n  NoColonHere\n  Bad Name: x\n");
		assert.equal(errors.length, 2);
		assert.match(errors[0], /line 2: expected "Name: value"/);
		assert.match(errors[1], /line 3: invalid header name "Bad Name"/);
	});

	it("enforces the rule-count and line-length limits", () => {
		const tooManyRules = Array.from({ length: LIMITS.maxHeaderRules + 1 }, (_, i) => `/p${i}\n  A: b`).join("\n");
		assert.match(checkHeadersFile(tooManyRules).at(-1), /101 rules \(limit 100\)/);
		const longLine = `/*\n  A: ${"x".repeat(LIMITS.maxHeaderLineLength)}\n`;
		assert.match(checkHeadersFile(longLine)[0], /longer than 2000/);
	});
});

describe("link extraction", () => {
	it("extracts href and src with either quote style, skipping comments", () => {
		const html = `<a href="/a">x</a><img src='b.png'><!-- <a href="/hidden"> -->`;
		assert.deepEqual(extractLinks(html), ["/a", "b.png"]);
	});

	it("classifies external, fragment and empty links as not internal", () => {
		for (const href of ["https://cdn.example.com/x.jpg", "//cdn.example.com/x", "mailto:a@b.c", "data:image/png;base64,x", "#top", ""]) {
			assert.equal(isInternalLink(href), false, href);
		}
		assert.equal(isInternalLink("/about/"), true);
		assert.equal(isInternalLink("../style.css"), true);
	});
});

describe("candidateTargets", () => {
	it("maps directory URLs to index.html (and name.html)", () => {
		assert.deepEqual(candidateTargets("index.html", "/"), ["index.html"]);
		assert.deepEqual(candidateTargets("index.html", "/about/"), ["about/index.html", "about.html"]);
	});

	it("maps extensionless URLs to the file, name.html, or name/index.html", () => {
		assert.deepEqual(candidateTargets("index.html", "/about"), ["about", "about.html", "about/index.html"]);
	});

	it("resolves relative links from the page's directory, ignoring query and hash", () => {
		assert.deepEqual(candidateTargets("blog/post/index.html", "../../style.css?v=2#x")[0], "style.css");
		assert.deepEqual(candidateTargets("blog/index.html", "./")[0], "blog/index.html");
	});

	it("decodes percent-encoding and rejects malformed or root-escaping links", () => {
		assert.equal(candidateTargets("index.html", "/my%20file.pdf")[0], "my file.pdf");
		assert.equal(candidateTargets("index.html", "/%E0%A4%A"), null);
		assert.equal(candidateTargets("index.html", "../outside.html"), null);
	});
});

describe("findBrokenLinks", () => {
	it("reports links with no matching file, and links to control files", () => {
		const dir = makeTree({ ...MINIMAL_SITE, "_headers": "/*\n  A: b\n", "index.html": '<a href="/missing">x</a><a href="/_headers">h</a>' });
		assert.deepEqual(findBrokenLinks(dir, listFiles(dir)), [
			'index.html: broken internal link "/missing"',
			'index.html: broken internal link "/_headers"',
		]);
	});
});
