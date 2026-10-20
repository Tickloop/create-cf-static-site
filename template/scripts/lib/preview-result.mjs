// Extracts the preview URL from `cf previews deploy` output.
//
// cf prints the result as JSON with `preview_urls` and `deployment_urls`
// (cf 1.0.0-beta.12). Their element shape isn't documented during the beta, so
// this accepts plain strings or objects with a `url` field, and tolerates log
// lines around the JSON.

/** Parses the last JSON object found in the command output. */
export function parsePreviewResult(output) {
	const start = output.indexOf("{");
	const end = output.lastIndexOf("}");
	if (start === -1 || end < start) {
		throw new Error("no JSON object found in `cf previews deploy` output");
	}
	return JSON.parse(output.slice(start, end + 1));
}

function urlsFrom(value) {
	if (!Array.isArray(value)) return [];
	return value
		.map((entry) => (typeof entry === "string" ? entry : entry?.url))
		.filter((url) => typeof url === "string" && url.startsWith("https://"));
}

/**
 * Prefers the stable per-preview URL (same for every push to a PR) over the
 * per-deployment URL (changes on every push).
 */
export function previewUrl(result) {
	const [url] = [...urlsFrom(result.preview_urls), ...urlsFrom(result.deployment_urls)];
	if (!url) throw new Error("`cf previews deploy` output contains no https preview URL");
	return url;
}
