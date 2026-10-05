// Example "generator": copies site/ to dist/ unchanged.
//
// This is the swap point for a real static site generator. Replace the
// `build:site` script in package.json with your generator's build command
// (e.g. `astro build`, `hugo --destination dist`, `vite build`), as long as it
// writes the finished site to dist/. Nothing else in the pipeline cares how
// dist/ was produced.
import { cpSync, rmSync } from "node:fs";
import { basename } from "node:path";

const SOURCE_DIR = "site";
const OUTPUT_DIR = "dist";
const IGNORED_NAMES = new Set([".DS_Store", "Thumbs.db"]);

rmSync(OUTPUT_DIR, { recursive: true, force: true });
cpSync(SOURCE_DIR, OUTPUT_DIR, {
	recursive: true,
	filter: (src) => !IGNORED_NAMES.has(basename(src)),
});
console.log(`Built ${SOURCE_DIR}/ → ${OUTPUT_DIR}/`);
