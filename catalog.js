// SUKIVA — catálogo público. Lee SIEMPRE de la base (get_catalog): el enlace y el QR nunca cambian.
(() => {
  const { db, ready, h, money, fmtDate, toast, imgUrl, dialog } = SK;
  const $ = id => document.getElementById(id);
  let data = { products: [], settings: {}, policies: [], promotions: [] };
  let filter = { cat: 'Todo', text: '' };
  let cart = [];            // [{variant_id, qty}]
  let requestKey = crypto.randomUUID();
  const CART_KEY = 'sukiva_cart_v1';

  try { cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]').filter(l => l && l.variant_id && l.qty > 0); } catch { cart = []; }
  const saveCart = () => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* sin almacenamiento */ } };

  const S = k => data.settings[k];
  const allVariants = () => data.products.flatMap(p => p.variants.map(v => ({ ...v, product: p })));
  const findVariant = id => allVariants().find(v => v.id === id);
  const stockOf = p => p.variants.reduce((a, v) => a + v.available, 0);
  const firstImage = (p, color) => (p.images.find(i => color && i.color === color) || p.images.find(i => !i.color) || p.images[0] || {}).path;

  function picture(p, color) {
    const path = firstImage(p, color);
    return path ? h('img', { src: imgUrl(path), alt: p.name, loading: 'lazy' })
                : h('div', { class: 'ph', 'aria-hidden': 'true' }, p.name.split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase());
  }

  function renderHeader() {
    const name = S('business_name') || 'SUKIVA';
    const logo = S('logo_path');
    $('bizName').replaceChildren(logo ? h('img', { src: imgUrl(logo), alt: name }) : name); document.title = name + ' · Catálogo';
    $('printTitle').replaceChildren(logo ? h('img', { src: imgUrl(logo), alt: name, class: 'print-logo' }) : '', name + ' · Catálogo de precios');
    $('printMeta').textContent = 'Actualizado el ' + fmtDate(data.generated_at, true) + ' · Precios y existencias sujetos a cambio';
    // Todas las categorías activas (en su orden), tengan o no prendas todavía; las nuevas aparecen solas.
    const cats = ['Todo', ...new Set([...(data.categories || []), ...data.products.map(p => p.category)])];
    if (!cats.includes(filter.cat)) filter.cat = 'Todo';
    $('cats').replaceChildren(...cats.map(c => h('button', { class: 'chip' + (c === filter.cat ? ' on' : ''), type: 'button', role: 'tab',
      'aria-selected': String(c === filter.cat), onclick: () => { filter.cat = c; renderHeader(); renderGrid(); } }, c)));
    $('promos').replaceChildren(...data.promotions.map(pm => h('div', { class: 'promo' }, h('b', {}, pm.name), pm.description ? h('div', {}, pm.description) : null)));
    const min = Number(S('free_shipping_min'));
    $('shipNote').textContent = min > 0 ? 'Envío nacional gratis en compras desde ' + money(min) + '. Un solo precio: efectivo, transferencia o tarjeta.' : '';
  }

  function renderGrid() {
    const t = filter.text.trim().toLowerCase();
    const list = data.products.filter(p => (filter.cat === 'Todo' || p.category === filter.cat) &&
      (!t || (p.name + ' ' + p.category + ' ' + p.variants.map(v => v.color).join(' ')).toLowerCase().includes(t)));
    $('grid').replaceChildren(...list.map(p => {
      const prices = p.variants.map(v => Number(v.price)); const lo = Math.min(...prices), hi = Math.max(...prices);
      const colors = [...new Set(p.variants.map(v => v.color).filter(Boolean))];
      const sizes = [...new Set(p.variants.filter(v => v.available > 0).map(v => v.size))];
      const wrap = h('div', { class: 'ph-wrap', style: 'position:relative' }, picture(p),
        stockOf(p) === 0 ? h('span', { class: 'badge bad tag' }, 'Agotado') : p.featured ? h('span', { class: 'badge info tag' }, 'Destacado') : null);
      return h('button', { class: 'pcard', type: 'button', onclick: () => openProduct(p) }, wrap,
        h('div', { class: 'info' }, h('b', {}, p.name), h('span', { class: 'muted small' }, colors.join(' · ') || p.category),
          h('span', { class: 'price' }, lo === hi ? money(lo) : 'Desde ' + money(lo)),
          h('span', { class: 'muted small print-only' }, 'Tallas: ' + (sizes.join(', ') || 'agotado'))));
    }));
    $('empty').textContent = filter.text.trim() ? 'No encontramos prendas con esa búsqueda.' : 'Aún no hay prendas disponibles en esta categoría.';
    $('empty').classList.toggle('hidden', list.length > 0);
  }

  function renderFooter() {
    $('policies').replaceChildren(data.policies.length ? h('h2', {}, 'Políticas') : '', ...data.policies.map(po =>
      h('details', { class: 'card' }, h('summary', {}, po.title),
        h('p', { class: 'muted small' }, 'Versión ' + po.version + ' · vigente desde ' + fmtDate(po.effective_from)),
        h('div', { class: 'policy' }, po.body))));
    const wa = String(S('contact_whatsapp') || '').replace(/\D/g, ''), ig = String(S('contact_instagram') || '').replace(/^@/, '');
    const rows = [
      S('contact_address') && h('div', {}, '📍 ', S('contact_address')),
      S('contact_hours') && h('div', {}, '🕑 ', S('contact_hours')),
      wa && h('div', {}, '💬 ', h('a', { href: 'https://wa.me/52' + wa, rel: 'noopener' }, 'WhatsApp ' + wa)),
      /^[\w.]{1,30}$/.test(ig) && h('div', {}, '📷 ', h('a', { href: 'https://instagram.com/' + ig, rel: 'noopener' }, '@' + ig)),
    ].filter(Boolean);
    $('contact').replaceChildren(h('h2', {}, 'Contacto'), ...(rows.length ? rows : [h('span', { class: 'muted' }, 'Pregunta en recepción del gimnasio.')]),
      h('p', { class: 'muted small' }, 'Catálogo actualizado el ' + fmtDate(data.generated_at, true)));
    $('contact').classList.toggle('hidden', false);
  }

  function openProduct(p) {
    const colors = [...new Set(p.variants.map(v => v.color))];
    let color = (p.variants.find(v => v.available > 0) || p.variants[0]).color, sel = null;
    const body = h('div', { class: 'stack' });
    const d = dialog(p.name, body, []);
    function draw() {
      const vs = p.variants.filter(v => v.color === color);
      if (!sel || sel.color !== color) sel = vs.find(v => v.available > 0) || null;
      const imgs = p.images.filter(i => !i.color || i.color === color);
      const inCart = sel ? (cart.find(l => l.variant_id === sel.id) || {}).qty || 0 : 0;
      const left = sel ? sel.available - inCart : 0;
      body.replaceChildren(
        h('div', { class: 'gallery' }, imgs.length ? imgs.map(i => h('img', { src: imgUrl(i.path), alt: p.name + ' ' + color, loading: 'lazy' })) : picture(p, color)),
        h('div', { class: 'row' }, h('span', { class: 'badge' }, p.category), h('span', { class: 'muted small' }, p.brand)),
        p.description ? h('p', {}, p.description) : null,
        colors.length > 1 || colors[0] ? h('div', { class: 'stack' }, h('h3', {}, 'Color'), h('div', { class: 'chips' }, colors.map(c =>
          h('button', { class: 'chip' + (c === color ? ' on' : ''), type: 'button', onclick: () => { color = c; draw(); } }, c || 'Único')))) : null,
        h('div', { class: 'stack' }, h('h3', {}, 'Talla'), h('div', { class: 'chips' }, vs.map(v =>
          h('button', { class: 'chip' + (sel && v.id === sel.id ? ' on' : ''), type: 'button', disabled: v.available === 0,
            onclick: () => { sel = v; draw(); } }, v.size || 'Única')))),
        sel ? h('div', { class: 'row' }, h('b', { class: 'grow', style: 'font-size:20px' }, money(sel.price)),
          h('span', { class: 'badge ' + (sel.available > 0 ? 'ok' : 'bad') },
            S('catalog_show_stock') === false ? 'Disponible' : sel.available === 1 ? 'Última pieza' : sel.available + ' disponibles'))
          : h('span', { class: 'badge bad' }, 'Agotado en este color'),
        h('button', { class: 'btn primary block', type: 'button', disabled: !sel || left <= 0, onclick: () => {
          const l = cart.find(x => x.variant_id === sel.id); l ? l.qty++ : cart.push({ variant_id: sel.id, qty: 1 });
          saveCart(); renderCartBar(); toast('Agregado a tu solicitud', 'ok'); d.close();
        } }, !sel ? 'No disponible' : left <= 0 ? 'Ya agregaste todas las disponibles' : 'Agregar a mi solicitud'),
        h('p', { class: 'muted small' }, 'Mídete la prenda antes de pagar. Consulta nuestras políticas al final del catálogo.'));
    }
    draw();
  }

  const cartLines = () => cart.map(l => ({ ...l, v: findVariant(l.variant_id) })).filter(l => l.v);
  const cartTotal = () => cartLines().reduce((a, l) => a + l.qty * Number(l.v.price), 0);
  function renderCartBar() {
    cart = cartLines().map(l => ({ variant_id: l.variant_id, qty: Math.min(l.qty, l.v.available) })).filter(l => l.qty > 0); saveCart();
    const n = cart.reduce((a, l) => a + l.qty, 0);
    $('cartbar').classList.toggle('hidden', n === 0);
    $('btnCart').textContent = 'Ver mi solicitud · ' + n + (n === 1 ? ' prenda · ' : ' prendas · ') + money(cartTotal());
  }

  function openCart() {
    const body = h('div', { class: 'stack' });
    const d = dialog('Mi solicitud de compra', body, []);
    let sending = false;
    function draw() {
      const lines = cartLines();
      if (!lines.length) { d.close(); renderCartBar(); return; }
      const min = Number(S('free_shipping_min')), total = cartTotal();
      const f = {
        name: h('input', { name: 'name', autocomplete: 'name', required: true, maxlength: 120 }),
        phone: h('input', { name: 'tel', type: 'tel', inputmode: 'numeric', autocomplete: 'tel-national', required: true, maxlength: 15, placeholder: '10 dígitos' }),
        email: h('input', { name: 'email', type: 'email', autocomplete: 'email', maxlength: 160 }),
        delivery: h('select', { name: 'delivery' }, h('option', { value: 'local' }, 'Recojo en el gimnasio'), h('option', { value: 'nacional' }, 'Envío a domicilio')),
        address: h('textarea', { name: 'address', autocomplete: 'street-address', maxlength: 400, placeholder: 'Calle, número, colonia, C.P., ciudad y estado' }),
        notes: h('textarea', { name: 'notes', maxlength: 500 }),
        website: h('input', { name: 'website', tabindex: '-1', autocomplete: 'off' }),   // trampa anti-bots: debe quedar vacío
      };
      const addrWrap = h('label', { class: 'field wide hidden' }, 'Dirección de entrega', f.address);
      f.delivery.addEventListener('change', () => addrWrap.classList.toggle('hidden', f.delivery.value !== 'nacional'));
      const btn = h('button', { class: 'btn accent block', type: 'submit' }, 'Enviar solicitud');
      const form = h('form', { class: 'form-grid', novalidate: true, onsubmit: async e => {
        e.preventDefault(); if (sending) return;
        const phone = f.phone.value.replace(/\D/g, '');
        if (f.name.value.trim().length < 3) return toast('Escribe tu nombre completo', 'bad');
        if (phone.length < 10) return toast('Escribe tu teléfono a 10 dígitos', 'bad');
        if (f.delivery.value === 'nacional' && f.address.value.trim().length < 10) return toast('Escribe la dirección completa', 'bad');
        sending = true; btn.disabled = true; btn.textContent = 'Enviando…';
        const { data: res, error } = await db.rpc('submit_purchase_request', { payload: {
          full_name: f.name.value, phone, email: f.email.value, delivery_type: f.delivery.value, shipping_address: f.address.value,
          notes: f.notes.value, website: f.website.value, idempotency_key: requestKey,
          items: cartLines().map(l => ({ variant_id: l.variant_id, qty: l.qty })) } });
        sending = false; btn.disabled = false; btn.textContent = 'Enviar solicitud';
        if (error) { toast(error.message || 'No se pudo enviar. Intenta de nuevo.', 'bad'); if (/xistencia|disponible/.test(error.message || '')) { await load(); draw(); } return; }
        const summary = cartLines().map(l => l.qty + ' × ' + l.v.product.name + ' ' + [l.v.color, l.v.size].filter(Boolean).join(' ')).join(', ');
        cart = []; saveCart(); requestKey = crypto.randomUUID(); renderCartBar(); d.close(); done(res.folio, summary); load();
      } },
        h('label', { class: 'field' }, 'Nombre completo', f.name), h('label', { class: 'field' }, 'Teléfono (WhatsApp)', f.phone),
        h('label', { class: 'field' }, 'Correo (opcional)', f.email), h('label', { class: 'field' }, 'Entrega', f.delivery),
        addrWrap, h('label', { class: 'field wide' }, 'Observaciones (opcional)', f.notes),
        h('div', { class: 'hp', 'aria-hidden': 'true' }, f.website), h('div', { class: 'wide' }, btn));
      body.replaceChildren(
        h('div', {}, lines.map(l => h('div', { class: 'line' },
          h('div', { class: 'grow' }, h('b', {}, l.v.product.name), h('div', { class: 'muted small' }, [l.v.color, l.v.size].filter(Boolean).join(' · ')), h('div', {}, money(l.v.price))),
          h('span', { class: 'qty' },
            h('button', { class: 'btn sm', type: 'button', 'aria-label': 'Quitar una', onclick: () => { change(l.variant_id, -1); } }, '−'), h('span', {}, l.qty),
            h('button', { class: 'btn sm', type: 'button', 'aria-label': 'Agregar una', disabled: l.qty >= l.v.available, onclick: () => { change(l.variant_id, 1); } }, '+'))))),
        h('div', { class: 'row' }, h('b', { class: 'grow' }, 'Subtotal'), h('b', { style: 'font-size:18px' }, money(total))),
        min > 0 ? h('p', { class: 'muted small' }, total >= min ? 'Tu compra alcanza envío nacional gratis.' : 'Te faltan ' + money(min - total) + ' para envío nacional gratis.') : null,
        h('div', { class: 'notice small' }, 'Esto es una solicitud, no un cobro. Te contactamos por WhatsApp para confirmar existencia, costo de envío y forma de pago.'),
        form);
    }
    function change(id, delta) { const l = cart.find(x => x.variant_id === id); l.qty += delta; cart = cart.filter(x => x.qty > 0); saveCart(); renderCartBar(); draw(); }
    draw();
  }

  function done(folio, summary) {
    const wa = String(S('contact_whatsapp') || '').replace(/\D/g, '');
    dialog('Solicitud recibida', h('div', { class: 'stack' },
      h('p', {}, 'Tu folio es ', h('b', { style: 'font-size:20px' }, folio), '.'),
      h('p', {}, 'Aún no es una compra pagada: te contactaremos para confirmar disponibilidad, envío y pago.'),
      wa ? h('a', { class: 'btn accent block', rel: 'noopener', target: '_blank',
        href: 'https://wa.me/52' + wa + '?text=' + encodeURIComponent('Hola, envié la solicitud ' + folio + ': ' + summary) }, 'Avisar por WhatsApp') : null), []);
  }

  async function load() {
    const { data: res, error } = await db.rpc('get_catalog');
    if (error) { toast('No se pudo cargar el catálogo. Revisa tu conexión.', 'bad'); return; }
    data = res; renderHeader(); renderGrid(); renderFooter(); renderCartBar();
    const m = location.hash.match(/^#p=([0-9a-f-]{36})$/); const p = m && data.products.find(x => x.id === m[1]);
    if (p && !document.querySelector('dialog[open]')) openProduct(p);
  }

  $('search').addEventListener('input', e => { filter.text = e.target.value; renderGrid(); });
  $('btnCart').addEventListener('click', openCart);
  $('btnPdf').addEventListener('click', () => { filter = { cat: 'Todo', text: '' }; $('search').value = ''; renderHeader(); renderGrid();
    document.querySelectorAll('#policies details').forEach(x => { x.open = true; }); window.print(); });
  if (!ready) { $('grid').replaceChildren(h('div', { class: 'notice' }, 'Catálogo en configuración: falta conectar la base de datos (web/config.js).')); return; }
  load();
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !document.querySelector('dialog[open]')) load(); });
})();
