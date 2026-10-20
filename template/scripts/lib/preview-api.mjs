// Deletes Worker Previews through the Cloudflare API. `cf` (beta) can deploy a
// preview but not delete one, and the documented CLI for it is Wrangler, which
// this project doesn't use. Wrangler's `preview delete` makes this same call.
const API_BASE = "https://api.cloudflare.com/client/v4";

// The preview doesn't exist: it was never deployed (e.g. a fork PR) or is
// already deleted.
const PREVIEW_NOT_FOUND = 10025;

/**
 * Deletes a preview and all its deployments. Resolves to false when there was
 * nothing to delete. `fetchFn` is injectable for tests.
 */
export async function deletePreview({ accountId, apiToken, worker, preview, fetchFn = fetch }) {
	const url = `${API_BASE}/accounts/${accountId}/workers/workers/${encodeURIComponent(worker)}/previews/${encodeURIComponent(preview)}`;
	const response = await fetchFn(url, { method: "DELETE", headers: { Authorization: `Bearer ${apiToken}` } });
	const body = await response.json().catch(() => ({}));
	if (body.success) return true;

	const errors = body.errors ?? [];
	if (errors.some((error) => error.code === PREVIEW_NOT_FOUND)) return false;
	const reason = errors.map((error) => `${error.code} ${error.message}`).join("; ") || `HTTP ${response.status}`;
	throw new Error(`deleting preview "${preview}" failed: ${reason}`);
}
