// Pre-deploy checks for dist/. Each check is a pure function returning a list of
// error strings, so tests can exercise them individually.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix } from "node:path";

// Workers Static Assets limits on the Free plan.
// https://developers.cloudflare.com/workers/platform/limits/#static-assets
export const LIMITS = {
	maxFiles: 20_000,
	maxFileBytes: 25 * 1024 * 1024,
	maxHeaderRules: 100,
	maxHeaderLineLength: 2_000,
};

export const REQUIRED_FILES = ["index.html", "404.html"];

// Control files that Cloudflare reads but does not serve as assets.
const CONTROL_FILES = new Set(["_headers", "_redirects", ".assetsignore"]);

/** Recursively lists files under dir as POSIX paths relative to dir. */
export function listFiles(dir, prefix = "") {
	return readdirSync(join(dir, prefix), { withFileTypes: true }).flatMap((entry) => {
		const relative = posix.join(prefix, entry.name);
		return entry.isDirectory() ? listFiles(dir, relative) : [relative];
	});
}

export function checkRequiredFiles(files) {
	const present = new Set(files);
	return REQUIRED_FILES.filter((file) => !present.has(file)).map((file) => `missing required file: ${file}`);
}

export function checkAssetLimits(dir, files) {
	const errors = [];
	const servedFiles = files.filter((file) => !CONTROL_FILES.has(file));
	if (servedFiles.length > LIMITS.maxFiles) {
		errors.push(`${servedFiles.length} files exceeds the ${LIMITS.maxFiles} file limit`);
	}
	for (const file of servedFiles) {
		const bytes = statSync(join(dir, file)).size;
		if (bytes > LIMITS.maxFileBytes) {
			const mib = (bytes / 1024 / 1024).toFixed(1);
			errors.push(`${file} is ${mib} MiB (limit 25 MiB) — move it to R2 media (see media/)`);
		}
	}
	return errors;
}

// RFC 7230 header-name characters.
const HEADER_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/** Validates the syntax of a `_headers` file. */
export function checkHeadersFile(text) {
	const errors = [];
	let ruleCount = 0;
	let currentRule = null;

	text.split(/\r?\n/).forEach((rawLine, index) => {
		const where = `_headers line ${index + 1}`;
		if (rawLine.length > LIMITS.maxHeaderLineLength) {
			errors.push(`${where}: longer than ${LIMITS.maxHeaderLineLength} characters`);
		}
		const line = rawLine.trim();
		if (line === "" || line.startsWith("#")) return;

		const isIndented = /^\s/.test(rawLine);
		if (!isIndented) {
			if (!line.startsWith("/") && !line.startsWith("https://")) {
				errors.push(`${where}: URL pattern must start with "/" or "https://"`);
			}
			currentRule = line;
			ruleCount += 1;
			return;
		}

		if (currentRule === null) {
			errors.push(`${where}: header line appears before any URL pattern`);
			return;
		}
		// "! Name" detaches a header set by an earlier rule.
		const name = line.startsWith("!") ? line.slice(1).trim() : line.slice(0, line.indexOf(":")).trim();
		if (!line.startsWith("!") && !line.includes(":")) {
			errors.push(`${where}: expected "Name: value"`);
		} else if (!HEADER_NAME.test(name)) {
			errors.push(`${where}: invalid header name "${name}"`);
		}
	});

	if (ruleCount > LIMITS.maxHeaderRules) {
		errors.push(`_headers has ${ruleCount} rules (limit ${LIMITS.maxHeaderRules})`);
	}
	return errors;
}

// href/src attribute values. Regex is enough for generated HTML; a full parser
// would be the first dependency this skeleton needs.
const LINK_ATTRIBUTE = /\b(?:href|src)\s*=\s*(["'])(.*?)\1/gi;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;
// Anything with a scheme (https:, mailto:, data:, ...) or protocol-relative.
const EXTERNAL_LINK = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

export function extractLinks(html) {
	const withoutComments = html.replace(HTML_COMMENT, "");
	return [...withoutComments.matchAll(LINK_ATTRIBUTE)].map((match) => match[2].trim());
}

/** True when a link should be checked against dist/ (same-site, not a fragment). */
export function isInternalLink(href) {
	return href !== "" && !href.startsWith("#") && !EXTERNAL_LINK.test(href);
}

/**
 * Returns the dist-relative files a request for `href` (from page `fromFile`)
 * could be served from under `htmlHandling: "auto-trailing-slash"`, or null
 * if the link escapes the site root or is malformed.
 */
export function candidateTargets(fromFile, href) {
	let path = href.split(/[?#]/, 1)[0];
	try {
		path = decodeURIComponent(path);
	} catch {
		return null;
	}

	const isDirectory = path === "" || path.endsWith("/");
	const joined = path.startsWith("/") ? path.slice(1) : posix.join(posix.dirname(fromFile), path);
	const normalized = posix.normalize(joined === "" ? "." : joined).replace(/\/$/, "");
	if (normalized === ".." || normalized.startsWith("../")) return null;

	const base = normalized === "." ? "" : normalized;
	const indexFile = posix.join(base, "index.html");
	if (isDirectory) return base === "" ? [indexFile] : [indexFile, `${base}.html`];
	return [base, `${base}.html`, indexFile];
}

export function findBrokenLinks(dir, files) {
	const servedFiles = new Set(files.filter((file) => !CONTROL_FILES.has(file)));
	const errors = [];
	for (const page of files.filter((file) => file.endsWith(".html"))) {
		const html = readFileSync(join(dir, page), "utf8");
		for (const href of extractLinks(html).filter(isInternalLink)) {
			const candidates = candidateTargets(page, href);
			if (!candidates?.some((candidate) => servedFiles.has(candidate))) {
				errors.push(`${page}: broken internal link "${href}"`);
			}
		}
	}
	return errors;
}

/** Runs every check against a built site directory. */
export function checkDist(dir) {
	if (!existsSync(dir) || !statSync(dir).isDirectory()) {
		return [`${dir}/ does not exist — run \`make build\` first`];
	}
	const files = listFiles(dir);
	const headersPath = join(dir, "_headers");
	return [
		...checkRequiredFiles(files),
		...checkAssetLimits(dir, files),
		...(existsSync(headersPath) ? checkHeadersFile(readFileSync(headersPath, "utf8")) : []),
		...findBrokenLinks(dir, files),
	];
}
