# My Links App

A personal bookmark manager built entirely through conversation with [Claude](https://claude.ai). Save, tag, search, and browse your links from any device — with a clean Apple-style UI running serverlessly on Cloudflare Workers + D1.

> **Built with Claude Code** — every feature in this app was designed and implemented through natural-language conversation with Claude, from the initial data model to the Safari tab importer and collections view.

## Live Demo

The public view shows non-private links: **https://public-worker.ausz.workers.dev**

The private admin interface (requires auth): **https://links.1000600.xyz**

---

## Features

### Core
- Save links with auto-fetched title, description, and thumbnail
- YouTube support via oEmbed (title, channel, thumbnail)
- Grid and list view toggle
- Full-text search across title, description, URL, and notes
- Inline notes editing
- Pagination

### Tags & Organisation
- Tag links manually (comma-separated)
- Auto-tagging rules by domain or keyword
- Tag cloud for filtering
- **Collections view** — browse all tags as folders with link count and last-updated date, edit collection name/description, open all links at once

### Safari Integration
- **Paste URLs importer** — copy tabs from Safari's address bar and paste them in bulk
- **Apple Shortcut** — one-tap shortcut saves all open Safari tabs as a tagged session (uses AppleScript + shell script via `save-safari-session.sh`)

### Management
- Archive and unarchive links
- Soft-delete with trash/restore
- Mark links as private (hidden from public view)
- Bulk select, delete, archive, tag, export
- Re-fetch metadata on demand

### Public View
- Optional read-only public page showing non-private, non-archived links
- Toggle with `PUBLIC_ENABLED` env var

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | [Cloudflare Workers](https://workers.cloudflare.com/) (TypeScript) |
| Database | [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite) |
| Public view | Cloudflare Workers (JavaScript) |
| Auth | Bearer token (`API_TOKEN` secret) + Cloudflare Access cookie |
| UI | Vanilla JS, Apple HIG-inspired CSS, no frameworks |
| Safari automation | AppleScript + zsh + macOS Shortcuts |

---

## Project Structure

```
my-links-app/
├── worker/                  # Private admin interface (TypeScript)
│   ├── src/index.ts         # All routes + HTML rendered server-side
│   └── wrangler.jsonc
├── public-worker/           # Public read-only view (JavaScript)
│   ├── src/index.js
│   └── wrangler.jsonc
└── save-safari-session.sh   # Shell script called by macOS Shortcut
```

---

## Setup

### Prerequisites
- [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)

### 1. Create the database

```bash
npx wrangler d1 create links-db
```

Copy the `database_id` from the output and update it in both `worker/wrangler.jsonc` and `public-worker/wrangler.jsonc`.

### 2. Deploy the admin worker

```bash
cd worker
npm install
npx wrangler secret put API_TOKEN   # set a strong random token
npx wrangler deploy
```

### 3. Deploy the public worker (optional)

```bash
cd public-worker
npm install
npx wrangler deploy
```

Set `PUBLIC_ENABLED` to `"true"` in `public-worker/wrangler.jsonc` to enable the public view.

### 4. Safari Shortcut (optional)

1. Copy `save-safari-session.sh` to your Mac and fill in your `API_TOKEN` and `API_URL`
2. Make it executable: `chmod +x ~/save-safari-session.sh`
3. In the Shortcuts app, create a new shortcut with a **Run Shell Script** action: `bash /Users/yourname/save-safari-session.sh "$1"`
4. Add the shortcut to your Safari toolbar

---

## How It Was Built

This project was built from scratch using [Claude Code](https://claude.ai/code) — Anthropic's agentic coding tool. The development process included:

- Designing the database schema through conversation
- Iterating on UI features by describing what was needed in plain English
- Debugging TypeScript template literal escaping issues together
- Working through macOS Shortcuts + AppleScript quirks step by step
- Adding features like bulk operations, collections, and the Safari importer incrementally

The entire git history reflects the real development conversation — no code was written outside of Claude.
