// Usage: node scripts/package-output.mjs [--preview]
// Turns dist/ into cf Build Output. See scripts/lib/build-output.mjs.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveWorkerConfig, writeBuildOutput } from "./lib/build-output.mjs";

const DIST_DIR = "dist";
const OUT_DIR = ".cloudflare/output";
const CONFIG_PATH = "cloudflare.config.ts";

const isPreview = process.argv.includes("--preview");

try {
	// Node 24 strips TypeScript types natively, so the config imports directly.
	const { default: configExport } = await import(pathToFileURL(resolve(CONFIG_PATH)).href);
	const worker = await resolveWorkerConfig(configExport, { isPreview });
	const versionDir = writeBuildOutput({ distDir: DIST_DIR, outDir: OUT_DIR, worker, isPreview });
	console.log(`Packaged ${DIST_DIR}/ → ${versionDir}/ (worker "${worker.name}", ${isPreview ? "preview" : "production"})`);
} catch (error) {
	console.error(`ERROR: ${error.message}`);
	process.exit(1);
}
