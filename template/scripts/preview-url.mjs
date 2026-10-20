// Usage: node scripts/preview-url.mjs <cf-previews-deploy-output-file>
// Prints the preview URL so CI can post it on the pull request.
import { readFileSync } from "node:fs";
import { parsePreviewResult, previewUrl } from "./lib/preview-result.mjs";

const [file] = process.argv.slice(2);
if (!file) {
	console.error("Usage: node scripts/preview-url.mjs <output-file>");
	process.exit(2);
}

try {
	console.log(previewUrl(parsePreviewResult(readFileSync(file, "utf8"))));
} catch (error) {
	console.error(`ERROR: ${error.message}`);
	process.exit(1);
}
