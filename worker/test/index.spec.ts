import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import worker from "../src/index";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;
const API_TOKEN = "test-token";

async function resetDb() {
	await env.links_db.prepare("DROP TABLE IF EXISTS links").run();
	await env.links_db.prepare("DROP TABLE IF EXISTS tag_metadata").run();
	await env.links_db
		.prepare(`
		CREATE TABLE links (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			url TEXT,
			title TEXT,
			description TEXT,
			thumbnail TEXT,
			tags TEXT,
			notes TEXT,
			read INTEGER DEFAULT 0,
			is_private INTEGER DEFAULT 0,
			archived_at DATETIME,
			deleted_at DATETIME,
			created_at DATETIME DEFAULT (datetime('now'))
		)
	`)
		.run();
	await env.links_db
		.prepare(`
		CREATE TABLE tag_metadata (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			tag TEXT NOT NULL UNIQUE,
			name TEXT,
			description TEXT,
			locked INTEGER DEFAULT 0,
			created_at DATETIME DEFAULT (datetime('now'))
		)
	`)
		.run();
}

function authedRequest(url: string) {
	return new IncomingRequest(url, {
		headers: { Authorization: `Bearer ${API_TOKEN}` },
	});
}

describe("admin worker", () => {
	beforeEach(resetDb);

	it("renders the login page for unauthenticated HTML requests", async () => {
		const ctx = createExecutionContext();
		const response = await worker.fetch(new IncomingRequest("http://example.com/"), env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe("/login");
	});

	it("escapes bookmarklet title and URL values on the add page", async () => {
		const ctx = createExecutionContext();
		const response = await worker.fetch(
			authedRequest("http://example.com/add?url=https%3A%2F%2Fexample.com%2F%3Cscript%3E&title=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E"),
			{ ...env, API_TOKEN },
			ctx,
		);
		await waitOnExecutionContext(ctx);

		const html = await response.text();
		expect(response.status).toBe(200);
		expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
		expect(html).toContain("https://example.com/&lt;script&gt;");
		expect(html).not.toContain('<img src=x onerror=alert(1)>');
	});

	it("does not hide untagged links when locked tags are filtered", async () => {
		await env.links_db
			.prepare("INSERT INTO links (url, title, tags) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)")
			.bind(
				"https://example.com/untagged",
				"Untagged",
				null,
				"https://example.com/open",
				"Open",
				"reading",
				"https://example.com/locked",
				"Locked",
				"secret",
			)
			.run();
		await env.links_db.prepare("INSERT INTO tag_metadata (tag, locked) VALUES (?, 1)").bind("secret").run();

		const ctx = createExecutionContext();
		const response = await worker.fetch(authedRequest("http://example.com/links"), { ...env, API_TOKEN }, ctx);
		await waitOnExecutionContext(ctx);

		const data = (await response.json()) as { results: Array<{ title: string }> };
		expect(data.results.map((link) => link.title).sort()).toEqual(["Open", "Untagged"]);
	});
});
