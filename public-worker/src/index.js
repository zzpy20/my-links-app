function fmtDate(s) {
	return new Date(s.endsWith('Z') ? s : s + 'Z').toLocaleString('en-AU', {
	  day: 'numeric', month: 'short', year: 'numeric',
	  hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Brisbane'
	});
  }
  
  function getOfflineHTML() {
	return `<!DOCTYPE html>
  <html lang="en">
  <head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Links - Unavailable</title>
  <style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #f5f5f7; }
  .wrap { display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .card { background: white; border-radius: 20px; padding: 48px; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.08); max-width: 400px; }
  .icon { font-size: 48px; margin-bottom: 16px; }
  h2 { font-size: 22px; font-weight: 700; margin-bottom: 8px; color: #1d1d1f; }
  p { font-size: 15px; color: #6e6e73; line-height: 1.5; }
  </style>
  </head>
  <body>
  <div class="wrap">
	<div class="card">
	  <div class="icon">🔒</div>
	  <h2>Not Available</h2>
	  <p>This page is currently private and not available for public viewing.</p>
	</div>
  </div>
  </body>
  </html>`;
  }
  
  function getHTML(links) {
	return `<!DOCTYPE html>
  <html lang="en">
  <head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Links - Public</title>
  <style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #f5f5f7; color: #1d1d1f; }
  header { background: white; padding: 16px 24px; border-bottom: 1px solid #e5e5e5; display: flex; gap: 12px; align-items: center; position: sticky; top: 0; z-index: 10; flex-wrap: wrap; }
  header h1 { font-size: 20px; font-weight: 700; margin-right: auto; }
  .badge { background: #0071e3; color: white; border-radius: 20px; padding: 4px 12px; font-size: 12px; font-weight: 600; }
  .search-wrap { position: relative; display: flex; align-items: center; }
  .search-wrap input { border: 1px solid #d2d2d7; border-radius: 10px; padding: 8px 32px 8px 14px; font-size: 14px; outline: none; background: #f5f5f7; width: 200px; }
  .search-wrap input:focus { border-color: #0071e3; background: white; }
  .sclear { position: absolute; right: 8px; background: none; border: none; cursor: pointer; color: #aeaeb2; font-size: 16px; display: none; }
  .view-btns { display: flex; border: 1px solid #d2d2d7; border-radius: 8px; overflow: hidden; }
  .view-btn { background: white; border: none; padding: 7px 13px; cursor: pointer; font-size: 17px; line-height: 1; }
  .view-btn.active { background: #0071e3; color: white; }
  .tag-panel { background: white; border-bottom: 1px solid #e5e5e5; }
  .tag-panel-header { display: flex; align-items: center; gap: 8px; padding: 10px 24px; cursor: pointer; user-select: none; }
  .tplbl { font-size: 13px; font-weight: 600; color: #6e6e73; }
  .tpcnt { background: #0071e3; color: white; border-radius: 10px; padding: 1px 7px; font-size: 11px; }
  .tpico { margin-left: auto; font-size: 12px; color: #aeaeb2; }
  .tag-cloud { display: flex; gap: 8px; padding: 0 24px 12px; flex-wrap: wrap; }
  .tag-cloud.hidden { display: none; }
  .tag-btn { background: #f0f0f5; border: 2px solid transparent; border-radius: 20px; padding: 4px 12px; font-size: 13px; cursor: pointer; color: #1d1d1f; }
  .tag-btn:hover { border-color: #0071e3; }
  .tag-btn.active { background: #0071e3; color: white; border-color: #0071e3; }
  .tfi { padding: 4px 24px 10px; font-size: 12px; color: #6e6e73; display: flex; align-items: center; gap: 8px; }
  .ctb { font-size: 12px; color: #0071e3; background: none; border: none; cursor: pointer; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; padding: 16px 24px 24px; }
  .card { background: white; border-radius: 14px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.08); text-decoration: none; color: inherit; display: block; }
  .card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.12); }
  .cthumb { width: 100%; height: 160px; object-fit: cover; display: block; }
  .cnoimg { width: 100%; height: 160px; background: linear-gradient(135deg, #667eea, #764ba2); display: flex; align-items: center; justify-content: center; font-size: 40px; color: white; }
  .cbody { padding: 14px; }
  .ctitle { font-size: 15px; font-weight: 600; line-height: 1.4; margin-bottom: 4px; }
  .cdesc { font-size: 13px; color: #6e6e73; line-height: 1.4; margin-bottom: 8px; }
  .cnotes { font-size: 13px; color: #3a3a3c; background: #f5f5f7; border-radius: 8px; padding: 6px 10px; margin-bottom: 8px; white-space: pre-wrap; word-break: break-word; }
  .curl { font-size: 12px; color: #0071e3; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; margin-bottom: 8px; }
  .ctags { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 4px; }
  .tag { background: #f0f0f5; border-radius: 6px; padding: 2px 8px; font-size: 11px; color: #6e6e73; }
  .cdate { font-size: 11px; color: #aeaeb2; }
  .list { display: flex; flex-direction: column; gap: 10px; padding: 16px 24px 24px; }
  .li { background: white; border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); display: flex; gap: 14px; align-items: flex-start; padding: 14px; text-decoration: none; color: inherit; }
  .li:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.12); }
  .lthumb { width: 80px; height: 80px; object-fit: cover; border-radius: 8px; flex-shrink: 0; display: block; }
  .lnoimg { width: 80px; height: 80px; border-radius: 8px; flex-shrink: 0; background: linear-gradient(135deg, #667eea, #764ba2); display: flex; align-items: center; justify-content: center; font-size: 28px; color: white; }
  .lcon { flex: 1; min-width: 0; }
  .ltitle { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
  .ldesc { font-size: 13px; color: #6e6e73; margin-bottom: 6px; }
  .lnotes { font-size: 13px; color: #3a3a3c; background: #f5f5f7; border-radius: 8px; padding: 6px 10px; margin-bottom: 6px; white-space: pre-wrap; word-break: break-word; }
  .lmeta { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 4px; }
  .lurl { font-size: 12px; color: #0071e3; }
  .ldate { font-size: 11px; color: #aeaeb2; }
  .empty { text-align: center; padding: 80px 24px; color: #aeaeb2; }
  </style>
  </head>
  <body>
  <header>
	<h1>🔖 My Links</h1>
	<span class="badge">Public View</span>
	<div class="search-wrap">
	  <input type="text" id="search" placeholder="Search..." oninput="dbs()">
	  <button class="sclear" id="sclear" onclick="clearSearch()">&#x2715;</button>
	</div>
	<div class="view-btns">
	  <button class="view-btn active" id="btn-grid" onclick="sv('grid')">&#9783;</button>
	  <button class="view-btn" id="btn-list" onclick="sv('list')">&#9776;</button>
	</div>
  </header>
  <div class="tag-panel">
	<div class="tag-panel-header" onclick="ttp()">
	  <span class="tplbl">TAGS</span>
	  <span class="tpcnt" id="tcnt">0</span>
	  <span class="tpico" id="tico">&#9650;</span>
	</div>
	<div class="tag-cloud" id="tcloud"></div>
	<div class="tfi" id="tfi" style="display:none">
	  Filtering: <span id="tlbl"></span>
	  <button class="ctb" onclick="clrT()">Clear all</button>
	</div>
  </div>
  <div id="con"></div>
  <script>
  var allLinks = ${JSON.stringify(links)};
  var cv = 'grid', at = [], tpo = true, st, atm = {};
  var cl = allLinks;
  
  function ttp() {
	tpo = !tpo;
	document.getElementById('tcloud').classList.toggle('hidden', !tpo);
	document.getElementById('tico').innerHTML = tpo ? '&#9650;' : '&#9660;';
  }
  
  function sv(v) {
	cv = v;
	document.getElementById('btn-grid').classList.toggle('active', v === 'grid');
	document.getElementById('btn-list').classList.toggle('active', v === 'list');
	render(cl);
  }
  
  function buildTagMap(links) {
	var m = {};
	links.forEach(function(l) {
	  if (l.tags) l.tags.split(',').forEach(function(t) {
		t = t.trim(); if (t) m[t] = (m[t] || 0) + 1;
	  });
	});
	return m;
  }
  
  function renderTags(m) {
	var ks = Object.keys(m);
	document.getElementById('tcnt').textContent = ks.length;
	var c = document.getElementById('tcloud');
	c.innerHTML = '';
	ks.sort().forEach(function(t) {
	  var b = document.createElement('button');
	  b.className = 'tag-btn' + (at.indexOf(t) >= 0 ? ' active' : '');
	  b.textContent = t + ' ' + m[t];
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
	filter();
  }
  
  function clrT() {
	at = []; renderTags(atm);
	document.getElementById('tfi').style.display = 'none';
	filter();
  }
  
  function dbs() {
	var val = document.getElementById('search').value;
	document.getElementById('sclear').style.display = val ? 'block' : 'none';
	clearTimeout(st);
	st = setTimeout(filter, 200);
  }
  
  function clearSearch() {
	document.getElementById('search').value = '';
	document.getElementById('sclear').style.display = 'none';
	filter();
  }
  
  function filter() {
	var s = document.getElementById('search').value.toLowerCase();
	cl = allLinks.filter(function(l) {
	  var matchSearch = !s || (l.title||'').toLowerCase().includes(s) || (l.url||'').toLowerCase().includes(s) || (l.description||'').toLowerCase().includes(s) || (l.notes||'').toLowerCase().includes(s);
	  var matchTags = !at.length || at.every(function(t) { return (l.tags||'').toLowerCase().includes(t.toLowerCase()); });
	  return matchSearch && matchTags;
	});
	render(cl);
  }
  
  function dom(url) { try { return new URL(url).hostname; } catch(e) { return url; } }
  
  function fmtDate(s) {
	return new Date(s.endsWith('Z') ? s : s + 'Z').toLocaleString('en-AU', {day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Australia/Brisbane'});
  }
  
  function mkTags(tags) {
	var a = tags ? tags.split(',').filter(function(t) { return t.trim(); }) : [];
	return a.map(function(t) { return '<span class="tag">' + t.trim() + '</span>'; }).join('');
  }
  
  function render(links) {
	var c = document.getElementById('con');
	if (!links.length) { c.innerHTML = '<div class="empty"><p>No links found.</p></div>'; return; }
	var wrap = document.createElement('div');
	wrap.className = cv === 'grid' ? 'grid' : 'list';
	links.forEach(function(l) {
	  var isGrid = cv === 'grid';
	  var card = document.createElement('a');
	  card.className = isGrid ? 'card' : 'li';
	  card.href = l.url;
	  card.target = '_blank';
	  card.rel = 'noopener';
	  var img;
	  if (l.thumbnail) {
		img = document.createElement('img');
		img.className = isGrid ? 'cthumb' : 'lthumb';
		img.src = l.thumbnail;
		img.loading = 'lazy';
		img.onerror = function() { this.style.display = 'none'; };
	  } else {
		img = document.createElement('div');
		img.className = isGrid ? 'cnoimg' : 'lnoimg';
		img.textContent = String.fromCodePoint(128279);
	  }
	  card.appendChild(img);
	  var body = document.createElement('div');
	  body.className = isGrid ? 'cbody' : 'lcon';
	  var title = document.createElement('div');
	  title.className = isGrid ? 'ctitle' : 'ltitle';
	  title.textContent = l.title || l.url;
	  body.appendChild(title);
	  if (l.description) {
		var desc = document.createElement('div');
		desc.className = isGrid ? 'cdesc' : 'ldesc';
		desc.textContent = l.description;
		body.appendChild(desc);
	  }
	  if (l.notes && l.notes.trim()) {
		var notes = document.createElement('div');
		notes.className = isGrid ? 'cnotes' : 'lnotes';
		notes.textContent = l.notes;
		body.appendChild(notes);
	  }
	  var tgh = mkTags(l.tags);
	  var dateStr = fmtDate(l.created_at);
	  if (isGrid) {
		var u = document.createElement('div'); u.className = 'curl'; u.textContent = dom(l.url); body.appendChild(u);
		if (tgh) { var td = document.createElement('div'); td.className = 'ctags'; td.innerHTML = tgh; body.appendChild(td); }
		var dt = document.createElement('div'); dt.className = 'cdate'; dt.textContent = dateStr; body.appendChild(dt);
	  } else {
		var meta = document.createElement('div'); meta.className = 'lmeta';
		var u2 = document.createElement('span'); u2.className = 'lurl'; u2.textContent = dom(l.url); meta.appendChild(u2);
		if (tgh) { var td2 = document.createElement('div'); td2.innerHTML = tgh; meta.appendChild(td2); }
		var dt2 = document.createElement('span'); dt2.className = 'ldate'; dt2.textContent = dateStr; meta.appendChild(dt2);
		body.appendChild(meta);
	  }
	  card.appendChild(body);
	  wrap.appendChild(card);
	});
	c.innerHTML = '';
	c.appendChild(wrap);
  }
  
  atm = buildTagMap(allLinks);
  renderTags(atm);
  render(allLinks);
  </script>
  </body>
  </html>`;
  }
  
  export default {
	async fetch(request, env) {
	  if (env.PUBLIC_ENABLED !== 'true') {
		return new Response(getOfflineHTML(), {
		  status: 503,
		  headers: { 'Content-Type': 'text/html; charset=utf-8' }
		});
	  }
  
	  try {
		const result = await env.DB.prepare(
		  'SELECT * FROM links WHERE deleted_at IS NULL AND archived_at IS NULL AND is_private = 0 ORDER BY created_at DESC LIMIT 500'
		).all();
  
		const html = getHTML(result.results || []);
		return new Response(html, {
		  headers: { 'Content-Type': 'text/html; charset=utf-8' }
		});
	  } catch (e) {
		return new Response('Error: ' + e.message, { status: 500 });
	  }
	}
  };