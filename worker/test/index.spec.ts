import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
	afterEach(() => {
		vi.restoreAllMocks();
	});

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

	it("stores a resolved thumbnail when metadata uses reordered attributes and relative URLs", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				new Response(
					`<!doctype html>
					<html>
						<head>
							<meta content="Metadata title" property="og:title">
							<meta content="Metadata description" name="description">
							<meta content="/images/card.jpg" property="og:image">
						</head>
					</html>`,
					{ headers: { "Content-Type": "text/html" } },
				),
			),
		);

		const ctx = createExecutionContext();
		const response = await worker.fetch(
			new IncomingRequest("http://example.com/links", {
				method: "POST",
				headers: { Authorization: `Bearer ${API_TOKEN}`, "Content-Type": "application/json" },
				body: JSON.stringify({ url: "https://site.example/articles/one" }),
			}),
			{ ...env, API_TOKEN },
			ctx,
		);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		const row = (await env.links_db.prepare("SELECT title, description, thumbnail FROM links").first()) as {
			title: string;
			description: string;
			thumbnail: string;
		};
		expect(row).toEqual({
			title: "Metadata title",
			description: "Metadata description",
			thumbnail: "https://site.example/images/card.jpg",
		});
	});

	it("falls back to the first regular page image when preview metadata is missing", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				new Response(
					`<!doctype html>
					<html>
						<head>
							<title>Product page</title>
							<link rel="icon" href="/favicon.ico">
						</head>
						<body>
							<img src="/assets/logo.svg">
							<img src="/products/photo.jpg">
						</body>
					</html>`,
					{ headers: { "Content-Type": "text/html" } },
				),
			),
		);

		const ctx = createExecutionContext();
		const response = await worker.fetch(
			new IncomingRequest("http://example.com/links", {
				method: "POST",
				headers: { Authorization: `Bearer ${API_TOKEN}`, "Content-Type": "application/json" },
				body: JSON.stringify({ url: "https://shop.example/items/one" }),
			}),
			{ ...env, API_TOKEN },
			ctx,
		);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		const row = (await env.links_db.prepare("SELECT thumbnail FROM links").first()) as { thumbnail: string };
		expect(row.thumbnail).toBe("https://shop.example/products/photo.jpg");
	});

	it("prefers Amazon landing images over small thumbnails and tracking pixels", async () => {
		const fetchMock = vi.fn(async () =>
			new Response(
				`<!doctype html>
				<html>
					<body>
						<img height="1" width="1" src="//fls-fe.amazon.com.au/1/batch/track">
						<img alt="" src="https://m.media-amazon.com/images/I/41a90fnL3rL._AC_US40_.jpg">
						<img id="landingImage" src="https://m.media-amazon.com/images/I/61DdZ9JekLL._AC_SX300_SY300_QL70_ML2_.jpg" data-old-hires="https://m.media-amazon.com/images/I/61DdZ9JekLL._AC_SL1500_.jpg">
					</body>
				</html>`,
				{ headers: { "Content-Type": "text/html" } },
			)
		);
		vi.stubGlobal(
			"fetch",
			fetchMock,
		);

		const ctx = createExecutionContext();
		const response = await worker.fetch(
			new IncomingRequest("http://example.com/links", {
				method: "POST",
				headers: { Authorization: `Bearer ${API_TOKEN}`, "Content-Type": "application/json" },
				body: JSON.stringify({ url: "https://www.amazon.com.au/dp/B09GFFNX5Y?ref_=pfb_spv01&tag=fbcmapntv-au-22&fbclid=abc&th=1" }),
			}),
			{ ...env, API_TOKEN },
			ctx,
		);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledWith("https://www.amazon.com.au/dp/B09GFFNX5Y", expect.any(Object));
		const row = (await env.links_db.prepare("SELECT thumbnail FROM links").first()) as { thumbnail: string };
		expect(row.thumbnail).toBe("https://m.media-amazon.com/images/I/61DdZ9JekLL._AC_SL1500_.jpg");
	});

	it("bulk refetches thumbnails only for selected links missing thumbnails", async () => {
		await env.links_db
			.prepare("INSERT INTO links (id, url, title, thumbnail) VALUES (?, ?, ?, ?), (?, ?, ?, ?)")
			.bind(
				1,
				"https://missing.example/one",
				"Missing",
				"",
				2,
				"https://existing.example/two",
				"Existing",
				"https://existing.example/current.jpg",
			)
			.run();
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				new Response('<html><head><meta property="og:image" content="/new.jpg"></head></html>', {
					headers: { "Content-Type": "text/html" },
				}),
			),
		);

		const ctx = createExecutionContext();
		const response = await worker.fetch(
			new IncomingRequest("http://example.com/links/batch-refetch-thumbnails", {
				method: "POST",
				headers: { Authorization: `Bearer ${API_TOKEN}`, "Content-Type": "application/json" },
				body: JSON.stringify({ ids: [1, 2] }),
			}),
			{ ...env, API_TOKEN },
			ctx,
		);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true, limit: 10, checked: 1, updated: 1, missing: 0, skipped: 1, failed: 0 });
		const { results } = await env.links_db.prepare("SELECT id, thumbnail FROM links ORDER BY id").all();
		expect(results).toEqual([
			{ id: 1, thumbnail: "https://missing.example/new.jpg" },
			{ id: 2, thumbnail: "https://existing.example/current.jpg" },
		]);
	});
});
