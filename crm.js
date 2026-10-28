// Owner CRM: KPIs, revenue chart, channel mix, occupancy, approvals, vendor table + export.
(() => {
  const { DAYS, ZONES, SPACES, money, esc } = EWM;
  const $ = (id) => document.getElementById(id);
  let store = EWM.load();
  const state = { range: 30 };
  const charts = {};

  const COLORS = { monthly: '#e2572b', reserved: '#f4bf55', walkin: '#8cc7b2', admission: '#c9d6e6' };
  const todayIso = EWM.todayIso();
  const PAID = (b) => b.status !== 'Cancelled' && b.status !== 'Under review';

  function rangeDays() {
    const end = EWM.today(); const start = new Date(end); start.setDate(start.getDate() - state.range);
    return { from: EWM.iso(start), to: todayIso };
  }
  const inRange = (ds, r) => ds >= r.from && ds <= r.to;
  // Visitors = historic seeded counts + QR tickets scanned in (paid online, cash at gate, or sold at gate).
  const usedTickets = (ds) => (store.tickets || []).filter((t) => t.date === ds && t.usedAt);
  const gateCount = (ds) => (store.admissions[ds] || 0) + usedTickets(ds).length;
  const gateCash = (ds) => {
    const p = DAYS[EWM.parse(ds).getDay()].admission;
    return (store.admissions[ds] || 0) * p + (store.tickets || []).filter((t) => t.date === ds && t.paid !== false).reduce((s, t) => s + t.price, 0);
  };

  // ---------- range chips ----------
  function renderRange() {
    $('range').innerHTML = [[7, '7 days'], [30, '30 days'], [45, '45 days']].map(([v, l]) => `<button class="chip ${state.range === v ? 'on' : ''}" data-v="${v}">${l}</button>`).join('');
    $('range').querySelectorAll('button').forEach((b) => b.onclick = () => { state.range = +b.dataset.v; render(); });
  }

  // ---------- KPIs ----------
  function renderKpis() {
    const r = rangeDays();
    const past = store.bookings.filter((b) => inRange(b.date, r) && PAID(b));
    const dates = [...new Set(past.map((b) => b.date))];
    const rent = past.reduce((s, b) => s + b.amount, 0);
    const gateRev = dates.reduce((s, d) => s + gateCash(d), 0);
    const visitors = dates.reduce((s, d) => s + gateCount(d), 0);
    const occ = dates.length ? Math.round((past.length / (dates.length * SPACES.length)) * 100) : 0;
    const absent = past.filter((b) => b.status === 'Absent').length;
    const review = store.bookings.filter((b) => b.status === 'Under review' && b.date >= todayIso);
    const pending = new Set(review.map((b) => b.conf || b.id)).size;
    const k = [
      ['Revenue', money(rent + gateRev), `${money(rent)} rent · ${money(gateRev)} gate`],
      ['Avg occupancy', occ + '%', `${dates.length} market days`],
      ['Visitors', visitors.toLocaleString(), 'counted at the gate'],
      ['Absences', absent, absent ? 'check absentee credits' : 'none'],
      ['To review', pending, pending ? 'applications waiting' : 'all clear'],
    ];
    $('kpis').innerHTML = k.map(([l, v, d], i) => `<div class="card kpi"><div class="l">${l}</div><div class="v" style="${i === 4 && pending ? 'color:var(--amber)' : ''}">${v}</div><div class="d muted">${d}</div></div>`).join('');
  }

  // ---------- revenue chart ----------
  function renderRevenue() {
    const r = rangeDays();
    const dates = [...new Set(store.bookings.filter((b) => inRange(b.date, r)).map((b) => b.date))].sort();
    const sum = (ds, type) => store.bookings.filter((b) => b.date === ds && b.type === type && PAID(b)).reduce((s, b) => s + b.amount, 0);
    const data = {
      labels: dates.map((d) => EWM.nice(d, { month: 'numeric', day: 'numeric' }) + ' ' + DAYS[EWM.parse(d).getDay()].short[0]),
      datasets: [
        { label: 'Monthly', data: dates.map((d) => sum(d, 'monthly')), backgroundColor: COLORS.monthly },
        { label: 'Reserved', data: dates.map((d) => sum(d, 'reserved')), backgroundColor: COLORS.reserved },
        { label: 'Walk-in', data: dates.map((d) => sum(d, 'walkin')), backgroundColor: COLORS.walkin },
        { label: 'Gate', data: dates.map(gateCash), backgroundColor: COLORS.admission },
      ],
    };
    $('revNote').textContent = 'Monthly rent spread across its market days';
    charts.rev?.destroy();
    charts.rev = new Chart($('revChart'), {
      type: 'bar', data,
      options: {
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${money(c.raw)}` } } },
        scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { callback: (v) => '$' + v.toLocaleString() }, grid: { color: '#eee' } } },
        borderRadius: 4,
      },
    });
  }

  // ---------- channel doughnut ----------
  function renderChannels() {
    const end = new Date(EWM.today()); end.setDate(end.getDate() + 30);
    const up = store.bookings.filter((b) => b.date >= todayIso && b.date <= EWM.iso(end) && b.type !== 'monthly');
    const ch = { online: 0, phone: 0, office: 0 };
    up.forEach((b) => { if (b.channel in ch) ch[b.channel]++; });
    charts.ch?.destroy();
    charts.ch = new Chart($('chanChart'), {
      type: 'doughnut',
      data: { labels: ['Website', 'Phone agent', 'Office'], datasets: [{ data: [ch.online, ch.phone, ch.office], backgroundColor: ['#e2572b', '#f4bf55', '#c9d6e6'], borderWidth: 0 }] },
      options: { maintainAspectRatio: false, cutout: '68%', plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } } } },
    });
  }

  // ---------- occupancy heat map ----------
  function renderOccupancy() {
    const ds = EWM.nextMarketDay();
    const booked = new Set(store.bookings.filter((b) => b.date === ds && b.status !== 'Cancelled').map((b) => b.space));
    const base = { premium: '#f4bf55', shaded: '#8cc7b2', open: '#9fb4cf' };
    $('occDay').textContent = EWM.nice(ds, { weekday: 'long', month: 'short', day: 'numeric' });
    $('heat').innerHTML = SPACES.map((s) => `<i title="${s.code}${booked.has(s.code) ? ' · booked' : ' · open'}" style="background:${booked.has(s.code) ? base[s.zone] : '#efece5'}"></i>`).join('');
    $('occPct').textContent = Math.round((booked.size / SPACES.length) * 100) + '% booked';
    $('occZones').innerHTML = Object.keys(ZONES).map((z) => {
      const all = SPACES.filter((s) => s.zone === z); const n = all.filter((s) => booked.has(s.code)).length;
      return `<span><b style="color:var(--ink)">${ZONES[z].label}</b> ${n}/${all.length}</span>`;
    }).join('') + `<span class="spacer"></span><span>${SPACES.length - booked.size} open to sell</span>`;
  }

  // ---------- applications ----------
  function renderApps() {
    const vb = Object.fromEntries(store.vendors.map((v) => [v.id, v]));
    const groups = {};
    store.bookings.filter((b) => b.status === 'Under review' && b.date >= todayIso).forEach((b) => {
      const k = b.conf || b.id; (groups[k] = groups[k] || []).push(b);
    });
    const list = Object.entries(groups).sort((a, b) => (b[1][0].created || 0) - (a[1][0].created || 0));
    $('appCount').textContent = list.length;
    if (!list.length) { $('apps').innerHTML = '<p class="muted">Nothing waiting. 🎉</p>'; return; }
    $('apps').innerHTML = list.slice(0, 6).map(([k, bs]) => {
      const b = bs[0]; const v = vb[b.vendorId] || {};
      const when = bs.length > 1 ? `${bs.length} ${DAYS[b.dow].short}s from ${EWM.nice(b.date, { month: 'short', day: 'numeric' })}` : EWM.nice(b.date);
      return `<div class="app">
        <div style="flex:1;min-width:0">
          <b>${esc(v.name)}</b> ${b.created ? '<span class="badge accent">NEW</span>' : ''}<br>
          <span class="small muted">${b.space} · ${when} · ${money(bs.reduce((s, x) => s + x.amount, 0))} paid</span>
        </div>
        <button class="btn sm" data-view="${v.id}">Docs</button>
        <button class="btn sm green" data-ok="${k}">Approve</button>
        <button class="btn sm red" data-no="${k}">✕</button>
      </div>`;
    }).join('');
    const act = (k, status) => {
      store.bookings.forEach((b) => { if ((b.conf || b.id) === k) b.status = status; });
      const b = store.bookings.find((x) => (x.conf || x.id) === k);
      const v = store.vendors.find((x) => x.id === b.vendorId);
      if (status === 'Confirmed' && v && v.permit === 'review') v.permit = 'valid';
      EWM.save(store);
      EWM.toast(status === 'Confirmed' ? `Approved · ${v?.name} gets a text` : `Declined · refund issued to ${v?.name}`);
      render();
    };
    $('apps').querySelectorAll('[data-ok]').forEach((x) => x.onclick = () => act(x.dataset.ok, 'Confirmed'));
    $('apps').querySelectorAll('[data-no]').forEach((x) => x.onclick = () => act(x.dataset.no, 'Cancelled'));
    $('apps').querySelectorAll('[data-view]').forEach((x) => x.onclick = () => openVendor(x.dataset.view));
  }

  // ---------- vendor table ----------
  function vendorRows() {
    const by = {};
    store.bookings.forEach((b) => { (by[b.vendorId] = by[b.vendorId] || []).push(b); });
    return store.vendors.map((v) => {
      const bs = by[v.id] || [];
      const past = bs.filter((b) => b.date <= todayIso && PAID(b));
      const future = bs.filter((b) => b.date > todayIso && b.status !== 'Cancelled').sort((a, b) => a.date.localeCompare(b.date));
      return {
        v, bookings: bs,
        visits: past.filter((b) => b.status !== 'Absent').length,
        absent: past.filter((b) => b.status === 'Absent').length,
        spent: past.reduce((s, b) => s + b.amount, 0),
        last: past.map((b) => b.date).sort().pop() || '',
        next: future[0],
      };
    });
  }
  const permitBadge = (p) => ({ valid: '<span class="badge green">Valid</span>', expiring: '<span class="badge amber">Expiring</span>', missing: '<span class="badge red">Missing</span>', review: '<span class="badge accent">In review</span>' }[p] || '');

  function filtered() {
    const q = $('vq').value.trim().toLowerCase(); const cat = $('vcat').value; const pm = $('vpermit').value;
    return vendorRows().filter(({ v }) =>
      (!q || [v.name, v.business, v.phone, v.id].some((x) => String(x || '').toLowerCase().includes(q)))
      && (!cat || v.category === cat) && (!pm || v.permit === pm))
      .sort((a, b) => b.spent - a.spent);
  }

  function renderVendors() {
    const cats = [...new Set(store.vendors.map((v) => v.category))].sort();
    if ($('vcat').options.length <= 1) $('vcat').innerHTML += cats.map((c) => `<option>${esc(c)}</option>`).join('');
    const rows = filtered();
    $('vrows').innerHTML = rows.map((r) => `
      <tr class="click" data-id="${r.v.id}">
        <td><b>${esc(r.v.name)}</b><br><span class="small muted">${esc(r.v.business)} · ${esc(r.v.phone)}</span></td>
        <td>${esc(r.v.category)}</td>
        <td>${permitBadge(r.v.permit)}</td>
        <td>${r.visits}</td>
        <td>${r.absent ? `<span style="color:var(--red);font-weight:700">${r.absent}</span>` : '0'}</td>
        <td><b>${money(r.spent)}</b></td>
        <td>${r.last ? EWM.nice(r.last, { month: 'short', day: 'numeric' }) : '—'}</td>
        <td>${r.next ? `${r.next.space} · ${EWM.nice(r.next.date, { month: 'short', day: 'numeric' })}` : '<span class="muted">—</span>'}</td>
      </tr>`).join('');
    $('vcount').textContent = `${rows.length} of ${store.vendors.length} vendors`;
    $('vrows').querySelectorAll('tr').forEach((tr) => tr.onclick = () => openVendor(tr.dataset.id));
  }
  ['vq', 'vcat', 'vpermit'].forEach((id) => { $(id).oninput = renderVendors; });

  $('export').onclick = () => {
    const head = ['Vendor ID', 'Name', 'Business', 'Phone', 'Email', 'Category', 'Language', 'Permit', 'Visits', 'Absences', 'Total spent', 'Last seen', 'Next booking'];
    const lines = filtered().map((r) => [r.v.id, r.v.name, r.v.business, r.v.phone, r.v.email, r.v.category, r.v.lang, r.v.permit, r.visits, r.absent, r.spent, r.last, r.next ? `${r.next.space} ${r.next.date}` : '']);
    const csv = [head, ...lines].map((row) => row.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `vendors-${todayIso}.csv`; a.click();
    EWM.toast(`Exported ${lines.length} vendors`);
  };

  // ---------- vendor drawer ----------
  function closeDrawer() { $('drawer').classList.remove('show'); $('scrim').classList.remove('show'); }
  $('scrim').onclick = closeDrawer;
  function openVendor(id) {
    const r = vendorRows().find((x) => x.v.id === id); if (!r) return;
    const v = r.v;
    const hist = r.bookings.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14);
    const st = (b) => b.status === 'Absent' ? 'red' : b.status === 'Under review' ? 'amber' : b.date > todayIso ? 'accent' : 'green';
    $('drawer').innerHTML = `
      <div class="row"><span class="badge">${v.id}</span><span class="spacer"></span><button class="btn sm" id="dx">Close</button></div>
      <h2 style="margin-top:14px">${esc(v.name)}</h2>
      <p class="muted">${esc(v.business)} · ${esc(v.category)} · since ${v.since}</p>
      <div class="grid g3" style="margin:16px 0">
        <div class="card kpi" style="padding:14px"><div class="l">Spent</div><div class="v" style="font-size:1.3rem">${money(r.spent)}</div></div>
        <div class="card kpi" style="padding:14px"><div class="l">Visits</div><div class="v" style="font-size:1.3rem">${r.visits}</div></div>
        <div class="card kpi" style="padding:14px"><div class="l">Absent</div><div class="v" style="font-size:1.3rem">${r.absent}</div></div>
      </div>
      <h3>Contact</h3>
      <p>📞 ${esc(v.phone || '—')}<br>✉️ ${esc(v.email || '—')}<br>🗣 ${esc(v.lang)}${v.address ? `<br>🏠 ${esc(v.address)}` : ''}${v.website ? `<br>🌐 <a href="https://${esc(v.website)}" target="_blank">${esc(v.website)}</a>` : ''}${v.social ? ` · ${esc(v.social)}` : ''}</p>
      ${v.describe ? `<h3>What they sell</h3><p>${(v.goods || []).map((g) => `<span class="badge">${esc(g)}</span>`).join(' ')}<br>${esc(v.describe)}${v.priceRange ? `<br><span class="small muted">Prices ${esc(v.priceRange)}</span>` : ''}</p>` : ''}
      ${v.notes ? `<h3>Vendor note</h3><p class="note" style="background:var(--amber-soft);padding:10px 12px;border-radius:10px">${esc(v.notes)}</p>` : ''}
      <h3>Documents</h3>
      <p>Seller's permit ${permitBadge(v.permit)}${v.permitNo ? ` <span class="small muted">#${esc(v.permitNo)}</span>` : ''}${v.exemptReason ? `<br><span class="small muted">Exempt: ${esc(v.exemptReason)}</span>` : ''}<br>
      ${v.docs ? Object.values(v.docs).map((f) => `<span class="small">📎 ${esc(f)}</span>`).join('<br>') : '<span class="small muted">Photo ID on file</span>'}
      ${v.coiExp ? `<br><span class="small muted">Insurance expires ${esc(v.coiExp)}</span>` : ''}</p>
      ${(store.outbox || []).some((m) => m.vendorId === v.id) ? `<h3>Messages sent</h3><p class="small">${store.outbox.filter((m) => m.vendorId === v.id).map((m) => `${m.channel === 'sms' ? '💬' : '✉️'} ${esc(m.subject)} <span class="muted">· ${new Date(m.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>`).join('<br>')}</p>` : ''}
      <h3>History</h3>
      <table class="t">${hist.map((b) => `<tr><td>${EWM.nice(b.date, { month: 'short', day: 'numeric' })}</td><td>${b.space}</td><td>${b.type}</td><td><span class="badge ${st(b)}">${b.status}</span></td><td style="text-align:right">${money(b.amount)}</td></tr>`).join('') || '<tr><td class="muted">No bookings yet</td></tr>'}</table>
      <div class="grid g2" style="margin-top:18px"><a class="btn" href="sms:${esc(v.phone)}">💬 Text</a><a class="btn" href="tel:${esc(v.phone)}">📞 Call</a></div>`;
    $('drawer').classList.add('show'); $('scrim').classList.add('show');
    $('dx').onclick = closeDrawer;
  }

  function render() {
    store = EWM.load();
    renderRange(); renderKpis(); renderRevenue(); renderChannels(); renderOccupancy(); renderApps(); renderVendors();
  }
  if (window.Chart) { Chart.defaults.font.family = 'Inter, system-ui, sans-serif'; Chart.defaults.color = '#6d6a63'; }
  render();
})();
