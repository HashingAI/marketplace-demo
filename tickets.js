// Visitor tickets. Every visitor enters with a QR code, however they pay:
//   Apple Pay / Google Pay / card  -> paid QR tickets right away
//   Cash                           -> gatekeeper sells at the gate, then the
//                                     visitor scans a claim QR (?claim=ORDER)
// There is deliberately no "reserve now, pay cash later" ticket: an unpaid QR
// looks like a real ticket and invites arguments and skipped payments at the gate.
// One QR per person, black and white (vendor passes are yellow).
(() => {
  const { DAYS, money, esc } = EWM;
  const $ = (id) => document.getElementById(id);
  const enabled = (ds) => EWM.parse(ds).getDay() in DAYS && ds >= EWM.todayIso() && (EWM.parse(ds) - EWM.today()) / 864e5 <= 60;
  const state = { date: EWM.nextMarketDay(), adult: 1, child: 0 };
  const price = () => DAYS[EWM.parse(state.date).getDay()].admission;
  const LABEL = { 'Apple Pay': (t) => ` Pay ${t}`, 'Google Pay': (t) => `G Pay ${t}`, Card: (t) => `💳 Card ${t}` };

  function render() {
    const d = EWM.parse(state.date);
    $('dateBtn').innerHTML = `<span>📅 ${d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span><span class="muted small">${DAYS[d.getDay()].hours} ▾</span>`;
    $('pAdult').textContent = `${money(price())} each`;
    $('nAdult').textContent = state.adult; $('nChild').textContent = state.child;
    document.querySelectorAll('.round').forEach((b) => { b.disabled = +b.dataset.s < 0 && state[b.dataset.d] <= (b.dataset.d === 'adult' ? 1 : 0); });
    const total = money(state.adult * price());
    $('total').textContent = total;
    document.querySelectorAll('[data-pay]').forEach((b) => { b.textContent = LABEL[b.dataset.pay](total); });
  }

  $('dateBtn').onclick = (e) => { e.stopPropagation(); EWM.datePicker($('dateBtn'), { value: state.date, enabled, onPick: (ds) => { state.date = ds; render(); } }); };
  document.querySelectorAll('.round').forEach((b) => b.onclick = () => { state[b.dataset.d] = Math.max(0, Math.min(10, state[b.dataset.d] + +b.dataset.s)); render(); });

  document.querySelectorAll('[data-pay]').forEach((b) => b.onclick = () => {
    const method = b.dataset.pay;
    document.querySelectorAll('[data-pay]').forEach((x) => { x.disabled = true; });
    EWM.toast(method === 'Card' ? 'Processing card…' : 'Confirm with Face ID… (demo)');
    setTimeout(() => {
      const s = EWM.load(); s.tickets = s.tickets || [];
      const order = 'O-' + Math.floor(100000 + Math.random() * 900000);
      const p = price();
      const kinds = [...Array(state.adult)].map(() => 'adult').concat([...Array(state.child)].map(() => 'child'));
      const list = kinds.map((kind, i) => ({
        id: `T${order.slice(2)}-${i + 1}`, order, date: state.date, kind, price: kind === 'adult' ? p : 0,
        method, paid: true, boughtAt: Date.now(), usedAt: null, channel: 'online',
      }));
      s.tickets.push(...list); EWM.save(s);
      localStorage.setItem('ewm_my_tickets', JSON.stringify(list.map((t) => t.id)));
      showTickets();
      EWM.toast(`✓ Paid ${money(state.adult * p)} · ${list.length} ticket${list.length > 1 ? 's' : ''}`);
    }, 900);
  });

  function showTickets(heading) {
    const s = EWM.load();
    const mine = JSON.parse(localStorage.getItem('ewm_my_tickets') || '[]');
    const list = (s.tickets || []).filter((t) => mine.includes(t.id));
    if (!list.length) { EWM.toast('No tickets yet'); return; }
    const d = list[0].date;
    $('buy').classList.add('hidden'); $('done').classList.remove('hidden');
    $('done').innerHTML = `
      <div class="hero"><h1>${heading || 'Your tickets'}</h1>
        <p class="muted">${EWM.nice(d, { weekday: 'long', month: 'long', day: 'numeric' })} · ${DAYS[EWM.parse(d).getDay()].hours}</p></div>
      <div class="tix">${list.map((t, i) => `
        <div class="tk ${t.usedAt ? 'used' : ''}">
          <div class="kind">${t.kind === 'adult' ? 'Adult' : 'Child · free'} · ${i + 1} of ${list.length}</div>
          <div class="date">${EWM.nice(t.date, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
          ${EWM.qr('EWM:T:' + t.id, 5, 'visitor')}
          <div class="id">${esc(t.id)}</div>
          <div class="stamp">USED ${t.usedAt ? new Date(t.usedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''}</div>
        </div>`).join('')}</div>
      <p class="dotsnav">${list.length > 1 ? 'Swipe to see each ticket · one person per code' : 'Show this at the gate'}</p>
      <div class="grid g2" style="margin-top:12px">
        <button class="btn lg" style="background:#000;color:#fff;border-color:#000" id="aw"> Add to Apple Wallet</button>
        <button class="btn lg" id="gw"><b style="color:#4285f4">G</b>&nbsp;Google Wallet</button>
      </div>
      <p class="small muted" style="text-align:center;margin-top:14px">We also texted these to you. Staff: try them in the <a href="scan.html">Gate scanner</a>.</p>
      <p style="text-align:center"><button class="btn" id="again">Buy more</button></p>`;
    $('aw').onclick = () => EWM.toast(' Added to Apple Wallet (demo)');
    $('gw').onclick = () => EWM.toast('Added to Google Wallet (demo)');
    $('again').onclick = () => { $('done').classList.add('hidden'); $('buy').classList.remove('hidden'); document.querySelectorAll('[data-pay]').forEach((x) => { x.disabled = false; }); render(); };
  }
  $('mine').onclick = () => showTickets();

  // Visitor scanned the claim QR the gatekeeper showed after a gate sale.
  const claim = new URLSearchParams(location.search).get('claim');
  if (claim) {
    const s = EWM.load();
    const ids = (s.tickets || []).filter((t) => t.order === claim).map((t) => t.id);
    if (ids.length) {
      localStorage.setItem('ewm_my_tickets', JSON.stringify(ids));
      showTickets('Paid at the gate ✓');
      return;
    }
    EWM.toast('That code has expired. Ask the gate staff.');
  }
  render();
})();
