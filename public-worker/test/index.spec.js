import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import worker from "../src";

async function resetDb() {
	await env.DB.prepare("DROP TABLE IF EXISTS links").run();
	await env.DB.prepare(`
		CREATE TABLE links (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			url TEXT,
			title TEXT,
			description TEXT,
			thumbnail TEXT,
			tags TEXT,
			notes TEXT,
			is_private INTEGER DEFAULT 0,
			archived_at DATETIME,
			deleted_at DATETIME,
			created_at DATETIME DEFAULT (datetime('now'))
		)
	`).run();
}

describe("public worker", () => {
	beforeEach(resetDb);

	it("shows the offline page when public access is disabled", async () => {
		const ctx = createExecutionContext();
		const response = await worker.fetch(new Request("http://example.com"), { ...env, PUBLIC_ENABLED: "false" }, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(503);
		expect(await response.text()).toContain("Not Available");
	});

	it("serializes public link data safely inside the script block", async () => {
		await env.DB.prepare("INSERT INTO links (url, title, tags) VALUES (?, ?, ?)")
			.bind("https://example.com", "Example", 'public, </script><img src=x onerror=alert(1)>')
			.run();

		const ctx = createExecutionContext();
		const response = await worker.fetch(new Request("http://example.com"), { ...env, PUBLIC_ENABLED: "true" }, ctx);
		await waitOnExecutionContext(ctx);

		const html = await response.text();
		expect(response.status).toBe(200);
		expect(html).toContain("\\u003c/script\\u003e\\u003cimg src=x onerror=alert(1)\\u003e");
		expect(html).not.toContain("</script><img src=x onerror=alert(1)>");
	});
});
