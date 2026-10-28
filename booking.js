// Reservation, one page:
//   From / To (calendar popover, only Wed Fri Sat Sun clickable) -> See spaces
//   -> map appears below on the same page -> tap a space -> price -> Continue
// The range covers every market day between From and To. "Selling on" chips
// let a vendor drop days inside the range (e.g. Sundays only for a month).
// If the chosen days fill every Sunday (say) of a month, that month is billed
// at the monthly rate when it is cheaper.
(() => {
  const { DAYS, DAY_ORDER, ZONES, SPACES, money, esc } = EWM;
  const $ = (id) => document.getElementById(id);
  const store = EWM.load();
  const taken = new Set(store.bookings.filter((b) => b.status !== 'Cancelled').map((b) => b.space + '|' + b.date));
  const freeOn = (ds) => SPACES.reduce((n, s) => n + !taken.has(s.code + '|' + ds), 0);

  const T = EWM.today();
  const TODAY = EWM.todayIso();
  const MAX = (() => { const d = new Date(T); d.setMonth(d.getMonth() + 4); return EWM.iso(d); })();

  const state = {
    start: null, end: null,
    days: new Set(DAY_ORDER), // weekdays kept inside the range
    cal: new Date(T.getFullYear(), T.getMonth(), 1),
    open: false, shown: false, space: null, elec: false,
  };

  // ---------- dates ----------
  const dowOf = (ds) => EWM.parse(ds).getDay();
  const isMarket = (ds) => dowOf(ds) in DAYS && ds >= TODAY && ds <= MAX;
  const addDays = (ds, n) => { const d = EWM.parse(ds); d.setDate(d.getDate() + n); return EWM.iso(d); };
  function rangeDates() {
    if (!state.start) return [];
    const out = []; for (let d = state.start; d <= (state.end || state.start); d = addDays(d, 1)) if (isMarket(d)) out.push(d);
    return out;
  }
  const chosenDates = () => rangeDates().filter((d) => state.days.has(dowOf(d)));
  function firstMarket(from = TODAY) { for (let d = from; d <= MAX; d = addDays(d, 1)) if (isMarket(d)) return d; return null; }
  const short = (ds) => EWM.nice(ds, { weekday: 'short', month: 'short', day: 'numeric' });
  function weekdayInMonth(key, dow) {
    const [y, m] = key.split('-').map(Number); const out = [];
    for (let d = new Date(y, m - 1, 1); d.getMonth() === m - 1; d.setDate(d.getDate() + 1)) { const s = EWM.iso(d); if (d.getDay() === dow && isMarket(s)) out.push(s); }
    return out;
  }

  // ---------- pricing ----------
  function quote(space, elec = state.elec) {
    const groups = {};
    chosenDates().forEach((ds) => { const k = ds.slice(0, 7) + '|' + dowOf(ds); (groups[k] = groups[k] || []).push(ds); });
    const lines = []; const perDate = {}; let total = 0; let save = 0; let monthly = false;
    Object.entries(groups).sort().forEach(([k, ds]) => {
      const [key, dowS] = k.split('|'); const dow = +dowS; const d = DAYS[dow];
      const one = EWM.price(space, dow, 'daily', elec).total;
      const daily = one * ds.length;
      const mon = EWM.price(space, dow, 'monthly', elec).total;
      const mName = EWM.parse(key + '-01').toLocaleDateString('en-US', { month: 'short' });
      const full = ds.length > 1 && ds.length === weekdayInMonth(key, dow).length;
      if (full && mon < daily) {
        lines.push({ label: `${mName} · every ${d.name} (${ds.length}) · monthly`, amount: mon, was: daily });
        ds.forEach((x) => { perDate[x] = mon / ds.length; });
        total += mon; save += daily - mon; monthly = true;
      } else {
        lines.push({ label: `${mName} · ${ds.length} ${d.short}${ds.length > 1 ? 's' : ''} × ${money(one)}`, amount: daily });
        ds.forEach((x) => { perDate[x] = one; });
        total += daily;
      }
    });
    return { lines, total, save, monthly, perDate };
  }

  // ---------- search bar ----------
  function renderBar() {
    $('vFrom').textContent = state.start ? short(state.start) : 'Add date';
    $('vTo').textContent = state.start ? short(state.end || state.start) : 'Add date';
    $('vFrom').classList.toggle('set', !!state.start); $('vTo').classList.toggle('set', !!state.start);
    $('fFrom').classList.toggle('on', state.open && (!state.start || !!state.end));
    $('fTo').classList.toggle('on', state.open && !!state.start && !state.end);
  }

  function renderCal() {
    const pop = $('pop'); pop.classList.toggle('hidden', !state.open);
    if (!state.open) return;
    const m0 = state.cal; const m1 = new Date(m0.getFullYear(), m0.getMonth() + 1, 1);
    const minM = new Date(T.getFullYear(), T.getMonth(), 1);
    const maxM = EWM.parse(MAX); maxM.setDate(1);
    const s = state.start; const e = state.end || state.start;

    const month = (m) => {
      const cells = []; for (let i = 0; i < m.getDay(); i++) cells.push('<span></span>');
      for (let dd = new Date(m); dd.getMonth() === m.getMonth(); dd.setDate(dd.getDate() + 1)) {
        const ds = EWM.iso(dd);
        const band = s && ds >= s && ds <= e && s !== e;
        const cls = ['cell', band ? 'inr' : '', ds === s ? 'rs' : '', ds === e ? 're' : ''].join(' ');
        if (!isMarket(ds)) { cells.push(`<span class="${cls}" data-d="${ds}"><span class="off">${dd.getDate()}</span></span>`); continue; }
        const left = freeOn(ds);
        cells.push(`<span class="${cls}" data-d="${ds}"><button class="dc ${ds === s || ds === e ? 'end' : ''}" data-d="${ds}" aria-label="${EWM.nice(ds)}, ${left} spaces open"><span class="dn">${dd.getDate()}</span><span class="lf ${left < 20 ? 'low' : ''}">${left} left</span></button></span>`);
      }
      const wk = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((x, i) => `<span class="${i in DAYS ? 'open' : ''}">${x}</span>`).join('');
      return `<div><div class="mname">${m.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div><div class="wk">${wk}</div><div class="days">${cells.join('')}</div></div>`;
    };

    const n = rangeDates().length;
    const msg = !s ? 'Pick your first day' : !state.end ? `${short(s)} · tap your last day, or Done for one day` : `${n} market day${n > 1 ? 's' : ''} selected`;
    pop.innerHTML = `
      <div class="pop-h">
        <button class="navb" id="pv" ${m0 <= minM ? 'disabled' : ''} aria-label="Previous month">‹</button>
        <div style="flex:1;text-align:center" class="small muted">Open Wednesday, Friday, Saturday, Sunday</div>
        <button class="navb" id="nx" ${m1 >= maxM ? 'disabled' : ''} aria-label="Next month">›</button>
      </div>
      <div class="months">${month(m0)}${month(m1)}</div>
      <div class="pop-f">
        <div class="chips">
          <button class="chip" data-q="weekend">This weekend</button>
          <button class="chip" data-q="four">Next 4 weeks</button>
          <button class="chip" data-q="month">Rest of month</button>
        </div>
        <span class="spacer"></span>
        <span id="calMsg" class="small">${msg}</span>
        <button class="btn sm" id="clr">Clear</button>
        <button class="btn primary" id="done" ${s ? '' : 'disabled'}>Done</button>
      </div>`;

    $('pv').onclick = () => { state.cal = new Date(m0.getFullYear(), m0.getMonth() - 1, 1); renderCal(); };
    $('nx').onclick = () => { state.cal = new Date(m0.getFullYear(), m0.getMonth() + 1, 1); renderCal(); };
    $('clr').onclick = () => { state.start = state.end = null; refresh(); };
    $('done').onclick = () => { if (!state.end) state.end = state.start; state.open = false; showResults(); };
    pop.querySelectorAll('[data-q]').forEach((b) => b.onclick = () => quick(b.dataset.q));
    pop.querySelectorAll('button.dc').forEach((b) => {
      b.onclick = () => pick(b.dataset.d);
      b.onmouseenter = () => {
        if (!state.start || state.end) return;
        const h = b.dataset.d; const a = h < state.start ? h : state.start; const z = h < state.start ? state.start : h;
        pop.querySelectorAll('.cell').forEach((c) => {
          const x = c.dataset.d; if (!x) return;
          c.classList.toggle('inr', x >= a && x <= z && a !== z); c.classList.toggle('rs', x === a); c.classList.toggle('re', x === z);
        });
      };
    });
  }

  function pick(ds) {
    if (!state.start || state.end) { state.start = ds; state.end = null; }
    else if (ds < state.start) state.start = ds;
    else state.end = ds;
    refresh();
  }

  function quick(kind) {
    const f = firstMarket();
    if (kind === 'weekend') { // next Fri..Sun
      let fri = f; while (dowOf(fri) !== 5) fri = addDays(fri, 1);
      state.start = fri; state.end = addDays(fri, 2);
    }
    if (kind === 'four') { state.start = f; state.end = addDays(f, 27); }
    if (kind === 'month') {
      const d = EWM.parse(f); const last = EWM.iso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
      state.start = f; state.end = last;
    }
    while (state.end && !isMarket(state.end)) state.end = addDays(state.end, -1);
    const sm = EWM.parse(state.start); state.cal = new Date(sm.getFullYear(), sm.getMonth(), 1);
    refresh();
  }

  function openCal() {
    state.open = true;
    if (state.start) { const sm = EWM.parse(state.start); state.cal = new Date(sm.getFullYear(), sm.getMonth(), 1); }
    refresh();
  }
  $('fFrom').onclick = openCal;
  $('fTo').onclick = openCal;
  document.addEventListener('click', (ev) => {
    if (!ev.target.isConnected) return; // popover re-rendered under the click
    if (state.open && !$('sbar').contains(ev.target)) { state.open = false; refresh(); }
  });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && state.open) { state.open = false; refresh(); } });
  $('go').onclick = () => {
    if (!state.start) { openCal(); EWM.toast('Pick your dates first'); return; }
    if (!state.end) state.end = state.start;
    state.open = false; showResults();
  };

  // ---------- results on the same page ----------
  function showResults() {
    const first = !state.shown; state.shown = true;
    refresh();
    if (first) setTimeout(() => $('results').scrollIntoView({ behavior: 'smooth' }), 50);
  }

  const isFree = (code) => chosenDates().every((ds) => !taken.has(code + '|' + ds));

  function renderResults() {
    $('results').classList.toggle('hidden', !state.shown || !state.start);
    if (!state.shown || !state.start) return;
    const all = rangeDates(); const ds = chosenDates();
    const span = ds.length ? ds : all;
    $('rTitle').textContent = span.length === 1 ? EWM.nice(span[0], { weekday: 'long', month: 'long', day: 'numeric' }) : `${short(span[0])} – ${short(span[span.length - 1])}`;
    const dropped = ds.length < all.length;
    const onlyDays = [...new Set(ds.map(dowOf))].map((k) => DAYS[k].name + 's').join(' & ');
    $('rSub').textContent = ds.length === 1 ? DAYS[dowOf(ds[0])].hours : `${ds.length} market days${dropped ? ' · ' + onlyDays + ' only' : ''} · same space every day`;

    // "Selling on" chips: only weekdays that occur in the range.
    const present = DAY_ORDER.filter((k) => all.some((d) => dowOf(d) === k));
    $('daychips').innerHTML = present.length > 1
      ? '<span class="small muted" style="align-self:center">Selling on</span>' + present.map((k) => {
        const c = all.filter((d) => dowOf(d) === k).length;
        return `<button class="chip ${state.days.has(k) ? 'on' : ''}" data-k="${k}">${DAYS[k].short}<span class="n">×${c}</span></button>`;
      }).join('')
      : '';
    $('daychips').querySelectorAll('button').forEach((b) => b.onclick = () => {
      const k = +b.dataset.k;
      if (state.days.has(k) && present.filter((x) => state.days.has(x)).length === 1) { EWM.toast('Keep at least one day'); return; }
      state.days.has(k) ? state.days.delete(k) : state.days.add(k);
      refresh();
    });

    if (state.space && !isFree(state.space)) state.space = null;
    const z = (zone) => SPACES.find((s) => s.zone === zone);
    $('legend').innerHTML = ['premium', 'shaded', 'open'].map((k) => `<span><i style="background:var(--${k})"></i>${ZONES[k].label} <b>${money(quote(z(k), false).total)}</b></span>`).join('') + '<span>⚡ Power</span>';

    let free = 0;
    const rowHtml = (r) => `<div class="srow"><span class="rl">${r}</span>${SPACES.filter((s) => s.row === r).map((s) => {
      const ok = isFree(s.code); if (ok) free++;
      const tip = ok ? `${s.code} · ${ZONES[s.zone].label} · ${money(quote(s).total)}${s.power ? ' · power' : ''}` : `${s.code} · taken`;
      return `<button class="sp ${s.zone} ${state.space === s.code ? 'sel' : ''}" data-code="${s.code}" title="${tip}" aria-label="${tip}" ${ok ? '' : 'disabled'}>${s.n}${s.power ? '<span class="bolt">⚡</span>' : ''}</button>`;
    }).join('')}</div>`;
    const blocks = [[['A', 'B'], 'Main Aisle · Premium'], [['C', 'D'], 'Shade Structure'], [['E', 'F'], 'Open Field']];
    $('map').innerHTML = blocks.map(([rows, label]) => `<div class="block"><div class="block-label">${label}</div>${rowHtml(rows[0])}<div class="aisle"></div>${rowHtml(rows[1])}</div>`).join('')
      + '<div class="landmarks"><div class="lm">🍔 Food Court</div><div class="lm gate">⬆ Main Gate · Entrance</div><div class="lm">🎵 Stage</div></div>';
    $('freeCount').textContent = free ? `${free} open${ds.length > 1 ? ' on all days' : ''}` : 'none open';
    $('map').querySelectorAll('.sp:not(:disabled)').forEach((b) => b.onclick = () => {
      state.space = state.space === b.dataset.code ? null : b.dataset.code;
      const sp = state.space && EWM.spaceByCode[state.space];
      if (!(sp && sp.power)) state.elec = false;
      refresh();
      if (state.space && window.innerWidth < 1000) $('summary').scrollIntoView({ behavior: 'smooth' });
    });
    renderSummary(free);
  }

  function renderSummary(free) {
    const ds = chosenDates();
    if (!state.space) {
      $('summary').innerHTML = free
        ? `<h3>Your reservation</h3><div class="empty"><div style="font-size:2.4rem">👆</div>Tap a colored square on the map</div>`
        : `<h3>No single space is free on all these days</h3><p class="muted">Try fewer days, or turn off a day under "Selling on".</p>`;
      return;
    }
    const sp = EWM.spaceByCode[state.space];
    const q = quote(sp);
    const fridays = ds.filter((d) => dowOf(d) === 5).length;
    $('summary').innerHTML = `
      <div><span class="badge dark">Space ${sp.code}</span> <span class="badge">${ZONES[sp.zone].label}</span>${q.monthly ? ' <span class="badge accent">Express check-in</span>' : ''}</div>
      <h2 style="margin-top:12px">${esc($('rTitle').textContent)}</h2>
      <p class="muted small">${ds.length} market day${ds.length > 1 ? 's' : ''} · ${ZONES[sp.zone].where}</p>
      ${sp.power && fridays ? `<label class="toggle"><input type="checkbox" id="elec" ${state.elec ? 'checked' : ''} /><span><b>Add electricity on Fridays</b><br><span class="small muted">+${money(DAYS[5].elec.daily)} a Friday</span></span></label>` : ''}
      <div style="margin-top:14px">
        ${q.lines.map((l) => `<div class="line"><span>${esc(l.label)}</span><span>${l.was ? `<s class="muted small">${money(l.was)}</s> ` : ''}<b>${money(l.amount)}</b></span></div>`).join('')}
        ${q.save ? `<div class="line" style="color:var(--green);font-weight:600"><span>Monthly savings</span><span>−${money(q.save)}</span></div>` : ''}
        <div class="line total"><span>Total</span><span>${money(q.total)}</span></div>
      </div>
      <button class="btn primary lg block" id="cont" style="margin-top:14px">Continue · ${money(q.total)}</button>
      <p class="small muted" style="text-align:center;margin:10px 0 0">We hold space ${sp.code} for 15 minutes.</p>`;
    const el = $('elec'); if (el) el.onchange = () => { state.elec = el.checked; refresh(); };
    $('cont').onclick = () => {
      const dows = [...new Set(ds.map(dowOf))];
      localStorage.setItem('ewm_cart', JSON.stringify({
        space: sp.code, zone: sp.zone, dow: dowOf(ds[0]), dates: ds, elec: state.elec,
        items: ds.map((d) => ({ date: d, amount: Math.round(q.perDate[d]) })),
        lines: q.lines, save: q.save, total: q.total, plan: q.monthly ? 'monthly' : 'daily',
        when: $('rTitle').textContent + (ds.length > 1 ? ` · ${ds.length} days` : ''),
        hours: dows.length === 1 ? DAYS[dows[0]].hours : 'Hours vary by day',
        heldUntil: Date.now() + 15 * 60 * 1000,
      }));
      location.href = 'apply.html';
    };
  }

  function refresh() { renderBar(); renderCal(); renderResults(); }
  refresh();
})();
