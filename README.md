# My Links App

A personal bookmark manager running on Cloudflare Workers + D1. Save, tag, and browse your links from any device with a clean Apple-style UI.

## Structure

```
my-links-app/
├── worker/          # Private admin interface (TypeScript)
└── public-worker/   # Public read-only view (JavaScript)
```

## Features

- Save links with auto-fetched title, description, and thumbnail
- Special YouTube support via oEmbed
- Tag links manually or via auto-tagging rules (by domain or keyword)
- Grid and list view
- Search and tag filtering
- Archive, delete, and mark links as private
- Inline notes editing
- Bulk operations (select, delete, archive, export)
- Optional public-facing page for sharing non-private links

## Workers

### `worker/` — Private Admin UI

The main interface for managing your links. Protected by an `API_TOKEN` secret.

**Setup:**
```bash
cd worker
npm install
npx wrangler secret put API_TOKEN
npx wrangler dev       # local dev
npx wrangler deploy    # deploy to Cloudflare
```

### `public-worker/` — Public View

A read-only page showing your non-private, non-archived links. Toggle visibility with the `PUBLIC_ENABLED` variable (`"true"` / `"false"`).

**Setup:**
```bash
cd public-worker
npm install
npx wrangler dev
npx wrangler deploy
```

## Database

Both workers share a single Cloudflare D1 database (`links-db`). Create it once:

```bash
npx wrangler d1 create links-db
```

Then update the `database_id` in both `wrangler.jsonc` files.
