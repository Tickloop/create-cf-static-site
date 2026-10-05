// Usage: node scripts/check-dist.mjs [dir]   (default: dist)
// Fails the build/deploy when dist/ would deploy broken or exceed CF limits.
import { checkDist } from "./lib/dist-checks.mjs";

const dir = process.argv[2] ?? "dist";
const errors = checkDist(dir);

if (errors.length > 0) {
	console.error(`dist check failed (${errors.length} problem${errors.length === 1 ? "" : "s"}):`);
	for (const error of errors) console.error(`  - ${error}`);
	process.exit(1);
}
console.log(`dist check passed: ${dir}/`);
