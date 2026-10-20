import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deletePreview } from "../scripts/lib/preview-api.mjs";

const ARGS = { accountId: "acct", apiToken: "token", worker: "site", preview: "pr-12" };

/** Fake fetch that records each request and answers with `json` and `status`. */
function fakeFetch(json, status = 200) {
	const calls = [];
	const fetchFn = async (url, init) => {
		calls.push({ url, init });
		return { status, json };
	};
	return { calls, fetchFn };
}

describe("deletePreview", () => {
	it("deletes the named preview of the Worker", async () => {
		const { calls, fetchFn } = fakeFetch(async () => ({ success: true }));
		assert.equal(await deletePreview({ ...ARGS, fetchFn }), true);
		assert.equal(calls[0].url, "https://api.cloudflare.com/client/v4/accounts/acct/workers/workers/site/previews/pr-12");
		assert.equal(calls[0].init.method, "DELETE");
		assert.equal(calls[0].init.headers.Authorization, "Bearer token");
	});

	it("treats a missing preview as already deleted", async () => {
		const { fetchFn } = fakeFetch(async () => ({ success: false, errors: [{ code: 10025, message: "Preview not found." }] }), 404);
		assert.equal(await deletePreview({ ...ARGS, fetchFn }), false);
	});

	it("fails on any other API error", async () => {
		const { fetchFn } = fakeFetch(async () => ({ success: false, errors: [{ code: 10000, message: "Authentication error" }] }), 403);
		await assert.rejects(deletePreview({ ...ARGS, fetchFn }), /10000 Authentication error/);
	});

	it("fails clearly when the response isn't JSON", async () => {
		const { fetchFn } = fakeFetch(async () => {
			throw new SyntaxError("Unexpected token <");
		}, 502);
		await assert.rejects(deletePreview({ ...ARGS, fetchFn }), /HTTP 502/);
	});
});
