interface Env {
	links_db: D1Database;
	API_TOKEN: string;
	LOGIN_PASSWORD?: string;
  }
  
  function decodeEntities(str: string): string {
	return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  }
  
  async function processYouTube(url: string): Promise<{ title: string; description: string; thumbnail: string } | null> {
	const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|m\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/);
	if (!match) return null;
	const videoId = match[1];
	try {
	  const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
	  const data = await res.json() as any;
	  return {
		title: data.title || 'YouTube Video',
		description: data.author_name ? `By ${data.author_name}` : '',
		thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
	  };
	} catch {
	  return { title: 'YouTube Video', description: '', thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` };
	}
  }
  
  async function applyRules(url: string, existingTags: string, env: Env, title: string = '', caption: string = ''): Promise<string> {
	try {
	  const { results } = await env.links_db.prepare('SELECT * FROM tag_rules WHERE enabled = 1').all();
	  if (!results.length) return existingTags;
	  const domain = (() => { try { return new URL(url).hostname.replace('www.', ''); } catch { return ''; } })();
	  const urlLower = url.toLowerCase();
	  const titleLower = title.toLowerCase();
	  const captionLower = caption.toLowerCase();
	  const existing = existingTags ? existingTags.split(',').map((t: string) => t.trim()).filter(Boolean) : [];
	  const toAdd: string[] = [];
	  for (const rule of results as any[]) {
		if (!rule.enabled) continue;
		const patterns = rule.pattern.split(',').map((p: string) => p.trim().toLowerCase()).filter(Boolean);
		let matched = false;
		if (rule.type === 'domain') {
		  matched = patterns.some((p: string) => domain.includes(p));
		} else if (rule.type === 'keyword') {
		  matched = patterns.some((p: string) => urlLower.includes(p) || titleLower.includes(p) || captionLower.includes(p));
		}
		if (matched) {
		  const ruleTags = rule.tags.split(',').map((t: string) => t.trim()).filter(Boolean);
		  ruleTags.forEach((t: string) => { if (!existing.includes(t) && !toAdd.includes(t)) toAdd.push(t); });
		}
	  }
	  return [...existing, ...toAdd].join(', ');
	} catch {
	  return existingTags;
	}
  }
  
  async function fetchMetadata(url: string) {
	try {
	  const res = await fetch(url, {
		headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
		signal: AbortSignal.timeout(8000),
	  });
	  const html = await res.text();
	  const getTag = (pattern: RegExp) => { const m = html.match(pattern); return m ? m[1].trim() : ''; };
	  const title = getTag(/<meta property="og:title" content="([^"]*)"/) || getTag(/<title>([^<]*)<\/title>/) || '';
	  const description = getTag(/<meta property="og:description" content="([^"]*)"/) || getTag(/<meta name="description" content="([^"]*)"/) || '';
	  const thumbnail = getTag(/<meta property="og:image" content="([^"]*)"/) || getTag(/<meta name="twitter:image" content="([^"]*)"/) || '';
	  return { title: decodeEntities(title), description: decodeEntities(description), thumbnail };
	} catch {
	  return { title: '', description: '', thumbnail: '' };
	}
  }
  
  async function getMeta(url: string) {
	const yt = await processYouTube(url);
	if (yt) return yt;
	return fetchMetadata(url);
  }
  
  const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, DELETE, PATCH, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
  };
  
  function getHTML(): string {
	return `<!DOCTYPE html>
  <html lang="en">
  <head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Links</title>
  <style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #f5f5f7; color: #1d1d1f; }
  header { background: white; padding: 16px 24px; border-bottom: 1px solid #e5e5e5; display: flex; gap: 12px; align-items: center; position: sticky; top: 0; z-index: 10; flex-wrap: wrap; }
  header h1 { font-size: 20px; font-weight: 700; margin-right: auto; }
  .search-wrap { position: relative; display: flex; align-items: center; }
  .search-wrap input { border: 1px solid #d2d2d7; border-radius: 10px; padding: 8px 32px 8px 14px; font-size: 14px; outline: none; background: #f5f5f7; width: 200px; }
  .search-wrap input:focus { border-color: #0071e3; background: white; }
  .search-clear { position: absolute; right: 8px; background: none; border: none; cursor: pointer; color: #aeaeb2; font-size: 16px; display: none; line-height: 1; padding: 0; }
  .view-btns { display: flex; border: 1px solid #d2d2d7; border-radius: 8px; overflow: hidden; }
  .view-btn { background: white; border: none; padding: 7px 13px; cursor: pointer; font-size: 17px; line-height: 1; }
  .view-btn.active { background: #0071e3; color: white; }
  .trash-btn { background: none; border: 1px solid #d2d2d7; border-radius: 8px; padding: 7px 10px; font-size: 16px; cursor: pointer; color: #6e6e73; }
  .trash-btn:hover { background: #fff0f0; border-color: #ff3b30; color: #ff3b30; }
  .tab-bar { background: white; border-bottom: 1px solid #e5e5e5; display: flex; padding: 0 24px; transition: opacity 0.2s; }
  .tab-bar.search-mode { opacity: 0.35; pointer-events: none; }
  .tab { padding: 12px 20px; font-size: 14px; font-weight: 600; color: #6e6e73; cursor: pointer; border-bottom: 3px solid transparent; margin-bottom: -1px; display: flex; align-items: center; gap: 6px; user-select: none; }
  .tab:hover { color: #1d1d1f; }
  .tab.active { color: #0071e3; border-bottom-color: #0071e3; }
  .tab-count { background: #e5e5ea; color: #6e6e73; border-radius: 10px; padding: 1px 7px; font-size: 11px; font-weight: 700; }
  .tab.active .tab-count { background: #0071e3; color: white; }
  .search-hint { padding: 8px 24px; font-size: 12px; color: #6e6e73; background: #f5f5f7; border-bottom: 1px solid #e5e5e5; display: none; }
  .search-hint.visible { display: block; }
  .src-badge-archive { background: #ff9500; color: white; border-radius: 6px; padding: 2px 7px; font-size: 10px; font-weight: 700; display: inline-block; margin-left: 4px; vertical-align: middle; }
  .src-badge-private { background: #5856d6; color: white; border-radius: 6px; padding: 2px 7px; font-size: 10px; font-weight: 700; display: inline-block; margin-left: 4px; vertical-align: middle; }
  .tag-panel { background: white; border-bottom: 1px solid #e5e5e5; }
  .tag-panel-header { display: flex; align-items: center; gap: 8px; padding: 10px 24px; cursor: pointer; user-select: none; }
  .tag-panel-header .lbl { font-size: 13px; font-weight: 600; color: #6e6e73; }
  .tag-panel-header .tcnt { background: #0071e3; color: white; border-radius: 10px; padding: 1px 7px; font-size: 11px; }
  .tag-panel-header .tico { margin-left: auto; font-size: 12px; color: #aeaeb2; }
  .tag-cloud { display: flex; gap: 8px; padding: 0 24px 12px; flex-wrap: wrap; }
  .tag-cloud.hidden { display: none; }
  .tag-btn { background: #f0f0f5; border: 2px solid transparent; border-radius: 20px; padding: 4px 12px; font-size: 13px; cursor: pointer; color: #1d1d1f; }
  .tag-btn:hover { border-color: #0071e3; }
  .tag-btn.active { background: #0071e3; color: white; border-color: #0071e3; }
  .tfi { padding: 4px 24px 10px; font-size: 12px; color: #6e6e73; display: flex; align-items: center; gap: 8px; }
  .ctb { font-size: 12px; color: #0071e3; background: none; border: none; cursor: pointer; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; padding: 16px 24px 24px; }
  .card { background: white; border-radius: 14px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.08); cursor: pointer; position: relative; }
  .card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.12); }
  .card.unread { border-left: 3px solid #0071e3; }
  .cthumb { width: 100%; height: 160px; object-fit: cover; display: block; background: #e5e5e5; }
  .cnoimg { width: 100%; height: 160px; background: linear-gradient(135deg, #667eea, #764ba2); display: flex; align-items: center; justify-content: center; font-size: 40px; color: white; }
  .cbody { padding: 14px; }
  .ctitle { font-size: 15px; font-weight: 600; line-height: 1.4; margin-bottom: 4px; }
  .cdesc { font-size: 13px; color: #6e6e73; line-height: 1.4; margin-bottom: 8px; }
  .nbox { font-size: 13px; color: #3a3a3c; background: #f5f5f7; border-radius: 8px; padding: 6px 10px; margin-bottom: 8px; min-height: 32px; cursor: pointer; white-space: pre-wrap; word-break: break-word; border: 1px solid transparent; }
  .nbox:hover { border-color: #d2d2d7; }
  .nph { color: #aeaeb2; }
  .curl { font-size: 12px; color: #0071e3; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; margin-bottom: 8px; }
  .ctags { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 4px; align-items: center; }
  .tag { background: #f0f0f5; border-radius: 6px; padding: 2px 8px; font-size: 11px; color: #6e6e73; }
  .cdate { font-size: 11px; color: #aeaeb2; }
  .rbadge { position: absolute; top: 8px; left: 8px; background: #34c759; color: white; border-radius: 10px; padding: 2px 8px; font-size: 11px; font-weight: 600; }
  .cact { position: absolute; top: 8px; right: 8px; display: none; gap: 4px; }
  .card:hover .cact, .li:hover .cact { display: flex; }
  .abtn { background: rgba(0,0,0,0.55); color: white; border: none; border-radius: 50%; width: 28px; height: 28px; cursor: pointer; font-size: 13px; display: flex; align-items: center; justify-content: center; }
  .list { display: flex; flex-direction: column; gap: 10px; padding: 16px 24px 24px; }
  .li { background: white; border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); display: flex; gap: 14px; align-items: flex-start; padding: 14px; cursor: pointer; position: relative; }
  .li:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.12); }
  .li.unread { border-left: 3px solid #0071e3; }
  .lthumb { width: 80px; height: 80px; object-fit: cover; border-radius: 8px; flex-shrink: 0; display: block; }
  .lnoimg { width: 80px; height: 80px; border-radius: 8px; flex-shrink: 0; background: linear-gradient(135deg, #667eea, #764ba2); display: flex; align-items: center; justify-content: center; font-size: 28px; color: white; }
  .lcon { flex: 1; min-width: 0; }
  .ltitle { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
  .ldesc { font-size: 13px; color: #6e6e73; margin-bottom: 6px; }
  .lmeta { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 4px; }
  .lurl { font-size: 12px; color: #0071e3; }
  .ldate { font-size: 11px; color: #aeaeb2; }
  .li .cact { top: 10px; right: 10px; }
  .empty { text-align: center; padding: 80px 24px; color: #aeaeb2; }
  .sel-bar { position: sticky; top: 57px; z-index: 9; background: #0071e3; color: white; padding: 10px 24px; display: none; align-items: center; gap: 12px; flex-wrap: wrap; }
  .sel-bar.visible { display: flex; }
  .sel-info { font-size: 14px; font-weight: 600; }
  .sel-clear { background: none; color: rgba(255,255,255,0.8); border: none; font-size: 13px; cursor: pointer; margin-left: auto; }
  .sel-delete { background: #ff3b30; color: white; border: none; border-radius: 8px; padding: 6px 14px; font-size: 13px; cursor: pointer; font-weight: 600; }
  .sel-archive { background: #ff9500; color: white; border: none; border-radius: 8px; padding: 6px 14px; font-size: 13px; cursor: pointer; font-weight: 600; }
  .sel-restore { background: #34c759; color: white; border: none; border-radius: 8px; padding: 6px 14px; font-size: 13px; cursor: pointer; font-weight: 600; }
  .sel-private { background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.5); border-radius: 8px; padding: 6px 14px; font-size: 13px; cursor: pointer; }
  .sel-all-btn { background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.5); border-radius: 8px; padding: 6px 14px; font-size: 13px; cursor: pointer; }
  .sel-export { background: white; color: #0071e3; border: none; border-radius: 8px; padding: 6px 14px; font-size: 13px; cursor: pointer; font-weight: 700; }
  .sel-export:hover { background: #e8f1fb; }
  .tag-mgr-btn { background: white; color: #0071e3; border: none; border-radius: 8px; padding: 6px 14px; font-size: 13px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px; }
  .tag-mgr-wrap { position: relative; }
  .tag-dropdown { position: absolute; top: calc(100% + 8px); left: 0; background: white; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.18); min-width: 260px; z-index: 999; overflow: hidden; }
  .tag-dropdown-header { padding: 10px 14px 6px; font-size: 12px; font-weight: 600; color: #6e6e73; text-transform: uppercase; letter-spacing: 0.5px; }
  .tag-dropdown-list { max-height: 240px; overflow-y: auto; padding: 4px 0; }
  .tag-dd-item { display: flex; align-items: center; gap: 10px; padding: 8px 14px; cursor: pointer; transition: background 0.1s; }
  .tag-dd-item:hover { background: #f5f5f7; }
  .tag-dd-item input[type=checkbox] { width: 16px; height: 16px; accent-color: #0071e3; cursor: pointer; flex-shrink: 0; }
  .tag-dd-item label { font-size: 14px; cursor: pointer; flex: 1; color: #1d1d1f; }
  .tag-dd-item .tag-count { font-size: 11px; color: #aeaeb2; }
  .tag-dropdown-footer { padding: 8px 14px 12px; border-top: 1px solid #f0f0f0; margin-top: 4px; }
  .tag-dd-input { width: 100%; border: 1px solid #d2d2d7; border-radius: 8px; padding: 7px 12px; font-size: 14px; outline: none; }
  .tag-dd-input:focus { border-color: #0071e3; }
  .tag-dd-add { width: 100%; margin-top: 6px; background: #0071e3; color: white; border: none; border-radius: 8px; padding: 7px; font-size: 13px; cursor: pointer; font-weight: 600; }
  .li-cb-wrap { display: flex; align-items: center; justify-content: center; width: 44px; min-height: 44px; flex-shrink: 0; cursor: pointer; margin: -14px 0 -14px -14px; padding: 14px 8px 14px 14px; }
  .li-cb { width: 22px; height: 22px; cursor: pointer; flex-shrink: 0; accent-color: #0071e3; pointer-events: none; }
  .li.selected { background: #f0f6ff; border-left: 3px solid #0071e3; }
  .sel-bar.visible ~ #con .li .cact { display: none !important; }
  .pager { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 16px 24px; flex-wrap: wrap; }
  .pbtn { background: white; border: 1px solid #d2d2d7; border-radius: 8px; padding: 6px 14px; font-size: 13px; cursor: pointer; }
  .pbtn:hover:not(:disabled) { border-color: #0071e3; color: #0071e3; }
  .pbtn.active { background: #0071e3; color: white; border-color: #0071e3; }
  .pbtn:disabled { opacity: 0.4; cursor: default; }
  .pinfo { font-size: 13px; color: #6e6e73; }
  .ppsel { border: 1px solid #d2d2d7; border-radius: 8px; padding: 6px 10px; font-size: 13px; outline: none; background: white; cursor: pointer; }
  .mo { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 100; display: flex; align-items: center; justify-content: center; }
  .md { background: white; border-radius: 16px; padding: 24px; width: 90%; max-width: 500px; box-shadow: 0 8px 32px rgba(0,0,0,0.18); max-height: 90vh; overflow-y: auto; }
  .md h3 { font-size: 17px; font-weight: 700; margin-bottom: 4px; }
  .murl { font-size: 12px; color: #0071e3; margin-bottom: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .md label { font-size: 13px; color: #6e6e73; display: block; margin-bottom: 4px; margin-top: 12px; }
  .md input[type=text] { width: 100%; border: 1px solid #d2d2d7; border-radius: 10px; padding: 8px 14px; font-size: 14px; outline: none; background: #f5f5f7; }
  .md input[type=text]:focus { border-color: #0071e3; background: white; }
  .md textarea { width: 100%; border: 1px solid #d2d2d7; border-radius: 10px; padding: 10px 14px; font-size: 14px; font-family: inherit; resize: vertical; min-height: 80px; outline: none; }
  .md textarea:focus { border-color: #0071e3; }
  .tprev { width: 100%; height: 120px; object-fit: cover; border-radius: 8px; margin-top: 8px; display: block; }
  .tprev.hidden { display: none; }
  .rfbtn { background: #f5f5f7; border: 1px solid #d2d2d7; border-radius: 8px; padding: 6px 12px; font-size: 13px; cursor: pointer; margin-top: 8px; width: 100%; text-align: left; }
  .mbtns { display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px; }
  .bcancel { background: #f5f5f7; border: none; border-radius: 10px; padding: 8px 18px; font-size: 14px; cursor: pointer; }
  .bsave { background: #0071e3; color: white; border: none; border-radius: 10px; padding: 8px 18px; font-size: 14px; cursor: pointer; }
  .bdel { background: #ff3b30; color: white; border: none; border-radius: 10px; padding: 8px 18px; font-size: 14px; cursor: pointer; margin-right: auto; }
  .rpanel { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 200; display: none; align-items: flex-start; justify-content: center; padding-top: 40px; }
  .rpanel.open { display: flex; }
  .rbox { background: white; border-radius: 16px; width: 90%; max-width: 640px; max-height: 80vh; display: flex; flex-direction: column; box-shadow: 0 8px 32px rgba(0,0,0,0.2); }
  .rhead { display: flex; align-items: center; padding: 16px 20px; border-bottom: 1px solid #e5e5e5; }
  .rhead-title { font-size: 18px; font-weight: 700; }
  .rhead-sub { font-size: 13px; color: #6e6e73; margin-left: 8px; }
  .rhead-close { margin-left: auto; background: none; border: none; font-size: 20px; cursor: pointer; color: #6e6e73; }
  .rlist { overflow-y: auto; padding: 12px 16px; flex: 1; }
  .ritem { display: flex; align-items: flex-start; flex-wrap: wrap; gap: 6px 10px; padding: 10px 12px; background: #f5f5f7; border-radius: 10px; margin-bottom: 8px; }
  .ritem.disabled { opacity: 0.5; }
  .rtype { background: #0071e3; color: white; border-radius: 6px; padding: 2px 8px; font-size: 11px; font-weight: 600; flex-shrink: 0; margin-top: 2px; }
  .rtype.keyword { background: #34c759; }
  .rpattern { font-size: 14px; font-weight: 600; flex: 1; min-width: 120px; word-break: break-word; }
  .rtags { font-size: 12px; color: #6e6e73; width: 100%; padding-left: 2px; }
  .rtoggle { background: none; border: 1px solid #d2d2d7; border-radius: 6px; padding: 3px 8px; font-size: 12px; cursor: pointer; }
  .rdel { background: none; border: none; color: #ff3b30; font-size: 16px; cursor: pointer; padding: 0 4px; }
  .redit { background: none; border: none; color: #0071e3; font-size: 14px; cursor: pointer; padding: 0 4px; }
  .radd { padding: 16px; border-top: 1px solid #e5e5e5; }
  .radd h4 { font-size: 14px; font-weight: 600; margin-bottom: 10px; color: #1d1d1f; }
  .radd-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .rselect { border: 1px solid #d2d2d7; border-radius: 8px; padding: 8px 10px; font-size: 14px; outline: none; background: white; cursor: pointer; }
  .rinput { border: 1px solid #d2d2d7; border-radius: 8px; padding: 8px 12px; font-size: 14px; outline: none; flex: 1; min-width: 120px; }
  .rinput:focus { border-color: #0071e3; }
  .radd-btn { background: #0071e3; color: white; border: none; border-radius: 8px; padding: 8px 16px; font-size: 14px; cursor: pointer; font-weight: 600; white-space: nowrap; }
  .rempty { text-align: center; padding: 40px; color: #aeaeb2; font-size: 14px; }
  .tpanel { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 200; display: none; align-items: flex-start; justify-content: center; padding-top: 40px; }
  .tpanel.open { display: flex; }
  .tbox { background: white; border-radius: 16px; width: 90%; max-width: 700px; max-height: 80vh; display: flex; flex-direction: column; box-shadow: 0 8px 32px rgba(0,0,0,0.2); }
  .thead { display: flex; align-items: center; padding: 16px 20px; border-bottom: 1px solid #e5e5e5; }
  .thead-title { font-size: 18px; font-weight: 700; }
  .thead-sub { font-size: 13px; color: #6e6e73; margin-left: 8px; }
  .thead-close { margin-left: auto; background: none; border: none; font-size: 20px; cursor: pointer; color: #6e6e73; }
  .tlist { overflow-y: auto; padding: 12px 16px; flex: 1; }
  .ti { display: flex; gap: 12px; align-items: flex-start; padding: 10px 0; border-bottom: 1px solid #f0f0f0; }
  .ti-thumb { width: 56px; height: 56px; object-fit: cover; border-radius: 8px; flex-shrink: 0; }
  .ti-noimg { width: 56px; height: 56px; border-radius: 8px; flex-shrink: 0; background: linear-gradient(135deg,#667eea,#764ba2); display: flex; align-items: center; justify-content: center; font-size: 22px; color: white; }
  .ti-info { flex: 1; min-width: 0; }
  .ti-title { font-size: 14px; font-weight: 600; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ti-url { font-size: 12px; color: #0071e3; margin-bottom: 2px; }
  .ti-date { font-size: 11px; color: #aeaeb2; }
  .ti-acts { display: flex; gap: 6px; flex-shrink: 0; align-items: center; }
  .trestore { background: #34c759; color: white; border: none; border-radius: 8px; padding: 6px 12px; font-size: 12px; cursor: pointer; font-weight: 600; }
  .tdelete { background: #ff3b30; color: white; border: none; border-radius: 8px; padding: 6px 12px; font-size: 12px; cursor: pointer; font-weight: 600; }
  .priv-badge { background: #5856d6; color: white; border-radius: 6px; padding: 2px 8px; font-size: 11px; font-weight: 700; display: inline-block; }
  </style>
  </head>
  <body>
  <header>
	<h1>My Links</h1>
	<div class="search-wrap">
	  <input type="text" id="search" placeholder="Search..." oninput="dbs()">
	  <button class="search-clear" id="sclear" onclick="clearSearch()">&#x2715;</button>
	</div>
	<div class="view-btns">
	  <button class="view-btn active" id="btn-grid" onclick="setView('grid')">&#9783;</button>
	  <button class="view-btn" id="btn-list" onclick="setView('list')">&#9776;</button>
	</div>
	<button class="trash-btn" onclick="openTrash()">&#128465;</button>
	<button class="trash-btn" onclick="openRules()" title="Auto-tag Rules">&#9881;</button>
	<button class="trash-btn" onclick="location.href='/import'" title="Import Bookmarks" style="color:#0071e3;border-color:#0071e3;">&#128228;</button>
	<button class="trash-btn" onclick="location.href='/collections'" title="Collections" style="color:#5856d6;border-color:#5856d6;">&#128193;</button>
  </header>
  <div class="tab-bar" id="tab-bar">
	<div class="tab active" id="tab-all" onclick="switchTab('all')">&#128279; All <span class="tab-count" id="cnt-all">0</span></div>
	<div class="tab" id="tab-archive" onclick="switchTab('archive')">&#128230; Archive <span class="tab-count" id="cnt-archive">0</span></div>
	<div class="tab" id="tab-private" onclick="switchTab('private')">&#128274; Private <span class="tab-count" id="cnt-private">0</span></div>
  </div>
  <div class="search-hint" id="search-hint">&#128269; Searching across All, Archive &amp; Private</div>
  <div class="tag-panel" id="tag-panel">
	<div class="tag-panel-header" onclick="ttp()">
	  <span class="lbl">TAGS</span>
	  <span class="tcnt" id="tcnt">0</span>
	  <span class="tico" id="tico">&#9650;</span>
	</div>
	<div class="tag-cloud" id="tcloud"></div>
	<div class="tfi" id="tfi" style="display:none">
	  Filtering: <span id="tlbl"></span>
	  <button class="ctb" onclick="clrT()">Clear all</button>
	</div>
  </div>
  <div class="sel-bar" id="sel-bar">
	<button class="sel-all-btn" onclick="selAll()">&#9745; Select All</button>
	<button class="sel-all-btn" onclick="deselAll()">&#9744; Deselect All</button>
	<span class="sel-info" id="sel-info">0 selected</span>
	<div class="tag-mgr-wrap">
	  <button class="tag-mgr-btn" onclick="toggleTagMgr()">&#127991; Manage Tags &#9660;</button>
	  <div class="tag-dropdown" id="tag-dropdown" style="display:none">
		<div class="tag-dropdown-header">Tags</div>
		<div class="tag-dropdown-list" id="tag-dd-list"></div>
		<div class="tag-dropdown-footer">
		  <input type="text" class="tag-dd-input" id="tag-dd-new" placeholder="New tag..." onkeydown="if(event.key==='Enter')addNewTag()">
		  <button class="tag-dd-add" onclick="addNewTag()">+ Add New Tag</button>
		</div>
	  </div>
	</div>
	<button class="sel-archive" id="btn-sel-archive" onclick="archiveSelected()">&#128230; Archive Selected</button>
	<button class="sel-restore" id="btn-sel-restore" onclick="restoreSelected()" style="display:none">&#8617; Restore Selected</button>
	<button class="sel-private" id="btn-private" onclick="togglePrivateSelected()">&#128274; Make Private</button>
	<button class="sel-export" onclick="exportLinks()">&#8681; Export</button>
	<button class="sel-delete" onclick="deleteSelected()">&#128465; Delete Selected</button>
	<button class="sel-clear" onclick="clearSel()">&#x2715; Cancel</button>
  </div>
  <div id="con"></div>
  <div id="pager"></div>
  <div id="mr"></div>
  <div class="rpanel" id="rpanel">
	<div class="rbox">
	  <div class="rhead">
		<span class="rhead-title">&#9881; Auto-tag Rules</span>
		<span class="rhead-sub">Applied when saving new links</span>
		<button class="rhead-close" onclick="closeRules()">&#x2715;</button>
	  </div>
	  <div class="rlist" id="rlist"></div>
	  <div class="radd">
		<h4>Add New Rule</h4>
		<div class="radd-row">
		  <select class="rselect" id="r-type">
			<option value="domain">Domain</option>
			<option value="keyword">Keyword</option>
		  </select>
		  <input type="text" class="rinput" id="r-pattern" placeholder="e.g. bunnings.com.au, amazon.com">
		  <span style="font-size:13px;color:#6e6e73;">&#8594; tags:</span>
		  <input type="text" class="rinput" id="r-tags" placeholder="e.g. shopping, tools, buy">
		  <button class="radd-btn" onclick="addRule()">+ Add</button>
		</div>
	  </div>
	</div>
  </div>
  <div class="tpanel" id="tpanel">
	<div class="tbox">
	  <div class="thead">
		<span class="thead-title">&#128465; Trash</span>
		<span class="thead-sub">Deleted items can be restored</span>
		<div style="margin-left:auto;display:flex;gap:8px;align-items:center;">
		  <button class="trestore" onclick="restoreAll()">&#8617; Restore All</button>
		  <button class="tdelete" onclick="deleteAll()">&#128465; Empty Trash</button>
		  <button class="thead-close" onclick="closeTrash()">&#x2715;</button>
		</div>
	  </div>
	  <div class="tlist" id="tlist"></div>
	</div>
  </div>
  <script>
  var cv = 'grid', cl = [], st, at = [], tpo = true, atm = {}, curPage = 1, perPage = 50, curSearch = '';
  var selectedIds = new Set();
  var curTab = 'all';
  
  function switchTab(tab) {
	curTab = tab;
	curPage = 1;
	curSearch = '';
	selectedIds.clear();
	document.getElementById('search').value = '';
	document.getElementById('sclear').style.display = 'none';
	at = [];
	document.getElementById('tfi').style.display = 'none';
	document.getElementById('tab-bar').classList.remove('search-mode');
	document.getElementById('search-hint').classList.remove('visible');
	['all','archive','private'].forEach(function(t) {
	  document.getElementById('tab-' + t).classList.toggle('active', t === tab);
	});
	document.getElementById('tag-panel').style.display = tab === 'all' ? '' : 'none';
	document.getElementById('btn-sel-archive').style.display = tab === 'archive' ? 'none' : '';
	document.getElementById('btn-sel-restore').style.display = tab === 'archive' ? '' : 'none';
	document.getElementById('btn-private').style.display = tab === 'archive' ? 'none' : '';
	updateSelBar();
	load('', 1);
	if (tab === 'all') loadTags();
  }
  
  function ttp() {
	tpo = !tpo;
	document.getElementById('tcloud').classList.toggle('hidden', !tpo);
	document.getElementById('tico').innerHTML = tpo ? '&#9650;' : '&#9660;';
  }
  
  function setView(v) {
	cv = v;
	document.getElementById('btn-grid').classList.toggle('active', v === 'grid');
	document.getElementById('btn-list').classList.toggle('active', v === 'list');
	render(cl);
  }
  
  function load(s, page) {
	if (s !== undefined) curSearch = s;
	if (page !== undefined) curPage = page;
	var p = new URLSearchParams();
	if (curSearch) p.set('search', curSearch);
	if (at.length && curTab === 'all') p.set('tags', at.join(','));
	p.set('page', String(curPage));
	p.set('perPage', String(perPage));
	var isSearchMode = curSearch.trim().length > 0;
	p.set('view', isSearchMode ? 'search' : curTab);
	fetch('/links?' + p).then(function(r) { return r.json(); }).then(function(d) {
	  cl = d.results;
	  render(d.results);
	  renderPager(d.total);
	  if (!isSearchMode) document.getElementById('cnt-' + curTab).textContent = d.total;
	});
  }
  
  function loadTags() {
	fetch('/tags').then(function(r) { return r.json(); }).then(function(d) { atm = d; renderTags(d); });
  }
  
  function renderTags(d) {
	var ks = Object.keys(d);
	document.getElementById('tcnt').textContent = ks.length;
	var c = document.getElementById('tcloud');
	c.innerHTML = '';
	ks.sort().forEach(function(t) {
	  var b = document.createElement('button');
	  b.className = 'tag-btn' + (at.indexOf(t) >= 0 ? ' active' : '');
	  b.textContent = t + ' (' + d[t] + ')';
	  b.onclick = function() { togT(t); };
	  c.appendChild(b);
	});
  }
  
  function togT(t) {
	var i = at.indexOf(t);
	if (i >= 0) at.splice(i, 1); else at.push(t);
	renderTags(atm);
	var fi = document.getElementById('tfi');
	if (at.length) { fi.style.display = 'flex'; document.getElementById('tlbl').textContent = at.join(', '); }
	else fi.style.display = 'none';
	load(undefined, 1);
  }
  
  function clrT() {
	at = []; renderTags(atm);
	document.getElementById('tfi').style.display = 'none';
	load(undefined, 1);
  }
  
  function dbs() {
	var val = document.getElementById('search').value;
	document.getElementById('sclear').style.display = val ? 'block' : 'none';
	var isSearchMode = val.trim().length > 0;
	document.getElementById('tab-bar').classList.toggle('search-mode', isSearchMode);
	document.getElementById('search-hint').classList.toggle('visible', isSearchMode);
	document.getElementById('tag-panel').style.display = isSearchMode ? 'none' : (curTab === 'all' ? '' : 'none');
	clearTimeout(st);
	st = setTimeout(function() { load(val, 1); }, 300);
  }
  
  function clearSearch() {
	document.getElementById('search').value = '';
	document.getElementById('sclear').style.display = 'none';
	document.getElementById('tab-bar').classList.remove('search-mode');
	document.getElementById('search-hint').classList.remove('visible');
	document.getElementById('tag-panel').style.display = curTab === 'all' ? '' : 'none';
	load('', 1);
  }
  
  function renderPager(total) {
	var pager = document.getElementById('pager');
	var totalPages = Math.ceil(total / perPage);
	if (totalPages <= 1) { pager.innerHTML = ''; return; }
	var html = '<div class="pager">';
	html += '<button class="pbtn" onclick="load(undefined,' + Math.max(1, curPage-1) + ')"' + (curPage <= 1 ? ' disabled' : '') + '>&#8249; Prev</button>';
	for (var i = 1; i <= totalPages; i++) {
	  if (i === 1 || i === totalPages || (i >= curPage-2 && i <= curPage+2)) {
		html += '<button class="pbtn' + (i === curPage ? ' active' : '') + '" onclick="load(undefined,' + i + ')">' + i + '</button>';
	  } else if (i === curPage-3 || i === curPage+3) {
		html += '<span class="pinfo">...</span>';
	  }
	}
	html += '<button class="pbtn" onclick="load(undefined,' + Math.min(totalPages, curPage+1) + ')"' + (curPage >= totalPages ? ' disabled' : '') + '>Next &#8250;</button>';
	html += '<span class="pinfo">' + total + ' links</span>';
	html += '<select class="ppsel" onchange="perPage=parseInt(this.value);load(undefined,1)">';
	[50,100,200].forEach(function(n) { html += '<option value="' + n + '"' + (perPage === n ? ' selected' : '') + '>' + n + ' per page</option>'; });
	html += '</select></div>';
	pager.innerHTML = html;
  }
  
  function dom(url) { try { return new URL(url).hostname; } catch(e) { return url; } }
  
  function fmtDate(s) {
	return new Date(s.endsWith('Z') ? s : s + 'Z').toLocaleString('en-AU', {day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Australia/Brisbane'});
  }
  
  function mkTags(tags) {
	var a = tags ? tags.split(',').filter(function(t) { return t.trim(); }) : [];
	var h = '';
	a.forEach(function(t) { h += '<span class="tag">' + t.trim() + '</span>'; });
	return h;
  }
  
  function mkImg(thumb, grid) {
	if (thumb) {
	  var img = document.createElement('img');
	  img.className = grid ? 'cthumb' : 'lthumb';
	  img.src = thumb; img.loading = 'lazy';
	  img.onerror = function() { this.style.display = 'none'; };
	  return img;
	}
	var d = document.createElement('div');
	d.className = grid ? 'cnoimg' : 'lnoimg';
	d.textContent = String.fromCodePoint(128279);
	return d;
  }
  
  function mkNotes(notes, id) {
	var d = document.createElement('div');
	d.className = 'nbox';
	d.onclick = function(e) { e.stopPropagation(); openNotes(id); };
	if (notes && notes.trim()) { d.textContent = notes; }
	else { var s = document.createElement('span'); s.className = 'nph'; s.textContent = 'Add notes...'; d.appendChild(s); }
	return d;
  }
  
  function mkActions(l) {
	var div = document.createElement('div');
	div.className = 'cact';
	var btns = [
	  { title: 'Edit', icon: '&#9998;', fn: function() { openEdit(l.id); } },
	  { title: l.read ? 'Unread' : 'Read', icon: '&#10003;', fn: function() { togRead(l.id, l.read ? 0 : 1); } },
	];
	var isArchived = !!l.archived_at;
	var isPrivate = !!l.is_private;
	var showRestore = (curTab === 'archive') || (curSearch && curSearch.trim() && isArchived);
	if (showRestore) {
	  btns.push({ title: 'Restore', icon: '&#8617;', fn: function() { unarchiveLink(l.id); } });
	} else {
	  btns.push({ title: isPrivate ? 'Make Public' : 'Make Private', icon: isPrivate ? '&#128275;' : '&#128274;', fn: function() { togPrivate(l.id, isPrivate ? 0 : 1); } });
	  btns.push({ title: 'Archive', icon: '&#128230;', fn: function() { archiveLink(l.id); } });
	}
	btns.push({ title: 'Delete', icon: '&#x2715;', fn: function() { delLink(l.id); } });
	btns.forEach(function(b) {
	  var btn = document.createElement('button');
	  btn.className = 'abtn'; btn.title = b.title; btn.innerHTML = b.icon;
	  btn.onclick = function(e) { e.stopPropagation(); b.fn(); };
	  div.appendChild(btn);
	});
	return div;
  }
  
  function render(links) {
	var c = document.getElementById('con');
	if (!links.length) { c.innerHTML = '<div class="empty"><p>No links found.</p></div>'; return; }
	var wrap = document.createElement('div');
	wrap.className = cv === 'grid' ? 'grid' : 'list';
	links.forEach(function(l) {
	  var isGrid = cv === 'grid';
	  var card = document.createElement('div');
	  card.className = (isGrid ? 'card' : 'li') + (!l.read ? ' unread' : '') + (selectedIds.has(l.id) ? ' selected' : '');
	  card.onclick = function() { window.open(l.url, '_blank'); };
	  if (!isGrid) {
		var cbWrap = document.createElement('div');
		cbWrap.className = 'li-cb-wrap';
		cbWrap.onclick = (function(id) { return function(e) {
		  e.stopPropagation();
		  var isChecked = !selectedIds.has(id);
		  toggleSel(id, isChecked);
		  var cb = cbWrap.querySelector('.li-cb');
		  if (cb) cb.checked = isChecked;
		}; })(l.id);
		var cb = document.createElement('input');
		cb.type = 'checkbox'; cb.className = 'li-cb';
		cb.dataset.id = String(l.id); cb.checked = selectedIds.has(l.id);
		cbWrap.appendChild(cb);
		card.appendChild(cbWrap);
	  }
	  card.appendChild(mkActions(l));
	  if (l.read && isGrid) { var rb = document.createElement('div'); rb.className = 'rbadge'; rb.textContent = 'Read'; card.appendChild(rb); }
	  card.appendChild(mkImg(l.thumbnail, isGrid));
	  var body = document.createElement('div');
	  body.className = isGrid ? 'cbody' : 'lcon';
	  var title = document.createElement('div');
	  title.className = isGrid ? 'ctitle' : 'ltitle';
	  title.textContent = l.title || l.url;
	  if (curSearch && curSearch.trim()) {
		if (l.archived_at) {
		  var sb = document.createElement('span'); sb.className = 'src-badge-archive'; sb.textContent = '📦 Archive'; title.appendChild(sb);
		} else if (l.is_private) {
		  var sb2 = document.createElement('span'); sb2.className = 'src-badge-private'; sb2.textContent = '🔒 Private'; title.appendChild(sb2);
		}
	  }
	  body.appendChild(title);
	  if (l.description) { var desc = document.createElement('div'); desc.className = isGrid ? 'cdesc' : 'ldesc'; desc.textContent = l.description; body.appendChild(desc); }
	  body.appendChild(mkNotes(l.notes, l.id));
	  var tgh = mkTags(l.tags);
	  var dateStr = fmtDate(l.created_at);
	  if (isGrid) {
		var u = document.createElement('div'); u.className = 'curl'; u.textContent = dom(l.url); body.appendChild(u);
		var td = document.createElement('div'); td.className = 'ctags';
		if (tgh) td.innerHTML = tgh;
		if (l.is_private) { var pb = document.createElement('span'); pb.className = 'priv-badge'; pb.textContent = '\uD83D\uDD12 Private'; td.appendChild(pb); }
		if (tgh || l.is_private) body.appendChild(td);
		var dt = document.createElement('div'); dt.className = 'cdate'; dt.textContent = dateStr; body.appendChild(dt);
	  } else {
		var meta = document.createElement('div'); meta.className = 'lmeta';
		var u2 = document.createElement('span'); u2.className = 'lurl'; u2.textContent = dom(l.url); meta.appendChild(u2);
		var td2 = document.createElement('div');
		if (tgh) td2.innerHTML = tgh;
		if (l.is_private) { var pb2 = document.createElement('span'); pb2.className = 'priv-badge'; pb2.textContent = '\uD83D\uDD12 Private'; td2.appendChild(pb2); }
		if (tgh || l.is_private) meta.appendChild(td2);
		var dt2 = document.createElement('span'); dt2.className = 'ldate'; dt2.textContent = dateStr; meta.appendChild(dt2);
		body.appendChild(meta);
	  }
	  card.appendChild(body);
	  wrap.appendChild(card);
	});
	c.innerHTML = '';
	c.appendChild(wrap);
  }
  
  function showM(html) {
	document.getElementById('mr').innerHTML = '<div class="mo" onclick="clsM()"><div class="md" onclick="event.stopPropagation()">' + html + '</div></div>';
  }
  function clsM() { document.getElementById('mr').innerHTML = ''; }
  
  function openNotes(id) {
	var l = cl.find(function(x) { return x.id === id; });
	if (!l) return;
	showM('<h3>Notes</h3><div class="murl">' + l.url + '</div><textarea id="ni" placeholder="Add notes...">' + (l.notes || '') + '</textarea><div class="mbtns"><button class="bcancel" onclick="clsM()">Cancel</button><button class="bsave" onclick="saveN(' + id + ')">Save</button></div>');
	setTimeout(function() { var e = document.getElementById('ni'); if (e) e.focus(); }, 50);
  }
  function saveN(id) {
	var n = document.getElementById('ni').value;
	fetch('/links/' + id + '/notes', {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({notes:n})}).then(function() {
	  clsM(); cl.forEach(function(x) { if (x.id === id) x.notes = n; }); render(cl);
	});
  }
  
  function openEdit(id) {
	var l = cl.find(function(x) { return x.id === id; });
	if (!l) return;
	var tv = l.thumbnail || '';
	var tphtml = tv ? '<img id="tp" class="tprev" src="' + tv + '">' : '<img id="tp" class="tprev hidden" src="">';
	showM('<h3>Edit Link</h3><div class="murl">' + l.url + '</div>' +
	  '<label>Tags (comma separated)</label><input type="text" id="et" value="' + (l.tags || '') + '">' +
	  '<label>Caption</label><input type="text" id="ec" value="' + (l.description || '').replace(/"/g, '&quot;') + '">' +
	  '<label>Thumbnail URL</label><input type="text" id="eth" value="' + tv + '" oninput="pvT()" placeholder="https://...">' +
	  tphtml +
	  '<button class="rfbtn" onclick="rfetch(' + id + ')">&#8635; Re-fetch title &amp; thumbnail</button>' +
	  '<div class="mbtns"><button class="bdel" onclick="delLink(' + id + ')">Delete</button><button class="bdel" style="background:#ff9500" onclick="archiveLink(' + id + ')">&#128230; Archive</button><button class="bcancel" onclick="clsM()">Cancel</button><button class="bsave" onclick="saveE(' + id + ')">Save</button></div>');
	setTimeout(function() { var e = document.getElementById('et'); if (e) e.focus(); }, 50);
  }
  function pvT() {
	var v = document.getElementById('eth').value;
	var img = document.getElementById('tp');
	if (!img) return;
	if (v) { img.src = v; img.className = 'tprev'; } else img.className = 'tprev hidden';
  }
  function rfetch(id) {
	var b = document.querySelector('.rfbtn'); if (b) b.textContent = 'Fetching...';
	fetch('/links/' + id + '/refetch', {method:'POST'}).then(function(r) { return r.json(); }).then(function(d) {
	  if (d.thumbnail) { document.getElementById('eth').value = d.thumbnail; pvT(); }
	  if (d.title) { cl.forEach(function(x) { if (x.id === id) x.title = d.title; }); }
	  if (b) b.textContent = (d.thumbnail || d.title) ? 'Done! Click Save to apply.' : 'Nothing found';
	});
  }
  function saveE(id) {
	var t = document.getElementById('et').value, c = document.getElementById('ec').value, th = document.getElementById('eth').value;
	fetch('/links/' + id + '/edit', {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({tags:t,description:c,thumbnail:th})}).then(function() {
	  clsM(); cl.forEach(function(x) { if (x.id === id) { x.tags = t; x.description = c; x.thumbnail = th; } }); render(cl); loadTags();
	});
  }
  function togRead(id, v) {
	fetch('/links/' + id + '/read', {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({read:v})}).then(function() {
	  cl.forEach(function(x) { if (x.id === id) x.read = v; }); render(cl);
	});
  }
  function delLink(id) {
	clsM();
	if (!confirm('Move to trash?')) return;
	fetch('/links/' + id, {method:'DELETE'}).then(function() { load(); loadTags(); });
  }
  
  function openTrash() { document.getElementById('tpanel').classList.add('open'); loadTrash(); }
  function closeTrash() { document.getElementById('tpanel').classList.remove('open'); }
  
  function loadTrash() {
	fetch('/trash').then(function(r) { return r.json(); }).then(function(items) {
	  var c = document.getElementById('tlist');
	  if (!items.length) { c.innerHTML = '<div class="empty"><p>Trash is empty</p></div>'; return; }
	  c.innerHTML = '';
	  items.forEach(function(l) {
		var div = document.createElement('div'); div.className = 'ti';
		if (l.thumbnail) {
		  var img = document.createElement('img'); img.className = 'ti-thumb'; img.src = l.thumbnail;
		  img.onerror = function() { this.style.display='none'; }; div.appendChild(img);
		} else {
		  var ni = document.createElement('div'); ni.className = 'ti-noimg'; ni.textContent = String.fromCodePoint(128279); div.appendChild(ni);
		}
		var info = document.createElement('div'); info.className = 'ti-info';
		var tt = document.createElement('div'); tt.className = 'ti-title'; tt.textContent = l.title || l.url;
		var tu = document.createElement('div'); tu.className = 'ti-url'; tu.textContent = dom(l.url);
		var td = document.createElement('div'); td.className = 'ti-date'; td.textContent = 'Deleted: ' + fmtDate(l.deleted_at);
		info.appendChild(tt); info.appendChild(tu); info.appendChild(td); div.appendChild(info);
		var acts = document.createElement('div'); acts.className = 'ti-acts';
		var rb = document.createElement('button'); rb.className = 'trestore'; rb.textContent = 'Restore';
		rb.onclick = (function(id) { return function() { restoreLink(id); }; })(l.id);
		var db = document.createElement('button'); db.className = 'tdelete'; db.textContent = 'Delete';
		db.onclick = (function(id) { return function() { permDelete(id); }; })(l.id);
		acts.appendChild(rb); acts.appendChild(db); div.appendChild(acts);
		c.appendChild(div);
	  });
	});
  }
  function restoreLink(id) {
	fetch('/links/' + id + '/restore', {method:'POST'}).then(function() { loadTrash(); load(); loadTags(); });
  }
  function permDelete(id) {
	if (!confirm('Permanently delete? This cannot be undone.')) return;
	fetch('/links/' + id + '/permanent', {method:'DELETE'}).then(function() { loadTrash(); });
  }
  function restoreAll() {
	if (!confirm('Restore all items from trash?')) return;
	fetch('/trash/restore-all', {method:'POST'}).then(function() { loadTrash(); load(); loadTags(); });
  }
  function deleteAll() {
	if (!confirm('Permanently delete all items in trash? This cannot be undone.')) return;
	fetch('/trash/empty', {method:'DELETE'}).then(function() { loadTrash(); });
  }
  
  function updateSelBar() {
	var bar = document.getElementById('sel-bar');
	var info = document.getElementById('sel-info');
	if (selectedIds.size > 0) {
	  bar.classList.add('visible');
	  info.textContent = selectedIds.size + ' selected';
	  var ids = Array.from(selectedIds);
	  var selectedLinks = ids.map(function(id) { return cl.find(function(x) { return x.id === id; }); }).filter(Boolean);
	  var isSearchMode = curSearch && curSearch.trim().length > 0;
	  var allArchived = selectedLinks.every(function(l) { return !!l.archived_at; });
	  var archiveBtn = document.getElementById('btn-sel-archive');
	  var restoreBtn = document.getElementById('btn-sel-restore');
	  if (curTab === 'archive' || (isSearchMode && allArchived)) {
		archiveBtn.style.display = 'none'; restoreBtn.style.display = '';
	  } else {
		archiveBtn.style.display = ''; restoreBtn.style.display = 'none';
	  }
	  var privBtn = document.getElementById('btn-private');
	  privBtn.style.display = (curTab === 'archive' || (isSearchMode && allArchived)) ? 'none' : '';
	  if (curTab === 'private') {
		privBtn.textContent = '\uD83D\uDD13 Make Public';
	  } else {
		var allPrivate = selectedLinks.every(function(l) { return !!l.is_private; });
		privBtn.textContent = allPrivate ? '\uD83D\uDD13 Make Public' : '\uD83D\uDD12 Make Private';
	  }
	} else {
	  bar.classList.remove('visible');
	}
  }
  
  function toggleSel(id, checked) {
	if (checked) selectedIds.add(id);
	else selectedIds.delete(id);
	document.querySelectorAll('.li').forEach(function(row) {
	  var cb = row.querySelector('.li-cb');
	  if (cb && parseInt(cb.dataset.id) === id) { cb.checked = checked; row.classList.toggle('selected', checked); }
	});
	updateSelBar();
  }
  
  function selAll() {
	cl.forEach(function(l) { selectedIds.add(l.id); });
	document.querySelectorAll('.li-cb').forEach(function(cb) { cb.checked = true; cb.closest('.li').classList.add('selected'); });
	updateSelBar();
  }
  
  function deselAll() {
	cl.forEach(function(l) { selectedIds.delete(l.id); });
	document.querySelectorAll('.li-cb').forEach(function(cb) { cb.checked = false; cb.closest('.li').classList.remove('selected'); });
	updateSelBar();
  }
  
  function clearSel() {
	selectedIds.clear();
	document.querySelectorAll('.li-cb').forEach(function(cb) { cb.checked = false; cb.closest('.li').classList.remove('selected'); });
	updateSelBar();
  }
  
  function toggleTagMgr() {
	var dd = document.getElementById('tag-dropdown');
	if (dd.style.display === 'none') { openTagMgr(); } else { dd.style.display = 'none'; }
  }
  
  function openTagMgr() {
	var dd = document.getElementById('tag-dropdown');
	dd.style.display = 'block';
	document.getElementById('tag-dd-new').value = '';
	var allTags = Object.keys(atm).sort();
	var selectedLinks = cl.filter(function(l) { return selectedIds.has(l.id); });
	var list = document.getElementById('tag-dd-list');
	list.innerHTML = '';
	if (!allTags.length) { list.innerHTML = '<div style="padding:10px 14px;font-size:13px;color:#aeaeb2;">No tags yet</div>'; return; }
	allTags.forEach(function(tag) {
	  var countWith = selectedLinks.filter(function(l) { return (l.tags||'').split(',').map(function(t){return t.trim();}).indexOf(tag)>=0; }).length;
	  var total = selectedLinks.length;
	  var item = document.createElement('div'); item.className = 'tag-dd-item';
	  var cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = 'tddc-' + tag;
	  cb.checked = countWith === total; cb.indeterminate = countWith > 0 && countWith < total;
	  cb.onchange = (function(t) { return function(e) { batchToggleTag(t, e.target.checked); }; })(tag);
	  var lbl = document.createElement('label'); lbl.htmlFor = 'tddc-' + tag; lbl.textContent = tag;
	  var cnt = document.createElement('span'); cnt.className = 'tag-count'; cnt.textContent = countWith + '/' + total;
	  item.appendChild(cb); item.appendChild(lbl); item.appendChild(cnt);
	  list.appendChild(item);
	});
  }
  
  function batchToggleTag(tag, add) {
	fetch('/links/batch-tag', {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:Array.from(selectedIds),tags:tag,mode:add?'append':'remove'})})
	.then(function() {
	  cl.forEach(function(l) {
		if (!selectedIds.has(l.id)) return;
		var tags = l.tags ? l.tags.split(',').map(function(t){return t.trim();}).filter(Boolean) : [];
		if (add) { if (tags.indexOf(tag)<0) tags.push(tag); } else { tags = tags.filter(function(t){return t!==tag;}); }
		l.tags = tags.join(', ');
	  });
	  render(cl); loadTags(); openTagMgr();
	});
  }
  
  function deleteSelected() {
	if (selectedIds.size === 0) return;
	if (!confirm('Move ' + selectedIds.size + ' item(s) to trash?')) return;
	Promise.all(Array.from(selectedIds).map(function(id){return fetch('/links/'+id,{method:'DELETE'});}))
	.then(function() { clearSel(); load(curSearch, curPage); loadTags(); });
  }
  
  function addNewTag() {
	var input = document.getElementById('tag-dd-new');
	var tag = input.value.trim();
	if (!tag || selectedIds.size === 0) return;
	batchToggleTag(tag, true); input.value = '';
  }
  
  function archiveLink(id) {
	clsM();
	if (!confirm('Archive this link? You can restore it later.')) return;
	fetch('/links/' + id + '/archive', {method:'POST'}).then(function() { load(curSearch, curPage); loadTags(); });
  }
  
  function unarchiveLink(id) {
	clsM();
	fetch('/links/' + id + '/unarchive', {method:'POST'}).then(function() { load(curSearch, curPage); });
  }
  
  function archiveSelected() {
	if (selectedIds.size === 0) return;
	if (!confirm('Archive ' + selectedIds.size + ' selected link(s)?')) return;
	fetch('/links/batch-archive', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:Array.from(selectedIds)})})
	.then(function() { clearSel(); load(curSearch, curPage); loadTags(); });
  }
  
  function restoreSelected() {
	if (selectedIds.size === 0) return;
	if (!confirm('Restore ' + selectedIds.size + ' selected link(s)?')) return;
	Promise.all(Array.from(selectedIds).map(function(id){return fetch('/links/'+id+'/unarchive',{method:'POST'});}))
	.then(function() { clearSel(); load(curSearch, curPage); });
  }
  
  function togPrivate(id, val) {
	fetch('/links/' + id + '/private', {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({is_private:val})})
	.then(function() { cl.forEach(function(x){if(x.id===id)x.is_private=val;}); render(cl); });
  }
  
  function togglePrivateSelected() {
	if (selectedIds.size === 0) return;
	var ids = Array.from(selectedIds);
	var newVal;
	if (curTab === 'private') {
	  newVal = 0;
	} else {
	  var allPrivate = ids.every(function(id){var l=cl.find(function(x){return x.id===id;});return l&&l.is_private;});
	  newVal = allPrivate ? 0 : 1;
	}
	if (!confirm('Make ' + ids.length + ' item(s) ' + (newVal ? 'private?' : 'public?'))) return;
	Promise.all(ids.map(function(id){return fetch('/links/'+id+'/private',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({is_private:newVal})});}))
	.then(function() { clearSel(); load(curSearch, curPage); });
  }

  function exportLinks() {
	var ids = Array.from(selectedIds);
	var links = ids.length > 0
	  ? ids.map(function(id){ return cl.find(function(x){ return x.id === id; }); }).filter(Boolean)
	  : cl;
	if (!links.length) return;

	var tabLabel = curSearch ? 'Search: ' + curSearch : (curTab === 'all' ? 'All Links' : curTab === 'archive' ? 'Archive' : 'Private');
	var exportLabel = ids.length > 0 ? ids.length + ' selected link(s)' : links.length + ' link(s) on current page';

	var rows = links.map(function(l) {
	  var tags = l.tags ? l.tags.split(',').map(function(t){
		return '<span style="display:inline-block;background:#f0f0f5;border-radius:4px;padding:2px 8px;font-size:11px;color:#555;margin:2px 3px 2px 0;">' + t.trim() + '</span>';
	  }).join('') : '';
	  var badges = '';
	  if (l.archived_at) badges += '<span style="display:inline-block;background:#ff9500;color:white;border-radius:4px;padding:2px 7px;font-size:10px;font-weight:700;margin-left:6px;">Archive</span>';
	  if (l.is_private) badges += '<span style="display:inline-block;background:#5856d6;color:white;border-radius:4px;padding:2px 7px;font-size:10px;font-weight:700;margin-left:6px;">Private</span>';
	  var desc = l.description ? '<p style="font-size:13px;color:#555;margin:0 0 10px;line-height:1.5;">' + l.description + '</p>' : '';
	  var notes = l.notes ? '<div style="font-size:13px;color:#3a3a3c;background:#f9f9fb;border-left:3px solid #0071e3;padding:8px 12px;border-radius:0 6px 6px 0;white-space:pre-wrap;margin-bottom:10px;">' + l.notes + '</div>' : '';
	  var safeUrl = l.url.split('"').join('&quot;');
	  var copyBtn = '<a href="' + safeUrl + '" onclick="navigator.clipboard.writeText(this.href);this.style.opacity=0.5;var e=this;setTimeout(function(){e.style.opacity=1;},800);return false;" style="font-size:11px;padding:2px 8px;border:1px solid #d2d2d7;border-radius:4px;background:white;cursor:pointer;color:#6e6e73;margin-left:8px;vertical-align:middle;text-decoration:none;display:inline-block;">Copy URL</a>';
	  return '<div style="background:white;border-radius:10px;box-shadow:0 1px 6px rgba(0,0,0,0.09);margin-bottom:16px;padding:16px;">'
		+ '<div style="margin-bottom:8px;">'
		+ '<a href="' + l.url + '" target="_blank" style="font-size:15px;font-weight:700;color:#1d1d1f;text-decoration:none;line-height:1.4;user-select:text;">' + (l.title || l.url) + '</a>'
		+ badges
		+ '</div>'
		+ desc
		+ '<div style="font-size:12px;color:#0071e3;margin-bottom:10px;word-break:break-all;">' + l.url + copyBtn + '</div>'
		+ notes
		+ (tags ? '<div style="margin-bottom:10px;">' + tags + '</div>' : '')
		+ '<div style="font-size:11px;color:#aeaeb2;">' + fmtDate(l.created_at) + '</div>'
		+ '</div>';
	}).join('');

	var html = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
	  + '<title>My Links Export</title>'
	  + '<style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f5f5f7;padding:24px 16px;}'
	  + '.wrap{max-width:680px;margin:0 auto;}'
	  + '.hdr{margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #e5e5e5;}'
	  + '.hdr h1{font-size:22px;font-weight:800;color:#1d1d1f;margin-bottom:4px;}'
	  + '.hdr p{font-size:13px;color:#6e6e73;}'
	  + 'a:hover{text-decoration:underline!important;}'
	  + '</style>'
	  + '</head><body><div class="wrap">'
	  + '<div class="hdr">'
	  + '<h1>&#128279; My Links</h1>'
	  + '<p>' + tabLabel + ' &nbsp;&middot;&nbsp; ' + exportLabel + ' &nbsp;&middot;&nbsp; Exported ' + new Date().toLocaleString('en-AU', {timeZone:'Australia/Brisbane',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) + '</p>'
	  + '</div>'
	  + rows
	  + '</div></body></html>';

	var blob = new Blob([html], {type: 'text/html;charset=utf-8'});
	var a = document.createElement('a');
	a.href = URL.createObjectURL(blob);
	a.download = 'my-links-' + new Date().toISOString().slice(0,10) + '.html';
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1000);
  }
  
  function openRules() { document.getElementById('rpanel').classList.add('open'); loadRules(); }
  function closeRules() { document.getElementById('rpanel').classList.remove('open'); }
  
  function loadRules() {
	fetch('/rules').then(function(r){return r.json();}).then(function(rules) {
	  var c = document.getElementById('rlist');
	  if (!rules.length) { c.innerHTML = '<div class="rempty">No rules yet. Add one below to auto-tag links when saving.</div>'; return; }
	  c.innerHTML = '';
	  rules.forEach(function(r) {
		var div = document.createElement('div'); div.className = 'ritem' + (r.enabled ? '' : ' disabled');
		var type = document.createElement('span'); type.className = 'rtype' + (r.type==='keyword'?' keyword':''); type.textContent = r.type; div.appendChild(type);
		var pat = document.createElement('div'); pat.className = 'rpattern'; pat.textContent = r.pattern; pat.title = r.pattern; div.appendChild(pat);
		var tags = document.createElement('div'); tags.className = 'rtags'; tags.textContent = '\u2192 ' + r.tags; div.appendChild(tags);
		var tog = document.createElement('button'); tog.className = 'rtoggle'; tog.textContent = r.enabled ? 'On' : 'Off';
		tog.onclick = (function(id,en){return function(){toggleRule(id,en?0:1);};})(r.id,r.enabled); div.appendChild(tog);
		var edit = document.createElement('button'); edit.className = 'redit'; edit.innerHTML = '&#9998;'; edit.title = 'Edit';
		edit.onclick = (function(id,type,pattern,tags,d){return function(){editRule(id,type,pattern,tags,d);};})(r.id,r.type,r.pattern,r.tags,div); div.appendChild(edit);
		var del = document.createElement('button'); del.className = 'rdel'; del.innerHTML = '&#x2715;';
		del.onclick = (function(id){return function(){deleteRule(id);};})(r.id); div.appendChild(del);
		c.appendChild(div);
	  });
	});
  }
  
  function addRule() {
	var type = document.getElementById('r-type').value;
	var pattern = document.getElementById('r-pattern').value.trim();
	var tags = document.getElementById('r-tags').value.trim();
	if (!pattern || !tags) { alert('Please fill in both pattern and tags.'); return; }
	fetch('/rules', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:type,pattern:pattern,tags:tags})})
	.then(function() { document.getElementById('r-pattern').value=''; document.getElementById('r-tags').value=''; loadRules(); });
  }
  
  function toggleRule(id, enabled) {
	fetch('/rules/'+id, {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:enabled})}).then(function(){loadRules();});
  }
  
  function deleteRule(id) {
	if (!confirm('Delete this rule?')) return;
	fetch('/rules/'+id, {method:'DELETE'}).then(function(){loadRules();});
  }

  function editRule(id, type, pattern, tags, div) {
	var orig = div.innerHTML;
	div.innerHTML = '';
	div.classList.remove('disabled');

	var sel = document.createElement('select'); sel.className = 'rinput'; sel.style.flex = 'none'; sel.style.width = '100px';
	['domain','keyword'].forEach(function(t){ var o = document.createElement('option'); o.value = t; o.textContent = t; if (t===type) o.selected = true; sel.appendChild(o); });

	var patIn = document.createElement('input'); patIn.type = 'text'; patIn.className = 'rinput'; patIn.value = pattern; patIn.placeholder = 'pattern';
	var tagIn = document.createElement('input'); tagIn.type = 'text'; tagIn.className = 'rinput'; tagIn.value = tags; tagIn.placeholder = 'tags';

	var saveBtn = document.createElement('button'); saveBtn.className = 'radd-btn'; saveBtn.textContent = 'Save';
	saveBtn.style.cssText = 'font-size:13px;padding:5px 14px;white-space:nowrap';
	saveBtn.onclick = function() {
	  var np = patIn.value.trim(), nt = tagIn.value.trim();
	  if (!np || !nt) { alert('Pattern and tags are required.'); return; }
	  fetch('/rules/'+id, {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({type:sel.value, pattern:np, tags:nt})})
	  .then(function(){ loadRules(); });
	};

	var cancelBtn = document.createElement('button'); cancelBtn.className = 'rdel'; cancelBtn.textContent = 'Cancel';
	cancelBtn.style.cssText = 'color:#6e6e73;font-size:13px';
	cancelBtn.onclick = function() { div.innerHTML = orig; };

	[sel, patIn, tagIn, saveBtn, cancelBtn].forEach(function(el){ div.appendChild(el); });
  }
  
  document.addEventListener('click', function(e) {
	var wrap = document.querySelector('.tag-mgr-wrap');
	if (wrap && !wrap.contains(e.target)) { var dd = document.getElementById('tag-dropdown'); if (dd) dd.style.display='none'; }
  });
  
  loadTags();
  load('', 1);
  </script>
  </body>
  </html>`;
  }
  
  function getCollectionsHTML(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Collections - My Links</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #f5f5f7; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
header { background: white; padding: 14px 20px; border-bottom: 1px solid #e5e5e5; display: flex; align-items: center; gap: 14px; flex-shrink: 0; }
.back { color: #0071e3; text-decoration: none; font-size: 14px; font-weight: 500; }
header h1 { font-size: 18px; font-weight: 700; color: #1d1d1f; }
.hcnt { background: #5856d6; color: white; border-radius: 10px; padding: 1px 8px; font-size: 12px; font-weight: 600; }
.layout { display: flex; flex: 1; overflow: hidden; }
.sidebar { width: 260px; flex-shrink: 0; background: white; border-right: 1px solid #e5e5e5; display: flex; flex-direction: column; overflow: hidden; }
.sidebar-head { padding: 12px; border-bottom: 1px solid #f0f0f0; }
.sidebar-head input { width: 100%; border: 1px solid #d2d2d7; border-radius: 8px; padding: 7px 12px; font-size: 13px; outline: none; background: #f5f5f7; }
.sidebar-head input:focus { border-color: #0071e3; background: white; }
.col-list { overflow-y: auto; flex: 1; }
.col-item { padding: 12px 16px; cursor: pointer; border-bottom: 1px solid #f5f5f7; border-left: 3px solid transparent; }
.col-item:hover { background: #f9f9fb; }
.col-item.active { background: #f0f6ff; border-left-color: #5856d6; }
.col-item.locked .col-name { color: #6e6e73; }
.locked-panel { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; gap: 12px; color: #6e6e73; }
.locked-panel .lock-icon { font-size: 40px; }
.locked-panel .lock-msg { font-size: 15px; font-weight: 500; color: #1d1d1f; }
.locked-panel .lock-sub { font-size: 13px; }
.btn-lock { background: #ff9500; color: white; }
.btn-lock:hover { background: #e08800; }
.btn-unlock { background: #34c759; color: white; }
.btn-unlock:hover { background: #28a745; }
.col-name { font-size: 14px; font-weight: 600; color: #1d1d1f; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.col-meta { font-size: 12px; color: #aeaeb2; margin-top: 2px; }
.main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.no-sel { display: flex; align-items: center; justify-content: center; flex: 1; color: #aeaeb2; font-size: 15px; }
.mhead { background: white; border-bottom: 1px solid #e5e5e5; padding: 18px 24px 14px; flex-shrink: 0; }
.mtitle { font-size: 20px; font-weight: 700; color: #1d1d1f; border: 1px solid transparent; outline: none; background: transparent; width: 100%; padding: 4px 8px; border-radius: 8px; margin-left: -8px; font-family: inherit; }
.mtitle:hover { background: #f5f5f7; }
.mtitle:focus { background: white; border-color: #0071e3; }
.mdesc { font-size: 14px; color: #6e6e73; border: 1px solid transparent; outline: none; background: transparent; width: 100%; margin-top: 6px; padding: 4px 8px; border-radius: 8px; margin-left: -8px; resize: none; font-family: inherit; display: block; }
.mdesc:hover { background: #f5f5f7; }
.mdesc:focus { background: white; border-color: #0071e3; }
.mactions { display: flex; gap: 8px; margin-top: 12px; align-items: center; }
.btn { border: none; border-radius: 8px; padding: 7px 14px; font-size: 13px; font-weight: 600; cursor: pointer; }
.btn-blue { background: #0071e3; color: white; }
.btn-gray { background: #f0f0f5; color: #1d1d1f; }
.mcnt { font-size: 13px; color: #aeaeb2; margin-left: auto; }
.links-list { overflow-y: auto; flex: 1; padding: 8px 24px 24px; }
.lrow { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid #f5f5f7; }
.lrow:last-child { border-bottom: none; }
.lfav { width: 16px; height: 16px; flex-shrink: 0; border-radius: 3px; }
.linfo { flex: 1; min-width: 0; }
.ltitle { font-size: 14px; font-weight: 500; color: #1d1d1f; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ltitle a { color: inherit; text-decoration: none; }
.ltitle a:hover { color: #0071e3; }
.lurl { font-size: 12px; color: #0071e3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ldate { font-size: 11px; color: #aeaeb2; flex-shrink: 0; }
.empty { text-align: center; padding: 60px 24px; color: #aeaeb2; font-size: 14px; }
</style>
</head>
<body>
<header>
  <a href="/" class="back">&#8592; My Links</a>
  <h1>&#128193; Collections</h1>
  <span class="hcnt" id="hcnt">0</span>
  <button id="session-lock-btn" class="btn btn-unlock" style="margin-left:auto;display:none" onclick="lockSession()">&#128275; Lock</button>
  <button id="session-unlock-btn" class="btn btn-blue" style="display:none" onclick="unlockSession()">&#128274; Unlock</button>
</header>
<div class="layout">
  <div class="sidebar">
    <div class="sidebar-head">
      <input type="text" id="search" placeholder="Search collections..." oninput="filterCols()">
    </div>
    <div class="col-list" id="col-list"><div class="empty">Loading...</div></div>
  </div>
  <div class="main" id="main">
    <div class="no-sel">&#8592; Select a collection to view its links</div>
  </div>
</div>
<scr` + `ipt>
var allCols = [], curTag = null, curLinks = [], isSessionUnlocked = false;

function updateSessionButtons() {
  var hasLocked = allCols.some(function(c){ return c.locked; });
  document.getElementById('session-lock-btn').style.display = (hasLocked && isSessionUnlocked) ? '' : 'none';
  document.getElementById('session-unlock-btn').style.display = (hasLocked && !isSessionUnlocked) ? '' : 'none';
}

fetch('/collections-data').then(function(r){ return r.json(); }).then(function(d){
  allCols = d.collections || [];
  isSessionUnlocked = d.unlocked || false;
  document.getElementById('hcnt').textContent = allCols.length;
  renderSidebar(allCols);
  updateSessionButtons();
});

function unlockSession() {
  var pw = prompt('Enter your password to unlock locked collections:');
  if (!pw) return;
  fetch('/unlock', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({password:pw})})
  .then(function(r){ return r.json(); })
  .then(function(d){
    if (d.ok) { isSessionUnlocked = true; updateSessionButtons(); renderSidebar(allCols); if (curTag) loadCol(curTag); }
    else { alert('Wrong password.'); }
  });
}

function lockSession() {
  fetch('/lock', {method:'POST'}).then(function(){
    isSessionUnlocked = false; updateSessionButtons(); renderSidebar(allCols);
    if (curTag) { var col = allCols.find(function(c){ return c.tag === curTag; }); if (col && col.locked) loadCol(curTag); }
  });
}

function setCollectionLock(tag, lock) {
  fetch('/collection-meta?tag=' + encodeURIComponent(tag), {
    method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({locked: lock ? 1 : 0})
  }).then(function(){
    var col = allCols.find(function(c){ return c.tag === tag; });
    if (col) col.locked = lock;
    updateSessionButtons();
    renderSidebar(allCols);
    loadCol(tag);
  });
}

function filterCols() {
  var q = document.getElementById('search').value.toLowerCase();
  renderSidebar(q ? allCols.filter(function(c){ return (c.name || c.tag).toLowerCase().indexOf(q) >= 0; }) : allCols);
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function hostname(url) { try { return new URL(url).hostname; } catch(e) { return url; } }

function fmtDate(s) {
  if (!s) return '';
  return new Date(s.endsWith('Z') ? s : s + 'Z').toLocaleDateString('en-AU', {day:'numeric', month:'short', year:'numeric', timeZone:'Australia/Brisbane'});
}

function renderSidebar(cols) {
  var list = document.getElementById('col-list');
  if (!cols.length) { list.innerHTML = '<div class="empty">No collections found</div>'; return; }
  var html = '';
  for (var i = 0; i < cols.length; i++) {
    var c = cols[i];
    var cls = 'col-item' + (c.tag === curTag ? ' active' : '') + (c.locked ? ' locked' : '');
    html += '<div class="' + cls + '" data-tag="' + esc(c.tag) + '">';
    html += '<div class="col-name">' + (c.locked ? (isSessionUnlocked ? '&#128275; ' : '&#128274; ') : '') + esc(c.name || c.tag) + '</div>';
    html += '<div class="col-meta">' + c.count + ' links';
    if (c.latest) html += ' &middot; ' + fmtDate(c.latest);
    html += '</div></div>';
  }
  list.innerHTML = html;
  var items = list.querySelectorAll('.col-item');
  for (var j = 0; j < items.length; j++) {
    (function(el) { el.addEventListener('click', function(){ loadCol(el.getAttribute('data-tag')); }); })(items[j]);
  }
}

function loadCol(tag) {
  curTag = tag;
  renderSidebar(allCols);
  var col = allCols.find(function(c){ return c.tag === tag; });
  var main = document.getElementById('main');

  if (col && col.locked && !isSessionUnlocked) {
    main.innerHTML = '<div class="locked-panel">'
      + '<div class="lock-icon">&#128274;</div>'
      + '<div class="lock-msg">This collection is locked</div>'
      + '<div class="lock-sub">Unlock to view its links</div>'
      + '<button class="btn btn-blue" onclick="unlockSession()">&#128275; Unlock</button>'
      + '</div>';
    return;
  }

  main.innerHTML = '<div class="no-sel">Loading...</div>';
  fetch('/collection-links?tag=' + encodeURIComponent(tag)).then(function(r){ return r.json(); }).then(function(d){
    curLinks = d.links || [];
    var lockBtn = col.locked
      ? '<button class="btn btn-lock" onclick="setCollectionLock(\\'' + esc(tag) + '\\', false)">&#128275; Remove Lock</button>'
      : '<button class="btn btn-gray" onclick="setCollectionLock(\\'' + esc(tag) + '\\', true)">&#128274; Lock this</button>';
    var html = '<div class="mhead">';
    html += '<input class="mtitle" id="mtitle" value="' + esc(col.name || col.tag) + '" onblur="saveMeta()">';
    html += '<textarea class="mdesc" id="mdesc" rows="2" placeholder="Add a description..." onblur="saveMeta()">' + esc(col.description || '') + '</textarea>';
    html += '<div class="mactions">';
    html += '<button class="btn btn-blue" onclick="openAll()">&#128193; Open all (' + curLinks.length + ')</button>';
    html += '<button class="btn btn-gray" onclick="copyUrls(this)">&#8682; Copy URLs</button>';
    html += lockBtn;
    html += '<span class="mcnt">' + curLinks.length + ' links';
    if (col.latest) html += ' &middot; ' + fmtDate(col.latest);
    html += '</span></div></div>';
    html += '<div class="links-list">';
    if (curLinks.length) {
      for (var i = 0; i < curLinks.length; i++) {
        var l = curLinks[i];
        var h = hostname(l.url);
        html += '<div class="lrow">';
        html += '<img class="lfav" src="https://www.google.com/s2/favicons?domain=' + encodeURIComponent(h) + '&sz=32" onerror="this.style.display=\\'none\\'">';
        html += '<div class="linfo">';
        html += '<div class="ltitle"><a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.title || l.url) + '</a></div>';
        html += '<div class="lurl">' + esc(h) + '</div>';
        html += '</div>';
        html += '<div class="ldate">' + fmtDate(l.created_at) + '</div>';
        html += '</div>';
      }
    } else {
      html += '<div class="empty">No links in this collection</div>';
    }
    html += '</div>';
    main.innerHTML = html;
  });
}

function saveMeta() {
  if (!curTag) return;
  var titleEl = document.getElementById('mtitle');
  var descEl = document.getElementById('mdesc');
  if (!titleEl || !descEl) return;
  var name = titleEl.value.trim();
  var desc = descEl.value.trim();
  var col = allCols.find(function(c){ return c.tag === curTag; });
  if (!col) return;
  if (name === (col.name || col.tag) && desc === (col.description || '')) return;
  fetch('/collection-meta?tag=' + encodeURIComponent(curTag), {
    method: 'PATCH',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({name: name, description: desc})
  }).then(function(r){ return r.json(); }).then(function(d){
    if (d.ok) { col.name = name; col.description = desc; renderSidebar(allCols); }
  });
}

function openAll() {
  window._openAllUrls = curLinks.map(function(l) { return l.url; });
  var items = curLinks.map(function(l) {
    var u = String(l.url || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    var t = esc(l.title || l.url);
    return '<a href="' + u + '" target="_blank">' + t + '</a>';
  }).join('');
  var cnt = curLinks.length;
  var html = '<html><head><meta charset="UTF-8"><title>Open All Links</title>'
    + '<style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f5f5f7;padding:32px}'
    + '.card{background:white;border-radius:14px;padding:24px;max-width:680px;margin:0 auto;box-shadow:0 2px 16px rgba(0,0,0,.08)}'
    + 'h2{font-size:16px;font-weight:700;color:#1d1d1f;margin-bottom:4px}'
    + 'p{font-size:13px;color:#6e6e73;margin-bottom:12px}'
    + '.btn{background:#0071e3;color:white;border:none;border-radius:8px;padding:9px 18px;font-size:14px;font-weight:600;cursor:pointer;margin-bottom:16px;display:block}'
    + '.btn:hover{background:#0077ed}'
    + '.note{font-size:12px;color:#aeaeb2;margin-bottom:16px}'
    + 'a{display:block;padding:9px 6px;color:#0071e3;text-decoration:none;border-bottom:1px solid #f5f5f7;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + 'a:last-child{border-bottom:none}a:hover{background:#f9f9fb;border-radius:6px}'
    + '</style></head><body>'
    + '<div class="card">'
    + '<h2>Open All Links</h2>'
    + '<button class="btn" onclick="window.opener._openAllUrls.forEach(function(u){window.open(u)})">Open All ' + cnt + ' Tabs (Chrome / Firefox)</button>'
    + '<p class="note">Safari: Cmd+click individual links below instead.</p>'
    + items
    + '</div></body></html>';
  var w = window.open('', '_blank');
  if (w) { w.document.open(); w.document.write(html); w.document.close(); }
}

function copyUrls(btn) {
  var urls = curLinks.map(function(l){ return l.url; }).join('\\n');
  navigator.clipboard.writeText(urls).then(function(){
    var orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(function(){ btn.textContent = orig; }, 1500);
  });
}
<\/scr` + `ipt>
</body>
</html>`;
  }

  function isUnlocked(request: Request): boolean {
	const cookies = request.headers.get('Cookie') || '';
	return cookies.split(';').some(c => c.trim() === 'unlocked=true');
  }

  async function getLockedTags(env: Env): Promise<string[]> {
	try {
	  const { results } = await env.links_db.prepare('SELECT tag FROM tag_metadata WHERE locked = 1').all();
	  return (results as any[]).map((r: any) => r.tag);
	} catch { return []; }
  }

  function getLoginHTML(error = ''): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>My Links — Login</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #f5f5f7; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
.card { background: white; border-radius: 18px; padding: 40px 36px; width: 340px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
h1 { font-size: 22px; font-weight: 700; color: #1d1d1f; margin-bottom: 6px; }
p { font-size: 14px; color: #6e6e73; margin-bottom: 24px; }
label { display: block; font-size: 13px; font-weight: 500; color: #1d1d1f; margin-bottom: 6px; }
input { width: 100%; border: 1px solid #d2d2d7; border-radius: 10px; padding: 10px 14px; font-size: 15px; outline: none; }
input:focus { border-color: #0071e3; box-shadow: 0 0 0 3px rgba(0,113,227,0.15); }
button { width: 100%; margin-top: 16px; background: #0071e3; color: white; border: none; border-radius: 10px; padding: 11px; font-size: 15px; font-weight: 600; cursor: pointer; }
button:hover { background: #0077ed; }
.err { margin-top: 12px; font-size: 13px; color: #ff3b30; text-align: center; }
</style>
</head>
<body>
<div class="card">
  <h1>My Links</h1>
  <p>Enter your password to continue.</p>
  <form method="POST" action="/login">
    <label for="token">Password</label>
    <input type="password" id="token" name="token" placeholder="••••••••" autofocus>
    <button type="submit">Sign In</button>
    ${error ? `<div class="err">${error}</div>` : ''}
  </form>
</div>
</body>
</html>`;
  }

  export default {
	async fetch(request: Request, env: Env): Promise<Response> {
	  const url = new URL(request.url);
	  const path = url.pathname;

	  if (request.method === 'OPTIONS') {
		return new Response(null, { headers: corsHeaders });
	  }

	  // Login route (no auth required)
	  if (path === '/login') {
		if (request.method === 'GET') {
		  return new Response(getLoginHTML(), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
		}
		if (request.method === 'POST') {
		  const body = await request.formData();
		  const password = (body.get('token') as string || '').trim();
		  const validPassword = (env.LOGIN_PASSWORD || env.API_TOKEN || '').trim();
		  const apiToken = (env.API_TOKEN || '').trim();
		  if (validPassword && password === validPassword) {
			return new Response(null, {
			  status: 302,
			  headers: {
				'Location': '/',
				'Set-Cookie': `session=${apiToken}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=31536000`,
			  },
			});
		  }
		  return new Response(getLoginHTML('Incorrect password. Try again.'), {
			status: 401,
			headers: { 'Content-Type': 'text/html; charset=utf-8' },
		  });
		}
	  }

	  // Auth check for all other routes
	  const authHeader = request.headers.get('Authorization') || '';
	  const tokenFromHeader = authHeader.replace('Bearer ', '');
	  const tokenFromQuery = url.searchParams.get('token') || '';
	  const cookies = request.headers.get('Cookie') || '';
	  const sessionCookie = (cookies.split(';').find(c => c.trim().startsWith('session=')) || '').split('=').slice(1).join('=').trim();
	  const apiToken = (env.API_TOKEN || '').trim();
	  const hasValidToken = apiToken && (
		tokenFromHeader.trim() === apiToken ||
		tokenFromQuery.trim() === apiToken ||
		sessionCookie === apiToken ||
		cookies.includes('CF_Authorization')
	  );

	  if (!hasValidToken) {
		const acceptsHtml = (request.headers.get('Accept') || '').includes('text/html');
		if (acceptsHtml || request.method === 'GET') {
		  return new Response(null, { status: 302, headers: { 'Location': '/login' } });
		}
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
		  status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
		});
	  }
  
	  if (request.method === 'GET' && path === '/') {
		return new Response(getHTML(), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
	  }

	  if (request.method === 'GET' && path === '/tags') {
		const { results } = await env.links_db.prepare(
		  'SELECT tags FROM links WHERE tags IS NOT NULL AND tags != "" AND deleted_at IS NULL AND archived_at IS NULL AND is_private = 0'
		).all();
		const locked = isUnlocked(request) ? [] : await getLockedTags(env);
		const tagMap: Record<string, number> = {};
		results.forEach((row: any) => {
		  if (row.tags) row.tags.split(',').forEach((t: string) => {
			const tag = t.trim();
			if (tag && !locked.includes(tag)) tagMap[tag] = (tagMap[tag] || 0) + 1;
		  });
		});
		return new Response(JSON.stringify(tagMap), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
	  }

	  if (request.method === 'GET' && path === '/collections') {
		return new Response(getCollectionsHTML(), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
	  }

	  if (request.method === 'GET' && path === '/collections-data') {
		await env.links_db.prepare('CREATE TABLE IF NOT EXISTS tag_metadata (id INTEGER PRIMARY KEY AUTOINCREMENT, tag TEXT NOT NULL UNIQUE, name TEXT, description TEXT, locked INTEGER DEFAULT 0, created_at DATETIME DEFAULT (datetime(\'now\')))').run();
		try { await env.links_db.prepare('ALTER TABLE tag_metadata ADD COLUMN locked INTEGER DEFAULT 0').run(); } catch {}
		const { results: rows } = await env.links_db.prepare('SELECT tags, created_at FROM links WHERE deleted_at IS NULL AND tags IS NOT NULL AND tags != \'\'').all();
		const tagMap = new Map<string, { count: number; latest: string }>();
		for (const row of rows as any[]) {
		  const tags = row.tags.split(',').map((t: string) => t.trim()).filter(Boolean);
		  for (const tag of tags) {
			const ex = tagMap.get(tag);
			if (ex) { ex.count++; if (row.created_at > ex.latest) ex.latest = row.created_at; }
			else tagMap.set(tag, { count: 1, latest: row.created_at });
		  }
		}
		const { results: meta } = await env.links_db.prepare('SELECT * FROM tag_metadata').all();
		const metaMap: Record<string, any> = {};
		(meta as any[]).forEach((m: any) => { metaMap[m.tag] = m; });
		const collections = Array.from(tagMap.entries())
		  .map(([tag, d]) => ({ tag, count: d.count, latest: d.latest, name: metaMap[tag]?.name || null, description: metaMap[tag]?.description || null, locked: metaMap[tag]?.locked ? true : false }))
		  .sort((a, b) => (b.latest > a.latest ? 1 : -1));
		return new Response(JSON.stringify({ collections, unlocked: isUnlocked(request) }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
	  }

	  if (request.method === 'GET' && path === '/collection-links') {
		const tag = url.searchParams.get('tag') || '';
		if (!tag) return new Response(JSON.stringify({ links: [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
		const lockedTags = await getLockedTags(env);
		if (lockedTags.includes(tag) && !isUnlocked(request)) {
		  return new Response(JSON.stringify({ links: [], locked: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
		}
		const { results } = await env.links_db.prepare(
		  'SELECT * FROM links WHERE deleted_at IS NULL AND (tags = ? OR tags LIKE ? OR tags LIKE ? OR tags LIKE ?) ORDER BY created_at DESC'
		).bind(tag, tag + ',%', '%, ' + tag, '%,' + tag + ',%').all();
		const filtered = (results as any[]).filter((r: any) => r.tags.split(',').map((t: string) => t.trim()).includes(tag));
		return new Response(JSON.stringify({ links: filtered }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
	  }

	  if (request.method === 'PATCH' && path === '/collection-meta') {
		const tag = url.searchParams.get('tag') || '';
		if (!tag) return new Response(JSON.stringify({ error: 'tag required' }), { status: 400, headers: corsHeaders });
		const body = await request.json() as { name?: string; description?: string; locked?: number };
		await env.links_db.prepare('INSERT OR IGNORE INTO tag_metadata (tag) VALUES (?)').bind(tag).run();
		const fields: string[] = [], vals: any[] = [];
		if (body.name !== undefined) { fields.push('name = ?'); vals.push(body.name); }
		if (body.description !== undefined) { fields.push('description = ?'); vals.push(body.description); }
		if (body.locked !== undefined) { fields.push('locked = ?'); vals.push(body.locked); }
		if (fields.length) await env.links_db.prepare('UPDATE tag_metadata SET ' + fields.join(', ') + ' WHERE tag = ?').bind(...vals, tag).run();
		return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
	  }

  if (request.method === 'POST' && path === '/unlock') {
	const body = await request.json() as { password: string };
	const validPassword = ((env.LOGIN_PASSWORD || env.API_TOKEN) || '').trim();
	if ((body.password || '').trim() === validPassword) {
	  return new Response(JSON.stringify({ ok: true }), {
		headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Set-Cookie': 'unlocked=true; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=3600' },
	  });
	}
	return new Response(JSON.stringify({ error: 'Wrong password' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  if (request.method === 'POST' && path === '/lock') {
	return new Response(JSON.stringify({ ok: true }), {
	  headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Set-Cookie': 'unlocked=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0' },
	});
  }

  if (request.method === 'GET' && path === '/import') {
	const importHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Import Bookmarks</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #f5f5f7; padding: 24px 16px; }
.wrap { max-width: 640px; margin: 0 auto; }
h1 { font-size: 20px; font-weight: 700; margin-bottom: 6px; color: #1d1d1f; }
.sub { font-size: 13px; color: #6e6e73; margin-bottom: 24px; }
.card { background: white; border-radius: 14px; padding: 24px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); margin-bottom: 16px; }
.drop { border: 2px dashed #d2d2d7; border-radius: 10px; padding: 40px; text-align: center; cursor: pointer; transition: all 0.2s; }
.drop:hover, .drop.over { border-color: #0071e3; background: #f0f6ff; }
.drop p { font-size: 14px; color: #6e6e73; margin-top: 8px; }
.drop .icon { font-size: 36px; }
input[type=file] { display: none; }
label { font-size: 13px; color: #6e6e73; display: block; margin-bottom: 6px; margin-top: 16px; font-weight: 600; }
.preview { margin-top: 16px; }
.prev-info { font-size: 13px; color: #1d1d1f; padding: 10px 14px; background: #f5f5f7; border-radius: 8px; margin-bottom: 12px; }
.tag-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.tf { display: flex; align-items: center; gap: 6px; background: #f0f0f5; border-radius: 20px; padding: 4px 10px 4px 12px; font-size: 13px; cursor: pointer; }
.tf input[type=checkbox] { accent-color: #0071e3; width: 14px; height: 14px; }
.tf.checked { background: #0071e3; color: white; }
.go { width: 100%; background: #0071e3; color: white; border: none; border-radius: 10px; padding: 12px; font-size: 15px; font-weight: 600; cursor: pointer; margin-top: 16px; }
.go:disabled { opacity: 0.5; cursor: default; }
.prog { margin-top: 16px; }
.pbar-wrap { background: #e5e5e5; border-radius: 10px; height: 8px; margin-bottom: 8px; overflow: hidden; }
.pbar { background: #0071e3; height: 8px; border-radius: 10px; width: 0%; transition: width 0.3s; }
.plog { font-size: 12px; color: #6e6e73; max-height: 120px; overflow-y: auto; }
.done { color: #34c759; font-weight: 600; font-size: 14px; }
.skip { color: #ff9500; }
a.back { display: inline-block; margin-top: 16px; font-size: 14px; color: #0071e3; text-decoration: none; }
</style>
</head>
<body>
<div class="wrap">
  <h1>&#128228; Import Bookmarks</h1>
  <p class="sub">Supports Safari, Chrome, Firefox bookmark exports (.html)</p>
  <div class="card">
	<div class="drop" id="drop" onclick="document.getElementById('fi').click()">
	  <div class="icon">&#128230;</div>
	  <p>Click to choose file, or drag &amp; drop here</p>
	  <input type="file" id="fi" accept=".html,.htm" onchange="loadFile(this.files[0])">
	</div>
	<div class="preview" id="preview" style="display:none">
	  <div class="prev-info" id="prev-info"></div>
	  <label>Import as tags (select folders to use as tags):</label>
	  <div class="tag-row" id="tag-row"></div>
	  <button class="go" id="go-btn" onclick="startImport()">Import Links</button>
	</div>
	<div class="prog" id="prog" style="display:none">
	  <div class="pbar-wrap"><div class="pbar" id="pbar"></div></div>
	  <div class="plog" id="plog"></div>
	</div>
  </div>
  <div class="card" style="margin-top:0">
    <h2 style="font-size:16px;font-weight:700;margin-bottom:6px;color:#1d1d1f">&#128203; Paste URLs</h2>
    <p style="font-size:13px;color:#6e6e73;margin-bottom:14px">Paste one URL per line — saved instantly without fetching metadata</p>
    <textarea id="paste-urls" placeholder="https://example.com&#10;https://another.com&#10;..." style="width:100%;height:140px;border:1px solid #d2d2d7;border-radius:10px;padding:10px 14px;font-size:13px;font-family:inherit;resize:vertical;outline:none;background:#f5f5f7"></textarea>
    <label style="font-size:13px;color:#6e6e73;display:block;margin:10px 0 4px;font-weight:600">Tag (optional, applied to all)</label>
    <input type="text" id="paste-tag" placeholder="e.g. read-later, research" style="width:100%;border:1px solid #d2d2d7;border-radius:10px;padding:8px 14px;font-size:14px;outline:none;background:#f5f5f7">
    <button id="paste-btn" onclick="savePasted()" style="width:100%;background:#0071e3;color:white;border:none;border-radius:10px;padding:12px;font-size:15px;font-weight:600;cursor:pointer;margin-top:12px">Save URLs</button>
    <div id="paste-result" style="margin-top:10px;font-size:13px"></div>
  </div>
  <a class="back" href="/">&#8592; Back to My Links</a>
</div>
<scr` + `ipt>
var parsed = [];

var drop = document.getElementById('drop');
drop.addEventListener('dragover', function(e){ e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', function(){ drop.classList.remove('over'); });
drop.addEventListener('drop', function(e){ e.preventDefault(); drop.classList.remove('over'); var f=e.dataTransfer.files[0]; if(f) loadFile(f); });

function loadFile(file) {
  var reader = new FileReader();
  reader.onload = function(e) { parseBookmarks(e.target.result); };
  reader.readAsText(file);
}

function parseBookmarks(html) {
  var parser = new DOMParser();
  var doc = parser.parseFromString(html, 'text/html');
  var links = doc.querySelectorAll('a[href]');
  parsed = [];
  var folders = {};
  links.forEach(function(a) {
    var url = a.getAttribute('href');
    if (!url || url.startsWith('javascript:') || url.startsWith('place:')) return;
    var title = a.textContent.trim() || url;
    // Walk up to find parent folder H3
    var tag = '';
    var node = a.parentElement;
    while (node) {
      var prev = node.previousElementSibling;
      if (prev && (prev.tagName === 'H3' || prev.tagName === 'DT')) {
        var h = prev.tagName === 'H3' ? prev : prev.querySelector('h3,H3');
        if (h) { tag = h.textContent.trim(); break; }
      }
      node = node.parentElement;
    }
    parsed.push({ url: url, title: title, tag: tag });
    if (tag) folders[tag] = (folders[tag] || 0) + 1;
  });

  document.getElementById('prev-info').textContent = parsed.length + ' links found across ' + Object.keys(folders).length + ' folders';
  var tr = document.getElementById('tag-row');
  tr.innerHTML = '';
  Object.keys(folders).sort().forEach(function(f) {
    var lbl = document.createElement('label');
    lbl.className = 'tf checked';
    var cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = true; cb.value = f;
    cb.onchange = function(){ lbl.className = 'tf' + (cb.checked ? ' checked' : ''); };
    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(' ' + f + ' (' + folders[f] + ')'));
    tr.appendChild(lbl);
  });

  document.getElementById('preview').style.display = '';
}

function startImport() {
  var selectedFolders = {};
  document.querySelectorAll('#tag-row input[type=checkbox]:checked').forEach(function(cb){ selectedFolders[cb.value] = true; });
  document.getElementById('go-btn').disabled = true;
  document.getElementById('prog').style.display = '';
  var log = document.getElementById('plog');
  var pbar = document.getElementById('pbar');
  var total = parsed.length, done = 0, skipped = 0;

  function next(i) {
    if (i >= parsed.length) {
      pbar.style.width = '100%';
      log.innerHTML += '<div class="done">&#10003; Done! Imported ' + (done) + ' links, skipped ' + skipped + '.</div>';
      return;
    }
    var item = parsed[i];
    var tag = (item.tag && selectedFolders[item.tag]) ? item.tag : '';
    fetch('/links', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ url: item.url, title: item.title, tags: tag })
    }).then(function(r){ return r.json(); }).then(function(){
      done++;
      pbar.style.width = Math.round((i+1)/total*100) + '%';
      log.innerHTML += '<div>&#10003; ' + (item.title.length > 60 ? item.title.slice(0,60)+'...' : item.title) + '</div>';
      log.scrollTop = log.scrollHeight;
      setTimeout(function(){ next(i+1); }, 80);
    }).catch(function(){
      skipped++;
      log.innerHTML += '<div class="skip">&#9888; Skipped: ' + item.url.slice(0,60) + '</div>';
      setTimeout(function(){ next(i+1); }, 80);
    });
  }
  next(0);
}

function savePasted() {
  var raw = document.getElementById('paste-urls').value;
  var tag = document.getElementById('paste-tag').value.trim();
  var btn = document.getElementById('paste-btn');
  var result = document.getElementById('paste-result');

  var lines = raw.split(/\\r\\n|\\r|\\n/).map(function(l){ return l.trim(); });

  // Parse title+URL pairs (Safari copy format: title line then URL line)
  var links = [];
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('http')) {
      var url = lines[i];
      // Check if the next line continues the URL (starts with /)
      while (i + 1 < lines.length && lines[i+1].startsWith('/')) {
        url += lines[++i];
      }
      // Check if the previous non-empty line was a title
      var title = '';
      for (var j = i - 1; j >= 0; j--) {
        if (lines[j] && !lines[j].startsWith('http')) { title = lines[j]; break; }
        if (!lines[j]) break;
      }
      links.push({ url: url, title: title || url, tags: tag });
    }
  }

  if (!links.length) {
    result.innerHTML = '<span style="color:#ff3b30">No valid URLs found. Make sure each URL starts with http.</span>';
    result.scrollIntoView({ behavior: 'smooth' });
    return;
  }

  btn.disabled = true; btn.textContent = 'Saving ' + links.length + ' links...';
  result.innerHTML = '';

  fetch('/links/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ links: links })
  }).then(function(r){ return r.json(); }).then(function(d){
    if (d.saved !== undefined) {
      result.innerHTML = '<span style="color:#34c759;font-weight:600">&#10003; Saved ' + d.saved + ' links</span>';
      document.getElementById('paste-urls').value = '';
    } else {
      result.innerHTML = '<span style="color:#ff3b30">Error: ' + (d.error || 'Unknown error') + '</span>';
    }
    btn.disabled = false; btn.textContent = 'Save URLs';
    result.scrollIntoView({ behavior: 'smooth' });
  }).catch(function(e){
    result.innerHTML = '<span style="color:#ff3b30">Network error. Are you logged in?</span>';
    btn.disabled = false; btn.textContent = 'Save URLs';
    result.scrollIntoView({ behavior: 'smooth' });
  });
}
<\/scr` + `ipt>
</body>
</html>`;
	return new Response(importHtml, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

	  if (request.method === 'GET' && path === '/add') {
		const pageUrl = url.searchParams.get('url') || '';
		const pageTitle = url.searchParams.get('title') || '';
		const encodedUrl = encodeURIComponent(pageUrl);
		const encodedTitle = encodeURIComponent(pageTitle);
		const addHtml = `<!DOCTYPE html>
  <html lang="en">
  <head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Save Link</title>
  <style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #f5f5f7; padding: 20px; }
  .card { background: white; border-radius: 14px; padding: 20px; box-shadow: 0 2px 12px rgba(0,0,0,0.1); }
  h2 { font-size: 16px; font-weight: 700; margin-bottom: 16px; color: #1d1d1f; }
  .ptitle { font-size: 13px; font-weight: 600; color: #1d1d1f; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .purl { font-size: 12px; color: #0071e3; margin-bottom: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  label { font-size: 13px; color: #6e6e73; display: block; margin-bottom: 4px; margin-top: 12px; }
  input { width: 100%; border: 1px solid #d2d2d7; border-radius: 8px; padding: 8px 12px; font-size: 14px; outline: none; background: #f5f5f7; }
  input:focus { border-color: #0071e3; background: white; }
  .btns { display: flex; gap: 10px; margin-top: 16px; }
  .bsave { flex: 1; background: #0071e3; color: white; border: none; border-radius: 10px; padding: 10px; font-size: 15px; cursor: pointer; font-weight: 600; }
  .bcancel { background: #f5f5f7; border: 1px solid #d2d2d7; border-radius: 10px; padding: 10px 16px; font-size: 15px; cursor: pointer; }
  .status { font-size: 13px; text-align: center; margin-top: 12px; }
  .ok { color: #34c759; font-weight: 600; }
  .err { color: #ff3b30; }
  </style>
  </head>
  <body>
  <div class="card">
	<h2>&#128204; Save Link</h2>
	<div class="ptitle">${pageTitle}</div>
	<div class="purl">${pageUrl}</div>
	<label>Tags (comma separated)</label>
	<input type="text" id="tags" placeholder="e.g. tech, read-later" autofocus>
	<label>Caption (optional)</label>
	<input type="text" id="caption" placeholder="Add a note...">
	<div class="btns">
	  <button class="bcancel" onclick="window.close()">Cancel</button>
	  <button class="bsave" onclick="save()">Save</button>
	</div>
	<div class="status" id="status"></div>
  </div>
  <scr` + `ipt>
  var pu = decodeURIComponent('${encodedUrl}');
  var pt = decodeURIComponent('${encodedTitle}');
  document.getElementById('tags').addEventListener('keydown', function(e) { if (e.key === 'Enter') document.getElementById('caption').focus(); });
  document.getElementById('caption').addEventListener('keydown', function(e) { if (e.key === 'Enter') save(); });
  function save() {
	var tags = document.getElementById('tags').value;
	var caption = document.getElementById('caption').value;
	var btn = document.querySelector('.bsave');
	btn.textContent = 'Saving...'; btn.disabled = true;
	fetch('/links', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:pu,title:pt,tags:tags,caption:caption})})
	.then(function(r){return r.json();}).then(function(d) {
	  var s = document.getElementById('status');
	  s.className = 'status ok'; s.textContent = 'Saved: ' + d.title;
	  setTimeout(function(){window.close();}, 1200);
	}).catch(function() {
	  var s = document.getElementById('status');
	  s.className = 'status err'; s.textContent = 'Error saving link';
	  btn.textContent = 'Save'; btn.disabled = false;
	});
  }
  <\/script>
  </body>
  </html>`;
		return new Response(addHtml, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
	  }
  
	  if (request.method === 'POST' && path === '/links') {
		const body = await request.json() as { url: string; tags?: string; caption?: string; title?: string };
		if (!body.url) return new Response(JSON.stringify({ error: 'url required' }), { status: 400, headers: corsHeaders });
		const cleanUrl = decodeEntities(body.url);
		const meta = await getMeta(cleanUrl);
		const finalTitle = body.title ? decodeEntities(body.title) : (meta.title || cleanUrl);
		const autoTags = await applyRules(cleanUrl, body.tags || '', env, meta.title || '', body.caption || '');
		await env.links_db.prepare('INSERT INTO links (url, title, description, thumbnail, tags) VALUES (?, ?, ?, ?, ?)')
		  .bind(cleanUrl, finalTitle, body.caption || meta.description || '', meta.thumbnail || '', autoTags).run();
		return new Response(JSON.stringify({ ok: true, title: finalTitle }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
	  }

	  if (request.method === 'POST' && path === '/links/batch') {
		const body = await request.json() as { links: Array<{ url: string; title?: string; tags?: string }> };
		if (!Array.isArray(body.links) || body.links.length === 0) {
		  return new Response(JSON.stringify({ error: 'links array required' }), { status: 400, headers: corsHeaders });
		}
		const statements = body.links
		  .filter((item) => item.url && item.url.trim())
		  .map((item) => {
			const cleanUrl = decodeEntities(item.url.trim());
			const title = item.title ? decodeEntities(item.title) : cleanUrl;
			const tags = item.tags || '';
			return env.links_db.prepare('INSERT INTO links (url, title, tags) VALUES (?, ?, ?)')
			  .bind(cleanUrl, title, tags);
		  });
		if (statements.length === 0) {
		  return new Response(JSON.stringify({ saved: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
		}
		await env.links_db.batch(statements);
		return new Response(JSON.stringify({ saved: statements.length }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
	  }
  
	  if (request.method === 'GET' && path === '/links') {
		const search = url.searchParams.get('search') || '';
		const tagsParam = url.searchParams.get('tags') || '';
		const page = parseInt(url.searchParams.get('page') || '1');
		const pp = parseInt(url.searchParams.get('perPage') || '50');
		const view = url.searchParams.get('view') || 'all';
  
		const conditions: string[] = ['deleted_at IS NULL'];
		const params: string[] = [];
  
		if (view === 'archive') {
		  conditions.push('archived_at IS NOT NULL');
		} else if (view === 'private') {
		  conditions.push('archived_at IS NULL');
		  conditions.push('is_private = 1');
		} else if (view === 'search') {
		  // global search: only exclude deleted
		} else {
		  conditions.push('archived_at IS NULL');
		  conditions.push('is_private = 0');
		}
  
		if (search) {
		  conditions.push('(title LIKE ? OR description LIKE ? OR url LIKE ? OR notes LIKE ?)');
		  params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
		}
		if (tagsParam && view === 'all') {
		  tagsParam.split(',').map((t: string) => t.trim()).filter(Boolean).forEach((tag: string) => {
			conditions.push('(tags = ? OR tags LIKE ? OR tags LIKE ? OR tags LIKE ? OR tags LIKE ? OR tags LIKE ?)');
			params.push(tag, tag + ',%', '%,' + tag, '%, ' + tag, '%,' + tag + ',%', '%, ' + tag + ',%');
		  });
		}
		if (!isUnlocked(request)) {
		  const lockedTags = await getLockedTags(env);
		  lockedTags.forEach((tag: string) => {
			conditions.push('(tags != ? AND tags NOT LIKE ? AND tags NOT LIKE ? AND tags NOT LIKE ? AND tags NOT LIKE ? AND tags NOT LIKE ?)');
			params.push(tag, tag + ',%', '%,' + tag, '%, ' + tag, '%,' + tag + ',%', '%, ' + tag + ',%');
		  });
		}
  
		const where = ' WHERE ' + conditions.join(' AND ');
		const countRow = await env.links_db.prepare('SELECT COUNT(*) as total FROM links' + where).bind(...params).first() as any;
		const total = countRow ? countRow.total : 0;
		const { results } = await env.links_db.prepare('SELECT * FROM links' + where + ' ORDER BY created_at DESC LIMIT ? OFFSET ?').bind(...params, pp, (page-1)*pp).all();
		return new Response(JSON.stringify({ results, total, page, perPage: pp }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
	  }
  
	  if (request.method === 'GET' && path === '/trash') {
		const { results } = await env.links_db.prepare('SELECT * FROM links WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC').all();
		return new Response(JSON.stringify(results), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
	  }
	  if (request.method === 'POST' && path === '/trash/restore-all') {
		await env.links_db.prepare('UPDATE links SET deleted_at = NULL WHERE deleted_at IS NOT NULL').run();
		return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
	  }
	  if (request.method === 'DELETE' && path === '/trash/empty') {
		await env.links_db.prepare('DELETE FROM links WHERE deleted_at IS NOT NULL').run();
		return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
	  }
  
	  if (request.method === 'POST' && path === '/links/batch-archive') {
		const body = await request.json() as { ids: number[] };
		for (const id of body.ids) {
		  await env.links_db.prepare("UPDATE links SET archived_at = datetime('now') WHERE id = ?").bind(id).run();
		}
		return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
	  }
  
	  if (request.method === 'PATCH' && path === '/links/batch-tag') {
		const body = await request.json() as { ids: number[]; tags: string; mode: string };
		for (const id of body.ids) {
		  const row = await env.links_db.prepare('SELECT tags FROM links WHERE id = ?').bind(id).first() as any;
		  if (!row) continue;
		  const existing = row.tags ? row.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [];
		  const incoming = body.tags.split(',').map((t: string) => t.trim()).filter(Boolean);
		  let newTags: string;
		  if (body.mode === 'replace') { newTags = incoming.join(', '); }
		  else if (body.mode === 'remove') { newTags = existing.filter((t: string) => !incoming.includes(t)).join(', '); }
		  else { newTags = Array.from(new Set([...existing, ...incoming])).join(', '); }
		  await env.links_db.prepare('UPDATE links SET tags = ? WHERE id = ?').bind(newTags, id).run();
		}
		return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
	  }
  
	  if (request.method === 'POST' && path.match(/^\/links\/\d+\/restore$/)) {
		const id = path.split('/')[2];
		await env.links_db.prepare('UPDATE links SET deleted_at = NULL WHERE id = ?').bind(id).run();
		return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
	  }
	  if (request.method === 'DELETE' && path.match(/^\/links\/\d+\/permanent$/)) {
		const id = path.split('/')[2];
		await env.links_db.prepare('DELETE FROM links WHERE id = ?').bind(id).run();
		return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
	  }
	  if (request.method === 'POST' && path.match(/^\/links\/\d+\/refetch$/)) {
		const id = path.split('/')[2];
		const row = await env.links_db.prepare('SELECT url FROM links WHERE id = ?').bind(id).first() as any;
		if (!row) return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: corsHeaders });
		const meta = await getMeta(row.url);
		const updates: string[] = [], vals: any[] = [];
		if (meta.thumbnail) { updates.push('thumbnail = ?'); vals.push(meta.thumbnail); }
		if (meta.title) { updates.push('title = ?'); vals.push(meta.title); }
		if (meta.description) { updates.push('description = ?'); vals.push(meta.description); }
		if (updates.length) await env.links_db.prepare('UPDATE links SET ' + updates.join(', ') + ' WHERE id = ?').bind(...vals, id).run();
		return new Response(JSON.stringify({ ok: true, thumbnail: meta.thumbnail, title: meta.title }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
	  }
	  if (request.method === 'PATCH' && path.match(/^\/links\/\d+\/notes$/)) {
		const id = path.split('/')[2];
		const body = await request.json() as { notes: string };
		await env.links_db.prepare('UPDATE links SET notes = ? WHERE id = ?').bind(body.notes, id).run();
		return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
	  }
	  if (request.method === 'PATCH' && path.match(/^\/links\/\d+\/edit$/)) {
		const id = path.split('/')[2];
		const body = await request.json() as { tags: string; description: string; thumbnail: string };
		await env.links_db.prepare('UPDATE links SET tags = ?, description = ?, thumbnail = ? WHERE id = ?').bind(body.tags, body.description, body.thumbnail, id).run();
		return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
	  }
	  if (request.method === 'PATCH' && path.match(/^\/links\/\d+\/read$/)) {
		const id = path.split('/')[2];
		const body = await request.json() as { read: number };
		await env.links_db.prepare('UPDATE links SET read = ? WHERE id = ?').bind(body.read, id).run();
		return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
	  }
	  if (request.method === 'POST' && path.match(/^\/links\/\d+\/archive$/)) {
		const id = path.split('/')[2];
		await env.links_db.prepare("UPDATE links SET archived_at = datetime('now') WHERE id = ?").bind(id).run();
		return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
	  }
	  if (request.method === 'POST' && path.match(/^\/links\/\d+\/unarchive$/)) {
		const id = path.split('/')[2];
		await env.links_db.prepare('UPDATE links SET archived_at = NULL WHERE id = ?').bind(id).run();
		return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
	  }
	  if (request.method === 'PATCH' && path.match(/^\/links\/\d+\/private$/)) {
		const id = path.split('/')[2];
		const body = await request.json() as { is_private: number };
		await env.links_db.prepare('UPDATE links SET is_private = ? WHERE id = ?').bind(body.is_private, id).run();
		return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
	  }
	  if (request.method === 'DELETE' && path.match(/^\/links\/\d+$/)) {
		const id = path.split('/')[2];
		await env.links_db.prepare("UPDATE links SET deleted_at = datetime('now') WHERE id = ?").bind(id).run();
		return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
	  }
  
	  if (request.method === 'GET' && path === '/rules') {
		const { results } = await env.links_db.prepare('SELECT * FROM tag_rules ORDER BY created_at DESC').all();
		return new Response(JSON.stringify(results), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
	  }
	  if (request.method === 'POST' && path === '/rules') {
		const body = await request.json() as { type: string; pattern: string; tags: string };
		await env.links_db.prepare('INSERT INTO tag_rules (type, pattern, tags) VALUES (?, ?, ?)').bind(body.type, body.pattern, body.tags).run();
		return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
	  }
	  if (request.method === 'PATCH' && path.match(/^\/rules\/\d+$/)) {
		const id = path.split('/')[2];
		const body = await request.json() as { type?: string; pattern?: string; tags?: string; enabled?: number };
		const fields: string[] = [], vals: any[] = [];
		if (body.type !== undefined) { fields.push('type = ?'); vals.push(body.type); }
		if (body.pattern !== undefined) { fields.push('pattern = ?'); vals.push(body.pattern); }
		if (body.tags !== undefined) { fields.push('tags = ?'); vals.push(body.tags); }
		if (body.enabled !== undefined) { fields.push('enabled = ?'); vals.push(body.enabled); }
		if (fields.length) await env.links_db.prepare('UPDATE tag_rules SET ' + fields.join(', ') + ' WHERE id = ?').bind(...vals, id).run();
		return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
	  }
	  if (request.method === 'DELETE' && path.match(/^\/rules\/\d+$/)) {
		const id = path.split('/')[2];
		await env.links_db.prepare('DELETE FROM tag_rules WHERE id = ?').bind(id).run();
		return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
	  }
  
	  return new Response('Not found', { status: 404, headers: corsHeaders });
	},
  };