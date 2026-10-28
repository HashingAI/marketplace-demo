// Gate scanner: the gatekeeper's phone.
// Scan a code and get one clear verdict:
//   green  = go in (visitor admitted, or vendor ready to check in)
//   amber  = something to do first (collect money, check permit/ID, pick a new space)
//   red    = stop (already used, wrong day, unknown, cancelled)
// Yellow QR = vendor pass, black-and-white QR = visitor ticket (one per person).
(() => {
  const { DAYS, ZONES, SPACES, money, esc } = EWM;
  const $ = (id) => document.getElementById(id);
  let store = EWM.load();
  const DAY = EWM.nextMarketDay(); // the market day being worked
  const history = [];
  let autoClose = null;
  let scanner = null;

  // ---------- lookups ----------
  const vendorOf = (b) => store.vendors.find((v) => v.id === b.vendorId) || { name: 'Unknown' };
  const dayBookings = () => store.bookings.filter((b) => b.date === DAY && b.status !== 'Cancelled');
  const isHere = (b) => b.status === 'Checked in' || b.status === 'Completed';
  const firstTime = (v) => !store.bookings.some((b) => b.vendorId === v.id && b.status === 'Completed');
  const permitBad = (v) => v.permit === 'missing' || v.permit === 'review';
  const fmt = (t) => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const dayName = (ds) => EWM.nice(ds, { weekday: 'long', month: 'short', day: 'numeric' });

  function parse(raw) {
    const s = String(raw || '').trim();
    let m = s.match(/^EWM:V:(.+)$/i); if (m) return { kind: 'vendor', code: m[1].toUpperCase() };
    m = s.match(/^EWM:T:(.+)$/i); if (m) return { kind: 'ticket', code: m[1].toUpperCase() };
    const up = s.toUpperCase();
    if ((store.tickets || []).some((t) => t.id === up)) return { kind: 'ticket', code: up };
    return { kind: 'vendor', code: up };
  }

  // Cash this gate collected today: gate ticket sales + vendor payments.
  // Shown on screen so the shift's cash bag can be counted against it.
  function cashTaken() {
    const t = (store.tickets || []).filter((x) => x.date === DAY && x.channel === 'gate' && x.method === 'Cash at gate').reduce((n, x) => n + x.price, 0);
    const v = dayBookings().filter((b) => b.payMethod === 'Cash' && b.by === 'Gate 1').reduce((n, b) => n + b.amount, 0);
    return t + v;
  }

  // ---------- status bar ----------
  function renderStatus() {
    const all = dayBookings();
    const here = all.filter(isHere).length;
    const visitors = (store.tickets || []).filter((t) => t.date === DAY && t.usedAt).length;
    $('status').innerHTML = `
      <span class="pill">📅 <b>${dayName(DAY)}</b>${DAY === EWM.todayIso() ? '' : ' (demo)'}</span>
      <span class="pill">🟨 Vendors <b>${here}/${all.length}</b></span>
      <span class="pill">⬜ Visitors <b>${visitors}</b></span>
      <span class="pill" title="Count the cash bag against this at the end of the shift">💵 Cash taken <b>${money(cashTaken())}</b></span>`;
  }
  function renderHist() {
    const c = { green: 'var(--green)', amber: '#d99a06', red: 'var(--red)' };
    $('hist').innerHTML = history.slice(-6).reverse().map((h) => `<div><i style="background:${c[h.tone]}"></i>${esc(h.text)}<time>${fmt(h.t)}</time></div>`).join('');
  }
  const log = (tone, text) => { history.push({ tone, text, t: Date.now() }); renderHist(); };

  // ---------- sheet ----------
  function openSheet(html, tone) {
    clearTimeout(autoClose);
    $('sheet').innerHTML = html;
    $('sheet').classList.add('show'); $('scrim').classList.add('show');
    EWM.beep(tone === 'green');
    if (scanner) try { scanner.pause(true); } catch (e) { /* not running */ }
  }
  function closeSheet() {
    clearTimeout(autoClose);
    $('sheet').classList.remove('show'); $('scrim').classList.remove('show');
    store = EWM.load(); renderStatus();
    if (scanner) try { scanner.resume(); } catch (e) { /* not paused */ }
  }
  $('scrim').onclick = closeSheet;
  const verdict = (tone, icon, title, sub) => `<div class="verdict v-${tone}"><div class="ic">${icon}</div><div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div></div>`;
  const nextBtn = (label = 'Scan next') => `<button class="btn lg block" data-close>${label}</button>`;
  function bindClose() { $('sheet').querySelectorAll('[data-close]').forEach((b) => b.onclick = closeSheet); }

  // ---------- handle a scan ----------
  function handle(raw) {
    store = EWM.load();
    const p = parse(raw);
    if (p.kind === 'ticket') return visitor(p.code);
    return vendor(p.code);
  }

  function visitor(id) {
    const t = (store.tickets || []).find((x) => x.id === id);
    if (!t) return unknown(id);
    if (t.refunded) { log('red', `Ticket ${id} refunded`); openSheet(verdict('red', '✕', 'Refunded ticket', 'Do not let in') + `<div class="sbody">${nextBtn()}</div>`, 'red'); return bindClose(); }
    if (t.date !== DAY) {
      log('red', `Ticket for ${EWM.nice(t.date)}`);
      openSheet(verdict('red', '📅', 'Wrong day', `This ticket is for ${dayName(t.date)}`) + `<div class="sbody"><p class="muted">Sell them today's entry with the button below, or they can buy a new ticket on their phone.</p><button class="btn primary lg block" id="sellWrong" style="margin-bottom:10px">🎟 Sell today's entry</button>${nextBtn()}</div>`, 'red');
      $('sellWrong').onclick = sellAtGate;
      return bindClose();
    }
    if (t.usedAt) {
      log('red', `Ticket ${id} used twice`);
      openSheet(verdict('red', '⛔', 'Already used', `Scanned at ${fmt(t.usedAt)}${t.usedBy ? ' · ' + esc(t.usedBy) : ''}`) + `<div class="sbody">
        <p class="muted">Each person has their own code. Ask them to swipe to the next ticket on their phone.</p>
        <div class="kv"><span>Ticket</span><span>${esc(t.id)} · ${t.kind}</span></div>
        <div class="kv"><span>Order</span><span>${esc(t.order)}</span></div>
        <div class="acts">${nextBtn()}</div></div>`, 'red');
      return bindClose();
    }
    if (t.paid === false) return collectTicket(t);
    admitTicket(t);
  }

  function admitTicket(t) {
    t.usedAt = Date.now(); t.usedBy = 'Gate 1'; EWM.save(store);
    const left = store.tickets.filter((x) => x.order === t.order && !x.usedAt).length;
    log('green', `Visitor ${t.kind} admitted`);
    openSheet(verdict('green', '✓', t.kind === 'adult' ? 'Welcome in' : 'Welcome in · child', `Visitor ticket · ${t.kind === 'adult' ? money(t.price) + ' paid' : 'free'}`) + `<div class="sbody">
      <div class="big-n">1</div><p style="text-align:center" class="muted">person in</p>
      ${left ? `<p style="text-align:center"><b>${left} more ticket${left > 1 ? 's' : ''}</b> in this group, scan each one</p>` : ''}
      <div class="acts">${nextBtn('Scan next (auto in 2s)')}</div></div>`, 'green');
    bindClose();
    autoClose = setTimeout(closeSheet, 2200); // keep the line moving
  }

  // Cash/tap picker for gate sales.
  function payPanel(amount, state) {
    return `<div class="grid g2" id="pm">${['Cash', 'Tap to Pay'].map((m) => `<button class="choice ${m === state.method ? 'on' : ''}" data-m="${m}"><div class="t">${m === 'Cash' ? '💵' : '📱'} ${m}</div></button>`).join('')}</div>
      ${state.method === 'Cash' ? `<div class="bills">${[amount, 5, 10, 20].map((n, i) => `<button class="${state.given === n ? 'on' : ''}" data-g="${n}">${i ? money(n) : 'Exact'}</button>`).join('')}</div>
        ${state.given ? `<p style="text-align:center;font-size:1.3rem;margin-top:12px">${state.given >= amount ? `Give change <b>${money(state.given - amount)}</b>` : `<span style="color:var(--red)">Short ${money(amount - state.given)}</span>`}</p>` : ''}`
      : '<div class="tap"><div class="w">📱</div><b>Hold their card or phone near this phone</b><div class="small muted">Apple Pay, Google Pay, or a contactless card</div></div>'}`;
  }
  function bindPay(state, redraw) {
    $('pm').querySelectorAll('button').forEach((x) => x.onclick = () => { state.method = x.dataset.m; state.given = 0; redraw(); });
    $('sheet').querySelectorAll('[data-g]').forEach((x) => x.onclick = () => { state.given = +x.dataset.g; redraw(); });
  }

  // Unpaid visitor ticket: same amber "Collect" step as an unpaid vendor.
  // Collect once for the whole group, then admit this person.
  function collectTicket(t) {
    const group = store.tickets.filter((x) => x.order === t.order);
    const owed = group.filter((x) => x.paid === false).reduce((n, x) => n + x.price, 0);
    const adults = group.filter((x) => x.kind === 'adult').length;
    const kids = group.length - adults;
    const ps = { method: 'Cash', given: 0 };
    log('amber', `Visitor ticket · owes ${money(owed)}`);
    const draw = () => {
      openSheet(verdict('amber', '💵', `Collect ${money(owed)}`, `Visitor ticket · not paid yet`) + `<div class="sbody">
        <div class="kv"><span>Group</span><span>${adults} adult${adults === 1 ? '' : 's'}${kids ? ` · ${kids} child${kids > 1 ? 'ren' : ''}` : ''}</span></div>
        <div class="kv"><span>Ticket</span><span>${esc(t.id)}</span></div>
        <div style="margin-top:12px">${payPanel(owed, ps)}</div>
        <div class="acts">
          <button class="btn green lg block" id="tkPaid" ${ps.method === 'Cash' && ps.given && ps.given < owed ? 'disabled' : ''}>✓ Paid ${money(owed)} · let in</button>
          ${nextBtn('Cancel')}
        </div></div>`, 'amber');
      bindClose(); bindPay(ps, draw);
      $('tkPaid').onclick = () => {
        group.forEach((x) => { if (x.paid === false) Object.assign(x, { paid: true, method: ps.method === 'Cash' ? 'Cash at gate' : 'Tap at gate', channel: 'gate', paidAt: Date.now(), paidBy: 'Gate 1' }); });
        admitTicket(t);
      };
    };
    draw();
  }

  // Walk-up visitor with no ticket: sell at the gate, then hand over a claim QR
  // the visitor scans with their own phone camera to get their QR tickets.
  function sellAtGate() {
    store = EWM.load();
    const p = DAYS[EWM.parse(DAY).getDay()].admission;
    const st = { adult: 1, child: 0, method: 'Cash', given: 0 };
    const draw = () => {
      const amount = st.adult * p;
      const stepper = (k, label, sub) => `<div class="kv" style="align-items:center"><span><b style="color:var(--ink)">${label}</b><br><span class="small">${sub}</span></span>
        <span class="row" style="gap:10px"><button class="btn sm" data-k="${k}" data-s="-1">−</button><b style="font-size:1.4rem;min-width:24px;text-align:center">${st[k]}</b><button class="btn sm" data-k="${k}" data-s="1">+</button></span></div>`;
      openSheet(verdict('amber', '🎟', 'Sell at the gate', `${money(p)} per adult · children free`) + `<div class="sbody">
        ${stepper('adult', 'Adults', money(p) + ' each')}${stepper('child', 'Children', 'free')}
        <div class="amt" style="margin:10px 0">${money(amount)}</div>
        ${payPanel(amount, st)}
        <div class="acts">
          <button class="btn green lg block" id="sellOk" ${st.method === 'Cash' && st.given && st.given < amount ? 'disabled' : ''}>✓ Paid ${money(amount)} · make QR</button>
          ${nextBtn('Cancel')}
        </div></div>`, 'amber');
      bindClose(); bindPay(st, draw);
      $('sheet').querySelectorAll('[data-k]').forEach((x) => x.onclick = () => {
        const k = x.dataset.k; st[k] = Math.max(k === 'adult' ? 1 : 0, Math.min(12, st[k] + +x.dataset.s)); st.given = 0; draw();
      });
      $('sellOk').onclick = () => {
        store.tickets = store.tickets || [];
        const order = 'O-' + Math.floor(100000 + Math.random() * 900000);
        const kinds = [...Array(st.adult)].map(() => 'adult').concat([...Array(st.child)].map(() => 'child'));
        const list = kinds.map((kind, i) => ({ id: `T${order.slice(2)}-${i + 1}`, order, date: DAY, kind, price: kind === 'adult' ? p : 0, method: st.method === 'Cash' ? 'Cash at gate' : 'Tap at gate', paid: true, paidAt: Date.now(), boughtAt: Date.now(), usedAt: null, channel: 'gate' }));
        store.tickets.push(...list); EWM.save(store);
        log('green', `Sold ${list.length} at gate · ${money(amount)}`);
        showClaim(order, list);
      };
    };
    draw();
  }

  function showClaim(order, list) {
    const url = new URL('tickets.html?claim=' + encodeURIComponent(order), location.href).href;
    openSheet(verdict('green', '✓', `Paid · ${list.length} ticket${list.length > 1 ? 's' : ''}`, 'Turn this phone to the visitor') + `<div class="sbody" style="text-align:center">
      <p style="font-size:1.1rem;margin:0 0 10px"><b>Open your camera and scan</b> to get your tickets</p>
      ${EWM.qr(url, 6, 'claim')}
      <p class="small muted" style="margin-top:10px">Then scan their phone ticket like any other.</p>
      <div class="acts" style="text-align:left">
        <a class="btn lg block" href="${url}" target="_blank">📱 Open as visitor's phone (demo)</a>
        <button class="btn primary lg block" data-close>They have it · scan their ticket</button>
        <button class="btn lg block" id="noPhone">No phone · let ${list.length} in now</button>
      </div></div>`, 'green');
    bindClose();
    $('noPhone').onclick = () => {
      list.forEach((t) => { t.usedAt = Date.now(); t.usedBy = 'Gate 1 · no phone'; });
      EWM.save(store);
      log('green', `${list.length} let in without phone`);
      closeSheet();
      EWM.toast(`✓ ${list.length} in · counted, no phone`);
    };
  }
  $('sell').onclick = sellAtGate;

  function unknown(code) {
    log('red', `Unknown code ${code.slice(0, 14)}`);
    openSheet(verdict('red', '?', 'Not found', esc(code.slice(0, 30))) + `<div class="sbody">
      <p class="muted">Not one of our codes. Ask for their name and look it up, or send them to the office.</p>
      <div class="manual" style="margin-top:0"><input class="in" id="look" placeholder="Name, business or space" /><button class="btn primary" id="lookGo">Find</button></div>
      <div id="lookRes" style="margin-top:10px"></div>
      <div class="acts">${nextBtn()}</div></div>`, 'red');
    bindClose();
    $('lookGo').onclick = () => {
      const q = $('look').value.trim().toLowerCase(); if (!q) return;
      const hits = dayBookings().filter((b) => { const v = vendorOf(b); return [v.name, v.business, b.space].some((x) => String(x || '').toLowerCase().includes(q)); }).slice(0, 5);
      $('lookRes').innerHTML = hits.length ? hits.map((b) => `<button class="btn block" style="justify-content:flex-start;margin-bottom:6px" data-b="${b.id}">${b.space} · ${esc(vendorOf(b).business || vendorOf(b).name)}</button>`).join('') : '<p class="muted">No booking today. Send them to the office for a walk-in.</p>';
      $('lookRes').querySelectorAll('[data-b]').forEach((x) => x.onclick = () => vendorCard(store.bookings.find((b) => b.id === x.dataset.b)));
    };
  }

  function vendor(code) {
    const matches = store.bookings.filter((b) => (b.conf || '').toUpperCase() === code || b.id.toUpperCase() === code);
    if (!matches.length) return unknown(code);
    const today = matches.find((b) => b.date === DAY);
    if (!today) {
      const next = matches.filter((b) => b.date > DAY && b.status !== 'Cancelled').sort((a, b) => a.date.localeCompare(b.date))[0];
      const v = vendorOf(matches[0]);
      log('red', `${v.business || v.name} · not booked today`);
      openSheet(verdict('red', '📅', 'Not booked today', esc(v.business || v.name)) + `<div class="sbody">
        <div class="kv"><span>Their next day</span><span>${next ? dayName(next.date) + ' · ' + next.space : 'none'}</span></div>
        <p class="muted" style="margin-top:12px">They can rent a walk-in space today at the office if spaces are open.</p>
        <div class="acts">${nextBtn()}</div></div>`, 'red');
      return bindClose();
    }
    vendorCard(today);
  }

  // ---------- vendor detail: Check in / Collect / Move ----------
  function vendorCard(b) {
    const v = vendorOf(b); const sp = EWM.spaceByCode[b.space];
    const paid = EWM.isPaid(b); const owe = b.due || b.amount; const first = firstTime(v); const bad = permitBad(v);
    const name = esc(v.business || v.name);

    if (b.status === 'Cancelled') { log('red', `${name} · cancelled`); openSheet(verdict('red', '✕', 'Booking cancelled', name) + `<div class="sbody"><p class="muted">Send them to the office.</p>${nextBtn()}</div>`, 'red'); return bindClose(); }

    let tone; let icon; let title; let sub;
    if (isHere(b)) { tone = 'red'; icon = '⛔'; title = 'Already checked in'; sub = `${b.at ? 'at ' + fmt(b.at) : 'earlier today'} · same pass scanned twice`; }
    else if (b.status === 'Absent') { tone = 'amber'; icon = '↺'; title = 'Space was released'; sub = 'They came after the hold time. Pick a new space.'; }
    else if (!paid) { tone = 'amber'; icon = '💵'; title = `Collect ${money(owe)}`; sub = b.due ? 'Upgraded space, difference due' : 'Reserved, not paid yet'; }
    else if (bad || first) { tone = 'amber'; icon = '🪪'; title = 'Check before entry'; sub = 'Reserved and paid'; }
    else { tone = 'green'; icon = '✓'; title = 'Reserved & paid'; sub = b.type === 'monthly' ? 'Monthly · Express entry' : 'Ready to check in'; }

    const canGo = () => (!first || $('idOk')?.checked) && (!bad || $('permitOk')?.checked);
    const main = isHere(b) ? ''
      : b.status === 'Absent' ? ''
      : paid ? `<button class="btn green lg block" id="goIn">✓ Check in · ${b.space}</button>`
      : `<button class="btn cash lg block" id="goPay">💵 Collect ${money(owe)} & check in</button>`;

    log(tone === 'green' ? 'green' : tone, `${name} · ${title}`);
    openSheet(verdict(tone, icon, title, sub) + `<div class="sbody">
      <div class="vhead"><div class="sc ${sp.zone}">${b.space}</div>
        <div><div style="font-weight:800;font-size:1.2rem">${name}</div><div class="muted">${esc(v.name)} · ${esc(v.phone || '')}</div></div></div>
      <div style="margin-top:12px">
        <div class="kv"><span>Space</span><span>${b.space} · ${ZONES[sp.zone].label}${b.elec ? ' · ⚡' : ''}</span></div>
        <div class="kv"><span>Payment</span><span>${paid ? `<b style="color:var(--green)">Paid</b>` : `<b style="color:var(--amber)">Owes ${money(owe)}</b>`}</span></div>
        ${isHere(b) ? `<div class="kv"><span>Checked in</span><span>${b.at ? fmt(b.at) : 'yes'}${b.by ? ' · ' + esc(b.by) : ''}</span></div>` : ''}
      </div>
      ${!isHere(b) && first ? `<label class="check warn"><input type="checkbox" id="idOk" /><span>🪪 First time here. Photo ID matches <b>${esc(v.name)}</b></span></label>` : ''}
      ${!isHere(b) && bad ? `<label class="check warn"><input type="checkbox" id="permitOk" /><span>📄 Seller's permit ${v.permit === 'missing' ? 'is missing in our system' : 'not verified yet'}. I saw a valid permit.</span></label>` : ''}
      <div class="acts">
        ${main}
        <button class="btn lg block" id="goMove">⇄ ${b.status === 'Absent' ? 'Pick a new space' : 'Move to another space'}</button>
        ${isHere(b) ? nextBtn('OK, scan next') : nextBtn('Cancel')}
      </div>
      ${!isHere(b) && (first || bad) ? '<p class="small muted" style="text-align:center;margin-top:8px">Tick the box above to continue. No permit? Send them to the office.</p>' : ''}
    </div>`, tone);
    bindClose();

    const refresh = () => { ['goIn', 'goPay'].forEach((id) => { const el = $(id); if (el) el.disabled = !canGo(); }); };
    ['idOk', 'permitOk'].forEach((id) => { const el = $(id); if (el) el.onchange = refresh; });
    refresh();
    const gi = $('goIn'); if (gi) gi.onclick = () => doCheckIn(b);
    const gp = $('goPay'); if (gp) gp.onclick = () => payCard(b);
    $('goMove').onclick = () => moveCard(b);
  }

  function doCheckIn(b, extra = {}) {
    const v = vendorOf(b);
    Object.assign(b, { status: 'Checked in', at: Date.now(), by: 'Gate 1' }, extra);
    if ($('permitOk')?.checked) v.permit = 'valid';
    EWM.save(store);
    log('green', `${v.business || v.name} → ${b.space}`);
    openSheet(verdict('green', '✓', `Go to ${b.space}`, esc(v.business || v.name)) + `<div class="sbody">
      <div class="big-n">${b.space}</div><p class="muted" style="text-align:center">${ZONES[EWM.spaceByCode[b.space].zone].where}</p>
      <div class="acts">${nextBtn('Scan next (auto in 2s)')}</div></div>`, 'green');
    bindClose();
    autoClose = setTimeout(closeSheet, 2200);
  }

  function payCard(b) {
    const v = vendorOf(b);
    let method = 'Cash'; let given = 0;
    const owe = b.due || b.amount;
    const draw = () => {
      openSheet(verdict('amber', '💵', `Collect ${money(owe)}`, esc(v.business || v.name) + ' · ' + b.space) + `<div class="sbody">
        <div class="grid g3" id="pm">${['Cash', 'Tap to Pay', 'Credit'].map((m) => `<button class="choice ${m === method ? 'on' : ''}" data-m="${m}"><div class="t" style="font-size:.95rem">${{ Cash: '💵', 'Tap to Pay': '📱', Credit: '🎟' }[m]} ${m}</div></button>`).join('')}</div>
        ${method === 'Cash' ? `<div class="bills">${[owe, 20, 50, 100].map((n, i) => `<button class="${given === n ? 'on' : ''}" data-g="${n}">${i ? money(n) : 'Exact'}</button>`).join('')}</div>
          ${given ? `<p style="text-align:center;font-size:1.3rem;margin-top:12px">${given >= owe ? `Give change <b>${money(given - owe)}</b>` : `<span style="color:var(--red)">Short ${money(owe - given)}</span>`}</p>` : ''}` : ''}
        ${method === 'Tap to Pay' ? `<div class="tap"><div class="w">📱</div><b>Hold their card or phone near this phone</b><div class="small muted">Apple Pay, Google Pay, or a contactless card</div></div>` : ''}
        ${method === 'Credit' ? '<p class="muted" style="margin-top:12px">Uses their absentee credit balance.</p>' : ''}
        <div class="acts">
          <button class="btn green lg block" id="paidOk" ${method === 'Cash' && given && given < owe ? 'disabled' : ''}>✓ ${method === 'Tap to Pay' ? 'Payment approved (demo)' : 'Paid'} · check in</button>
          <button class="btn lg block" id="payBack">Back</button>
        </div></div>`, 'amber');
      $('pm').querySelectorAll('button').forEach((x) => x.onclick = () => { method = x.dataset.m; given = 0; draw(); });
      $('sheet').querySelectorAll('[data-g]').forEach((x) => x.onclick = () => { given = +x.dataset.g; draw(); });
      $('paidOk').onclick = () => doCheckIn(b, { paid: true, due: 0, payMethod: method, paidAt: Date.now() });
      $('payBack').onclick = () => vendorCard(b);
    };
    draw();
  }

  function moveCard(b) {
    const v = vendorOf(b);
    const used = new Set(dayBookings().filter((x) => x !== b && x.status !== 'Absent').map((x) => x.space));
    const cur = EWM.spaceByCode[b.space];
    let pick = null;
    const priceOf = (s) => EWM.price(s, EWM.parse(DAY).getDay(), 'daily', b.elec).total;
    const draw = () => {
      const rows = ['A', 'B', 'C', 'D', 'E', 'F'].map((r, i) => (i && i % 2 === 0 ? '<span class="gap"></span>' : '') + `<span class="rl">${r}</span>` + SPACES.filter((s) => s.row === r).map((s) => {
        const free = !used.has(s.code) || s.code === b.space;
        return `<button class="${s.zone} ${s.code === b.space ? 'cur' : ''} ${pick === s.code ? 'sel' : ''}" data-s="${s.code}" ${free && s.code !== b.space ? '' : 'disabled'} title="${s.code}">${s.n}</button>`;
      }).join('')).join('');
      const p = pick && EWM.spaceByCode[pick];
      const diff = p ? priceOf(p) - priceOf(cur) : 0;
      const freeN = SPACES.filter((s) => !used.has(s.code) && s.code !== b.space).length;
      openSheet(verdict('amber', '⇄', 'Move space', `${esc(v.business || v.name)} · now ${b.space}`) + `<div class="sbody">
        <p class="muted" style="margin:0">${freeN} open today. Tap one. Grey = taken.</p>
        <div class="mini">${rows}</div>
        <div class="row small muted" style="margin-top:8px;gap:12px"><span>🟨 Premium</span><span>🟩 Shaded</span><span>🟦 Open field</span><span>⬛ current</span></div>
        ${p ? `<div class="kv" style="margin-top:10px"><span>New space</span><span><b>${p.code}</b> · ${ZONES[p.zone].label}</span></div>
          <div class="kv"><span>Price difference</span><span>${diff > 0 ? `<b style="color:var(--amber)">+${money(diff)} to collect</b>` : diff < 0 ? `${money(-diff)} less (no refund at gate)` : 'Same price'}</span></div>` : ''}
        <div class="acts">
          <button class="btn primary lg block" id="mvOk" ${p ? '' : 'disabled'}>${p ? `Move to ${p.code}${diff > 0 ? ' · collect ' + money(diff) : ''}` : 'Pick a space'}</button>
          <button class="btn lg block" id="mvBack">Back</button>
        </div></div>`, 'amber');
      $('sheet').querySelectorAll('[data-s]').forEach((x) => x.onclick = () => { pick = x.dataset.s; draw(); });
      $('mvBack').onclick = () => vendorCard(b);
      $('mvOk').onclick = () => {
        const from = b.space;
        b.space = pick; b.movedFrom = from; if (b.status === 'Absent') b.status = 'Confirmed';
        if (diff > 0) { b.amount += diff; if (EWM.isPaid(b)) b.due = diff; }
        EWM.save(store);
        EWM.toast(`Moved ${from} → ${pick}`);
        vendorCard(b);
      };
    };
    draw();
  }

  // ---------- inputs ----------
  $('typeBtn').onclick = () => { $('manual').classList.toggle('hidden'); $('code').focus(); };
  $('codeGo').onclick = () => { if ($('code').value.trim()) { handle($('code').value); $('code').value = ''; } };
  $('code').onkeydown = (e) => { if (e.key === 'Enter') $('codeGo').onclick(); };

  $('cam').onclick = async () => {
    if (scanner) { try { await scanner.stop(); } catch (e) { /* already stopped */ } scanner = null; $('cam').textContent = '📷 Use camera'; $('laser').classList.remove('hidden'); return; }
    if (!window.Html5Qrcode) { EWM.toast('Camera library did not load. Use the demo buttons.'); return; }
    try {
      scanner = new Html5Qrcode('reader');
      let last = ''; let lastT = 0;
      await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: 220 }, (text) => {
        if (text === last && Date.now() - lastT < 3000) return; // same code held in view
        last = text; lastT = Date.now(); handle(text);
      });
      $('cam').textContent = '■ Stop camera'; $('laser').classList.add('hidden');
    } catch (e) {
      scanner = null;
      EWM.toast('No camera access here. Open over https or localhost, or use the demo buttons.');
    }
  };

  // ---------- demo: simulate scans ----------
  function sim(kind) {
    store = EWM.load();
    const all = dayBookings();
    const waiting = all.filter((b) => !isHere(b) && b.status !== 'Absent');
    const code = (b) => 'EWM:V:' + (b.conf || b.id);
    const pickOne = (list) => list[Math.floor(Math.random() * list.length)];
    const ensureTicket = (date, used) => {
      store.tickets = store.tickets || [];
      let t = store.tickets.find((x) => x.date === date && !!x.usedAt === used && x.paid !== false);
      if (!t) {
        const order = 'O-' + Math.floor(100000 + Math.random() * 900000);
        t = { id: `T${order.slice(2)}-1`, order, date, kind: 'adult', price: DAYS[EWM.parse(date).getDay()].admission, method: 'Apple Pay', paid: true, boughtAt: Date.now(), usedAt: used ? Date.now() - 1800000 : null, usedBy: used ? 'Gate 2' : undefined };
        store.tickets.push(t); EWM.save(store);
      }
      return 'EWM:T:' + t.id;
    };
    let c = null;
    if (kind === 'paid') c = pickOne(waiting.filter((b) => EWM.isPaid(b) && !permitBad(vendorOf(b)) && !firstTime(vendorOf(b))));
    if (kind === 'owes') c = pickOne(waiting.filter((b) => !EWM.isPaid(b)));
    if (kind === 'permit') c = pickOne(waiting.filter((b) => permitBad(vendorOf(b))));
    if (kind === 'first') c = pickOne(waiting.filter((b) => firstTime(vendorOf(b))));
    if (kind === 'again') c = pickOne(all.filter(isHere));
    if (c) return handle(code(c));
    if (['paid', 'owes', 'permit', 'first', 'again'].includes(kind)) { EWM.toast(kind === 'again' ? 'Check someone in first, then scan them again' : 'No vendor like that left today'); return; }
    if (kind === 'ticket') return handle(ensureTicket(DAY, false));
    if (kind === 'unpaid') {
      // A code that looks like a ticket but was never paid (e.g. a tampered or
      // half-finished order). The scanner must refuse it.
      store.tickets = store.tickets || [];
      const order = 'O-' + Math.floor(100000 + Math.random() * 900000);
      const t = { id: `T${order.slice(2)}-1`, order, date: DAY, kind: 'adult', price: DAYS[EWM.parse(DAY).getDay()].admission, method: 'none', paid: false, boughtAt: Date.now(), usedAt: null };
      store.tickets.push(t); EWM.save(store);
      return handle('EWM:T:' + t.id);
    }
    if (kind === 'used') return handle(ensureTicket(DAY, true));
    if (kind === 'wrongday') {
      const other = store.bookings.find((b) => b.date > DAY && b.status !== 'Cancelled');
      return handle(other ? code(other) : ensureTicket(EWM.upcoming(EWM.parse(DAY).getDay(), 2)[1], false));
    }
    if (kind === 'fake') return handle('https://example.com/coupon-' + Math.floor(Math.random() * 1e4));
  }
  $('demo').querySelectorAll('[data-sim]').forEach((b) => b.onclick = () => sim(b.dataset.sim));

  renderStatus(); renderHist();
})();
