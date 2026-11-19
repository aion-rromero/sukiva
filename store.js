// SUKIVA — tienda pública. Lee SIEMPRE de la base (get_catalog): el enlace y el QR no cambian.
// Todo el contenido se inserta como texto (SK.h), nunca como HTML.
(() => {
  const { db, ready, h, money, fmtDate, toast, imgUrl } = SK;
  const $ = id => document.getElementById(id);
  let data = { products: [], settings: {}, policies: [], promotions: [], categories: [] };
  let filter = { cat: 'Todo', text: '' };
  let cart = [], requestKey = crypto.randomUUID(), openQa = null, pdpProduct = null, lastFocus = null;
  const CART_KEY = 'sukiva_cart_v1';
  try { cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]').filter(l => l && l.variant_id && l.qty > 0); } catch { cart = []; }
  const saveCart = () => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* sin almacenamiento */ } };

  const S = k => data.settings[k];
  const uniq = a => [...new Set(a)];
  const allVariants = () => data.products.flatMap(p => p.variants.map(v => ({ ...v, product: p })));
  const findVariant = id => allVariants().find(v => v.id === id);
  const stockOf = p => p.variants.reduce((a, v) => a + v.available, 0);
  const imgsOf = (p, color) => { const own = p.images.filter(i => color && i.color === color); return (own.length ? own : p.images.slice(0, 1)).map(i => i.path); };
  const imgOf = (p, color) => imgsOf(p, color)[0];
  const guideFor = p => { let g = S('size_guides'); if (typeof g === 'string') { try { g = JSON.parse(g); } catch { g = null; } }
    return Array.isArray(g) ? g.find(x => x && Array.isArray(x.categories) && x.categories.includes(p.category) && Array.isArray(x.rows)) : null; };
  const inCart = id => (cart.find(l => l.variant_id === id) || {}).qty || 0;
  const leftOf = v => v.available - inCart(v.id);
  const label = v => [v.color, v.size].filter(Boolean).join(' · ');
  const initials = p => p.name.split(' ').map(w => w[0]).join('').slice(0, 3);

  function photo(path, alt, eager) {
    return h('img', { src: imgUrl(path), alt, loading: eager ? 'eager' : 'lazy', decoding: 'async', fetchpriority: eager ? 'high' : null });
  }

  // ── bucle en movimiento: funde las fotos de una prenda (frente, espalda, detalle) como un video corto.
  // Solo corre a la vista y con la pestaña activa; con "reducir movimiento" queda la primera foto fija.
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const reels = new Map();
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => {
    const c = reels.get(e.target); if (!c) return;
    if (!e.target.isConnected) { c.stop(); reels.delete(e.target); io.unobserve(e.target); return; }
    c.seen = e.isIntersecting; c.seen && c.auto && !document.hidden ? c.start() : c.stop();
  }), { threshold: .45 }) : null;
  function loop(box, paths, alt, ms, opt) {
    opt = opt || {}; let i = 0, timer = null, wait = null;
    box.classList.add('loop'); box.replaceChildren(paths.length ? photo(paths[0], alt, opt.eager) : null);
    const step = () => {
      i = (i + 1) % paths.length; const n = photo(paths[i], '', true); n.classList.add('in');
      const go = () => { if (!box.isConnected) return c.stop(); box.append(n); requestAnimationFrame(() => requestAnimationFrame(() => n.classList.add('on')));
        setTimeout(() => { while (box.children.length > 1) box.firstChild.remove(); n.classList.remove('in', 'on'); }, 900); };
      n.decode ? n.decode().then(go, go) : go();
    };
    const c = { auto: !!opt.auto, seen: false,
      start(now) { if (timer || wait || calm || paths.length < 2) return; const run = () => { wait = null; if (now) step(); timer = setInterval(step, ms); }; opt.delay ? wait = setTimeout(run, opt.delay) : run(); },
      stop() { clearInterval(timer); clearTimeout(wait); timer = wait = null; },
      rewind() { c.stop(); if (i) { i = 0; box.replaceChildren(photo(paths[0], alt)); } } };
    if (opt.auto && io && paths.length > 1 && !calm) { reels.set(box, c); io.observe(box); }
    return c;
  }

  // ── bolsa (datos)
  function add(v) {
    if (leftOf(v) <= 0) return toast('Ya agregaste todas las disponibles', 'bad');
    const l = cart.find(x => x.variant_id === v.id); l ? l.qty++ : cart.push({ variant_id: v.id, qty: 1 });
    saveCart(); renderCount(true); toast('Agregado a tu solicitud: ' + v.product.name + ', ' + label(v));
  }
  const cartLines = () => cart.map(l => ({ ...l, v: findVariant(l.variant_id) })).filter(l => l.v);
  const cartTotal = () => cartLines().reduce((a, l) => a + l.qty * Number(l.v.price), 0);
  function renderCount(bump) {
    cart = cartLines().map(l => ({ variant_id: l.variant_id, qty: Math.min(l.qty, l.v.available) })).filter(l => l.qty > 0); saveCart();
    const n = cart.reduce((a, l) => a + l.qty, 0), c = $('bagCount');
    c.hidden = n === 0; c.textContent = n;
    if (bump) { c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); }
  }

  // El nombre ocupa el ancho del muro, sea cual sea su longitud.
  function fitNames() {
    for (const [el, cap] of [[$('heroName'), innerHeight * .36], [$('footMark'), innerHeight * .5]]) {
      const s = el.firstElementChild; if (!s) continue;
      el.style.fontSize = '100px';
      const w = s.getBoundingClientRect().width; if (!w) continue;
      el.style.fontSize = Math.floor(Math.min(el.clientWidth / w * 100 * .99, cap / .78)) + 'px';
    }
    $('hero').style.setProperty('--name', $('heroName').style.fontSize || '120px');
  }

  // ── portada y barra
  function renderTop() {
    const name = S('business_name') || 'SUKIVA', logo = S('logo_path');
    document.title = name;
    $('brand').replaceChildren(logo ? h('img', { src: imgUrl(logo), alt: name }) : name);
    $('heroName').replaceChildren(h('span', {}, name)); $('footMark').replaceChildren(h('span', {}, name)); fitNames();
    // Portada: dos bucles con las prendas disponibles (vista principal y segunda vista), desfasados.
    const cast = [...data.products].sort((a, b) => b.featured - a.featured).map(p => { const v = p.variants.find(x => x.available > 0); return v ? imgsOf(p, v.color) : []; }).filter(x => x.length);
    const pick = cast.length ? cast : data.products.map(p => p.images.map(i => i.path)).filter(x => x.length);
    $('hero').classList.toggle('plain', !pick.length);
    const A = h('div', { class: 'panel' }), B = h('div', { class: 'panel' });
    $('heroMedia').replaceChildren(pick.length ? [A, B] : null);
    if (pick.length) {
      loop(A, pick.filter((_, n) => n % 2 === 0).slice(0, 6).map(x => x[0]), '', 3600, { auto: true, eager: true });
      const odd = pick.filter((_, n) => n % 2 === 1).slice(0, 6); loop(B, (odd.length ? odd : pick).map(x => x[1] || x[0]), '', 3600, { auto: true, delay: 1800 });
    }
    $('printHead').replaceChildren(logo ? h('img', { src: imgUrl(logo), alt: '' }) : null, h('b', {}, name + ' · Lista de precios'),
      'Actualizada el ' + fmtDate(data.generated_at, true) + '. Precios y existencias sujetos a cambio.');
  }

  // ── bento: categorías con foto real + condiciones tomadas de la configuración
  function renderBento() {
    const used = new Set([...$('heroMedia').querySelectorAll('img')].map(i => i.getAttribute('src')));
    const cats = uniq([...(data.categories || []), ...data.products.map(p => p.category)]).map(c => {
      const ps = data.products.filter(p => p.category === c); if (!ps.length) return null;
      const paths = ps.flatMap(p => p.images.map(i => i.path));
      const path = paths.find(x => !used.has(imgUrl(x))) || paths[0]; if (path) used.add(imgUrl(path));
      return { cat: c, n: ps.length, path };
    }).filter(Boolean);
    const catTile = c => h('button', { class: 'tile ' + (c.path ? 'photo' : 'ink'), type: 'button', onclick: () => pickCat(c.cat, true) },
      c.path ? photo(c.path, '') : null, h('strong', {}, c.cat), h('span', {}, c.n === 1 ? '1 prenda' : c.n + ' prendas'));
    const text = (cls, big, small, href) => h(href ? 'a' : 'div', { class: 'tile text ' + cls, href }, h('span', {}, small), h('strong', {}, big));
    const min = Number(S('free_shipping_min')), pct = Number(S('layaway_deposit_pct')), days = Number(S('layaway_days'));
    const info = [
      min > 0 && text('ink', 'Envío gratis desde ' + money(min), 'Envío nacional'),
      pct > 0 && days > 0 && text('', 'Aparta con ' + Math.round(pct * 100) + '%', 'Liquida en ' + days + ' días'),
      ...data.promotions.map(pm => text('ink', pm.name, pm.description || 'Promoción')),
      data.policies.length && text('', 'Elige bien tu talla', 'Todas las ventas son finales. Lee las condiciones.', '#politicas'),
    ].filter(Boolean);
    // Escritorio (6 columnas): una pieza grande 4×2 con dos al lado y filas de tres; la última cierra la fila.
    const tiles = [...cats.map(catTile), ...info];
    if (tiles[0]) tiles[0].classList.add('big');
    const rest = (tiles.length - 3) % 3;
    if (tiles.length > 3 && rest) tiles[tiles.length - 1].classList.add(rest === 1 ? 'w6' : 'w4');
    $('bento').replaceChildren(tiles);
  }
  function pickCat(c, scroll) {
    filter.cat = c; renderFilters(); renderGrid();
    if (scroll) $('prendas').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  // ── tienda
  function renderFilters() {
    const cats = ['Todo', ...uniq([...(data.categories || []), ...data.products.map(p => p.category)])];
    if (!cats.includes(filter.cat)) filter.cat = 'Todo';
    $('cats').replaceChildren(cats.map(c => h('button', { class: 'chip', type: 'button', role: 'tab', 'aria-selected': String(c === filter.cat), onclick: () => pickCat(c) }, c)));
  }

  function card(p, i, total) {
    const prices = p.variants.map(v => Number(v.price)), lo = Math.min(...prices), hi = Math.max(...prices);
    const live = p.variants.filter(v => v.available > 0), colors = uniq(p.variants.map(v => v.color).filter(Boolean));
    const big = total >= 5 && i % 5 === 0;
    // Al pasar el cursor (o al estar a la vista, en las prendas grandes) recorre las vistas del color mostrado.
    const main = h('span', { class: 'main' }); let reel = null;
    const show = color => { if (reel) reel.stop(); const paths = imgsOf(p, color);
      if (!paths.length) { reel = null; return main.replaceChildren(h('span', { class: 'ph', 'aria-hidden': 'true' }, initials(p))); }
      reel = loop(main, paths, p.name + (color ? ', ' + color : ''), big ? 2600 : 1300, { auto: big, eager: i < 2 }); };
    show(live[0] && live[0].color);
    const el = h('article', { class: 'card' + (big ? ' lg' + (i % 10 === 5 ? ' r' : '') : '') });
    const qaBtn = live.length ? h('button', { class: 'qa-open', type: 'button', 'aria-expanded': 'false', onclick: () => quickAdd(p, top, qaBtn, show) }, 'Agregar +') : null;
    const top = h('div', { class: 'card-top' },
      h('button', { class: 'card-media', type: 'button', 'aria-label': 'Ver ' + p.name, onclick: () => openProduct(p),
        onmouseenter: () => { if (reel && !reel.auto && matchMedia('(hover: hover)').matches) reel.start(true); },
        onmouseleave: () => { if (reel && !reel.auto) reel.rewind(); } }, main,
        !live.length ? h('span', { class: 'flag out' }, 'Agotado') : stockOf(p) === 1 ? h('span', { class: 'flag' }, 'Última pieza') : null),
      qaBtn);
    el.replaceChildren(top,
      h('div', { class: 'card-info' },
        h('button', { class: 'card-name', type: 'button', onclick: () => openProduct(p) }, p.name),
        h('span', { class: 'card-price' }, lo === hi ? money(lo) : 'Desde ' + money(lo)),
        h('span', { class: 'card-colors' }, colors.length > 1 ? colors.length + ' colores' : colors[0] || p.category),
        h('span', { class: 'card-colors print-only' }, 'Tallas: ' + (uniq(live.map(v => v.size)).join(', ') || 'agotado'))));
    return el;
  }

  // Compra rápida: color (si hay más de uno) y talla sobre la misma tarjeta; tocar la talla agrega.
  function quickAdd(p, el, btn, show) {
    if (openQa) { const same = openQa.el === el; openQa.close(); if (same) return; }
    const live = () => p.variants.filter(v => leftOf(v) > 0);
    let color = (live()[0] || {}).color;
    const panel = h('div', { class: 'qa', role: 'group', 'aria-label': 'Agregar ' + p.name });
    const close = () => { panel.remove(); btn.setAttribute('aria-expanded', 'false'); btn.hidden = false; openQa = null; };
    function draw() {
      const colors = uniq(live().map(v => v.color));
      if (!colors.length) return close();
      if (!colors.includes(color)) color = colors[0];
      show(color);
      panel.replaceChildren(
        h('div', { class: 'qa-head' }, h('span', {}, colors.length > 1 ? 'Color y talla' : 'Talla' + (color ? ' · ' + color : '')),
          h('button', { type: 'button', 'aria-label': 'Cerrar', onclick: close }, '✕')),
        colors.length > 1 ? h('div', { class: 'qa-row' }, colors.map(c => h('button', { class: 'chip' + (c === color ? ' on' : ''), type: 'button',
          'aria-pressed': String(c === color), onclick: () => { color = c; draw(); } }, c || 'Único'))) : null,
        h('div', { class: 'qa-row' }, p.variants.filter(v => v.color === color).map(v => h('button', { class: 'chip', type: 'button', disabled: leftOf(v) <= 0,
          'aria-label': 'Agregar talla ' + (v.size || 'única'), onclick: () => { add({ ...v, product: p }); close(); } }, v.size || 'Única'))));
    }
    el.append(panel); btn.setAttribute('aria-expanded', 'true'); btn.hidden = true; openQa = { el, close }; draw();
    const first = panel.querySelector('.qa-row .chip:not(:disabled)'); if (first) first.focus({ preventScroll: true });
  }

  function renderGrid() {
    if (openQa) openQa.close();
    const t = filter.text.trim().toLowerCase();
    const list = data.products.filter(p => (filter.cat === 'Todo' || p.category === filter.cat) &&
      (!t || (p.name + ' ' + p.category + ' ' + p.variants.map(v => v.color).join(' ')).toLowerCase().includes(t)))
      .sort((a, b) => (stockOf(b) > 0) - (stockOf(a) > 0));   // lo disponible primero; lo agotado al final
    $('grid').replaceChildren(list.map((p, i) => card(p, i, list.length)));
    for (const [box, c] of reels) if (!box.isConnected) { c.stop(); reels.delete(box); if (io) io.unobserve(box); }
    $('shopCount').textContent = list.length === 1 ? '1 prenda' : list.length + ' prendas';
    $('empty').textContent = t ? 'No hay prendas con esa búsqueda. Prueba con otro nombre o color.' : 'Aún no hay prendas en esta categoría.';
    $('empty').hidden = list.length > 0;
  }

  function renderFoot() {
    $('politicas').hidden = $('footPol').hidden = !data.policies.length;
    $('policies').replaceChildren(data.policies.map(po => h('details', {}, h('summary', {}, po.title),
      h('p', { class: 'muted small' }, 'Vigente desde ' + fmtDate(po.effective_from)), h('div', { class: 'body' }, po.body))));
    const wa = String(S('contact_whatsapp') || '').replace(/\D/g, ''), ig = String(S('contact_instagram') || '').replace(/^@/, '');
    const rows = [
      S('contact_address') && h('span', {}, S('contact_address')), S('contact_hours') && h('span', {}, S('contact_hours')),
      wa && h('a', { href: 'https://wa.me/52' + wa, rel: 'noopener' }, 'WhatsApp ' + wa),
      /^[\w.]{1,30}$/.test(ig) && h('a', { href: 'https://instagram.com/' + ig, rel: 'noopener' }, 'Instagram @' + ig)].filter(Boolean);
    $('contact').replaceChildren(rows.length ? rows : h('span', {}, 'Pregunta en recepción del gimnasio.'));
    $('updated').textContent = 'Precios y existencias actualizados el ' + fmtDate(data.generated_at, true);
  }

  // ── capas: ficha y bolsa
  function lock() {
    const any = !$('pdp').hidden || !$('bag').hidden;
    document.body.classList.toggle('lock', any);
    for (const el of [$('top'), $('bar'), document.querySelector('.foot')]) el.inert = any;
    $('pdp').inert = !$('bag').hidden; $('scrim').hidden = $('bag').hidden;
  }

  function openProduct(p, keepHash) {
    if (openQa) openQa.close();
    if (!pdpProduct) lastFocus = document.activeElement;
    pdpProduct = p;
    if (!keepHash) history.replaceState(null, '', '#p=' + p.id);
    const colors = uniq(p.variants.map(v => v.color));
    let color = (p.variants.find(v => v.available > 0) || p.variants[0]).color, sel = null;
    const gallery = h('div', { class: 'pdp-gallery' }), buy = h('div', { class: 'buy' }), price = h('p', { class: 'pdp-price' });
    const sizes = uniq(p.variants.map(v => String(v.size || '').split(' / ')[0]).filter(Boolean));
    const lengths = uniq(p.variants.map(v => String(v.size || '').split(' / ')[1]).filter(Boolean));
    const guide = guideFor(p);
    const closeBtn = h('button', { class: 'x', type: 'button', 'aria-label': 'Cerrar', onclick: closeProduct }, '✕');
    $('pdp').setAttribute('aria-label', p.name);
    $('pdp').replaceChildren(closeBtn, h('div', { class: 'pdp-body' }, gallery, h('div', { class: 'pdp-side' },
      h('div', { class: 'pdp-head' }, h('p', { class: 'muted' }, [p.brand, p.category].filter(Boolean).join(', ')), h('h3', {}, p.name), price),
      buy,
      h('div', { class: 'pdp-info' },
        p.description ? h('details', { open: true }, h('summary', {}, 'Descripción'), h('div', { class: 'body' }, p.description)) : null,
        h('details', { open: true }, h('summary', {}, 'Guía de tallas'),
          h('div', { class: 'body' }, 'Tallas de esta prenda: ' + (sizes.join(', ') || 'única') + '.' + (lengths.length ? ' Largos: ' + lengths.join(', ') + '.' : '')),
          guide ? [
            h('div', { class: 'guide-wrap' }, h('table', { class: 'guide' },
              h('thead', {}, h('tr', {}, (guide.columns || []).map(c => h('th', { scope: 'col' }, c)))),
              h('tbody', {}, guide.rows.map(r => h('tr', { class: sizes.includes(String(r[0])) ? 'mine' : null }, r.map((c, n) => h(n ? 'td' : 'th', n ? {} : { scope: 'row' }, c))))))),
            h('ul', {}, (guide.notes || []).map(n => h('li', {}, n)), h('li', {}, 'Medidas del cuerpo según la guía oficial de ' + (p.brand || 'la marca') + '. Las filas resaltadas son las tallas que manejamos de esta prenda.')),
          ] : h('div', { class: 'body' }, 'Confirma tu talla antes de pagar. Si tienes duda, pregúntanos primero.')),
        data.policies.map(po => h('details', {}, h('summary', {}, po.title), h('div', { class: 'body' }, po.body))),
        Number(S('free_shipping_min')) > 0 ? h('details', {}, h('summary', {}, 'Envío'), h('div', { class: 'body' },
          'Entrega en el gimnasio o envío a domicilio. Envío nacional gratis desde ' + money(S('free_shipping_min')) + '.')) : null))));
    function draw(moved) {
      const vs = p.variants.filter(v => v.color === color);
      if (!sel || sel.color !== color) sel = vs.find(v => leftOf(v) > 0) || vs.find(v => v.available > 0) || null;
      const own = p.images.filter(i => i.color === color), imgs = own.length ? own : p.images;
      gallery.replaceChildren(imgs.length ? imgs.map((i, n) => h('figure', {}, photo(i.path, p.name + (i.color ? ', ' + i.color : ''), n === 0)))
        : h('div', { class: 'ph', 'aria-hidden': 'true' }, initials(p)));
      if (moved) $('pdp').scrollTo({ top: 0 });
      price.textContent = sel ? money(sel.price) : money(Math.min(...vs.map(v => Number(v.price))));
      const left = sel ? leftOf(sel) : 0;
      buy.replaceChildren(
        h('div', { class: 'buy-label' }, h('span', {}, color || 'Color único'),
          h('span', {}, !sel ? 'Agotado en este color' : S('catalog_show_stock') === false ? 'Disponible' : sel.available === 1 ? 'Última pieza' : sel.available + ' disponibles')),
        colors.length > 1 ? h('div', { class: 'chips' }, colors.map(c => h('button', { class: 'chip' + (c === color ? ' on' : ''), type: 'button',
          'aria-pressed': String(c === color), onclick: () => { color = c; draw(true); } }, c || 'Único'))) : null,
        h('div', { class: 'chips' }, vs.map(v => h('button', { class: 'chip' + (sel && v.id === sel.id ? ' on' : ''), type: 'button', disabled: v.available === 0,
          'aria-pressed': String(!!sel && v.id === sel.id), onclick: () => { sel = v; draw(); } }, v.size || 'Única'))),
        h('button', { class: 'pill solid block', type: 'button', disabled: !sel || left <= 0,
          onclick: () => { add({ ...sel, product: p }); draw(); } },
          !sel ? 'Agotado' : left <= 0 ? 'Ya agregaste todas las disponibles' : 'Agregar a mi solicitud · ' + money(sel.price)));
    }
    draw(); $('pdp').hidden = false; $('pdp').scrollTop = 0; lock(); closeBtn.focus();
  }
  function closeProduct() {
    if (!pdpProduct) return;
    pdpProduct = null; $('pdp').hidden = true; $('pdp').replaceChildren(); lock();
    history.replaceState(null, '', location.pathname + location.search);
    if (lastFocus && lastFocus.isConnected) lastFocus.focus({ preventScroll: true });
  }

  let bagFocus = null;
  function openBag() {
    bagFocus = document.activeElement; $('bag').hidden = false; lock(); drawBag(); $('bag').querySelector('.x').focus();
  }
  function closeBag() {
    if ($('bag').hidden) return;
    $('bag').hidden = true; $('bag').replaceChildren(); lock();
    if (pdpProduct) openProduct(pdpProduct, true); else if (bagFocus && bagFocus.isConnected) bagFocus.focus({ preventScroll: true });
  }
  const bagHead = title => h('div', { class: 'bag-head' }, h('h3', {}, title), h('button', { class: 'x', type: 'button', 'aria-label': 'Cerrar', onclick: closeBag }, '✕'));

  function drawBag() {
    const lines = cartLines();
    if (!lines.length) {
      return $('bag').replaceChildren(bagHead('Mi solicitud'), h('div', { class: 'bag-body' },
        h('p', { class: 'empty' }, 'Tu solicitud está vacía.'), h('p', {}, 'Elige una prenda y su talla para empezar.')),
        h('div', { class: 'bag-foot' }, h('button', { class: 'pill solid block', type: 'button', onclick: () => { closeBag(); closeProduct(); $('prendas').scrollIntoView(); } }, 'Ver prendas')));
    }
    const min = Number(S('free_shipping_min')), total = cartTotal(); let sending = false;
    const f = {
      name: h('input', { name: 'name', autocomplete: 'name', required: true, maxlength: 120 }),
      phone: h('input', { name: 'tel', type: 'tel', inputmode: 'numeric', autocomplete: 'tel-national', required: true, maxlength: 15, placeholder: '10 dígitos' }),
      email: h('input', { name: 'email', type: 'email', autocomplete: 'email', maxlength: 160 }),
      delivery: h('select', { name: 'delivery' }, h('option', { value: 'local' }, 'Recojo en el gimnasio'), h('option', { value: 'nacional' }, 'Envío a domicilio')),
      address: h('textarea', { name: 'address', autocomplete: 'street-address', maxlength: 400, placeholder: 'Calle, número, colonia, C.P., ciudad y estado' }),
      notes: h('textarea', { name: 'notes', maxlength: 500 }),
      website: h('input', { name: 'website', tabindex: '-1', autocomplete: 'off' }),   // trampa anti-bots: debe quedar vacío
    };
    // Conserva lo ya escrito al cambiar cantidades.
    const old = $('bag').querySelector('form'); if (old) for (const k of Object.keys(f)) if (old.elements[f[k].name]) f[k].value = old.elements[f[k].name].value;
    const addr = h('label', { class: 'field', hidden: f.delivery.value !== 'nacional' }, 'Dirección de entrega', f.address);
    f.delivery.addEventListener('change', () => { addr.hidden = f.delivery.value !== 'nacional'; });
    const btn = h('button', { class: 'pill solid block', type: 'submit', form: 'reqForm' }, 'Enviar solicitud · ' + money(total));
    const form = h('form', { class: 'form', id: 'reqForm', novalidate: true, onsubmit: async e => {
      e.preventDefault(); if (sending) return;
      const phone = f.phone.value.replace(/\D/g, '');
      if (f.name.value.trim().length < 3) { f.name.focus(); return toast('Escribe tu nombre completo', 'bad'); }
      if (phone.length < 10) { f.phone.focus(); return toast('Escribe tu teléfono a 10 dígitos', 'bad'); }
      if (f.delivery.value === 'nacional' && f.address.value.trim().length < 10) { f.address.focus(); return toast('Escribe la dirección completa', 'bad'); }
      sending = true; btn.disabled = true; btn.textContent = 'Enviando…';
      const { data: res, error } = await db.rpc('submit_purchase_request', { payload: {
        full_name: f.name.value, phone, email: f.email.value, delivery_type: f.delivery.value, shipping_address: f.address.value,
        notes: f.notes.value, website: f.website.value, idempotency_key: requestKey,
        items: cartLines().map(l => ({ variant_id: l.variant_id, qty: l.qty })) } });
      sending = false;
      if (error) {
        toast(error.message || 'No se pudo enviar. Revisa tu conexión e intenta de nuevo.', 'bad');
        if (/xistencia|disponible/.test(error.message || '')) await load();
        return drawBag();
      }
      const summary = cartLines().map(l => l.qty + ' × ' + l.v.product.name + ' ' + [l.v.color, l.v.size].filter(Boolean).join(' ')).join(', ');
      cart = []; saveCart(); requestKey = crypto.randomUUID(); renderCount(); drawDone(res.folio, summary); load();
    } },
      h('label', { class: 'field' }, 'Nombre completo', f.name),
      h('div', { class: 'two' }, h('label', { class: 'field' }, 'Teléfono (WhatsApp)', f.phone), h('label', { class: 'field' }, 'Correo (opcional)', f.email)),
      h('label', { class: 'field' }, 'Entrega', f.delivery), addr, h('label', { class: 'field' }, 'Observaciones (opcional)', f.notes),
      h('div', { class: 'hp', 'aria-hidden': 'true' }, f.website));
    const change = (id, d) => { const l = cart.find(x => x.variant_id === id); l.qty += d; cart = cart.filter(x => x.qty > 0); saveCart(); renderCount(); drawBag(); };
    $('bag').replaceChildren(bagHead('Mi solicitud'),
      h('div', { class: 'bag-body' },
        h('div', {}, lines.map(l => h('div', { class: 'line' },
          h('div', { class: 'thumb' }, imgOf(l.v.product, l.v.color) ? photo(imgOf(l.v.product, l.v.color), '') : null),
          h('div', {}, h('b', {}, l.v.product.name), h('div', { class: 'muted small' }, label(l.v)), h('div', {}, money(l.v.price))),
          h('span', { class: 'step' },
            h('button', { type: 'button', 'aria-label': 'Quitar una ' + l.v.product.name, onclick: () => change(l.variant_id, -1) }, '−'), h('span', {}, l.qty),
            h('button', { type: 'button', 'aria-label': 'Agregar otra ' + l.v.product.name, disabled: l.qty >= l.v.available, onclick: () => change(l.variant_id, 1) }, '+'))))),
        min > 0 ? h('div', {}, h('p', { class: 'small' }, total >= min ? 'Tu compra alcanza envío nacional gratis.' : 'Te faltan ' + money(min - total) + ' para envío nacional gratis.'),
          h('div', { class: 'meter', 'aria-hidden': 'true' }, h('i', { style: 'width:' + Math.min(100, Math.round(total / min * 100)) + '%' }))) : null,
        h('p', { class: 'note' }, 'Esto es una solicitud, no un cobro. Te contactamos por WhatsApp para confirmar existencia, envío y forma de pago.'),
        form),
      h('div', { class: 'bag-foot' }, h('div', { class: 'sum' }, h('span', {}, 'Subtotal'), h('b', {}, money(total))), btn));
  }

  function drawDone(folio, summary) {
    const wa = String(S('contact_whatsapp') || '').replace(/\D/g, '');
    $('bag').replaceChildren(bagHead('Solicitud enviada'),
      h('div', { class: 'bag-body done' }, h('p', { class: 'muted' }, 'Tu folio'), h('strong', {}, folio),
        h('p', {}, 'Aún no es una compra pagada. Te contactamos para confirmar existencia, envío y forma de pago.')),
      h('div', { class: 'bag-foot' },
        wa ? h('a', { class: 'pill solid block', rel: 'noopener', target: '_blank',
          href: 'https://wa.me/52' + wa + '?text=' + encodeURIComponent('Hola, envié la solicitud ' + folio + ': ' + summary) }, 'Avisar por WhatsApp') : null,
        h('button', { class: 'pill block', type: 'button', onclick: closeBag }, 'Seguir viendo prendas')));
  }

  async function load() {
    const { data: res, error } = await db.rpc('get_catalog');
    if (error || !res) { toast('No se pudo cargar la tienda. Revisa tu conexión.', 'bad'); return; }
    data = res; data.products = data.products || []; data.policies = data.policies || []; data.promotions = data.promotions || []; data.settings = data.settings || {};
    renderTop(); renderBento(); renderFilters(); renderGrid(); renderFoot(); renderCount();
    const m = location.hash.match(/^#p=([0-9a-f-]{36})$/), p = m && data.products.find(x => x.id === m[1]);
    if (p && $('pdp').hidden && $('bag').hidden) openProduct(p, true);
  }

  addEventListener('resize', fitNames); if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitNames);
  $('search').addEventListener('input', e => { filter.text = e.target.value; renderGrid(); });
  $('openBag').addEventListener('click', openBag);
  $('scrim').addEventListener('click', closeBag);
  document.addEventListener('keydown', e => { if (e.key !== 'Escape') return; if (!$('bag').hidden) closeBag(); else if (pdpProduct) closeProduct(); else if (openQa) openQa.close(); });
  $('btnPdf').addEventListener('click', () => { filter = { cat: 'Todo', text: '' }; $('search').value = ''; renderFilters(); renderGrid();
    document.querySelectorAll('#policies details').forEach(x => { x.open = true; }); window.print(); });
  if (!ready) { $('empty').hidden = false; $('empty').textContent = 'Tienda en configuración: falta conectar la base de datos (config.js).'; return; }
  load();
  document.addEventListener('visibilitychange', () => {
    for (const [box, c] of reels) { if (!box.isConnected) { c.stop(); reels.delete(box); io.unobserve(box); } else document.hidden ? c.stop() : c.seen && c.start(); }
    if (!document.hidden && $('pdp').hidden && $('bag').hidden && !openQa) load();
  });
})();
