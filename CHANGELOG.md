# Changelog

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
