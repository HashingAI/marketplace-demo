// Vendor check-in.
// Each row: space + business + person. One button on the right does the one
// thing that row needs next:
//   owes money   -> "Collect $X"  (records cash/card, then checks in)
//   already paid -> "Check in"
//   here         -> "✓ Here 8:42"  (no button)
// Nobody marks absences by hand. After the release time, vendors who have not
// arrived are offered as one batch release; past days count them as no-shows.
// Tap a row for the full details and the rare actions (move space, undo, ...).
(() => {
  const { DAYS, ZONES, SPACES, money, esc } = EWM;
  const $ = (id) => document.getElementById(id);
  let store = EWM.load();

  const enabled = (ds) => {
    if (!(EWM.parse(ds).getDay() in DAYS)) return false;
    const diff = (EWM.parse(ds) - EWM.today()) / 864e5;
    return diff >= -60 && diff <= 45;
  };
  const state = { date: EWM.nextMarketDay(), tab: 'todo', q: '', simulateLate: false };

  // ---------- helpers ----------
  const vendors = () => Object.fromEntries(store.vendors.map((v) => [v.id, v]));
  const dayList = () => store.bookings.filter((b) => b.date === state.date && b.status !== 'Cancelled');
  const isHere = (b) => b.status === 'Checked in' || b.status === 'Completed';
  const isPast = () => state.date < EWM.todayIso();
  const isGone = (b) => b.status === 'Absent' || (isPast() && !isHere(b));
  const paid = (b) => EWM.isPaid(b);
  const owes = (b) => !paid(b) && !isGone(b);
  const docProblem = (v) => v && (v.permit === 'missing' || v.permit === 'review');
  const openHour = (ds) => DAYS[EWM.parse(ds).getDay()].hours.split(' – ')[0];
  // Release time = 2 hours after the gate opens.
  function releaseTime(ds) {
    const m = openHour(ds).match(/(\d+):(\d+)(am|pm)/); let h = +m[1] % 12; if (m[3] === 'pm') h += 12;
    const d = EWM.parse(ds); d.setHours(h + 2, +m[2], 0, 0); return d;
  }
  const fmtTime = (t) => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const pastRelease = () => state.date === EWM.todayIso() && (state.simulateLate || Date.now() > releaseTime(state.date));

  function save(msg) { EWM.save(store); if (msg) EWM.toast(msg); render(); }
  function checkIn(b, extra = {}) { Object.assign(b, { prev: b.status, status: 'Checked in', at: Date.now() }, extra); }

  // ---------- date header ----------
  function renderDate() {
    const d = EWM.parse(state.date);
    const t = state.date === EWM.todayIso() ? 'Today' : isPast() ? 'Past' : 'Upcoming';
    $('dateBtn').innerHTML = `📅 ${d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} <span class="sub">${t}</span> <span class="muted">▾</span>`;
  }
  $('dateBtn').onclick = (e) => {
    e.stopPropagation();
    EWM.datePicker($('dateBtn'), {
      value: state.date, enabled,
      mark: (ds) => { const n = store.bookings.filter((b) => b.date === ds && b.status !== 'Cancelled').length; return n ? n : ''; },
      onPick: (ds) => { state.date = ds; state.tab = 'todo'; render(); },
    });
  };
  const step = (dir) => { let d = state.date; for (let i = 0; i < 10; i++) { const x = EWM.parse(d); x.setDate(x.getDate() + dir); d = EWM.iso(x); if (enabled(d)) { state.date = d; state.tab = 'todo'; render(); return; } } };
  $('prev').onclick = () => step(-1);
  $('next').onclick = () => step(1);

  // ---------- tabs = the only summary on the page ----------
  function renderTabs(all) {
    const counts = {
      todo: all.filter((b) => !isHere(b) && !isGone(b)).length,
      here: all.filter(isHere).length,
      owe: all.filter(owes).length,
      gone: all.filter(isGone).length,
      all: all.length,
    };
    const T = [['todo', 'Not here yet'], ['here', 'Here'], ['owe', 'Owes money', 'warn'], ['gone', 'No-show'], ['all', 'All']];
    $('tabs').innerHTML = T.filter(([k]) => k !== 'gone' || counts.gone).map(([k, l, c]) =>
      `<button class="tab ${state.tab === k ? 'on' : ''} ${c || ''}" data-t="${k}">${l} <span class="n">${counts[k]}</span></button>`).join('');
    $('tabs').querySelectorAll('button').forEach((b) => b.onclick = () => { state.tab = b.dataset.t; render(); });
    $('bar').style.width = all.length ? Math.round((counts.here / all.length) * 100) + '%' : '0';
  }

  // ---------- release banner ----------
  function renderBanner(all) {
    const late = all.filter((b) => !isHere(b) && !isGone(b) && b.type !== 'walkin');
    if (state.date !== EWM.todayIso()) {
      $('banner').innerHTML = isPast() ? '' : `<div class="banner" style="background:#f1efe9;color:var(--muted)">Upcoming day · check-in opens ${openHour(state.date)}.</div>`;
      return;
    }
    if (!pastRelease()) {
      $('banner').innerHTML = `<div class="banner" style="background:#f1efe9;color:var(--muted)">Spaces are held until <b style="color:var(--ink)">${fmtTime(releaseTime(state.date))}</b>. After that you can release no-shows to walk-ins. <span class="spacer"></span><button class="btn sm" id="sim">Demo: jump past ${fmtTime(releaseTime(state.date))}</button></div>`;
      $('sim').onclick = () => { state.simulateLate = true; render(); };
      return;
    }
    if (!late.length) { $('banner').innerHTML = ''; return; }
    $('banner').innerHTML = `<div class="banner">⏰ <span>It's past <b>${fmtTime(releaseTime(state.date))}</b>. <b>${late.length}</b> reserved vendor${late.length > 1 ? 's are' : ' is'} not here.</span><span class="spacer"></span><button class="btn sm dark" id="rel">Release ${late.length} space${late.length > 1 ? 's' : ''} to walk-ins</button></div>`;
    $('rel').onclick = () => {
      late.forEach((b) => { b.prev = b.status; b.status = 'Absent'; b.releasedAt = Date.now(); });
      save(`${late.length} spaces released · monthly vendors get absentee credit by policy`);
    };
  }

  // ---------- list ----------
  function renderList(all) {
    const vb = vendors();
    let list = all;
    if (state.tab === 'todo') list = list.filter((b) => !isHere(b) && !isGone(b));
    if (state.tab === 'here') list = list.filter(isHere);
    if (state.tab === 'owe') list = list.filter(owes);
    if (state.tab === 'gone') list = list.filter(isGone);

    const q = state.q.trim().toLowerCase();
    if (q) {
      const dg = q.replace(/\D/g, '');
      list = all.filter((b) => { // search always looks at the whole day
        const v = vb[b.vendorId] || {};
        return [b.space, b.id, b.conf, v.name, v.business].some((x) => String(x || '').toLowerCase().includes(q))
          || (dg.length >= 4 && String(v.phone || '').replace(/\D/g, '').endsWith(dg));
      });
    }
    list.sort((a, b) => a.space.localeCompare(b.space));

    if (!list.length) {
      $('list').innerHTML = q
        ? `<div class="empty">Nobody called “${esc(state.q)}” is booked today.<br><br><button class="btn primary lg" id="emptyWalk">＋ Add as walk-in</button></div>`
        : `<div class="empty">${state.tab === 'todo' ? '🎉 Everyone is checked in.' : 'Nothing here.'}</div>`;
      const ew = $('emptyWalk'); if (ew) ew.onclick = () => openWalkIn(state.q);
      return;
    }

    $('list').innerHTML = list.slice(0, 150).map((b) => {
      const v = vb[b.vendorId] || { name: 'Unknown' };
      const sp = EWM.spaceByCode[b.space];
      const flags = (b.type === 'monthly' ? '<span class="flag m" title="Monthly renter. Prepaid, skips the admission line.">Monthly</span>' : '')
        + (docProblem(v) ? '<span class="flag w" title="Seller\'s permit missing or not verified">⚠ Permit</span>' : '');
      let right;
      if (isGone(b)) right = `<div class="done" style="color:var(--muted)">No-show<small>${b.releasedAt ? 'space released' : ''}</small></div>`;
      else if (isHere(b) && paid(b)) right = `<div class="done">✓ Here<small>${b.at ? fmtTime(b.at) : 'checked in'}</small></div>`;
      else if (!paid(b)) right = `<div class="act"><button class="btn cash" data-pay="${b.id}">💵 Collect ${money(b.due || b.amount)}</button></div>`;
      else right = `<div class="act"><button class="btn green" data-in="${b.id}">✓ Check in</button></div>`;
      return `
        <div class="item ${isHere(b) ? 'here' : ''} ${isGone(b) ? 'gone' : ''}" data-open="${b.id}">
          <div class="sc ${sp.zone}">${b.space}</div>
          <div style="min-width:0">
            <div class="nm">${esc(v.business || v.name)}${flags}</div>
            <div class="who">${esc(v.name)} · ${esc(v.phone || 'no phone')}</div>
          </div>
          ${right}
        </div>`;
    }).join('');

    $('list').querySelectorAll('[data-open]').forEach((row) => row.onclick = (e) => {
      if (e.target.closest('button')) return;
      openDrawer(row.dataset.open);
    });
    $('list').querySelectorAll('[data-in]').forEach((x) => x.onclick = () => tryCheckIn(x.dataset.in));
    $('list').querySelectorAll('[data-pay]').forEach((x) => x.onclick = () => openPay(x.dataset.pay));
  }

  function tryCheckIn(id) {
    const b = store.bookings.find((x) => x.id === id);
    const v = vendors()[b.vendorId];
    if (docProblem(v) && !confirm(`${v.name}'s seller's permit is ${v.permit === 'missing' ? 'missing' : 'not verified yet'}.\nState law requires it before they sell.\n\nCheck in anyway? (manager override, logged)`)) return;
    checkIn(b, docProblem(v) ? { override: 'permit' } : {});
    save(`✓ ${b.space} · ${v?.business || v?.name} checked in`);
  }

  // Enter with an exact code = scanned QR: check in if paid, else open payment.
  $('q').oninput = () => { state.q = $('q').value; render(); };
  $('q').onkeydown = (e) => {
    if (e.key !== 'Enter') return;
    const code = $('q').value.trim().toUpperCase();
    const hit = dayList().filter((b) => (b.conf || '').toUpperCase() === code || b.id.toUpperCase() === code || b.space === code).find((b) => !isHere(b));
    if (!hit) return;
    $('q').value = ''; state.q = '';
    if (paid(hit)) tryCheckIn(hit.id); else openPay(hit.id);
  };

  // ---------- drawer: everything about one vendor ----------
  function closeAll() { $('drawer').classList.remove('show'); $('modal').classList.remove('show'); $('scrim').classList.remove('show'); }
  $('scrim').onclick = closeAll;

  function openDrawer(id) {
    const b = store.bookings.find((x) => x.id === id);
    const v = vendors()[b.vendorId] || {};
    const sp = EWM.spaceByCode[b.space];
    const hist = store.bookings.filter((x) => x.vendorId === v.id && x.date < EWM.todayIso()).sort((x, y) => x.date.localeCompare(y.date)).slice(-16);
    const noShows = hist.filter((x) => x.status === 'Absent').length;
    const typeText = {
      monthly: 'Monthly renter. Paid for the whole month, so they skip the admission line (Express). Still tap Check in so we know they came. If they miss a day, absentee credit follows the policy.',
      reserved: 'Reserved this day in advance.',
      walkin: 'Walk-in. Paid at the window today.',
    }[b.type];
    const payLine = paid(b)
      ? `<span style="color:var(--green);font-weight:700">Paid ${money(b.due || b.amount)}</span> · ${b.payMethod ? esc(b.payMethod) : b.channel === 'online' ? 'online' : b.channel === 'phone' ? 'online (phone link)' : b.type === 'monthly' ? 'monthly' : 'in advance'}`
      : `<span style="color:var(--amber);font-weight:700">Owes ${money(b.due || b.amount)}</span>`;
    const used = new Set(dayList().map((x) => x.space));
    const free = SPACES.filter((s) => !used.has(s.code));

    $('drawer').innerHTML = `
      <div class="row"><span class="spacer"></span><button class="btn sm" id="dx">Close</button></div>
      <div class="dh" style="margin-top:6px">
        <div class="sc ${sp.zone}" style="width:72px">${b.space}</div>
        <div><h2 style="margin:0">${esc(v.business || v.name)}</h2><div class="muted">${esc(v.name)}</div></div>
      </div>
      <div class="grid g2" style="margin-top:16px">
        <a class="btn" href="tel:${esc(v.phone)}">📞 Call</a><a class="btn" href="sms:${esc(v.phone)}">💬 Text</a>
      </div>

      <div class="dsec"><h3>Today</h3>
        <div class="kv"><span>Status</span><span><b>${isGone(b) ? 'No-show' : isHere(b) ? '✓ Here' + (b.at ? ' since ' + fmtTime(b.at) : '') : 'Not here yet'}</b></span></div>
        <div class="kv"><span>Payment</span><span>${payLine}</span></div>
        <div class="kv"><span>Space</span><span>${b.space} · ${ZONES[sp.zone].label}${b.elec ? ' · ⚡ power' : ''}</span></div>
        <div class="kv"><span>Booking</span><span>${esc(b.conf || b.id)}</span></div>
        <div class="explain" style="margin-top:10px">${typeText}</div>
      </div>

      <div class="dsec"><h3>Documents</h3>
        <div class="kv"><span>Seller's permit</span><span>${v.permit === 'valid' ? '<span class="badge green">Verified</span>' : v.permit === 'expiring' ? '<span class="badge amber">Expiring soon</span>' : v.permit === 'review' ? '<span class="badge amber">Not verified yet</span>' : '<span class="badge red">Missing</span>'}</span></div>
        <div class="kv"><span>Sells</span><span>${esc(v.describe || v.category || '—')}</span></div>
        ${b.override ? '<div class="kv"><span>Override</span><span style="color:var(--red)">Checked in without permit</span></div>' : ''}
      </div>

      <div class="dsec"><h3>Last ${hist.length} market days</h3>
        <div class="dots">${hist.map((x) => `<i class="${x.status === 'Absent' ? 'x' : ''}" title="${x.date} ${x.status}"></i>`).join('') || '<span class="muted small">First time here</span>'}</div>
        ${noShows ? `<div class="small" style="color:var(--red);margin-top:6px">${noShows} no-show${noShows > 1 ? 's' : ''}</div>` : ''}
      </div>
      ${v.notes ? `<div class="dsec"><h3>Vendor note</h3><div class="explain">${esc(v.notes)}</div></div>` : ''}

      <div class="dsec"><h3>Actions</h3>
        <div class="grid" style="gap:8px">
          ${!isHere(b) && !isGone(b) && paid(b) ? `<button class="btn green lg" data-a="in">✓ Check in</button>` : ''}
          ${!paid(b) ? `<button class="btn cash lg" data-a="pay">💵 Collect ${money(b.due || b.amount)}</button>` : ''}
          <div class="row" style="gap:8px">
            <select class="in" id="mv" style="flex:1;min-height:48px">${free.slice(0, 40).map((s) => `<option value="${s.code}">${s.code} · ${ZONES[s.zone].label}</option>`).join('')}</select>
            <button class="btn" data-a="move">Move space</button>
          </div>
          ${isHere(b) ? '<button class="btn" data-a="undo">↶ Undo check-in</button>' : ''}
          ${isGone(b) && !isPast() ? '<button class="btn" data-a="back">↶ They arrived late, bring back</button>' : ''}
          <button class="btn" data-a="receipt">🧾 Text receipt again</button>
        </div>
      </div>`;
    $('drawer').classList.add('show'); $('scrim').classList.add('show');
    $('dx').onclick = closeAll;
    $('drawer').querySelectorAll('[data-a]').forEach((x) => x.onclick = () => {
      const a = x.dataset.a;
      if (a === 'in') { closeAll(); tryCheckIn(b.id); }
      if (a === 'pay') { closeAll(); openPay(b.id); }
      if (a === 'move') { const to = $('mv').value; const from = b.space; b.space = to; closeAll(); save(`Moved ${from} → ${to}`); }
      if (a === 'undo') { b.status = 'Confirmed'; delete b.at; closeAll(); save('Check-in undone'); }
      if (a === 'back') {
        if (dayList().some((x) => x !== b && x.space === b.space)) { EWM.toast(`${b.space} was resold. Move them first.`); return; }
        b.status = 'Confirmed'; delete b.releasedAt; closeAll(); save('Back on the list');
      }
      if (a === 'receipt') EWM.toast(`🧾 Receipt texted to ${v.phone || 'vendor'}`);
    });
  }

  // ---------- payment ----------
  function openPay(id, after) {
    const b = store.bookings.find((x) => x.id === id);
    const v = vendors()[b.vendorId] || {};
    let method = 'Cash'; let given = 0;
    const draw = () => {
      const change = given - (b.due || b.amount);
      $('modal').innerHTML = `
        <div class="row"><b>${b.space} · ${esc(v.business || v.name)}</b><span class="spacer"></span><button class="btn sm" id="px">✕</button></div>
        <div class="amt" style="margin-top:12px">${money(b.due || b.amount)}</div>
        <div class="grid g3" style="margin-top:14px" id="pm">
          ${['Cash', 'Card', 'Credit'].map((m) => `<button class="choice ${m === method ? 'on' : ''}" data-m="${m}"><div class="t">${{ Cash: '💵', Card: '💳', Credit: '🎟' }[m]} ${m}</div></button>`).join('')}
        </div>
        ${method === 'Cash' ? `
          <div class="small muted" style="margin-top:14px">Cash received</div>
          <div class="bills">${[b.due || b.amount, 20, 50, 100].map((n, i) => `<button class="${given === n ? 'on' : ''}" data-g="${n}">${i === 0 ? 'Exact' : money(n)}</button>`).join('')}</div>
          ${given ? `<div class="change">${change >= 0 ? `Change: <b>${money(change)}</b>` : `<span style="color:var(--red)">Short by ${money(-change)}</span>`}</div>` : ''}` : ''}
        ${method === 'Credit' ? '<p class="small muted" style="margin-top:12px">Uses the vendor\'s absentee credit balance.</p>' : ''}
        <button class="btn green lg block" id="pok" style="margin-top:18px" ${method === 'Cash' && given && given < (b.due || b.amount) ? 'disabled' : ''}>✓ Paid ${money(b.due || b.amount)}${isHere(b) ? '' : ' · check in'}</button>
        ${isHere(b) ? '' : '<button class="btn block" id="plater" style="margin-top:8px">Check in now, pay later</button>'}
        <p class="small muted" style="text-align:center;margin:10px 0 0">Receipt is texted. No printing needed.</p>`;
      $('px').onclick = closeAll;
      $('pm').querySelectorAll('button').forEach((x) => x.onclick = () => { method = x.dataset.m; given = 0; draw(); });
      $('modal').querySelectorAll('[data-g]').forEach((x) => x.onclick = () => { given = +x.dataset.g; draw(); });
      $('pok').onclick = () => {
        Object.assign(b, { paid: true, due: 0, payMethod: method, paidAt: Date.now() });
        if (!isHere(b)) checkIn(b);
        closeAll(); save(`✓ ${money(b.due || b.amount)} ${method.toLowerCase()} · ${b.space} checked in`);
        if (after) after(b);
      };
      const pl = $('plater');
      if (pl) pl.onclick = () => { checkIn(b); closeAll(); save(`${b.space} checked in · still owes ${money(b.due || b.amount)}`); };
    };
    draw();
    $('scrim').classList.add('show'); $('modal').classList.add('show');
  }

  // ---------- walk-in ----------
  function openWalkIn(prefill = '') {
    const d = DAYS[EWM.parse(state.date).getDay()];
    const used = new Set(dayList().filter((b) => !isGone(b)).map((b) => b.space));
    const free = SPACES.filter((s) => !used.has(s.code)).sort((a, b) => (a.zone === 'open' ? -1 : 1) - (b.zone === 'open' ? -1 : 1));
    $('modal').innerHTML = `
      <div class="row"><h2 style="margin:0">Walk-in vendor</h2><span class="spacer"></span><button class="btn sm" id="wx">✕</button></div>
      <p class="muted">First come, first served · <b>${money(d.walkIn)}</b></p>
      <label class="f">Business or name</label><input class="in" id="wName" value="${esc(prefill)}" placeholder="e.g. Rosa's Plants" />
      <label class="f">Phone <span class="muted small">(for the receipt)</span></label><input class="in" id="wPhone" type="tel" inputmode="tel" />
      <label class="f">Space</label>
      <select class="in" id="wSpace">${free.map((s) => `<option value="${s.code}">${s.code} · ${ZONES[s.zone].label}</option>`).join('')}</select>
      <button class="btn primary lg block" id="wOk" style="margin-top:18px">Next: collect ${money(d.walkIn)}</button>`;
    $('scrim').classList.add('show'); $('modal').classList.add('show');
    $('wName').focus();
    $('wx').onclick = closeAll;
    $('wOk').onclick = () => {
      const name = $('wName').value.trim(); if (!name) { EWM.toast('Add a name'); return; }
      const phone = $('wPhone').value.trim();
      let v = store.vendors.find((x) => (phone && x.phone === phone) || x.name.toLowerCase() === name.toLowerCase() || (x.business || '').toLowerCase() === name.toLowerCase());
      if (!v) { v = { id: 'V' + (1001 + store.vendors.length), name, business: name, phone, category: 'Other', lang: 'English', permit: 'missing', since: new Date().getFullYear() }; store.vendors.push(v); }
      const b = { id: EWM.nextId(store), vendorId: v.id, space: $('wSpace').value, date: state.date, dow: EWM.parse(state.date).getDay(), type: 'walkin', amount: d.walkIn, elec: false, status: 'Confirmed', channel: 'gate', paid: false, created: Date.now() };
      store.bookings.push(b); EWM.save(store);
      openPay(b.id, () => { if (v.permit === 'missing') EWM.toast(`✓ ${b.space} · ask ${name} for their seller's permit`); });
    };
  }
  $('walkin').onclick = () => openWalkIn();

  function render() {
    store = EWM.load();
    const all = dayList();
    renderDate(); renderTabs(all); renderBanner(all); renderList(all);
  }
  render();
})();
