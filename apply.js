// Vendor application:
//   Sign in -> About you -> Your business -> Documents -> Pay -> Done
// Fields follow what California requires the operator to keep on every seller
// (CDTFA Pub 111 / form CDTFA-410-D) plus what the owner needs to run the market.
// Every form page has a purple "Demo" bar that fills it in with fake data.
(() => {
  const { DAYS, ZONES, money, esc } = EWM;
  const $ = (id) => document.getElementById(id);

  const cart = JSON.parse(localStorage.getItem('ewm_cart') || 'null');
  let user = JSON.parse(localStorage.getItem('ewm_user') || 'null');

  const STEPS = ['Sign in', 'About you', 'Business', 'Documents', 'Pay', 'Done'];
  let step = user ? 1 : 0;
  let result = null;
  let preview = 'sms';

  const GOODS = ['New items', 'Used / secondhand', 'Handmade', 'Food or drinks', 'Plants / produce'];
  const CATS = ['Clothing', 'Shoes', 'Produce', 'Food', 'Antiques', 'Collectibles', 'Tools', 'Electronics', 'Toys', 'Plants', 'Jewelry', 'Home goods', 'Crafts', 'Beauty', 'Other'];
  const EXEMPT = [
    'My product sales are not taxable (for example cold food to go)',
    'My sales are occasional sales and exempt',
    'I sell for a retailer that holds the permit',
  ];
  const HEARD = ['Drove by', 'A friend / another vendor', 'Phone call', 'Facebook / Instagram', 'Google', 'Other'];

  const form = {
    // about you
    name: user?.name || '', phone: user?.phone || '', email: user?.email || '',
    street: '', city: '', zip: '', idNumber: '', idState: 'CA', lang: 'English', heard: '',
    emergName: '', emergPhone: '',
    // business
    business: '', entity: 'Individual', years: '', website: '', social: '',
    permitStatus: 'have', permitNo: '', exemptReason: EXEMPT[0],
    goods: [], category: 'Clothing', describe: '', priceRange: '', canopy: true, vehicle: '', notes: '',
    // documents
    files: {}, permitExp: '', coiExp: '', tffExp: '',
    acks: { rules: false, prohibited: false, used: false, truth: false }, signature: '',
  };

  const sells = (g) => form.goods.includes(g);
  const DOCS = [
    { key: 'permit', icon: '📄', title: "California seller's permit", need: () => form.permitStatus === 'have', required: true, exp: null,
      why: 'State law: we may not rent you a space until we verify your permit. We keep a copy for 4 years.', src: ['CDTFA Pub 111', 'https://cdtfa.ca.gov/formspubs/pub111/'] },
    { key: 'id', icon: '🪪', title: "Driver's license or state ID", need: () => true, required: true, exp: null,
      why: 'The state requires us to record your ID number and issuing state.', src: ['CDTFA-410-D', 'https://cdtfa.ca.gov/formspubs/cdtfa410d.pdf'] },
    { key: 'coi', icon: '🛡️', title: 'Liability insurance certificate', need: () => true, required: true, exp: 'coiExp',
      why: 'Market rule: $1,000,000 general liability, with Escondido World Marketplace named as additional insured.', src: null },
    { key: 'tff', icon: '🍽️', title: 'San Diego County health permit (TFF)', need: () => sells('Food or drinks'), required: true, exp: 'tffExp',
      why: 'Required for anyone selling food or drinks at a swap meet. Apply 30 days ahead. Post it in your booth.', src: ['SD County DEH', 'https://www.sandiegocounty.gov/content/sdc/deh/fhd/food/tempevents.html'] },
    { key: 'biz', icon: '🏢', title: 'City or county business license', need: () => true, required: false, exp: null,
      why: 'Optional. State inspectors may ask to see it if you have one.', src: null },
  ];
  const neededDocs = () => DOCS.filter((d) => d.need());

  // ---------- demo fill ----------
  const DEMO = {
    1: () => Object.assign(form, {
      name: form.name || 'Maria Lopez', phone: form.phone || '(760) 555-0142', email: form.email || 'maria.lopez@example.com',
      street: '1420 E Valley Pkwy', city: 'Escondido', zip: '92027', idNumber: 'D1234567', idState: 'CA', lang: 'Español', heard: 'A friend / another vendor',
      emergName: 'Carlos Lopez', emergPhone: '(760) 555-0177',
    }),
    2: () => Object.assign(form, {
      business: 'Lopez Style Rack', entity: 'Sole proprietor (DBA)', years: '6', website: 'lopezstylerack.com', social: '@lopezstylerack',
      permitStatus: 'have', permitNo: '102-345678', goods: ['New items', 'Used / secondhand'], category: 'Clothing',
      describe: "Women's and kids' clothing, mostly new with tags. Some vintage jackets.", priceRange: '$5 – $40', canopy: true, vehicle: '8ABC123',
      notes: 'Prefer a spot near the food court if possible.',
    }),
    3: () => {
      const names = { permit: 'sellers-permit.jpg', id: 'drivers-license.jpg', coi: 'insurance-certificate.pdf', tff: 'health-permit.pdf', biz: 'business-license.pdf' };
      neededDocs().forEach((d) => { form.files[d.key] = { name: names[d.key], size: '1.2 MB', demo: true }; });
      const y = new Date(); y.setFullYear(y.getFullYear() + 1);
      form.coiExp = EWM.iso(y); form.tffExp = EWM.iso(y);
      Object.keys(form.acks).forEach((k) => { form.acks[k] = true; });
      form.signature = form.name;
    },
  };
  const demoBar = (n) => `
    <div class="demo">🧪 Demo mode <span class="spacer"></span>
      <button class="btn sm" data-demo="${n}">Fill this page</button>
      <button class="btn sm" data-demo="all">Fill all → Pay</button>
    </div>`;

  // ---------- small render helpers ----------
  const inp = (id, label, opts = {}) => `
    <label class="f" for="${id}">${label}${opts.req ? ' <span class="req">*</span>' : ''}${opts.opt ? ' <span class="muted small">(optional)</span>' : ''}</label>
    <input class="in" id="${id}" value="${esc(form[id])}" ${opts.type ? `type="${opts.type}"` : ''} ${opts.mode ? `inputmode="${opts.mode}"` : ''} placeholder="${esc(opts.ph || '')}" />
    ${opts.why ? `<div class="why">${opts.why}</div>` : ''}`;
  const sel = (id, label, list, opts = {}) => `
    <label class="f" for="${id}">${label}${opts.opt ? ' <span class="muted small">(optional)</span>' : ''}</label>
    <select class="in" id="${id}">${opts.blank ? '<option value="">Choose…</option>' : ''}${list.map((x) => `<option ${x === form[id] ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`;
  const chips = (id, list, multi) => `<div class="chips" data-chips="${id}" data-multi="${multi ? 1 : 0}">${list.map((x) => `<button class="chip ${(multi ? form[id].includes(x) : form[id] === x) ? 'on' : ''}" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div>`;

  function renderStepper() {
    $('stepper').innerHTML = STEPS.map((s, i) => `<div class="${i <= step ? 'on' : ''}"><div class="bar"></div><div class="lbl">${s}</div></div>`).join('');
  }
  function renderCart() {
    if (!cart || step === 5) { $('cartBox').innerHTML = ''; return; }
    $('cartBox').innerHTML = `
      <div class="cart">
        <span class="code">${esc(cart.space)}</span>
        <div style="flex:1"><b>${esc(cart.when)}</b><br><span class="small muted">${ZONES[cart.zone].label} · ${esc(cart.hours)}${cart.elec ? ' · ⚡ Power' : ''}</span></div>
        <b style="font-size:1.3rem">${money(cart.total)}</b>
      </div>`;
  }

  // ---------- views ----------
  const views = {
    0: () => `
      <h2>Sign in to continue</h2>
      <p class="muted">One account for all your reservations and documents.</p>
      <div class="sso">
        <button class="btn lg" data-sso="Google"><b style="color:#4285f4">G</b>&nbsp; Continue with Google</button>
        <button class="btn lg dark" data-sso="Apple"> Continue with Apple</button>
      </div>
      <div class="or">or use your phone number</div>
      <div id="phoneBox">
        <input class="in" id="ph" type="tel" placeholder="(760) 555-0123" inputmode="tel" />
        <button class="btn primary lg block" id="send" style="margin-top:12px">Text me a code</button>
      </div>`,

    1: () => `
      ${demoBar(1)}
      <h2>About you</h2>
      <p class="muted">The state asks us to keep this on file for every seller.</p>
      <div class="sec"><div class="sec-t">Contact</div>
        ${inp('name', 'Full legal name', { req: true, why: 'As it appears on your ID.' })}
        <div class="two"><div>${inp('phone', 'Mobile phone', { req: true, type: 'tel', mode: 'tel' })}</div><div>${inp('email', 'Email', { req: true, type: 'email', why: 'Your QR code and receipts go here.' })}</div></div>
        <label class="f">Preferred language</label>${chips('lang', ['English', 'Español'], false)}
      </div>
      <div class="sec"><div class="sec-t">Mailing address</div>
        ${inp('street', 'Street', { req: true })}
        <div class="two"><div>${inp('city', 'City', { req: true })}</div><div>${inp('zip', 'ZIP', { req: true, mode: 'numeric' })}</div></div>
      </div>
      <div class="sec"><div class="sec-t">ID</div>
        <div class="two"><div>${inp('idNumber', "Driver's license or ID number", { req: true })}</div><div>${sel('idState', 'Issued by (state)', ['CA', 'AZ', 'NV', 'OR', 'Other / Mexico'])}</div></div>
        <div class="why">Required by California for swap meet sellers (CDTFA-410-D).</div>
      </div>
      <div class="sec"><div class="sec-t">Emergency contact <span style="text-transform:none;font-weight:400">(optional)</span></div>
        <div class="two"><div>${inp('emergName', 'Name')}</div><div>${inp('emergPhone', 'Phone', { type: 'tel', mode: 'tel' })}</div></div>
        ${sel('heard', 'How did you hear about us?', HEARD, { blank: true, opt: true })}
      </div>
      ${nav(true)}`,

    2: () => `
      ${demoBar(2)}
      <h2>Your business</h2>
      <p class="muted">Helps us place you well and approve you faster.</p>
      <div class="sec"><div class="sec-t">Business</div>
        ${inp('business', 'Business name', { req: true, ph: 'Or your own name if you have none' })}
        <div class="two"><div>${sel('entity', 'Business type', ['Individual', 'Sole proprietor (DBA)', 'LLC / Corporation', 'Nonprofit'])}</div><div>${inp('years', 'Years selling', { mode: 'numeric', opt: true })}</div></div>
        <div class="two"><div>${inp('website', 'Website', { opt: true, ph: 'example.com' })}</div><div>${inp('social', 'Instagram / Facebook', { opt: true, ph: '@yourshop' })}</div></div>
      </div>
      <div class="sec"><div class="sec-t">California seller's permit</div>
        <div class="chips" data-chips="permitStatus" data-multi="0" style="margin-top:10px">
          <button class="chip ${form.permitStatus === 'have' ? 'on' : ''}" data-v="have">I have one</button>
          <button class="chip ${form.permitStatus === 'exempt' ? 'on' : ''}" data-v="exempt">I don't need one</button>
        </div>
        ${form.permitStatus === 'have'
          ? inp('permitNo', 'Permit number', { req: true, ph: '123-456789', why: 'We check it on the CDTFA website before your first day. <a href="https://cdtfa.ca.gov/formspubs/pub107/" target="_blank">Need one? It\'s free.</a>' })
          : sel('exemptReason', 'Reason (state form)', EXEMPT)}
      </div>
      <div class="sec"><div class="sec-t">What you sell</div>
        <label class="f">Type of goods <span class="req">*</span> <span class="muted small">pick all that apply</span></label>${chips('goods', GOODS, true)}
        ${sells('Used / secondhand') ? '<div class="why" style="color:var(--amber)">Selling used items: state law asks for a list of used items with serial numbers. We collect it at check-in.</div>' : ''}
        ${sells('Food or drinks') ? '<div class="why" style="color:var(--amber)">Food or drinks: you will need a San Diego County health permit on the next page.</div>' : ''}
        <div class="two"><div>${sel('category', 'Main category', CATS)}</div><div>${inp('priceRange', 'Typical prices', { opt: true, ph: '$5 – $40' })}</div></div>
        <label class="f" for="describe">Describe what you sell <span class="req">*</span></label>
        <textarea class="in" id="describe" placeholder="e.g. New kids' clothes and shoes, some used toys">${esc(form.describe)}</textarea>
        <div class="why">Required by the state. We also use it to avoid putting the same items side by side.</div>
      </div>
      <div class="sec"><div class="sec-t">Setup</div>
        <label class="ack"><input type="checkbox" id="canopy" ${form.canopy ? 'checked' : ''} /><span>I bring my own canopy / tent (10×10 max)</span></label>
        ${inp('vehicle', 'Vehicle license plate', { opt: true, ph: '8ABC123', why: 'For vendor parking.' })}
        <label class="f" for="notes">Anything we should know? <span class="muted small">(optional)</span></label>
        <textarea class="in" id="notes" placeholder="Accessibility needs, preferred neighbors, questions…">${esc(form.notes)}</textarea>
      </div>
      ${nav(true)}`,

    3: () => {
      const rows = neededDocs().map((d) => {
        const f = form.files[d.key];
        return `
          <div class="doc ${f ? 'done' : ''}">
            <div class="ic">${f ? '✅' : d.icon}</div>
            <div class="body">
              <b>${d.title}</b> ${d.required ? '<span class="badge accent">Required</span>' : '<span class="badge">Optional</span>'}
              <div class="small muted" style="margin-top:4px">${d.why}</div>
              ${d.src ? `<div class="src"><a href="${d.src[1]}" target="_blank">Source: ${d.src[0]} ↗</a></div>` : ''}
              ${f ? `<div class="fn">📎 ${esc(f.name)} · ${f.size}${f.demo ? ' · demo file' : ''}</div>` : ''}
              ${d.exp && f ? `<label class="small" style="display:block;margin-top:8px">Expires on <input class="in" type="date" data-exp="${d.exp}" value="${esc(form[d.exp])}" style="min-height:42px;margin-top:4px" /></label>` : ''}
            </div>
            <label class="btn sm" for="f-${d.key}">${f ? 'Change' : '📷 Upload'}</label>
            <input type="file" id="f-${d.key}" data-key="${d.key}" accept="image/*,.pdf" />
          </div>`;
      }).join('');
      const a = form.acks;
      return `
        ${demoBar(3)}
        <h2>Documents</h2>
        <p class="muted">Take a photo with your phone or upload a PDF. Returning vendors only do this once.</p>
        ${rows}
        <div class="doc done" style="background:#fff">
          <div class="ic">✍️</div>
          <div class="body"><b>State seller form (CDTFA-410-D)</b> <span class="badge green">We fill it for you</span>
            <div class="small muted" style="margin-top:4px">Built from your answers. You sign below.</div></div>
        </div>
        <div class="sec"><div class="sec-t">Please confirm</div>
          <label class="ack"><input type="checkbox" data-ack="rules" ${a.rules ? 'checked' : ''} /><span>I agree to the market rules, setup and cleanup times.</span></label>
          <label class="ack"><input type="checkbox" data-ack="prohibited" ${a.prohibited ? 'checked' : ''} /><span>I will not sell prohibited items (weapons, fake brand items, alcohol, tobacco or vapes to minors, live animals).</span></label>
          ${sells('Used / secondhand') ? `<label class="ack"><input type="checkbox" data-ack="used" ${a.used ? 'checked' : ''} /><span>I will list my used items for the state report at check-in.</span></label>` : ''}
          <label class="ack"><input type="checkbox" data-ack="truth" ${a.truth ? 'checked' : ''} /><span>The information I gave is true. Escondido World Marketplace may verify my seller's permit with the state.</span></label>
          <label class="f" for="signature">Type your full name to sign <span class="req">*</span></label>
          <input class="in" id="signature" value="${esc(form.signature)}" style="font-family:'Brush Script MT',cursive;font-size:1.5rem" />
        </div>
        ${nav(docsReady())}`;
    },

    4: () => `
      <h2>Pay</h2>
      ${cart.lines.map((l) => `<div class="row" style="justify-content:space-between;padding:4px 0"><span>${esc(l.label)}</span><span>${l.was ? `<s class="muted small">${money(l.was)}</s> ` : ''}<b>${money(l.amount)}</b></span></div>`).join('')}
      ${cart.save ? `<div class="row" style="justify-content:space-between;color:var(--green);font-weight:600;padding:4px 0"><span>You save</span><span>${money(cart.save)}</span></div>` : ''}
      <div class="row" style="justify-content:space-between;margin:12px 0 18px;padding-top:12px;border-top:1px solid var(--line);font-size:1.3rem"><b>Total</b><b>${money(cart.total)}</b></div>
      <div class="pay-opt">
        <button class="btn lg apple" data-pay="Apple Pay"> Pay</button>
        <button class="btn lg" data-pay="Google Pay"><b style="color:#4285f4">G</b>&nbsp;Pay</button>
        <button class="btn lg" id="cardBtn">💳 Pay with card</button>
      </div>
      <div id="cardForm" class="hidden" style="margin-top:14px">
        <input class="in" placeholder="Card number  4242 4242 4242 4242" inputmode="numeric" />
        <div class="two" style="margin-top:10px"><input class="in" placeholder="MM / YY" /><input class="in" placeholder="CVC" /></div>
        <button class="btn primary lg block" data-pay="Visa •••• 4242" style="margin-top:12px">Pay ${money(cart.total)}</button>
      </div>
      <p class="small muted" style="text-align:center;margin-top:14px">🔒 Secure payment by Stripe. Full refund if your application is not approved.</p>
      <button class="btn" id="back" style="margin-top:6px">Back</button>`,

    5: () => {
      const r = result;
      return `
        <div class="done-hero">
          <div class="check">✓</div>
          <h1>You're all set, ${esc(r.first)}!</h1>
          <p class="muted">Space <b>${esc(r.space)}</b> · ${esc(r.when)} · ${esc(r.hours)}</p>
          <div class="qr">${qrSvg(r.conf, 5)}</div>
          <div class="big">${esc(r.conf)}</div>
          <p class="small muted">Show this at ${r.plan === 'monthly' ? 'Express Check-in' : 'the vendor gate'}. No printing needed.</p>
          <div class="wallets">
            <button class="btn w-apple" data-wallet="Apple Wallet"> Add to Apple Wallet</button>
            <button class="btn" data-wallet="Google Wallet"><b style="color:#4285f4">G</b>&nbsp;Add to Google Wallet</button>
            <button class="btn" id="ics">📅 Add to calendar</button>
          </div>
        </div>

        <div class="sent">
          <div class="sec-t">We just sent you</div>
          <div class="sent-row ${preview === 'sms' ? 'on' : ''}" data-pv="sms"><span class="ic">💬</span><div><b>Text message</b><div class="small muted">to ${esc(r.phone)}</div></div><span class="st">✓ Delivered</span></div>
          <div class="sent-row ${preview === 'email' ? 'on' : ''}" data-pv="email"><span class="ic">✉️</span><div><b>Email with your QR code</b><div class="small muted">to ${esc(r.email)}</div></div><span class="st">✓ Sent</span></div>
          <div class="sent-row ${preview === 'wallet' ? 'on' : ''}" data-pv="wallet"><span class="ic">🎫</span><div><b>Wallet pass</b><div class="small muted">${r.wallet ? 'Added to ' + esc(r.wallet) : 'Tap a wallet button above'}</div></div><span class="st" style="${r.wallet ? '' : 'color:var(--muted)'}">${r.wallet ? '✓ Added' : 'Ready'}</span></div>
        </div>
        <div class="preview" id="pv"></div>

        <ul class="timeline">
          <li class="ok"><span class="b">✓</span><div><div class="tt">Application sent</div><div class="small muted">Just now</div></div></li>
          <li class="ok"><span class="b">✓</span><div><div class="tt">Documents uploaded</div><div class="small muted">${Object.keys(form.files).length} files + signed state form</div></div></li>
          <li class="ok"><span class="b">✓</span><div><div class="tt">Paid ${money(r.total)}</div><div class="small muted">${esc(r.method)}</div></div></li>
          <li class="now"><span class="b">●</span><div><div class="tt">Staff review</div><div class="small muted">We verify your seller's permit, usually within 1 business day. We'll text you.</div></div></li>
          <li><span class="b">5</span><div><div class="tt">Market day</div><div class="small muted">Reminder the night before, with your space number</div></div></li>
          <li><span class="b">6</span><div><div class="tt">Completed</div><div class="small muted">Receipt and any balance due appear here</div></div></li>
        </ul>
        <div class="two" style="margin-top:8px">
          <a class="btn lg" href="booking.html">Book another</a>
          <a class="btn lg dark" href="crm.html">See it as the owner →</a>
        </div>`;
    },
  };

  const nav = (ok) => `<div class="row" style="margin-top:24px"><button class="btn" id="back">Back</button><span class="spacer"></span><button class="btn primary lg" id="next" ${ok ? '' : 'disabled'}>Next</button></div>`;

  // ---------- previews on the done page ----------
  function renderPreview() {
    const r = result; const el = $('pv'); if (!el) return;
    const es = form.lang === 'Español';
    if (preview === 'sms') {
      el.innerHTML = `<div class="phone"><div class="screen"><div class="notch"></div>
        <div class="push"><b>💬 Messages · now</b><br>Escondido World Mkt: ${es ? '¡Listo!' : "You're booked!"} Space ${esc(r.space)}…</div>
        <div class="from">Escondido World Marketplace</div>
        <div class="bubble">${es
          ? `¡Hola ${esc(r.first)}! Tu espacio <b>${esc(r.space)}</b> está reservado: ${esc(r.when)}. Código: <b>${esc(r.conf)}</b>. Muéstralo en la entrada de vendedores.`
          : `Hi ${esc(r.first)}! Space <b>${esc(r.space)}</b> is booked for ${esc(r.when)}. Code: <b>${esc(r.conf)}</b>. Show it at the vendor gate.`}</div>
        <div class="bubble">${es ? 'Tu código QR y recibo' : 'Your QR code and receipt'}: <a href="#">ewm.co/r/${esc(r.conf.slice(3))}</a></div>
        <div class="bubble">${es ? 'Estamos revisando tus documentos. Te avisamos pronto.' : "We're reviewing your documents and will text you soon."} ${es ? 'Responde STOP para cancelar.' : 'Reply STOP to opt out.'}</div>
      </div></div>`;
    } else if (preview === 'email') {
      el.innerHTML = `<div class="mail">
        <div class="mail-h"><b>From:</b> Escondido World Marketplace &lt;bookings@escondidowm.com&gt;<br><b>To:</b> ${esc(r.email)}<br><b>Subject:</b> Your space ${esc(r.space)} is booked · ${esc(r.conf)}</div>
        <div class="mail-b">
          <div class="mbar"></div>
          <h2>See you at the market, ${esc(r.first)}!</h2>
          <p class="muted">Show this QR code at ${r.plan === 'monthly' ? 'Express Check-in' : 'the vendor gate'}.</p>
          <div style="text-align:center"><div class="qr">${qrSvg(r.conf, 4)}</div><div style="font-weight:700">${esc(r.conf)}</div></div>
          <table>
            <tr><td>Space</td><td>${esc(r.space)} · ${ZONES[r.zone].label}</td></tr>
            <tr><td>When</td><td>${esc(r.when)}</td></tr>
            <tr><td>Hours</td><td>${esc(r.hours)}</td></tr>
            <tr><td>Paid</td><td>${money(r.total)} · ${esc(r.method)}</td></tr>
            <tr><td>Status</td><td style="color:var(--amber)">Documents in review</td></tr>
          </table>
          <div class="row"><span class="btn sm w-apple"> Add to Apple Wallet</span><span class="btn sm">Add to Google Wallet</span><span class="btn sm">📅 Calendar</span></div>
          <p class="small muted" style="margin-top:16px">635 W Mission Ave, Escondido, CA 92025 · (760) 233-7703</p>
        </div></div>`;
    } else {
      el.innerHTML = `<div class="pass">
        <div class="row"><b>EW</b><span class="spacer"></span><div style="text-align:right"><div class="lbl">Space</div><div class="val" style="font-size:1.6rem">${esc(r.space)}</div></div></div>
        <div style="margin-top:14px"><div class="lbl">Vendor</div><div class="val">${esc(form.business || form.name)}</div></div>
        <div class="row" style="margin-top:10px;justify-content:space-between">
          <div><div class="lbl">Date</div><div class="val">${esc(EWM.nice(r.dates[0], { month: 'short', day: 'numeric' }))}${r.dates.length > 1 ? ' +' + (r.dates.length - 1) : ''}</div></div>
          <div><div class="lbl">Gate opens</div><div class="val">${DAYS[r.dow].hours.split(' –')[0]}</div></div>
        </div>
        <div class="qrb">${qrSvg(r.conf, 4)}</div>
        <div style="text-align:center;font-size:.8rem;opacity:.85">${esc(r.conf)}</div>
      </div>`;
    }
  }

  // Vendor passes are the yellow QR the gate scanner recognises.
  function qrSvg(text, cell) { return EWM.qr('EWM:V:' + text, cell, 'vendor'); }

  // Calendar file: one VEVENT per date. Some calendar apps silently drop RRULE, so no recurrence.
  function downloadIcs(r) {
    const t = (ds, s) => {
      const m = s.match(/(\d+):(\d+)(am|pm)/); let h = +m[1] % 12; if (m[3] === 'pm') h += 12;
      return ds.replace(/-/g, '') + 'T' + String(h).padStart(2, '0') + m[2] + '00';
    };
    const ev = r.dates.map((ds, i) => { const [open, close] = DAYS[EWM.parse(ds).getDay()].hours.split(' – '); return [
      'BEGIN:VEVENT', `UID:${r.conf}-${i}@escondidowm.com`, `DTSTAMP:${t(EWM.todayIso(), '12:00am')}`,
      `DTSTART;TZID=America/Los_Angeles:${t(ds, open)}`, `DTEND;TZID=America/Los_Angeles:${t(ds, close)}`,
      `SUMMARY:Selling at Escondido World Marketplace · Space ${r.space}`,
      'LOCATION:635 W Mission Ave\\, Escondido\\, CA 92025', `DESCRIPTION:Confirmation ${r.conf}`, 'END:VEVENT',
    ].join('\r\n'); });
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//EWM//Booking//EN', ...ev, 'END:VCALENDAR'].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    a.download = `ewm-${r.conf}.ics`; a.click();
    EWM.toast(`📅 ${r.dates.length} market day${r.dates.length > 1 ? 's' : ''} added to calendar file`);
  }

  // ---------- validation ----------
  const digits = (s) => String(s || '').replace(/\D/g, '');
  function missing(n) {
    const m = [];
    if (n === 1) {
      if (!form.name) m.push('name'); if (digits(form.phone).length < 10) m.push('phone');
      if (!/.+@.+\..+/.test(form.email)) m.push('email');
      if (!form.street || !form.city || !form.zip) m.push('address'); if (!form.idNumber) m.push('ID number');
    }
    if (n === 2) {
      if (!form.business) m.push('business name');
      if (form.permitStatus === 'have' && !form.permitNo) m.push("seller's permit number");
      if (!form.goods.length) m.push('type of goods'); if (!form.describe) m.push('description');
    }
    return m;
  }
  function docsReady() {
    return neededDocs().every((d) => !d.required || form.files[d.key])
      && Object.entries(form.acks).every(([k, v]) => v || (k === 'used' && !sells('Used / secondhand')))
      && form.signature.trim().length > 2;
  }

  // ---------- actions ----------
  function collect() {
    $('panel').querySelectorAll('input.in, select.in, textarea.in').forEach((el) => {
      if (el.id && el.id in form && el.type !== 'file') form[el.id] = el.value.trim();
    });
    const c = $('canopy'); if (c) form.canopy = c.checked;
  }

  function signIn(provider, phone) {
    user = provider === 'Phone' ? { name: '', phone, provider } : { name: provider === 'Google' ? 'Maria Lopez' : 'Jose Ramirez', email: provider === 'Google' ? 'maria.lopez@gmail.com' : 'jose@icloud.com', phone: '', provider };
    localStorage.setItem('ewm_user', JSON.stringify(user));
    form.name = form.name || user.name; form.phone = form.phone || user.phone; form.email = form.email || user.email || '';
    EWM.toast(`Signed in with ${provider}`);
    go(1);
  }

  function pay(method) {
    document.querySelectorAll('[data-pay], #cardBtn').forEach((b) => { b.disabled = true; });
    EWM.toast('Processing payment…');
    setTimeout(() => {
      const s = EWM.load();
      let v = s.vendors.find((x) => digits(x.phone) && digits(x.phone) === digits(form.phone));
      const profile = {
        name: form.name, business: form.business, phone: form.phone, email: form.email, category: form.category,
        lang: form.lang === 'Español' ? 'Spanish' : 'English', permit: 'review',
        address: `${form.street}, ${form.city} ${form.zip}`, idState: form.idState, entity: form.entity,
        website: form.website, social: form.social, goods: form.goods, describe: form.describe, priceRange: form.priceRange,
        permitNo: form.permitStatus === 'have' ? form.permitNo : '', exemptReason: form.permitStatus === 'exempt' ? form.exemptReason : '',
        vehicle: form.vehicle, notes: form.notes, heard: form.heard,
        docs: Object.fromEntries(Object.entries(form.files).map(([k, f]) => [k, f.name])), coiExp: form.coiExp, tffExp: form.tffExp,
      };
      if (v) Object.assign(v, profile); else { v = { id: 'V' + (1001 + s.vendors.length), since: new Date().getFullYear(), ...profile }; s.vendors.push(v); }

      const conf = 'EW-' + Math.floor(100000 + Math.random() * 900000);
      const items = cart.items || cart.dates.map((d) => ({ date: d, amount: Math.round(cart.total / cart.dates.length) }));
      items.forEach(({ date: ds, amount }) => s.bookings.push({
        id: EWM.nextId(s), conf, vendorId: v.id, space: cart.space, date: ds, dow: EWM.parse(ds).getDay(),
        type: cart.plan === 'monthly' ? 'monthly' : 'reserved', amount, elec: cart.elec && EWM.parse(ds).getDay() === 5,
        status: 'Under review', channel: 'online', created: Date.now(),
      }));
      s.outbox = s.outbox || [];
      s.outbox.push(
        { at: Date.now(), vendorId: v.id, channel: 'sms', to: form.phone, subject: `Booked ${cart.space} · ${conf}` },
        { at: Date.now(), vendorId: v.id, channel: 'email', to: form.email, subject: `Your space ${cart.space} is booked · ${conf}` },
      );
      EWM.save(s);
      localStorage.removeItem('ewm_cart');
      result = { ...cart, conf, phone: form.phone, email: form.email, method, first: form.name.split(' ')[0], wallet: null };
      go(5);
      setTimeout(() => EWM.toast('💬 Text and ✉️ email sent'), 500);
    }, 900);
  }

  function bind() {
    const p = $('panel');
    p.querySelectorAll('[data-demo]').forEach((b) => b.onclick = () => {
      collect();
      if (b.dataset.demo === 'all') { DEMO[1](); DEMO[2](); DEMO[3](); EWM.toast('🧪 Demo data filled'); go(4); return; }
      DEMO[b.dataset.demo](); EWM.toast('🧪 Demo data filled'); render();
    });
    p.querySelectorAll('[data-sso]').forEach((b) => b.onclick = () => signIn(b.dataset.sso));
    const send = $('send');
    if (send) send.onclick = () => {
      const ph = $('ph').value.trim();
      if (digits(ph).length < 10) { EWM.toast('Please enter a 10-digit phone number'); return; }
      $('phoneBox').innerHTML = `
        <p>We texted a 4-digit code to <b>${esc(ph)}</b>. <span class="small muted">(Demo: any 4 digits)</span></p>
        <input class="in" id="code" inputmode="numeric" maxlength="4" placeholder="• • • •" style="font-size:1.6rem;text-align:center;letter-spacing:.5em" />
        <button class="btn primary lg block" id="verify" style="margin-top:12px">Sign in</button>`;
      $('code').focus();
      $('verify').onclick = () => { if ($('code').value.length === 4) signIn('Phone', ph); else EWM.toast('Enter the 4-digit code'); };
    };

    p.querySelectorAll('[data-chips]').forEach((g) => g.querySelectorAll('button').forEach((b) => b.onclick = () => {
      collect();
      const key = g.dataset.chips; const v = b.dataset.v;
      if (g.dataset.multi === '1') form[key] = form[key].includes(v) ? form[key].filter((x) => x !== v) : [...form[key], v];
      else form[key] = v;
      if (key === 'goods' && sells('Food or drinks') && form.category !== 'Food') form.category = 'Food';
      render();
    }));

    p.querySelectorAll('input[type=file]').forEach((el) => el.onchange = () => {
      const f = el.files[0]; if (!f) return;
      collect();
      form.files[el.dataset.key] = { name: f.name, size: (f.size / 1048576).toFixed(1) + ' MB' };
      render();
    });
    p.querySelectorAll('[data-exp]').forEach((el) => el.onchange = () => { form[el.dataset.exp] = el.value; });
    p.querySelectorAll('[data-ack]').forEach((el) => el.onchange = () => { form.acks[el.dataset.ack] = el.checked; refreshNext(); });
    const sig = $('signature'); if (sig) sig.oninput = () => { form.signature = sig.value; refreshNext(); };

    const back = $('back'); if (back) back.onclick = () => { collect(); go(step - 1); };
    const next = $('next');
    if (next) next.onclick = () => {
      collect();
      const m = missing(step);
      if (m.length) { EWM.toast('Please add: ' + m.join(', ')); return; }
      go(step + 1);
    };

    if (step === 4) {
      $('cardBtn').onclick = () => $('cardForm').classList.toggle('hidden');
      p.querySelectorAll('[data-pay]').forEach((b) => b.onclick = () => pay(b.dataset.pay));
    }
    if (step === 5) {
      p.querySelectorAll('[data-pv]').forEach((b) => b.onclick = () => { preview = b.dataset.pv; render(); });
      p.querySelectorAll('[data-wallet]').forEach((b) => b.onclick = () => { result.wallet = b.dataset.wallet; preview = 'wallet'; render(); EWM.toast(`🎫 Added to ${b.dataset.wallet} (demo)`); });
      $('ics').onclick = () => downloadIcs(result);
      renderPreview();
    }
  }
  function refreshNext() { const n = $('next'); if (n && step === 3) n.disabled = !docsReady(); }

  function go(n) { step = n; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }

  function render() {
    renderStepper(); renderCart();
    if (!cart && step >= 1 && step <= 4) {
      $('panel').innerHTML = `<h2>Start with a space</h2><p class="muted">You're signed in${user?.name ? ' as ' + esc(user.name) : ''}. Pick a space on the map first, then come back here.</p><a class="btn primary lg" href="booking.html">Pick a space</a>`;
      return;
    }
    $('panel').innerHTML = views[step]();
    bind();
  }
  render();
})();
