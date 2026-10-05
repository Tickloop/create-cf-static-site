import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** Creates a temp directory populated with { "relative/path": contents }. */
export function makeTree(files) {
	const root = mkdtempSync(join(tmpdir(), "static-site-test-"));
	for (const [path, contents] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), contents);
	}
	return root;
}

export const MINIMAL_SITE = {
	"index.html": '<a href="/about/">About</a>',
	"404.html": "<h1>404</h1>",
	"about/index.html": '<link href="../style.css"><a href="/">Home</a>',
	"style.css": "body{}",
};
