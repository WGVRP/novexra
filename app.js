(() => {
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const API = (window.API_BASE || '').replace(/\/$/, ''), pretty = n => n.replace(/([a-z])([A-Z])/g, '$1 $2');
const app = $('#app'), dlg = $('#dlg');
let sid = localStorage.getItem('sid'), me = null, G = null, info = null, loginErr = '';
const hs = location.hash;
if (hs.startsWith('#sid=')) { sid = hs.slice(5); localStorage.setItem('sid', sid); history.replaceState(null, '', location.pathname + '#/'); }
else if (hs.startsWith('#error=')) { loginErr = decodeURIComponent(hs.slice(7)); history.replaceState(null, '', location.pathname); }

const toast = (m, bad) => { const t = document.createElement('div'); t.className = 'toast' + (bad ? ' bad' : ''); t.textContent = m; $('#toasts').append(t); setTimeout(() => t.remove(), 4500); };
function logout() { if (sid) fetch(API + '/api/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + sid } }).catch(() => {}); localStorage.removeItem('sid'); sid = null; me = null; info = null; location.hash = ''; route(); }
async function api(p, m = 'GET', b) {
  const r = await fetch(API + p, { method: m, headers: { Authorization: 'Bearer ' + sid, ...(b ? { 'Content-Type': 'application/json' } : {}) }, body: b ? JSON.stringify(b) : undefined }).catch(() => { throw Error('Cannot reach the server. Check your connection.'); });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && sid) { localStorage.removeItem('sid'); sid = null; route(); throw Error(d.error || 'Session expired'); }
  if (!r.ok) throw Error(d.error || 'Request failed (' + r.status + ')');
  return d;
}
const act = async f => { try { await f(); } catch (e) { toast(e.message, 1); } };

function modal(title, body, ok, fn, danger) {
  dlg.innerHTML = `<form><h3>${esc(title)}</h3><div class="mb">${body}</div><div class="actions"><button type="button" class="btn" data-x>Cancel</button><button class="btn ${danger ? 'bad' : 'pri'}">${esc(ok)}</button></div></form>`;
  const f = $('form', dlg); $('[data-x]', f).onclick = () => dlg.close();
  f.onsubmit = e => { e.preventDefault(); const b = $('.actions button:last-child', f); b.disabled = true; act(async () => { try { await fn(new FormData(f), f); dlg.close(); } finally { b.disabled = false; } }); };
  dlg.showModal(); return f;
}
const confirmBox = (msg, ok, fn) => modal('Are you sure?', `<p>${msg}</p>`, ok, fn, true);
const reload = () => route();
const head = (t, b = '') => `<div class="hd"><h1>${t}</h1><span class="sp"></span>${b}</div>`;
const icon = (g, s = 64) => g.icon ? `<img class="gi" src="https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=${s}" alt="">` : `<span class="gi">${esc(g.name.split(/\s+/).map(w => w[0]).join('').slice(0, 3))}</span>`;
const post = (p, b) => api(p, 'POST', b);

/* ---------- screens ---------- */
function login() {
  app.innerHTML = `<div class="center"><div class="card login"><h1>Server Panel</h1><p class="mut">Manage your Discord server's channels, roles, members and ranks from one place.</p>${loginErr ? `<p class="err">${esc(loginErr)}</p>` : ''}<a class="btn pri big" href="${API}/auth/login">Log in with Discord</a></div></div>`;
}
async function servers() {
  G = null; info = null;
  app.innerHTML = `<div class="top"><b>Server Panel</b><span class="sp"></span><span class="mut">${esc(me.name)}</span><button class="btn" id="lo">Log out</button></div><div class="wrap"><h1>Your servers</h1><p class="mut">Servers you own or can manage.</p><div id="sl" class="grid"><p class="mut">Loading</p></div></div>`;
  $('#lo').onclick = logout;
  await act(async () => {
    const l = await api('/api/guilds');
    $('#sl').innerHTML = l.length ? l.map(g => `<div class="card sv">${icon(g)}<b>${esc(g.name)}</b>${g.botIn ? `<a class="btn pri" href="#/g/${g.id}/overview">Manage</a>` : `<a class="btn" href="${API}/invite?guild_id=${g.id}">Add bot</a>`}</div>`).join('') : '<p class="mut">No servers found where you have Manage Server permission.</p>';
  });
}
const NAV = ['Overview', 'Channels', 'Roles', 'Members', 'Ranks', 'Templates', 'Settings'];
async function guild(id, v) {
  if (G !== id || !info) {
    G = id; info = null; app.innerHTML = '<div class="wrap mut">Loading</div>';
    try { info = await api('/api/guilds/' + id); }
    catch (e) { if (!sid) return; app.innerHTML = `<div class="wrap"><h1>Cannot open this server</h1><p class="mut">${esc(e.message)}</p><p><a class="btn" href="#/">Back</a> <a class="btn pri" href="${API}/invite?guild_id=${id}">Add bot</a></p></div>`; return; }
  }
  if (!VIEWS[v]) v = 'overview';
  app.innerHTML = `<div class="shell"><aside><div class="sh">${icon(info)}<b>${esc(info.name)}</b></div><nav>${NAV.map(n => `<a href="#/g/${id}/${n.toLowerCase()}" class="${n.toLowerCase() === v ? 'on' : ''}">${n}</a>`).join('')}</nav><div class="sf"><a href="#/">All servers</a><a href="#" id="lo">Log out</a></div></aside><main id="m"><p class="mut">Loading</p></main></div>`;
  $('#lo').onclick = e => { e.preventDefault(); logout(); };
  await act(() => VIEWS[v]($('#m')));
}

/* ---------- views ---------- */
const CP = ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'AddReactions', 'AttachFiles', 'EmbedLinks', 'MentionEveryone', 'ManageMessages', 'Connect', 'Speak'];
const VER = ['None', 'Low', 'Medium', 'High', 'Highest'];
const roleForm = r => `<label>Name<input name="name" required maxlength="100" value="${esc(r?.name)}"></label><label>Color<input type="color" name="color" value="${r && r.color !== '#000000' ? r.color : '#99aab5'}"></label><label class="ck"><input type="checkbox" name="hoist" ${r?.hoist ? 'checked' : ''}>Show members separately</label><label class="ck"><input type="checkbox" name="mentionable" ${r?.mentionable ? 'checked' : ''}>Allow anyone to mention this role</label><h4>Permissions</h4><div class="pg">${info.allPerms.map(p => `<label class="ck"><input type="checkbox" name="perm" value="${p}" ${r?.perms.includes(p) ? 'checked' : ''}>${pretty(p)}</label>`).join('')}</div>`;
const roleBody = fd => ({ name: fd.get('name'), color: fd.get('color'), hoist: fd.has('hoist'), mentionable: fd.has('mentionable'), perms: fd.getAll('perm') });

const VIEWS = {
  async overview(m) {
    const i = info = await api('/api/guilds/' + G), st = (a, b) => `<div class="card st"><span class="mut">${a}</span><b>${b}</b></div>`;
    m.innerHTML = head('Overview') + `<div class="grid4">${st('Members', i.members)}${st('Channels', i.channels)}${st('Roles', i.roles)}${st('Boost level', i.boost)}</div><div class="card"><dl><dt>Server ID</dt><dd>${i.id}</dd><dt>Created</dt><dd>${new Date(i.created).toLocaleDateString()}</dd><dt>Verification level</dt><dd>${VER[i.verification] ?? i.verification}</dd><dt>Your access</dt><dd>${i.you}</dd></dl></div>`;
  },

  async channels(m) {
    const d = await api(`/api/guilds/${G}/channels`), cs = d.channels.sort((a, b) => a.position - b.position), cats = cs.filter(c => c.type === 4);
    const TN = { 0: 'Text', 2: 'Voice', 4: 'Category' };
    const row = c => `<div class="row"><span class="tag">${TN[c.type] || 'Other'}</span><b>${esc(c.name)}</b><span class="sp"></span><button class="btn" data-e="${c.id}">Edit</button><button class="btn" data-p="${c.id}">Permissions</button><button class="btn bad" data-d="${c.id}">Delete</button></div>`;
    m.innerHTML = head('Channels', '<button class="btn" id="nc">New category</button><button class="btn pri" id="nch">New channel</button>') +
      `<div class="card list">${cs.filter(c => c.type !== 4 && !c.parentId).map(row).join('')}${cats.map(c => row(c) + `<div class="kids">${cs.filter(k => k.parentId === c.id).map(row).join('')}</div>`).join('') || ''}</div>`;
    const form = c => `<label>Name<input name="name" required maxlength="100" value="${esc(c?.name)}"></label>${!c || c.type === 0 ? `<label>Topic<input name="topic" maxlength="1024" value="${esc(c?.topic)}"></label>` : ''}${!c || c.type !== 4 ? `<label>Category<select name="parentId"><option value="">None</option>${cats.map(k => `<option value="${k.id}" ${c?.parentId === k.id ? 'selected' : ''}>${esc(k.name)}</option>`).join('')}</select></label>` : ''}`;
    $('#nch').onclick = () => modal('New channel', `<label>Type<select name="type"><option value="text">Text</option><option value="voice">Voice</option></select></label>` + form(), 'Create', async fd => { await post(`/api/guilds/${G}/channels`, Object.fromEntries(fd)); reload(); });
    $('#nc').onclick = () => modal('New category', '<label>Name<input name="name" required maxlength="100"></label>', 'Create', async fd => { await post(`/api/guilds/${G}/channels`, { type: 'category', name: fd.get('name') }); reload(); });
    m.onclick = e => {
      const b = e.target.closest('button'); if (!b) return; const c = cs.find(x => x.id === (b.dataset.e || b.dataset.p || b.dataset.d)); if (!c) return;
      if (b.dataset.e) modal('Edit ' + c.name, form(c), 'Save', async fd => { await api(`/api/guilds/${G}/channels/${c.id}`, 'PATCH', Object.fromEntries(fd)); reload(); });
      if (b.dataset.d) confirmBox(`Delete <b>${esc(c.name)}</b>${c.type === 4 ? ' (channels inside it stay, but become uncategorised)' : ''}? This cannot be undone.`, 'Delete', async () => { await api(`/api/guilds/${G}/channels/${c.id}`, 'DELETE'); reload(); });
      if (b.dataset.p) act(async () => {
        const ov = await api(`/api/guilds/${G}/channels/${c.id}/overwrites`), roles = d.roles.sort((a, b) => b.position - a.position);
        const f = modal('Permissions: ' + c.name, `<label>Role<select name="role">${roles.map(r => `<option value="${r.id}">${r.everyone ? '@everyone' : esc(r.name)}</option>`).join('')}</select></label><div class="pg">${CP.map(k => `<label>${pretty(k)}<select name="p_${k}"><option value="">Inherit</option><option value="1">Allow</option><option value="0">Deny</option></select></label>`).join('')}</div>`, 'Save', async fd => {
          const perms = {}; CP.forEach(k => { const v = fd.get('p_' + k); perms[k] = v === '' ? null : v === '1'; });
          await api(`/api/guilds/${G}/channels/${c.id}/overwrites/${fd.get('role')}`, 'PUT', { perms }); toast('Permissions saved');
        });
        const fill = () => { const o = ov[f.role.value] || {}; CP.forEach(k => f['p_' + k].value = k in o ? (o[k] ? '1' : '0') : ''); };
        f.role.onchange = fill; fill();
      });
    };
  },

  async roles(m) {
    const rs = await api(`/api/guilds/${G}/roles`);
    m.innerHTML = head('Roles', '<button class="btn pri" id="nr">New role</button>') + `<div class="card list">${rs.map(r => `<div class="row"><i class="dot" style="background:${r.color === '#000000' ? '#4f545c' : r.color}"></i><b>${r.everyone ? '@everyone' : esc(r.name)}</b><span class="mut">${r.perms.length} permissions</span><span class="sp"></span>${r.everyone || r.managed ? '<span class="mut">Locked</span>' : `<button class="btn" data-u="${r.id}">Up</button><button class="btn" data-n="${r.id}">Down</button><button class="btn" data-e="${r.id}">Edit</button><button class="btn bad" data-d="${r.id}">Delete</button>`}</div>`).join('')}</div><p class="mut">Roles are listed from highest to lowest.</p>`;
    $('#nr').onclick = () => modal('New role', roleForm(), 'Create', async fd => { await post(`/api/guilds/${G}/roles`, roleBody(fd)); reload(); });
    m.onclick = e => {
      const b = e.target.closest('button'); if (!b) return; const id = b.dataset.u || b.dataset.n || b.dataset.e || b.dataset.d, r = rs.find(x => x.id === id); if (!r) return;
      if (b.dataset.u || b.dataset.n) act(async () => { await post(`/api/guilds/${G}/roles/${id}/move`, { dir: b.dataset.u ? 'up' : 'down' }); reload(); });
      if (b.dataset.e) modal('Edit ' + r.name, roleForm(r), 'Save', async fd => { await api(`/api/guilds/${G}/roles/${id}`, 'PATCH', roleBody(fd)); reload(); });
      if (b.dataset.d) confirmBox(`Delete the role <b>${esc(r.name)}</b>? Members lose it immediately.`, 'Delete', async () => { await api(`/api/guilds/${G}/roles/${id}`, 'DELETE'); reload(); });
    };
  },

  async members(m) {
    const [rs, L] = await Promise.all([api(`/api/guilds/${G}/roles`), api(`/api/guilds/${G}/ranks`)]), rm = Object.fromEntries(rs.map(r => [r.id, r]));
    m.innerHTML = head('Members') + `<form class="srch" id="sf"><input name="q" placeholder="Search by name"><button class="btn pri">Search</button></form><div class="card list" id="ml"></div>`;
    let list = [];
    const rank = x => { let i = -1; L.forEach((id, k) => x.roles.includes(id) && (i = k)); return i; };
    const draw = () => {
      $('#ml').innerHTML = list.map(x => { const k = rank(x); return `<div class="row"><img class="av" src="${esc(x.avatar)}" alt=""><div class="grow"><b>${esc(x.name)}</b><div class="chips">${x.roles.map(i => rm[i] ? `<span class="chip" style="border-color:${rm[i].color === '#000000' ? '#4f545c' : rm[i].color}">${esc(rm[i].name)}</span>` : '').join('')}</div></div>${L.length ? `<span class="mut">${k >= 0 ? esc(rm[L[k]].name) : 'Unranked'}</span><button class="btn" data-dn="${x.id}" ${k < 0 ? 'disabled' : ''}>Demote</button><button class="btn" data-up="${x.id}" ${k >= L.length - 1 ? 'disabled' : ''}>Promote</button>` : ''}<button class="btn" data-r="${x.id}">Roles</button></div>`; }).join('') || '<p class="mut pad">No members found.</p>';
    };
    const load = async q => { list = await api(`/api/guilds/${G}/members?q=${encodeURIComponent(q || '')}`); draw(); };
    $('#sf').onsubmit = e => { e.preventDefault(); act(() => load(new FormData(e.target).get('q'))); };
    await load('');
    $('#ml').onclick = e => {
      const b = e.target.closest('button'); if (!b) return; const id = b.dataset.up || b.dataset.dn || b.dataset.r, x = list.find(y => y.id === id); if (!x) return;
      const set = i => act(async () => { const u = await post(`/api/guilds/${G}/members/${id}/rank`, { index: i }); list = list.map(y => y.id === id ? u : y); draw(); });
      if (b.dataset.up) set(rank(x) + 1);
      if (b.dataset.dn) set(rank(x) - 1);
      if (b.dataset.r) {
        const own = rs.filter(r => !r.everyone && !r.managed);
        modal('Roles for ' + x.name, `<div class="pg">${own.map(r => `<label class="ck"><input type="checkbox" name="r" value="${r.id}" ${x.roles.includes(r.id) ? 'checked' : ''}>${esc(r.name)}</label>`).join('')}</div>`, 'Save', async fd => {
          const want = fd.getAll('r'); let u = x;
          for (const r of own) { const has = x.roles.includes(r.id), w = want.includes(r.id); if (has !== w) u = await api(`/api/guilds/${G}/members/${id}/roles/${r.id}`, w ? 'PUT' : 'DELETE'); }
          list = list.map(y => y.id === id ? u : y); draw();
        });
      }
    };
  },

  async ranks(m) {
    const [rs, L] = await Promise.all([api(`/api/guilds/${G}/roles`), api(`/api/guilds/${G}/ranks`)]), rm = Object.fromEntries(rs.map(r => [r.id, r]));
    const save = ids => act(async () => { await api(`/api/guilds/${G}/ranks`, 'PUT', { ids }); reload(); });
    const free = rs.filter(r => !r.everyone && !r.managed && !L.includes(r.id));
    m.innerHTML = head('Ranks', '<button class="btn pri" id="cr">Create rank structure</button>') + `<p class="mut">A rank ladder is an ordered list of roles. Members hold one rank at a time and can be promoted or demoted from the Members page. Highest rank is at the top.</p><div class="card list">${[...L].reverse().map((id, n) => `<div class="row"><span class="tag">${L.length - n}</span><b>${esc(rm[id].name)}</b><span class="sp"></span><button class="btn" data-u="${id}">Move up</button><button class="btn" data-n="${id}">Move down</button><button class="btn bad" data-x="${id}">Remove</button></div>`).join('') || '<p class="mut pad">No ranks yet. Create a structure or add existing roles below.</p>'}</div>${free.length ? `<form class="srch" id="af"><select name="r">${free.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select><button class="btn">Add existing role as top rank</button></form>` : ''}`;
    $('#cr').onclick = () => modal('Create rank structure', '<label>Rank names, one per line, lowest first<textarea name="names" rows="6" required placeholder="Recruit&#10;Member&#10;Officer&#10;Leader"></textarea></label><label>Color<input type="color" name="color" value="#5865f2"></label>', 'Create', async fd => { await post(`/api/guilds/${G}/ranks/create`, { names: fd.get('names').split('\n').map(s => s.trim()).filter(Boolean), color: fd.get('color') }); reload(); });
    if ($('#af')) $('#af').onsubmit = e => { e.preventDefault(); save([...L, new FormData(e.target).get('r')]); };
    m.onclick = e => {
      const b = e.target.closest('button'); if (!b) return; const id = b.dataset.u || b.dataset.n || b.dataset.x; if (!id) return; const i = L.indexOf(id), a = [...L];
      if (b.dataset.x) return confirmBox(`Remove <b>${esc(rm[id].name)}</b> from the ladder? The role itself is kept.`, 'Remove', async () => { await api(`/api/guilds/${G}/ranks`, 'PUT', { ids: L.filter(x => x !== id) }); reload(); });
      const j = b.dataset.u ? i + 1 : i - 1; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; save(a);
    };
  },

  async templates(m) {
    const t = await api('/api/templates');
    m.innerHTML = head('Templates') + `<p class="mut">Applying a template adds roles, categories and channels. Nothing existing is deleted.</p><div class="grid">${t.map(x => `<div class="card"><h3>${esc(x.name)}</h3><p class="mut">${esc(x.info)}</p><p><b>Roles:</b> ${x.roles.map(esc).join(', ')}</p><p><b>Categories:</b> ${x.cats.map(esc).join(', ')}</p><button class="btn pri" data-t="${x.key}">Apply template</button></div>`).join('')}</div>`;
    m.onclick = e => { const b = e.target.closest('[data-t]'); if (!b) return; const x = t.find(y => y.key === b.dataset.t); confirmBox(`Apply the <b>${esc(x.name)}</b> template to ${esc(info.name)}? It will create roles, categories and channels.`, 'Apply', async () => { await post(`/api/guilds/${G}/templates/${x.key}`); toast('Template applied'); }); };
  },

  async settings(m) {
    const i = info = await api('/api/guilds/' + G);
    m.innerHTML = head('Settings') + `<form class="card form" id="sf"><label>Server name<input name="name" required maxlength="100" value="${esc(i.name)}"></label><label>Verification level<select name="verification">${VER.map((v, k) => `<option value="${k}" ${k === i.verification ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label>System messages channel<select name="systemChannelId"><option value="">None</option>${i.textChannels.map(c => `<option value="${c.id}" ${c.id === i.systemChannelId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label><div><button class="btn pri">Save changes</button></div></form>`;
    $('#sf').onsubmit = e => { e.preventDefault(); act(async () => { await api(`/api/guilds/${G}/settings`, 'PATCH', Object.fromEntries(new FormData(e.target))); toast('Settings saved'); info = null; reload(); }); };
  },
};

/* ---------- router ---------- */
async function route() {
  if (!sid) return login();
  if (!me) { try { me = await api('/api/me'); } catch { return login(); } }
  const p = location.hash.replace(/^#\/?/, '').split('/');
  if (p[0] === 'g' && p[1]) return guild(p[1], p[2] || 'overview');
  return servers();
}
window.addEventListener('hashchange', route);
route();
})();
