import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { resolveWorkerConfig, writeBuildOutput } from "../scripts/lib/build-output.mjs";
import { MINIMAL_SITE, makeTree } from "./helpers.mjs";

const WORKER = { name: "site", compatibilityDate: "2026-10-01", domains: ["example.com"] };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

describe("resolveWorkerConfig", () => {
	it("accepts the object form", async () => {
		assert.deepEqual(await resolveWorkerConfig({ worker: WORKER }, { isPreview: false }), WORKER);
	});

	it("calls the function form with { isPreview, mode: undefined }", async () => {
		let seen;
		const configExport = async (context) => {
			seen = context;
			return { worker: { ...WORKER, domains: context.isPreview ? [] : ["example.com"] } };
		};
		assert.deepEqual((await resolveWorkerConfig(configExport, { isPreview: true })).domains, []);
		assert.deepEqual(seen, { isPreview: true, mode: undefined });
		assert.deepEqual((await resolveWorkerConfig(configExport, { isPreview: false })).domains, ["example.com"]);
	});

	it("rejects missing worker, name or compatibility date", async () => {
		await assert.rejects(resolveWorkerConfig({}, { isPreview: false }), /must define `worker`/);
		await assert.rejects(resolveWorkerConfig({ worker: { compatibilityDate: "2026-10-01" } }, { isPreview: false }), /name/);
		await assert.rejects(resolveWorkerConfig({ worker: { name: "x", compatibilityDate: "Oct 1" } }, { isPreview: false }), /YYYY-MM-DD/);
	});

	it("refuses a production config with no domains and no workers.dev", async () => {
		const worker = { ...WORKER, domains: [], workersDev: false };
		await assert.rejects(resolveWorkerConfig({ worker }, { isPreview: false }), /no public address/);
		await assert.doesNotReject(resolveWorkerConfig({ worker }, { isPreview: true }));
		await assert.doesNotReject(resolveWorkerConfig({ worker: { ...worker, workersDev: true } }, { isPreview: false }));
	});

	it("refuses fields that need a Worker script", async () => {
		const worker = { ...WORKER, entrypoint: "./src/index.ts", env: {} };
		await assert.rejects(resolveWorkerConfig({ worker }, { isPreview: false }), /sets entrypoint, env/);
	});
});

describe("writeBuildOutput", () => {
	it("writes config, worker config and assets in cf's Build Output layout", () => {
		const distDir = makeTree(MINIMAL_SITE);
		const outDir = makeTree({});
		const versionDir = writeBuildOutput({ distDir, outDir, worker: WORKER, isPreview: false });

		assert.equal(versionDir, join(outDir, "v0"));
		assert.deepEqual(readJson(join(versionDir, "config.json")), { buildContext: { isPreview: false } });
		assert.deepEqual(readJson(join(versionDir, "workers/default/worker.config.json")), WORKER);
		assert.equal(readFileSync(join(versionDir, "workers/default/assets/about/index.html"), "utf8"), MINIMAL_SITE["about/index.html"]);
	});

	it("records preview builds so production deploys refuse them", () => {
		const versionDir = writeBuildOutput({ distDir: makeTree(MINIMAL_SITE), outDir: makeTree({}), worker: WORKER, isPreview: true });
		assert.equal(readJson(join(versionDir, "config.json")).buildContext.isPreview, true);
	});

	it("removes files left over from a previous build", () => {
		const outDir = makeTree({ "v0/workers/default/assets/deleted-page.html": "stale" });
		writeBuildOutput({ distDir: makeTree(MINIMAL_SITE), outDir, worker: WORKER, isPreview: false });
		assert.equal(existsSync(join(outDir, "v0/workers/default/assets/deleted-page.html")), false);
	});
});
