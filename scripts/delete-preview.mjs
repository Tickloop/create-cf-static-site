// Usage: node scripts/delete-preview.mjs <preview-name>
// Deletes a Worker Preview and all its deployments, so closed PRs don't leave
// previews behind. Reads CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.
import { loadWorkerConfig } from "./lib/build-output.mjs";
import { deletePreview } from "./lib/preview-api.mjs";

const [preview] = process.argv.slice(2);
const { CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: apiToken } = process.env;

if (!preview) {
	console.error("Usage: node scripts/delete-preview.mjs <preview-name>");
	process.exit(2);
}

try {
	const { name: worker } = await loadWorkerConfig({ isPreview: true });
	const deleted = await deletePreview({ accountId, apiToken, worker, preview });
	console.log(deleted ? `Deleted preview "${preview}" of ${worker}.` : `No preview "${preview}" on ${worker}; nothing to delete.`);
} catch (error) {
	console.error(`ERROR: ${error.message}`);
	process.exit(1);
}
