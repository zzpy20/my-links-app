# Changelog

## 2026-09-13 — Locked folder, tag/search leak fixes, wrangler.jsonc route fix

### New Features

**Locked folder** (renamed from "Private")
- The old Private tab was just a filter — anyone with normal app access could see it, no password required. Now genuinely password-protected, reusing the same `isUnlocked()`/cookie mechanism already used for locked collections
- Server excludes locked links entirely when not unlocked (not just hidden client-side) — the tab's count stays blank rather than leaking how many locked links exist
- Independent `LOCK_PASSWORD` secret — previously the unlock check reused `LOGIN_PASSWORD || API_TOKEN`, the same credential as the main app login, so there was no way to rotate one without rotating the other
- Manual "Lock now" button — re-locks immediately instead of waiting for the 1-hour cookie to expire
- "Make Private"/"Make Public"/"🔒 Private" wording renamed to Lock/Unlock/Locked throughout (tab label, per-link toggle, bulk toggle, badges) to match

### Bug Fixes

**Locked links leaking outside Locked folder**
- Archive's view filter never checked `is_private` — a link that was both archived and locked showed up unprotected under Archive, and was simultaneously invisible in Locked folder (which required `archived_at IS NULL`). Archive now excludes locked links, and Locked folder shows a locked link regardless of archive status, so every locked entry lives in exactly one place
- Global search wasn't filtering `is_private` at all — locked links were searchable regardless of lock state, contradicting the point of locking them. Now excluded unconditionally; the search-hint text was corrected from "Searching across All, Archive & Locked folder" to "Searching across All & Archive"

**Selection bar**
- The Lock button was hardcoded hidden whenever the Archive tab was active (and whenever everything selected was already archived, even from search) — a leftover from before archived+locked was a valid combination

**Manage Tags dropdown**
- Built its checkbox list from `GET /tags`, which deliberately excludes locked/private links so they don't leak into the All tab's filter chips — meant any tag used only on locked links had no checkbox at all, since the list didn't know it existed. Could show "No tags yet" on a selection that actually had tags. Now unions the global tag list with tags actually present on the selected links, so it always reflects the real selection regardless of which tab it's opened from

### Infrastructure

**wrangler.jsonc config drift**
- The custom domain route (`links.1000600.xyz`) was configured live via the Cloudflare dashboard but was never present in `wrangler.jsonc`. A non-interactive `wrangler deploy` silently accepted the "override remote config with local" prompt and dropped the route from the live Worker. Caught and restored within minutes; the route (plus `observability.enabled`) is now committed to the config file so this can't silently repeat on a future deploy from either session

---

## 2026-05-06 — Collections sorting, iPhone shortcut fix

### New Features

**Collections sidebar sorting**
- Four sort buttons above the collection list: Recent (default), Oldest, A–Z, Z–A
- Sorting is client-side and works together with the search filter
- "Oldest" sorts by when the first link with that tag was added (new `earliest` field returned by `/collections-data`)

### Bug Fixes

**iPhone "MY LINKS Share" shortcut**
- Was using `worker.ausz.workers.dev` (behind Cloudflare Access) → changed to `https://links.1000600.xyz/links`
- Was using CF-Access service token headers with no Bearer token → added `Authorization: Bearer <token>` header

---

## 2026-05-01 — Tag normalisation, Tag Manager, Logout, Icons & Bug Fixes

### New Features

**Logout**
- Logout button added to the header
- Uses `GET /logout` → 302 redirect to clear cookie reliably
- Session cookie changed from `SameSite=Strict` to `SameSite=Lax` so the browser bookmarklet popup works when clicked from another site

**Tag Manager panel**
- New slide-in panel (gear icon in header) to manage all tags globally
- Rename a tag across all links in one action
- Delete a tag from all links without deleting the links themselves
- Separate from the "Manage tags" action bar (which applies tags to selected links)

**Per-rule Preview Run**
- Each Auto-tag rule now has its own "Run" button
- Shows a dry-run preview of which links would be affected before applying
- Apply or cancel from the preview panel

**Trash count badge**
- Red badge on the trash icon shows how many items are in the trash
- Updates automatically after delete/restore actions

**SVG icon set**
- All header buttons replaced with Heroicons SVGs (consistent 19×19, stroke-width 1.5)
- Hover tooltips on all header buttons (0.5s delay)

**Public site tag whitelist**
- Public site now only shows links tagged `public`
- Previously showed all non-private links

### Changes

**Tag case normalisation**
- All tags are now stored lowercase — "Jobs" and "jobs" are treated as the same tag
- Normalisation applied at every write point (new links, edits, batch import, auto-tag rules, rename)
- One-time migration ran to lowercase all existing tags in the database (53 links updated, 3 tag_metadata rows updated)

**Tag rename now reflects immediately in Collections**
- Renaming a tag via Tag Manager now clears the collection's custom display name
- Previously the old display name persisted in the sidebar even after the tag key changed

### Bug Fixes

- **Collection-links missing links** — SQL query upgraded from 4 to 6 LIKE patterns; links with a tag in a middle position (e.g. `"public, github, first-batch"`) were not returned
- **Bookmarklet broken** — `SameSite=Strict` cookie was not sent on cross-origin popup navigation; fixed with `SameSite=Lax`. Bookmarklet URL also updated to `links.1000600.xyz` (not `worker.ausz.workers.dev` which requires Cloudflare Access SSO)
- **Collections lock state lost** — after tag lowercase migration, `tag_metadata` still had mixed-case tags so the lookup between links and metadata broke; fixed by migrating `tag_metadata` too
- **CF_Authorization bypass** — removed: any Cloudflare cookie previously granted admin access as a wildcard bypass

---

## 2026-04-29 — v1 Milestone

Initial feature-complete release. See README for full feature list.
