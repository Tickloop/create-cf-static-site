// Usage: node scripts/package-output.mjs [dist-dir] [--preview]
// Checks the built site, then turns it into cf Build Output for
// `cf deploy --prebuilt`. See scripts/lib/build-output.mjs.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveWorkerConfig, writeBuildOutput } from "./lib/build-output.mjs";
import { checkDist } from "./lib/dist-checks.mjs";

const OUT_DIR = ".cloudflare/output";
const CONFIG_PATH = "cloudflare.config.ts";

const args = process.argv.slice(2);
const isPreview = args.includes("--preview");
const [distDir = "dist"] = args.filter((arg) => arg !== "--preview");

try {
	// Node 24 strips TypeScript types natively, so the config imports directly.
	const { default: configExport } = await import(pathToFileURL(resolve(CONFIG_PATH)).href);
	const worker = await resolveWorkerConfig(configExport, { isPreview });
	const errors = checkDist(distDir, worker);
	if (errors.length > 0) {
		throw new Error(`${distDir}/ can't be deployed:\n${errors.map((error) => `  - ${error}`).join("\n")}`);
	}
	const versionDir = writeBuildOutput({ distDir, outDir: OUT_DIR, worker, isPreview });
	console.log(`Packaged ${distDir}/ → ${versionDir}/ (worker "${worker.name}", ${isPreview ? "preview" : "production"})`);
} catch (error) {
	console.error(`ERROR: ${error.message}`);
	process.exit(1);
}
