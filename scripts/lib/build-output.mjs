// Writes cf "Build Output" (.cloudflare/output/v0) for an assets-only Worker,
// so `cf deploy --prebuilt` / `cf previews deploy --prebuilt` can upload it
// without Wrangler or Vite.
//
// The layout below mirrors what `cf build` produces for a static project
// (cf 1.0.0-beta.12). The format is beta: if a `cf` upgrade changes it, this
// file and tests/build-output.test.mjs are the only places to update.
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const BUILD_OUTPUT_VERSION_DIR = "v0";
export const DEFAULT_WORKER_DIR = join("workers", "default");
const CONFIG_PATH = "cloudflare.config.ts";

// Fields that need a Worker script or bundler. This packager only ships static
// assets, so it refuses them instead of silently deploying something broken.
const UNSUPPORTED_WORKER_FIELDS = ["entrypoint", "env", "durableObjects", "triggers"];

/** Imports cloudflare.config.ts from the working directory and resolves its `worker`. */
export async function loadWorkerConfig({ isPreview }) {
	// Node 24 strips TypeScript types natively, so the config imports directly.
	const { default: configExport } = await import(pathToFileURL(resolve(CONFIG_PATH)).href);
	return resolveWorkerConfig(configExport, { isPreview });
}

/**
 * Evaluates the default export of cloudflare.config.ts (object or function
 * form) the same way cf does, and returns the `worker` section.
 */
export async function resolveWorkerConfig(configExport, { isPreview }) {
	// cf calls function-form configs with { isPreview, mode }. Builds written by
	// this packager record no mode, so mode is undefined, matching cf's API commands.
	const context = { isPreview, mode: undefined };
	const config = await (typeof configExport === "function" ? configExport(context) : configExport);
	const worker = await (typeof config?.worker === "function" ? config.worker(context) : config?.worker);

	if (!worker || typeof worker !== "object") {
		throw new Error("cloudflare.config.ts must define `worker`.");
	}
	if (typeof worker.name !== "string" || worker.name === "") {
		throw new Error("cloudflare.config.ts: `worker.name` is required.");
	}
	if (!/^\d{4}-\d{2}-\d{2}$/.test(worker.compatibilityDate ?? "")) {
		throw new Error("cloudflare.config.ts: `worker.compatibilityDate` must be YYYY-MM-DD.");
	}
	const unsupported = UNSUPPORTED_WORKER_FIELDS.filter((field) => worker[field] !== undefined);
	if (unsupported.length > 0) {
		throw new Error(
			`cloudflare.config.ts sets ${unsupported.join(", ")}, which need a Worker script. ` +
				"This skeleton deploys static assets only; see AGENTS.md → 'Add server-side logic'.",
		);
	}
	// Without workers.dev, the custom domains are production's only address.
	if (!isPreview && worker.workersDev !== true && !worker.domains?.length) {
		throw new Error("cloudflare.config.ts: DOMAINS is empty, so production would have no public address.");
	}
	return worker;
}

/** Replaces outDir/v0 with a fresh Build Output containing distDir as assets. */
export function writeBuildOutput({ distDir, outDir, worker, isPreview }) {
	const versionDir = join(outDir, BUILD_OUTPUT_VERSION_DIR);
	const workerDir = join(versionDir, DEFAULT_WORKER_DIR);

	// Start clean so files deleted from the site don't linger in the upload.
	rmSync(versionDir, { recursive: true, force: true });
	mkdirSync(workerDir, { recursive: true });

	cpSync(distDir, join(workerDir, "assets"), { recursive: true });
	writeJson(join(versionDir, "config.json"), { buildContext: { isPreview } });
	writeJson(join(workerDir, "worker.config.json"), worker);
	return versionDir;
}

function writeJson(path, value) {
	writeFileSync(path, `${JSON.stringify(value, null, "\t")}\n`);
}
