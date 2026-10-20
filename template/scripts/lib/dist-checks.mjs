// Pre-deploy checks on the built site: anything Cloudflare would reject, or a
// site that would deploy broken. Returns error strings so tests can assert on them.
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, posix } from "node:path";

// Workers Static Assets limits on the Free plan.
// https://developers.cloudflare.com/workers/platform/limits/#static-assets
export const LIMITS = {
	maxFiles: 20_000,
	maxFileBytes: 25 * 1024 * 1024,
};

// Control files that Cloudflare reads but does not serve as assets.
const CONTROL_FILES = new Set(["_headers", "_redirects", ".assetsignore"]);

/** Recursively lists files under dir as POSIX paths relative to dir. */
export function listFiles(dir, prefix = "") {
	return readdirSync(join(dir, prefix), { withFileTypes: true }).flatMap((entry) => {
		const relative = posix.join(prefix, entry.name);
		return entry.isDirectory() ? listFiles(dir, relative) : [relative];
	});
}

/** 404.html is only required when the Worker serves it for unknown paths. */
export function requiredFiles(worker) {
	return worker.assets?.notFoundHandling === "404-page" ? ["index.html", "404.html"] : ["index.html"];
}

/** Returns every reason `dir` can't be deployed as `worker`'s assets. */
export function checkDist(dir, worker) {
	if (!existsSync(dir) || !statSync(dir).isDirectory()) {
		return [`${dir}/ does not exist. Run the site build first.`];
	}
	const files = listFiles(dir);
	const servedFiles = files.filter((file) => !CONTROL_FILES.has(file));
	const errors = requiredFiles(worker)
		.filter((file) => !files.includes(file))
		.map((file) => `missing ${file}`);

	if (errors.includes("missing 404.html")) {
		errors.push('a single-page app needs notFoundHandling: "single-page-application" in cloudflare.config.ts');
	}
	if (servedFiles.length > LIMITS.maxFiles) {
		errors.push(`${servedFiles.length} files exceeds the ${LIMITS.maxFiles} file limit`);
	}
	for (const file of servedFiles) {
		const bytes = statSync(join(dir, file)).size;
		if (bytes > LIMITS.maxFileBytes) {
			errors.push(`${file} is ${(bytes / 1024 / 1024).toFixed(1)} MiB (limit 25 MiB)`);
		}
	}
	return errors;
}
