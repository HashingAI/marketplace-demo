// Shared demo data and store for all four pages.
// Everything lives in localStorage, so a booking made on booking.html shows up
// in the staff check-in screen and the owner CRM.
//
// Prices come from https://www.escondidowm.com/content/rentalinformation.aspx
// (Daily walk-in / Reserved / Monthly). The premium and shaded surcharges on
// reserved daily spaces are demo assumptions: the site only says "price varies
// depending on the location".
const EWM = (() => {
  const DAYS = {
    3: { name: 'Wednesday', short: 'Wed', hours: '6:00am – 3:00pm', walkIn: 35, reserved: 40, monthly: [95, 95], elec: null, admission: 2 },
    5: { name: 'Friday', short: 'Fri', hours: '2:00pm – 10:00pm', walkIn: 65, reserved: 75, monthly: [210, 230], elec: { daily: 5, monthly: 25 }, admission: 3 },
    6: { name: 'Saturday', short: 'Sat', hours: '7:00am – 3:00pm', walkIn: 35, reserved: 40, monthly: [95, 95], elec: null, admission: 3 },
    0: { name: 'Sunday', short: 'Sun', hours: '6:00am – 3:30pm', walkIn: 70, reserved: 75, monthly: [240, 260], elec: null, admission: 3 },
  };
  const DAY_ORDER = [3, 5, 6, 0];

  const ZONES = {
    premium: { label: 'Premium', where: 'Main Aisle, by the entrance', daily: 10 },
    shaded: { label: 'Shaded', where: 'Under the shade structure', daily: 5 },
    open: { label: 'Open Field', where: 'Open air, back lot', daily: 0 },
  };

  const ROWS = ['A', 'B', 'C', 'D', 'E', 'F'];
  const PER_ROW = 14;
  const zoneOf = (r) => (r <= 'B' ? 'premium' : r <= 'D' ? 'shaded' : 'open');
  const SPACES = [];
  ROWS.forEach((r) => {
    for (let i = 1; i <= PER_ROW; i++) {
      SPACES.push({ code: r + String(i).padStart(2, '0'), row: r, n: i, zone: zoneOf(r), power: r <= 'D' && i % 3 === 1 });
    }
  });
  const spaceByCode = Object.fromEntries(SPACES.map((s) => [s.code, s]));

  function price(space, dow, plan, elec) {
    const d = DAYS[dow];
    let base;
    if (plan === 'monthly') {
      const [lo, hi] = d.monthly;
      base = space.zone === 'premium' ? hi : space.zone === 'shaded' ? Math.round((lo + hi) / 2) : lo;
    } else {
      base = d.reserved + ZONES[space.zone].daily;
    }
    const e = elec && d.elec && space.power ? (plan === 'monthly' ? d.elec.monthly : d.elec.daily) : 0;
    return { base, elec: e, total: base + e };
  }

  // ---------- dates ----------
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parse = (s) => { const [y, m, dd] = s.split('-').map(Number); return new Date(y, m - 1, dd); };
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const todayIso = () => iso(today());
  const nice = (s, opts = { weekday: 'short', month: 'short', day: 'numeric' }) => parse(s).toLocaleDateString('en-US', opts);

  function upcoming(dow, count = 8) {
    const out = []; const d = today();
    while (out.length < count) { if (d.getDay() === dow) out.push(iso(d)); d.setDate(d.getDate() + 1); }
    return out;
  }
  function upcomingMonths(dow, count = 3) {
    const out = []; const t = today();
    for (let k = 0; out.length < count && k < 6; k++) {
      const first = new Date(t.getFullYear(), t.getMonth() + k, 1);
      const dates = [];
      for (let d = new Date(first); d.getMonth() === first.getMonth(); d.setDate(d.getDate() + 1)) {
        if (d.getDay() === dow && d >= t) dates.push(iso(d));
      }
      if (dates.length) out.push({ key: iso(first).slice(0, 7), label: first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }), dates });
    }
    return out;
  }
  function nextMarketDay() {
    const d = today();
    while (!(d.getDay() in DAYS)) d.setDate(d.getDate() + 1);
    return iso(d);
  }
  function marketDaysAround(back = 3, fwd = 4) {
    const out = []; const d = today(); d.setDate(d.getDate() - 10);
    for (let i = 0; i < 30; i++) { if (d.getDay() in DAYS) out.push(iso(d)); d.setDate(d.getDate() + 1); }
    const t = nextMarketDay(); const idx = out.indexOf(t);
    return out.slice(Math.max(0, idx - back), idx + fwd);
  }

  // ---------- deterministic pseudo-random ----------
  function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

  // ---------- seed ----------
  function seed() {
    const first = ['Maria', 'Jose', 'Rosa', 'Luis', 'Carmen', 'Juan', 'Ana', 'Miguel', 'Linda', 'Robert', 'Patricia', 'James', 'Guadalupe', 'Daniel', 'Teresa', 'Frank', 'Elena', 'Victor', 'Susan', 'Ramon', 'Nancy', 'Thanh', 'Mei', 'George'];
    const last = ['Garcia', 'Hernandez', 'Lopez', 'Martinez', 'Nguyen', 'Smith', 'Ramirez', 'Torres', 'Flores', 'Johnson', 'Rivera', 'Chen', 'Morales', 'Ortiz', 'Brown', 'Castillo', 'Reyes', 'Miller'];
    const cats = ['Produce', 'Clothing', 'Antiques', 'Tools', 'Electronics', 'Food', 'Toys', 'Plants', 'Jewelry', 'Home goods', 'Shoes', 'Crafts'];
    const biz = { Produce: 'Fresh Farm', Clothing: 'Style Rack', Antiques: 'Old Town Finds', Tools: 'Tool Barn', Electronics: 'Tech Corner', Food: 'Tacos', Toys: 'Toy Box', Plants: 'Green Pots', Jewelry: 'Silver Line', 'Home goods': 'Casa Goods', Shoes: 'Sole Stop', Crafts: 'Handmade' };
    const vendors = Array.from({ length: 64 }, (_, i) => {
      const h = hash('v' + i);
      const name = `${first[h % first.length]} ${last[(h >>> 5) % last.length]}`;
      const category = cats[(h >>> 3) % cats.length];
      return {
        id: 'V' + (1001 + i), name,
        business: `${name.split(' ')[1]} ${biz[category]}`,
        phone: `(760) ${200 + (h % 700)}-${String(1000 + ((h >>> 7) % 9000))}`,
        email: `${name.toLowerCase().replace(' ', '.')}@example.com`,
        category, lang: h % 3 === 0 ? 'Spanish' : 'English',
        permit: h % 13 === 0 ? 'missing' : h % 7 === 0 ? 'expiring' : 'valid',
        since: 2010 + (h % 16),
      };
    });

    const bookings = []; const admissions = {};
    const t = today(); let seq = 10000;
    for (let off = -45; off <= 30; off++) {
      const d = new Date(t); d.setDate(d.getDate() + off);
      const dow = d.getDay(); if (!(dow in DAYS)) continue;
      const ds = iso(d); const past = off < 0;
      if (past) admissions[ds] = Math.round((260 + (hash('adm' + ds) % 520)) * (dow === 0 || dow === 6 ? 1.5 : 1));
      SPACES.forEach((sp) => {
        const h = hash(sp.code + ds); const hm = hash(sp.code + dow);
        let type = null;
        if (hm % 4 === 0) type = 'monthly';
        else if (h % 100 < (off > 0 ? Math.max(8, 34 - off) : 36)) type = 'reserved';
        else if (past && h % 100 > 80 && sp.zone === 'open') type = 'walkin';
        if (!type) return;
        const vendor = type === 'monthly' ? vendors[hm % vendors.length] : vendors[h % vendors.length];
        const elec = sp.power && dow === 5;
        const p = price(sp, dow, type === 'monthly' ? 'monthly' : 'daily', elec);
        const amount = type === 'walkin' ? DAYS[dow].walkIn : type === 'monthly' ? Math.round(p.total / 4) : p.total;
        let status = past ? (h % 23 === 0 ? 'Absent' : 'Completed') : 'Confirmed';
        if (!past && type === 'reserved' && h % 17 === 0) status = 'Under review';
        bookings.push({
          id: 'R-' + seq++, vendorId: vendor.id, space: sp.code, date: ds, dow, type, amount, elec, status,
          channel: type === 'walkin' ? 'gate' : ['phone', 'online', 'office'][h % 3],
        });
      });
    }
    return { vendors, bookings, admissions };
  }

  // ---------- store ----------
  const KEY = 'ewm_demo_v1';
  function load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { s = null; }
    if (!s) { s = seed(); save(s); }
    return s;
  }
  function save(s) { localStorage.setItem(KEY, JSON.stringify(s)); }
  function reset() { ['ewm_demo_v1', 'ewm_cart', 'ewm_user'].forEach((k) => localStorage.removeItem(k)); }
  function nextId(s) { return 'R-' + (10000 + s.bookings.length + Math.floor(Math.random() * 900) + 100); }

  // ---------- ui helpers ----------
  const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
  function toast(msg) {
    let el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 2200);
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- payments ----------
  // Online, phone-link, monthly and walk-in bookings are paid up front.
  // Some office reservations pay cash on arrival. An explicit b.paid wins.
  function isPaid(b) {
    if (b.due > 0) return false; // e.g. upgraded to a pricier space at the gate
    if (b.paid !== undefined) return b.paid;
    if (b.type === 'walkin' || b.type === 'monthly' || b.channel === 'online' || b.channel === 'phone') return true;
    return hash(b.id) % 3 !== 0;
  }

  // ---------- calendar date picker (single date) ----------
  // Popover month calendar anchored under a button. Days that fail
  // enabled(ds) are greyed out and cannot be picked.
  function datePicker(anchor, { value, enabled, onPick, mark }) {
    const old = document.getElementById('dp-pop');
    if (old) { old.remove(); if (old.dataset.for === anchor.id) return; }
    const pop = document.createElement('div');
    pop.id = 'dp-pop'; pop.className = 'dp'; pop.dataset.for = anchor.id;
    const v = parse(value); const cur = new Date(v.getFullYear(), v.getMonth(), 1);
    const r = anchor.getBoundingClientRect();
    pop.style.top = (r.bottom + window.scrollY + 8) + 'px';
    pop.style.left = Math.max(8, Math.min(window.innerWidth - 348, r.left + window.scrollX)) + 'px';
    const tIso = todayIso();
    function draw() {
      const cells = [];
      for (let i = 0; i < cur.getDay(); i++) cells.push('<span></span>');
      for (let d = new Date(cur); d.getMonth() === cur.getMonth(); d.setDate(d.getDate() + 1)) {
        const ds = iso(d); const ok = enabled(ds);
        const cls = [ds === value ? 'sel' : '', ds === tIso ? 'today' : ''].join(' ');
        const m = ok && mark ? mark(ds) : '';
        cells.push(ok ? `<button class="${cls}" data-d="${ds}">${d.getDate()}${m ? `<i>${m}</i>` : ''}</button>` : `<span class="na ${cls}">${d.getDate()}</span>`);
      }
      pop.innerHTML = `
        <div class="dp-h"><button data-nav="-1" aria-label="Previous month">‹</button>
        <b>${cur.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</b>
        <button data-nav="1" aria-label="Next month">›</button></div>
        <div class="dp-w">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((x, i) => `<span class="${i in DAYS ? 'on' : ''}">${x}</span>`).join('')}</div>
        <div class="dp-g">${cells.join('')}</div>
        <div class="dp-f"><button data-today="1">Today</button><span>Grey days are closed</span></div>`;
    }
    pop.addEventListener('click', (e) => {
      e.stopPropagation();
      const nav = e.target.closest('[data-nav]');
      if (nav) { cur.setMonth(cur.getMonth() + Number(nav.dataset.nav)); draw(); return; }
      if (e.target.closest('[data-today]')) {
        let d = tIso; for (let i = 0; i < 7 && !enabled(d); i++) { const x = parse(d); x.setDate(x.getDate() + 1); d = iso(x); }
        pop.remove(); onPick(d); return;
      }
      const day = e.target.closest('[data-d]');
      if (day) { pop.remove(); onPick(day.dataset.d); }
    });
    document.body.appendChild(pop); draw();
    setTimeout(() => {
      const close = (ev) => { if (!pop.contains(ev.target) && ev.target !== anchor && !anchor.contains(ev.target)) pop.remove(); if (!pop.isConnected) document.removeEventListener('click', close); };
      document.addEventListener('click', close);
    }, 0);
  }

  // ---------- QR codes ----------
  // Vendor passes are yellow, visitor tickets are plain black and white, so the
  // gatekeeper can tell them apart before scanning. Payloads:
  //   EWM:V:<booking code>   vendor
  //   EWM:T:<ticket id>      visitor (one per person)
  function qr(payload, cell = 4, kind = 'visitor') {
    let svg = '<div style="width:140px;height:140px;display:grid;place-items:center">QR</div>';
    if (window.qrcode) {
      const q = qrcode(0, 'M'); q.addData(payload); q.make();
      svg = q.createSvgTag(cell, 0)
        .replace(/fill="white"/, `fill="${kind === 'vendor' ? '#ffd34d' : '#ffffff'}"`)
        .replace(/fill="black"/, 'fill="#1f1e1b"');
    }
    const label = { vendor: 'VENDOR', visitor: 'VISITOR', claim: 'SCAN WITH YOUR PHONE CAMERA' }[kind];
    return `<div class="qrbox ${kind === 'vendor' ? 'qr-vendor' : 'qr-visitor'}">${svg}<span>${label}</span></div>`;
  }

  // ---------- feedback for scanners ----------
  function beep(ok) {
    try {
      const ctx = beep.ctx || (beep.ctx = new (window.AudioContext || window.webkitAudioContext)());
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = ok ? 880 : 220; o.type = ok ? 'sine' : 'square';
      g.gain.setValueAtTime(0.12, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (ok ? 0.15 : 0.4));
      o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + (ok ? 0.15 : 0.4));
    } catch (e) { /* no audio available */ }
    if (navigator.vibrate) navigator.vibrate(ok ? 60 : [120, 80, 120]);
  }

  // ---------- shared top navigation ----------
  const NAV = [
    ['booking', 'booking.html', 'Reserve'], ['tickets', 'tickets.html', 'Visitor tickets'],
    ['scan', 'scan.html', 'Gate scanner'], ['checkin', 'checkin.html', 'Check-in dashboard'], ['crm', 'crm.html', 'Owner CRM'],
  ];
  const navEl = typeof document !== 'undefined' && document.getElementById('nav');
  if (navEl) navEl.innerHTML = NAV.map(([k, href, l]) => `<a href="${href}" class="${navEl.dataset.on === k ? 'on' : ''}">${l}</a>`).join('');

  return {
    qr, beep,
    DAYS, DAY_ORDER, ZONES, SPACES, spaceByCode, price, isPaid, datePicker,
    iso, parse, today, todayIso, nice, upcoming, upcomingMonths, nextMarketDay, marketDaysAround,
    hash, load, save, reset, nextId, money, toast, esc,
  };
})();
