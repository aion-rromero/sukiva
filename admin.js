// SUKIVA — panel administrativo. La interfaz solo ORDENA la operación: los permisos reales los impone
// la base de datos (RLS + funciones). Ocultar un menú aquí no es una medida de seguridad.
(() => {
  const { db, ready, h, money, fmtDate, today, toast, imgUrl, dialog, cfg } = SK;
  const $ = id => document.getElementById(id);
  const view = () => $('view');
  let role = null, session = null;

  const STATUS = { solicitud: 'Solicitud recibida', pendiente_confirmacion: 'Pendiente de confirmación', pendiente_anticipo: 'Pendiente de anticipo',
    confirmado: 'Confirmado', en_preparacion: 'En preparación', listo: 'Listo para entregar', enviado: 'Enviado', entregado: 'Entregado',
    cancelado: 'Cancelado', devuelto: 'Devuelto' };
  const STATUS_KIND = { solicitud: 'info', pendiente_confirmacion: 'warn', pendiente_anticipo: 'warn', confirmado: 'ok', en_preparacion: 'ok',
    listo: 'ok', enviado: 'ok', entregado: '', cancelado: 'bad', devuelto: 'bad' };
  const MOVES = { compra: 'Compra', devolucion_cliente: 'Devolución de cliente', ajuste_positivo: 'Ajuste positivo', otro_ingreso: 'Otro ingreso',
    venta: 'Venta', obsequio: 'Obsequio influencer', muestra: 'Muestra', merma: 'Merma', ajuste_negativo: 'Ajuste negativo', otro_egreso: 'Otro egreso' };
  const isAdmin = () => role === 'admin' || role === 'superadmin';
  const isOwner = () => role === 'superadmin';

  async function run(promise, okMsg) {
    const { data, error } = await promise;
    if (error) { toast(error.message || 'Ocurrió un error', 'bad'); throw error; }
    if (okMsg) toast(okMsg, 'ok');
    return data;
  }
  // Personal visible para la sesión (administración ve a todos; una vendedora solo se ve a sí misma)
  async function staffList() { return run(db.from('profiles').select('id,full_name,role,active').order('full_name')); }
  async function adminUsers(body) {
    const { data, error } = await db.functions.invoke('admin-users', { body });
    if (error) {
      let msg = 'No se pudo completar la operación';
      try { msg = (await error.context.json()).error || msg; } catch { /* sin detalle */ }
      toast(msg, 'bad'); throw error;
    }
    return data;
  }
  const pwField = (k, label) => ({ k, label, type: 'password', help: 'Mínimo 12 caracteres' });
  const badge = (text, kind) => h('span', { class: 'badge ' + (kind || '') }, text);
  const stBadge = s => badge(STATUS[s] || s, STATUS_KIND[s]);

  function table(cols, rows, onRow) {
    return h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, cols.map(c => h('th', { class: c.right ? 'right' : '' }, c.label)))),
      h('tbody', {}, rows.length ? rows.map(r => h('tr', { class: onRow ? 'click' : '', onclick: onRow ? () => onRow(r) : null },
        cols.map(c => h('td', { class: (c.right ? 'right ' : '') + (c.nowrap ? 'nowrap' : '') }, c.get(r)))))
        : h('tr', {}, h('td', { colspan: cols.length, class: 'muted' }, 'Sin registros')))));
  }

  // Formularios declarativos
  function form(fields, values = {}) {
    const inputs = {};
    const el = h('div', { class: 'form-grid' }, fields.map(f => {
      const v = values[f.k] ?? f.def ?? '';
      let input;
      if (f.type === 'select') input = h('select', {}, f.options.map(([val, label]) => h('option', { value: val, selected: String(val) === String(v) }, label)));
      else if (f.type === 'textarea') input = h('textarea', { value: v, maxlength: f.max || 4000 });
      else if (f.type === 'check') input = h('input', { type: 'checkbox', checked: v === true });
      else input = h('input', { type: f.type || 'text', value: v, step: f.step, min: f.min, maxlength: f.max, placeholder: f.ph, required: f.required,
        autocomplete: f.type === 'password' ? 'new-password' : null });
      inputs[f.k] = input;
      return f.type === 'check' ? h('label', { class: 'check' + (f.wide ? ' wide' : '') }, input, f.label)
                                : h('label', { class: 'field' + (f.wide ? ' wide' : '') }, f.label, input, f.help ? h('span', { class: 'muted small' }, f.help) : null);
    }));
    const get = () => Object.fromEntries(fields.map(f => {
      const i = inputs[f.k];
      if (f.type === 'check') return [f.k, i.checked];
      if (f.type === 'number') return [f.k, i.value === '' ? null : Number(i.value)];
      if (f.type === 'password') return [f.k, i.value];
      return [f.k, i.value.trim() === '' ? null : i.value.trim()];
    }));
    return { el, get, inputs };
  }
  function formDialog(title, fields, values, onSave, extra) {
    const f = form(fields, values);
    const btn = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
      btn.disabled = true;
      try { await onSave(f.get()); d.close(); } catch { /* el error ya se mostró */ } finally { btn.disabled = false; }
    } }, 'Guardar');
    const d = dialog(title, [f.el, extra || null], [h('button', { class: 'btn', type: 'button', onclick: () => d.close() }, 'Cancelar'), btn]);
    return f;
  }
  const head = (title, ...actions) => h('div', { class: 'page-head' },
    h('button', { class: 'btn sm menu-btn', type: 'button', onclick: () => $('sidebar').classList.toggle('open') }, '☰'),
    h('h1', { class: 'grow' }, title), ...actions);

  // CRUD genérico para catálogos simples
  async function crud(o) {
    const rows = await run(db.from(o.table).select(o.select || '*').order(o.order || 'name').limit(500));
    const edit = row => formDialog((row ? 'Editar ' : 'Nuevo: ') + o.noun, o.fields, row || {}, async v => {
      await run(row ? db.from(o.table).update(v).eq('id', row.id) : db.from(o.table).insert(v), 'Guardado');
      o.reload();
    });
    return h('div', { class: 'card stack' }, h('div', { class: 'row' }, h('h2', { class: 'grow' }, o.title),
      o.canWrite ? h('button', { class: 'btn sm primary', type: 'button', onclick: () => edit(null) }, '+ Nuevo') : null),
      table(o.cols, rows, o.canWrite ? edit : null));
  }

  // ═════════════════════════ DASHBOARD
  async function pageDashboard() {
    const from = h('input', { type: 'date', value: today().slice(0, 8) + '01' }), to = h('input', { type: 'date', value: today() });
    const out = h('div', { class: 'stack' });
    async function load() {
      const d = await run(db.rpc('dashboard', { date_from: from.value, date_to: to.value }));
      const kpi = (label, val, sub) => h('div', { class: 'kpi' }, h('span', { class: 'muted small' }, label), h('b', {}, val), sub ? h('span', { class: 'muted small' }, sub) : null);
      const max = Math.max(1, ...d.by_day.map(x => Number(x.total)));
      out.replaceChildren(
        h('div', { class: 'kpis' }, kpi('Ventas hoy', money(d.sales_today)), kpi('Ventas de la semana', money(d.sales_week)), kpi('Ventas del mes', money(d.sales_month)),
          kpi('Solicitudes por atender', d.pending_requests), kpi('Pedidos abiertos', d.orders_open), kpi('Saldos por cobrar', money(d.balance_due))),
        h('h2', {}, 'Periodo seleccionado'),
        h('div', { class: 'kpis' }, kpi('Ventas', money(d.sales_range), d.orders_range + ' pedidos'), kpi('Cobrado', money(d.collected_range)),
          kpi('Utilidad bruta estimada', money(d.gross_profit_range), 'venta − costo − descuentos; sin comisiones ni envíos'),
          kpi('Entregados', d.orders_delivered_range), kpi('Compras de mercancía', money(d.purchases_range))),
        h('div', { class: 'card stack' }, h('h3', {}, 'Ventas por día'),
          d.by_day.length ? h('div', { class: 'bars' }, d.by_day.map(x => h('div', { style: 'height:' + Math.round(Number(x.total) / max * 100) + '%', 'data-tip': fmtDate(x.d) + ' · ' + money(x.total) })))
                          : h('p', { class: 'muted' }, 'Aún no hay ventas en el periodo.')),
        h('h2', {}, 'Inventario'),
        h('div', { class: 'kpis' }, kpi('Piezas en existencia', d.stock_units, d.stock_available + ' disponibles · ' + d.stock_reserved + ' comprometidas'),
          kpi('Valor a costo', money(d.stock_value_cost)), kpi('Valor a precio de venta', money(d.stock_value_price)),
          kpi('Variantes agotadas', d.out_of_stock), kpi('En mínimo', d.low_stock)),
        h('div', { class: 'card stack' }, h('h3', {}, 'Productos más vendidos'), table([
          { label: 'Producto', get: r => r.name }, { label: 'Piezas', right: true, get: r => r.qty },
          { label: 'Venta', right: true, get: r => money(r.revenue) }, { label: 'Utilidad', right: true, get: r => money(r.profit) }], d.top_products)),
        h('div', { class: 'form-grid' },
          h('div', { class: 'card stack' }, h('h3', {}, 'Por canal'), table([{ label: 'Canal', get: r => r.channel }, { label: 'Venta', right: true, get: r => money(r.total) }], d.by_channel)),
          h('div', { class: 'card stack' }, h('h3', {}, 'Por categoría'), table([{ label: 'Categoría', get: r => r.category },
            { label: 'Venta', right: true, get: r => money(r.revenue) }, { label: 'Utilidad', right: true, get: r => money(r.profit) }], d.by_category))));
    }
    from.addEventListener('change', load); to.addEventListener('change', load);
    view().replaceChildren(head('Dashboard', h('label', { class: 'row small muted' }, 'Del', from), h('label', { class: 'row small muted' }, 'al', to)), out);
    await load();
  }

  // ═════════════════════════ PEDIDOS
  async function pagePedidos() {
    const fStatus = h('select', { style: 'width:auto' }, h('option', { value: '' }, 'Todos los estatus'), h('option', { value: 'abiertos' }, 'Abiertos'),
      Object.entries(STATUS).map(([k, v]) => h('option', { value: k }, v)));
    fStatus.value = 'abiertos';
    const fText = h('input', { type: 'search', placeholder: 'Folio, nombre o teléfono', style: 'max-width:240px' });
    const out = h('div', { class: 'card' });
    let rows = [], names = {};
    function draw() {
      const t = fText.value.trim().toLowerCase();
      const list = rows.filter(o => (!fStatus.value || (fStatus.value === 'abiertos' ? !['entregado', 'cancelado', 'devuelto'].includes(o.status) : o.status === fStatus.value)) &&
        (!t || (o.folio + ' ' + o.contact_name + ' ' + o.contact_phone).toLowerCase().includes(t)));
      out.replaceChildren(table([
        { label: 'Folio', nowrap: true, get: o => h('b', {}, o.folio) }, { label: 'Fecha', nowrap: true, get: o => fmtDate(o.created_at, true) },
        { label: 'Cliente', get: o => [o.contact_name, h('div', { class: 'muted small' }, o.contact_phone)] }, { label: 'Canal', get: o => o.channel },
        { label: 'Entrega', get: o => o.delivery_type }, { label: 'Estatus', get: o => stBadge(o.status) },
        { label: 'Vendedor(a)', get: o => o.seller_id ? (names[o.seller_id] || 'Otro usuario') : badge('Sin asignar', 'warn') },
        { label: 'Total', right: true, get: o => money(o.total) }, { label: 'Saldo', right: true, get: o => Number(o.total) - Number(o.paid) > 0 ? h('b', {}, money(o.total - o.paid)) : badge('Pagado', 'ok') }],
        list, o => orderDetail(o.id, load)));
    }
    async function load() {
      const [r, staff] = await Promise.all([
        run(db.from('orders').select('id,folio,created_at,contact_name,contact_phone,channel,status,delivery_type,total,paid,seller_id').order('created_at', { ascending: false }).limit(500)), staffList()]);
      rows = r; names = Object.fromEntries(staff.map(p => [p.id, p.full_name]));
      draw();
    }
    fStatus.addEventListener('change', draw); fText.addEventListener('input', draw);
    view().replaceChildren(head('Pedidos y solicitudes', fStatus, fText, h('button', { class: 'btn primary', type: 'button', onclick: () => newOrder(load) }, '+ Nuevo pedido')), out);
    await load();
  }

  async function newOrder(after) {
    const [variants, staff] = await Promise.all([run(db.rpc('staff_variants')), isAdmin() ? staffList() : Promise.resolve([])]);
    const lines = [];
    const f = form([
      ...(isAdmin() ? [{ k: 'seller_id', label: 'Venta registrada a', type: 'select', def: session.user.id,
        options: staff.filter(p => p.active).map(p => [p.id, p.full_name + ' (' + p.role + ')']) }] : []),
      { k: 'full_name', label: 'Nombre completo', required: true }, { k: 'phone', label: 'Teléfono (10 dígitos)', type: 'tel' },
      { k: 'email', label: 'Correo (opcional)', type: 'email' },
      { k: 'channel', label: 'Canal', type: 'select', options: [['gym', 'Gimnasio'], ['whatsapp', 'WhatsApp'], ['instagram', 'Instagram'], ['otro', 'Otro']] },
      { k: 'delivery_type', label: 'Entrega', type: 'select', options: [['local', 'Local / gimnasio'], ['nacional', 'Envío nacional']] },
      { k: 'shipping_address', label: 'Dirección (si es envío)', type: 'textarea', wide: true }, { k: 'notes', label: 'Notas internas', type: 'textarea', wide: true }]);
    const sel = h('select', {}, variants.map(v => h('option', { value: v.id, disabled: v.available <= 0 },
      v.product + ' · ' + [v.color, v.size].filter(Boolean).join(' · ') + ' — ' + money(v.price) + ' (' + v.available + ' disp.)')));
    const qty = h('input', { type: 'number', min: 1, value: 1, style: 'width:80px' });
    const list = h('div', {});
    const drawLines = () => list.replaceChildren(table([
      { label: 'Prenda', get: l => l.v.product + ' · ' + [l.v.color, l.v.size].filter(Boolean).join(' · ') }, { label: 'Cant.', right: true, get: l => l.qty },
      { label: 'Importe', right: true, get: l => money(l.qty * l.v.price) },
      { label: '', get: l => h('button', { class: 'btn sm danger', type: 'button', onclick: () => { lines.splice(lines.indexOf(l), 1); drawLines(); } }, 'Quitar') }], lines));
    drawLines();
    const save = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
      if (!lines.length) return toast('Agrega al menos una prenda', 'bad');
      save.disabled = true;
      try {
        const id = await run(db.rpc('order_create', { payload: { ...f.get(), items: lines.map(l => ({ variant_id: l.v.id, qty: l.qty })) } }), 'Pedido creado');
        d.close(); await after(); orderDetail(id, after);
      } catch { /* mostrado */ } finally { save.disabled = false; }
    } }, 'Crear pedido');
    const d = dialog('Nuevo pedido', [f.el, h('h3', {}, 'Prendas'),
      h('div', { class: 'row' }, h('div', { class: 'grow' }, sel), qty, h('button', { class: 'btn', type: 'button', onclick: () => {
        const v = variants.find(x => x.id === sel.value), q = Number(qty.value);
        if (!v || !(q > 0)) return; if (lines.some(l => l.v.id === v.id)) return toast('Esa prenda ya está en el pedido', 'bad');
        if (q > v.available) return toast('Solo hay ' + v.available + ' disponibles', 'bad');
        lines.push({ v, qty: q }); drawLines();
      } }, 'Agregar')), list], [save]);
  }

  async function orderDetail(id, after) {
    const body = h('div', { class: 'stack' });
    const d = dialog('Pedido', body, []);
    d.addEventListener('close', () => after && after());
    async function load() {
      const staff = await staffList();
      const [o, providers] = await Promise.all([
        run(db.from('orders').select('*, order_items(*), order_status_history(*), payments(*), shipments(*, shipping_providers(name))').eq('id', id).single()),
        run(db.from('shipping_providers').select('id,name').eq('active', true).order('name'))]);
      d.querySelector('h2').textContent = 'Pedido ' + o.folio;
      const closed = ['cancelado', 'devuelto'].includes(o.status), balance = Number(o.total) - Number(o.paid);
      const setStatus = async (s, extra = {}) => { await run(db.rpc('order_set_status', { order_id: id, new_status: s, ...extra }), 'Estatus: ' + STATUS[s]); load(); };
      const next = o.status === 'entregado' ? ['devuelto'] : o.status === 'enviado' ? ['entregado', 'devuelto'] : closed ? []
        : Object.keys(STATUS).filter(s => s !== o.status && s !== 'devuelto' && s !== 'solicitud');
      const stockNote = { none: 'Sin apartar inventario', reserved: 'Inventario APARTADO para este pedido', deducted: 'Inventario descontado', returned: 'Devuelto' }[o.stock_state];
      const disc = h('input', { type: 'number', min: 0, step: '0.01', value: o.discount }), ship = h('input', { type: 'number', min: 0, step: '0.01', value: o.shipping_cost });
      const pay = form([{ k: 'amount', label: 'Importe', type: 'number', step: '0.01', def: balance > 0 ? balance : '' },
        { k: 'method', label: 'Método', type: 'select', options: [['efectivo', 'Efectivo'], ['transferencia', 'Transferencia'], ['tarjeta', 'Tarjeta'], ['saldo_a_favor', 'Saldo a favor'], ['otro', 'Otro']] },
        { k: 'reference', label: 'Referencia / comprobante' }]);
      const shp = form([{ k: 'provider_id', label: 'Paquetería', type: 'select', options: providers.map(p => [p.id, p.name]) }, { k: 'tracking_number', label: 'Número de guía' },
        { k: 'cost', label: 'Costo real de la guía', type: 'number', step: '0.01', def: 0 }]);
      const notes = h('textarea', { value: o.notes || '' });
      body.replaceChildren(
        h('div', { class: 'row' }, stBadge(o.status), badge(stockNote, o.stock_state === 'reserved' ? 'warn' : ''), h('span', { class: 'muted small' }, o.channel + ' · ' + fmtDate(o.created_at, true))),
        h('div', { class: 'card' }, h('b', {}, o.contact_name), h('div', {}, o.contact_phone, o.contact_email ? ' · ' + o.contact_email : ''),
          h('div', { class: 'muted' }, o.delivery_type === 'nacional' ? 'Envío nacional: ' + (o.shipping_address || '') : 'Entrega local / gimnasio'),
          o.customer_notes ? h('div', { class: 'notice small', style: 'margin-top:8px' }, 'Nota del cliente: ', o.customer_notes) : null),
        (() => {
          const current = staff.find(p => p.id === o.seller_id);
          if (isAdmin()) {
            const ss = h('select', { style: 'width:auto' }, h('option', { value: '' }, 'Sin asignar'),
              staff.filter(p => p.active || p.id === o.seller_id).map(p => h('option', { value: p.id, selected: p.id === o.seller_id }, p.full_name + ' (' + p.role + ')')));
            ss.addEventListener('change', async () => { try { await run(db.rpc('order_set_seller', { order_id: id, seller: ss.value || null }), 'Venta reasignada'); } finally { load(); } });
            return h('label', { class: 'row small' }, h('b', {}, 'Venta registrada a:'), ss, h('span', { class: 'muted' }, 'Define a quién se le paga la comisión.'));
          }
          return h('div', { class: 'row small' }, h('b', {}, 'Venta registrada a:'), o.seller_id ? (current ? current.full_name : 'Otro usuario') : badge('Sin asignar', 'warn'),
            o.seller_id ? null : h('button', { class: 'btn sm', type: 'button', onclick: async () => { await run(db.rpc('order_set_seller', { order_id: id, seller: session.user.id }), 'Venta registrada a tu nombre'); load(); } }, 'Tomar esta venta'));
        })(),
        table([{ label: 'Prenda', get: i => i.description }, { label: 'Cant.', right: true, get: i => i.qty }, { label: 'Precio', right: true, get: i => money(i.unit_price) },
          { label: 'Importe', right: true, get: i => money(i.qty * i.unit_price) }], o.order_items),
        h('div', { class: 'form-grid' }, h('label', { class: 'field' }, 'Descuento ($)', disc), h('label', { class: 'field' }, 'Envío cobrado ($)', ship),
          h('div', { class: 'field' }, 'Total', h('b', { style: 'font-size:20px;color:var(--ink)' }, money(o.total)), h('span', { class: 'small' }, 'Subtotal ' + money(o.subtotal))),
          h('div', { class: 'field' }, 'Saldo', h('b', { style: 'font-size:20px;color:var(--ink)' }, money(balance)), h('span', { class: 'small' }, 'Cobrado ' + money(o.paid)))),
        !closed && o.status !== 'entregado' ? h('div', {}, h('button', { class: 'btn sm', type: 'button', onclick: async () => {
          await run(db.rpc('order_set_charges', { order_id: id, discount: Number(disc.value) || 0, shipping: Number(ship.value) || 0 }), 'Importes actualizados'); load(); } }, 'Actualizar importes')) : null,
        next.length ? h('div', { class: 'stack' }, h('h3', {}, 'Cambiar estatus'), h('div', { class: 'row' }, next.map(s => h('button', {
          class: 'btn sm' + (s === 'cancelado' || s === 'devuelto' ? ' danger' : ''), type: 'button', onclick: () => {
            if (s === 'devuelto') {
              const rs = h('input', { type: 'checkbox' }), note = h('input', { placeholder: 'Motivo' });
              const dd = dialog('Registrar devolución', [h('label', { class: 'check' }, rs, 'La prenda se aceptó como vendible: reingresar a inventario'), note],
                [h('button', { class: 'btn primary', type: 'button', onclick: async () => { await setStatus('devuelto', { restock: rs.checked, note: note.value }); dd.close(); } }, 'Confirmar devolución')]);
            } else if (s === 'cancelado') { if (confirm('¿Cancelar el pedido ' + o.folio + '? Se libera el inventario apartado.')) setStatus(s); }
            else setStatus(s);
          } }, STATUS[s]))),
          h('p', { class: 'muted small' }, 'Anticipo / Confirmado / En preparación / Listo apartan inventario. Enviado y Entregado lo descuentan. Cancelar lo libera.')) : null,
        h('div', { class: 'card stack' }, h('h3', {}, 'Pagos'),
          table([{ label: 'Fecha', get: p => fmtDate(p.paid_at, true) }, { label: 'Método', get: p => p.method }, { label: 'Referencia', get: p => p.reference || '—' },
            { label: 'Importe', right: true, get: p => money(p.amount) }], o.payments.sort((a, b) => a.paid_at.localeCompare(b.paid_at))),
          o.status !== 'cancelado' ? [pay.el, h('div', {}, h('button', { class: 'btn sm primary', type: 'button', onclick: async () => {
            const v = pay.get(); if (!v.amount) return toast('Escribe el importe', 'bad');
            await run(db.rpc('payment_register', { order_id: id, amount: v.amount, method: v.method, reference: v.reference }), 'Pago registrado'); load(); } }, 'Registrar pago'))] : null),
        h('div', { class: 'card stack' }, h('h3', {}, 'Envíos'),
          table([{ label: 'Paquetería', get: s => s.shipping_providers ? s.shipping_providers.name : '—' }, { label: 'Guía', get: s => s.tracking_number || '—' },
            { label: 'Costo', right: true, get: s => money(s.cost) },
            { label: 'Estatus', get: s => { const st = h('select', { style: 'width:auto' }, ['pendiente', 'guia_generada', 'en_transito', 'entregado', 'incidencia', 'devuelto'].map(x => h('option', { value: x, selected: x === s.status }, x)));
              st.addEventListener('change', () => run(db.from('shipments').update({ status: st.value, shipped_at: st.value === 'en_transito' ? new Date().toISOString() : s.shipped_at,
                delivered_at: st.value === 'entregado' ? new Date().toISOString() : s.delivered_at }).eq('id', s.id), 'Envío actualizado')); return st; } }], o.shipments),
          shp.el, h('div', {}, h('button', { class: 'btn sm', type: 'button', onclick: async () => {
            const v = shp.get(); await run(db.from('shipments').insert({ order_id: id, provider_id: v.provider_id, tracking_number: v.tracking_number, cost: v.cost || 0,
              status: v.tracking_number ? 'guia_generada' : 'pendiente' }), 'Envío registrado'); load(); } }, 'Registrar envío'))),
        h('label', { class: 'field' }, 'Notas internas', notes),
        h('div', {}, h('button', { class: 'btn sm', type: 'button', onclick: () => run(db.from('orders').update({ notes: notes.value || null }).eq('id', id), 'Notas guardadas') }, 'Guardar notas')),
        h('details', {}, h('summary', { class: 'muted' }, 'Historial del pedido'), table([{ label: 'Fecha', get: x => fmtDate(x.changed_at, true) },
          { label: 'Cambio', get: x => (x.from_status ? STATUS[x.from_status] + ' → ' : '') + STATUS[x.to_status] }, { label: 'Nota', get: x => x.note || '' }],
          o.order_status_history.sort((a, b) => a.id - b.id))));
    }
    await load();
  }

  // ═════════════════════════ PRODUCTOS
  async function pageProductos() {
    const [products, cats] = await Promise.all([
      run(db.from('products').select('*, categories(name), product_variants(*), product_images(*)').is('deleted_at', null).order('name')),
      run(db.from('categories').select('*').order('sort'))]);
    const reload = pageProductos;
    view().replaceChildren(head('Productos', h('button', { class: 'btn primary', type: 'button', onclick: () => editProduct(null, cats, reload) }, '+ Nuevo producto')),
      h('div', { class: 'card' }, table([
        { label: 'Producto', get: p => [h('b', {}, p.name), h('div', { class: 'muted small' }, p.brand)] }, { label: 'Categoría', get: p => p.categories.name },
        { label: 'Variantes', right: true, get: p => p.product_variants.filter(v => !v.deleted_at).length },
        { label: 'Existencia', right: true, get: p => p.product_variants.reduce((a, v) => a + v.stock_on_hand, 0) },
        { label: 'Fotos', right: true, get: p => p.product_images.length ? p.product_images.length : badge('Sin foto', 'warn') },
        { label: 'Catálogo', get: p => !p.active ? badge('Inactivo', 'bad') : p.catalog_visible ? badge('Visible', 'ok') : badge('Oculto') }], products, p => editProduct(p, cats, reload))));
  }

  function editProduct(p, cats, reload) {
    const f = form([{ k: 'name', label: 'Nombre comercial', required: true, wide: true }, { k: 'category_id', label: 'Categoría', type: 'select', options: cats.map(c => [c.id, c.name]) },
      { k: 'brand', label: 'Marca', def: 'DFYNE' }, { k: 'description', label: 'Descripción', type: 'textarea', wide: true },
      { k: 'featured', label: 'Destacado', type: 'check' }, { k: 'catalog_visible', label: 'Visible en catálogo público', type: 'check', def: true },
      { k: 'active', label: 'Activo', type: 'check', def: true }], p || {});
    const extra = h('div', { class: 'stack' });
    const d = dialog(p ? p.name : 'Nuevo producto', [f.el, extra], [
      p ? h('button', { class: 'btn danger', type: 'button', onclick: async () => {
        if (!confirm('¿Dar de baja "' + p.name + '"? Se conserva su historial.')) return;
        await run(db.from('products').update({ deleted_at: new Date().toISOString(), active: false }).eq('id', p.id), 'Producto dado de baja'); d.close(); reload(); } }, 'Dar de baja') : null,
      h('button', { class: 'btn primary', type: 'button', onclick: async () => {
        const v = f.get(); v.brand = v.brand || 'DFYNE';
        if (p) { await run(db.from('products').update(v).eq('id', p.id), 'Producto guardado'); d.close(); reload(); }
        else { const np = await run(db.from('products').insert(v).select('*, categories(name), product_variants(*), product_images(*)').single(), 'Producto creado. Agrega variantes y fotos.');
          d.close(); await reload(); editProduct(np, cats, reload); }
      } }, 'Guardar')]);
    if (!p) return;
    const cat = cats.find(c => c.id === p.category_id);
    async function refresh() {
      const [vars, imgs] = await Promise.all([run(db.from('product_variants').select('*').eq('product_id', p.id).is('deleted_at', null).order('color').order('size')),
        run(db.from('product_images').select('*').eq('product_id', p.id).order('sort').order('created_at'))]);
      const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: true });
      const imgColor = h('select', { style: 'width:auto' }, h('option', { value: '' }, 'Todos los colores'), [...new Set(vars.map(v => v.color).filter(Boolean))].map(c => h('option', { value: c }, c)));
      file.addEventListener('change', async () => {
        for (const fl of file.files) {
          if (!['image/jpeg', 'image/png', 'image/webp'].includes(fl.type) || fl.size > 5 * 1024 * 1024) { toast(fl.name + ': usa JPG, PNG o WebP de hasta 5 MB', 'bad'); continue; }
          const path = p.id + '/' + crypto.randomUUID() + '.' + { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[fl.type];
          await run(db.storage.from('product-images').upload(path, fl, { contentType: fl.type, cacheControl: '31536000' }));
          await run(db.from('product_images').insert({ product_id: p.id, storage_path: path, color: imgColor.value || null, sort: imgs.length }));
        }
        toast('Fotos cargadas', 'ok'); refresh();
      });
      extra.replaceChildren(
        h('div', { class: 'row' }, h('h3', { class: 'grow' }, 'Variantes (color / talla)'), h('button', { class: 'btn sm', type: 'button', onclick: () => editVariant(null) }, '+ Variante')),
        table([{ label: 'SKU', nowrap: true, get: v => v.sku }, { label: 'Color', get: v => v.color || '—' }, { label: 'Talla', get: v => v.size || '—' },
          { label: 'Precio', right: true, get: v => money(v.price) }, { label: 'Costo prom.', right: true, get: v => money(v.avg_cost) },
          { label: 'Exist.', right: true, get: v => v.stock_on_hand }, { label: 'Catálogo', get: v => !v.active ? badge('Inactiva', 'bad') : v.catalog_visible ? badge('Visible', 'ok') : badge('Oculta') }], vars, editVariant),
        h('p', { class: 'muted small' }, 'Las existencias no se editan aquí: entran por Compras y se mueven por Pedidos o Inventario.'),
        h('h3', {}, 'Fotografías'),
        h('div', { class: 'thumbs' }, imgs.map(i => h('figure', {}, h('img', { src: imgUrl(i.storage_path), alt: '' }), h('figcaption', { class: 'small muted' }, i.color || 'Todos'),
          h('button', { class: 'btn sm danger', type: 'button', 'aria-label': 'Eliminar foto', onclick: async () => {
            await run(db.from('product_images').delete().eq('id', i.id)); await db.storage.from('product-images').remove([i.storage_path]); refresh(); } }, '✕')))),
        h('div', { class: 'row' }, h('span', { class: 'small muted' }, 'Aplican a:'), imgColor, h('div', { class: 'grow' }, file)));
      function editVariant(v) {
        const cost = h('input', { type: 'number', step: '0.01', placeholder: 'Costo final MXN', value: v && Number(v.avg_cost) ? v.avg_cost : '' });
        const vf = formDialog(v ? 'Variante ' + v.sku : 'Nueva variante', [
          { k: 'sku', label: 'SKU (MAYÚSCULAS, números y guiones)', required: true }, { k: 'color', label: 'Color' }, { k: 'size', label: 'Talla (ej. S / Regular)' },
          { k: 'price', label: 'Precio único', type: 'number', step: '1', required: true }, { k: 'stock_min', label: 'Existencia mínima', type: 'number', def: 0 },
          { k: 'active', label: 'Activa', type: 'check', def: true }, { k: 'catalog_visible', label: 'Visible en catálogo', type: 'check', def: true }], v || {},
          async val => { val.sku = (val.sku || '').toUpperCase(); val.color = val.color || ''; val.size = val.size || ''; val.stock_min = val.stock_min || 0;
            await run(v ? db.from('product_variants').update(val).eq('id', v.id) : db.from('product_variants').insert({ ...val, product_id: p.id }), 'Variante guardada'); refresh(); },
          h('div', { class: 'row' }, h('div', { class: 'grow' }, cost), h('button', { class: 'btn sm', type: 'button', onclick: async () => {
            if (!(Number(cost.value) > 0)) return toast('Escribe el costo final de la pieza', 'bad');
            vf.inputs.price.value = await run(db.rpc('calc_price', { cost: Number(cost.value), markup: Number(cat.markup_pct) }));
          } }, 'Sugerir precio (cotizador: +' + Math.round(cat.markup_pct * 100) + '%)')));
      }
    }
    refresh();
  }

  // ═════════════════════════ INVENTARIO
  async function pageInventario() {
    const [vars, movs] = await Promise.all([
      run(db.from('product_variants').select('*, products(name)').is('deleted_at', null).order('sku')),
      run(db.from('inventory_movements').select('*, product_variants(sku)').order('id', { ascending: false }).limit(300))]);
    const adjust = v => formDialog('Movimiento · ' + v.sku, [
      { k: 'move_type', label: 'Tipo', type: 'select', options: ['ajuste_positivo', 'otro_ingreso', 'muestra', 'merma', 'ajuste_negativo', 'otro_egreso'].map(t => [t, MOVES[t]]) },
      { k: 'qty', label: 'Cantidad', type: 'number', min: 1, def: 1 }, { k: 'note', label: 'Motivo (obligatorio)', type: 'textarea', wide: true }], {},
      async val => { await run(db.rpc('inventory_adjust', { variant: v.id, ...val }), 'Movimiento registrado'); pageInventario(); });
    view().replaceChildren(head('Inventario'),
      h('div', { class: 'card stack' }, h('h2', {}, 'Existencias'), table([
        { label: 'SKU', nowrap: true, get: v => v.sku }, { label: 'Producto', get: v => v.products.name + ' · ' + [v.color, v.size].filter(Boolean).join(' · ') },
        { label: 'Física', right: true, get: v => v.stock_on_hand }, { label: 'Comprometida', right: true, get: v => v.stock_reserved },
        { label: 'Disponible', right: true, get: v => { const a = v.stock_on_hand - v.stock_reserved; return a <= 0 ? badge('0', 'bad') : a <= v.stock_min ? badge(a, 'warn') : h('b', {}, a); } },
        { label: 'Costo prom.', right: true, get: v => money(v.avg_cost) }, { label: 'Valor', right: true, get: v => money(v.stock_on_hand * v.avg_cost) },
        { label: '', get: v => h('button', { class: 'btn sm', type: 'button', onclick: () => adjust(v) }, 'Movimiento') }], vars)),
      h('div', { class: 'card stack' }, h('h2', {}, 'Últimos movimientos'), table([
        { label: 'Fecha', nowrap: true, get: m => fmtDate(m.created_at, true) }, { label: 'SKU', get: m => m.product_variants.sku }, { label: 'Tipo', get: m => MOVES[m.type] },
        { label: 'Cant.', right: true, get: m => (m.qty > 0 ? '+' : '') + m.qty }, { label: 'Saldo', right: true, get: m => m.balance }, { label: 'Nota', get: m => m.note || '' }], movs)));
  }

  // ═════════════════════════ COMPRAS
  async function pageCompras() {
    const [rows, sups] = await Promise.all([
      run(db.from('purchases').select('*, suppliers(name), purchase_items(qty, qty_received, unit_cost)').order('created_at', { ascending: false })),
      run(db.from('suppliers').select('id,name').eq('active', true).order('name'))]);
    const fields = [{ k: 'supplier_id', label: 'Proveedor', type: 'select', options: sups.map(s => [s.id, s.name]) }, { k: 'purchase_date', label: 'Fecha de compra', type: 'date', def: today() },
      { k: 'reference', label: 'Factura / número de orden' }, { k: 'currency', label: 'Moneda', type: 'select', options: [['USD', 'USD'], ['MXN', 'MXN']] },
      { k: 'fx_rate', label: 'Tipo de cambio (MXN por unidad)', type: 'number', step: '0.0001', def: 1 }, { k: 'shipping_cost', label: 'Envío pagado (MXN)', type: 'number', step: '0.01', def: 0 },
      { k: 'other_costs', label: 'Aranceles / otros (MXN)', type: 'number', step: '0.01', def: 0 }, { k: 'expected_date', label: 'Fecha estimada de recepción', type: 'date' },
      { k: 'notes', label: 'Observaciones', type: 'textarea', wide: true }];
    const pk = { borrador: '', ordenada: 'info', parcial: 'warn', recibida: 'ok', cancelada: 'bad' };
    view().replaceChildren(head('Compras y abastecimiento', h('button', { class: 'btn primary', type: 'button', onclick: () => formDialog('Nueva compra', fields, {}, async v => {
      const p = await run(db.from('purchases').insert(v).select('id').single(), 'Compra creada en borrador'); await pageCompras(); purchaseDetail(p.id, fields); }) }, '+ Nueva compra')),
      h('div', { class: 'card' }, table([{ label: 'Folio', get: p => h('b', {}, p.folio) }, { label: 'Fecha', get: p => fmtDate(p.purchase_date) }, { label: 'Proveedor', get: p => p.suppliers.name },
        { label: 'Referencia', get: p => p.reference || '—' }, { label: 'Piezas', right: true, get: p => p.purchase_items.reduce((a, i) => a + i.qty_received, 0) + ' / ' + p.purchase_items.reduce((a, i) => a + i.qty, 0) },
        { label: 'Costo total', right: true, get: p => money(p.purchase_items.reduce((a, i) => a + i.qty * i.unit_cost, 0)) }, { label: 'Estatus', get: p => badge(p.status, pk[p.status]) }],
        rows, p => purchaseDetail(p.id, fields))));
  }

  async function purchaseDetail(id, fields) {
    const body = h('div', { class: 'stack' });
    const d = dialog('Compra', body, []);
    d.addEventListener('close', () => pageCompras());
    const variants = await run(db.from('product_variants').select('id, sku, color, size, products(name, categories(markup_pct))').is('deleted_at', null).order('sku'));
    async function load() {
      const p = await run(db.from('purchases').select('*, suppliers(name), purchase_items(*, product_variants(sku, price, products(name, categories(markup_pct))))').eq('id', id).single());
      d.querySelector('h2').textContent = 'Compra ' + p.folio + ' · ' + p.status;
      const editable = ['borrador', 'ordenada'].includes(p.status), canReceive = ['ordenada', 'parcial'].includes(p.status);
      const st = async s => { await run(db.rpc('purchase_set_status', { purchase: id, new_status: s }), 'Compra: ' + s); load(); };
      const f = form(fields, p);
      const sel = h('select', {}, variants.map(v => h('option', { value: v.id }, v.sku + ' — ' + v.products.name + ' ' + [v.color, v.size].filter(Boolean).join(' '))));
      const qty = h('input', { type: 'number', min: 1, value: 1, style: 'width:80px' }), price = h('input', { type: 'number', step: '0.01', placeholder: 'Precio ' + p.currency, style: 'width:130px' });
      const sugg = new Map();
      await Promise.all(p.purchase_items.map(async i => sugg.set(i.id, await run(db.rpc('calc_price', { cost: Number(i.unit_cost), markup: Number(i.product_variants.products.categories.markup_pct) })))));
      body.replaceChildren(
        editable ? [f.el, h('div', {}, h('button', { class: 'btn sm', type: 'button', onclick: async () => { await run(db.from('purchases').update(f.get()).eq('id', id), 'Datos guardados'); load(); } }, 'Guardar datos'))]
                 : h('div', { class: 'muted' }, p.suppliers.name + ' · ' + fmtDate(p.purchase_date) + ' · ref. ' + (p.reference || '—') + ' · TC ' + p.fx_rate + ' · envío ' + money(p.shipping_cost)),
        h('h3', {}, 'Partidas'),
        table([{ label: 'SKU', nowrap: true, get: i => i.product_variants.sku }, { label: 'Cant.', right: true, get: i => i.qty }, { label: 'Recibidas', right: true, get: i => i.qty_received },
          { label: 'Precio ' + p.currency, right: true, get: i => Number(i.unit_price).toFixed(2) }, { label: 'Costo final MXN', right: true, get: i => money(i.unit_cost) },
          { label: 'Precio sugerido', right: true, get: i => money(sugg.get(i.id)) }, { label: 'Precio actual', right: true, get: i => money(i.product_variants.price) },
          { label: '', nowrap: true, get: i => [
            canReceive && i.qty > i.qty_received ? h('button', { class: 'btn sm', type: 'button', onclick: async () => {
              const n = Number(prompt('¿Cuántas piezas recibes de ' + i.product_variants.sku + '? (pendientes: ' + (i.qty - i.qty_received) + ')', i.qty - i.qty_received));
              if (n > 0) { await run(db.rpc('purchase_receive', { item: i.id, qty: n }), 'Recepción registrada'); load(); } } }, 'Recibir') : null,
            editable ? h('button', { class: 'btn sm danger', type: 'button', onclick: async () => { await run(db.from('purchase_items').delete().eq('id', i.id)); load(); } }, 'Quitar') : null] }],
          p.purchase_items.sort((a, b) => a.product_variants.sku.localeCompare(b.product_variants.sku))),
        h('p', { class: 'muted small' }, 'Costo final = precio × tipo de cambio + (envío + otros) ÷ piezas. El precio sugerido usa el cotizador; el precio de venta se cambia en Productos.'),
        editable ? h('div', { class: 'row' }, h('div', { class: 'grow' }, sel), qty, price, h('button', { class: 'btn', type: 'button', onclick: async () => {
          if (!(Number(qty.value) > 0) || price.value === '') return toast('Cantidad y precio son obligatorios', 'bad');
          await run(db.from('purchase_items').insert({ purchase_id: id, variant_id: sel.value, qty: Number(qty.value), unit_price: Number(price.value) })); load(); } }, 'Agregar partida')) : null,
        h('div', { class: 'row' },
          p.status === 'borrador' ? h('button', { class: 'btn primary', type: 'button', onclick: () => st('ordenada') }, 'Marcar como ordenada') : null,
          p.status === 'ordenada' ? h('button', { class: 'btn', type: 'button', onclick: () => st('borrador') }, 'Regresar a borrador') : null,
          canReceive ? h('button', { class: 'btn primary', type: 'button', onclick: async () => {
            if (confirm('¿Recibir TODAS las piezas pendientes? El inventario sube de inmediato.')) { await run(db.rpc('purchase_receive_all', { purchase: id }), 'Mercancía recibida'); load(); } } }, 'Recibir todo lo pendiente') : null,
          editable ? h('button', { class: 'btn danger', type: 'button', onclick: () => { if (confirm('¿Cancelar la compra?')) st('cancelada'); } }, 'Cancelar compra') : null));
    }
    await load();
  }

  // ═════════════════════════ CLIENTES
  async function pageClientes() {
    view().replaceChildren(head('Clientes'), await crud({ table: 'customers', title: 'Directorio', noun: 'cliente', order: 'full_name', canWrite: true, reload: pageClientes,
      cols: [{ label: 'Nombre', get: c => c.full_name }, { label: 'Teléfono', get: c => c.phone }, { label: 'Correo', get: c => c.email || '—' }, { label: 'Notas', get: c => c.notes || '' },
        { label: 'Alta', get: c => fmtDate(c.created_at) }],
      fields: [{ k: 'full_name', label: 'Nombre completo', required: true }, { k: 'phone', label: 'Teléfono (solo dígitos)', required: true }, { k: 'email', label: 'Correo', type: 'email' },
        { k: 'notes', label: 'Notas', type: 'textarea', wide: true }] }));
  }

  // ═════════════════════════ POLÍTICAS
  async function pagePoliticas() {
    const rows = await run(db.from('policies').select('*, policy_versions!policy_versions_policy_id_fkey(*)').order('sort'));
    const pk = { borrador: 'warn', publicada: 'ok', archivada: '' };
    view().replaceChildren(head('Políticas comerciales', h('button', { class: 'btn primary', type: 'button', onclick: () => formDialog('Nueva política', [
      { k: 'title', label: 'Título', required: true, wide: true }, { k: 'slug', label: 'Identificador (minúsculas-con-guiones)', required: true }, { k: 'sort', label: 'Orden', type: 'number', def: 0 }], {},
      async v => { await run(db.from('policies').insert(v), 'Política creada'); pagePoliticas(); }) }, '+ Nueva política')),
      h('p', { class: 'muted' }, 'Solo la versión PUBLICADA aparece en el catálogo. Los borradores nunca se publican solos y las versiones anteriores se conservan.'),
      ...rows.map(po => {
        const vs = po.policy_versions.sort((a, b) => b.version - a.version);
        const editDraft = v => formDialog(po.title + ' · borrador v' + v.version, [{ k: 'body', label: 'Texto', type: 'textarea', wide: true, max: 20000 }], v,
          async val => { await run(db.from('policy_versions').update({ body: val.body || '' }).eq('id', v.id), 'Borrador guardado'); pagePoliticas(); }).inputs.body.style.minHeight = '320px';
        return h('div', { class: 'card stack' }, h('div', { class: 'row' }, h('h2', { class: 'grow' }, po.title),
          vs.some(v => v.status === 'borrador') ? null : h('button', { class: 'btn sm', type: 'button', onclick: async () => {
            await run(db.from('policy_versions').insert({ policy_id: po.id, version: (vs[0] ? vs[0].version : 0) + 1, body: vs[0] ? vs[0].body : '' }), 'Borrador creado'); pagePoliticas(); } }, '+ Nueva versión (borrador)')),
          table([{ label: 'Versión', get: v => 'v' + v.version }, { label: 'Estatus', get: v => badge(v.status, pk[v.status]) }, { label: 'Vigente desde', get: v => fmtDate(v.effective_from) },
            { label: 'Publicada', get: v => fmtDate(v.published_at, true) },
            { label: '', nowrap: true, get: v => v.status === 'borrador' ? [h('button', { class: 'btn sm', type: 'button', onclick: () => editDraft(v) }, 'Editar'), ' ',
              h('button', { class: 'btn sm primary', type: 'button', onclick: async () => {
                if (confirm('¿Publicar la versión ' + v.version + ' de "' + po.title + '"? Será visible en el catálogo de inmediato.')) {
                  await run(db.rpc('policy_publish', { version_id: v.id }), 'Política publicada'); pagePoliticas(); } } }, 'Publicar')]
              : h('button', { class: 'btn sm', type: 'button', onclick: () => dialog(po.title + ' · v' + v.version, h('div', { class: 'policy' }, v.body), []) }, 'Ver') }], vs));
      }));
  }

  // ═════════════════════════ INFLUENCERS
  async function pageInfluencers() {
    const [profiles, gifts, variants] = await Promise.all([run(db.from('influencer_profiles').select('*').order('name')),
      run(db.from('influencer_gifts').select('*, influencer_profiles(name), product_variants(sku)').order('created_at', { ascending: false })),
      run(db.from('product_variants').select('id, sku, stock_on_hand, stock_reserved, avg_cost').is('deleted_at', null).order('sku'))]);
    const totalCost = gifts.reduce((a, g) => a + g.qty * g.unit_cost + Number(g.shipping_cost), 0), sales = gifts.reduce((a, g) => a + Number(g.sales_attributed || 0), 0);
    view().replaceChildren(head('Influencers', h('button', { class: 'btn primary', type: 'button', disabled: !profiles.length, onclick: () => formDialog('Registrar obsequio', [
      { k: 'influencer', label: 'Influencer', type: 'select', options: profiles.map(p => [p.id, p.name]) },
      { k: 'variant', label: 'Prenda', type: 'select', options: variants.filter(v => v.stock_on_hand - v.stock_reserved > 0).map(v => [v.id, v.sku + ' (' + (v.stock_on_hand - v.stock_reserved) + ' disp. · costo ' + money(v.avg_cost) + ')']) },
      { k: 'qty', label: 'Piezas', type: 'number', min: 1, def: 1 }, { k: 'shipping', label: 'Costo de envío', type: 'number', step: '0.01', def: 0 }, { k: 'note', label: 'Nota', wide: true }], {},
      async v => { await run(db.rpc('gift_register', v), 'Obsequio registrado y descontado de inventario'); pageInfluencers(); }) }, '+ Registrar obsequio')),
      h('div', { class: 'kpis' }, h('div', { class: 'kpi' }, h('span', { class: 'muted small' }, 'Piezas obsequiadas'), h('b', {}, gifts.reduce((a, g) => a + g.qty, 0))),
        h('div', { class: 'kpi' }, h('span', { class: 'muted small' }, 'Inversión (costo + envío)'), h('b', {}, money(totalCost))),
        h('div', { class: 'kpi' }, h('span', { class: 'muted small' }, 'Ventas atribuidas'), h('b', {}, money(sales))),
        h('div', { class: 'kpi' }, h('span', { class: 'muted small' }, 'Publicaciones'), h('b', {}, gifts.reduce((a, g) => a + g.posts_count, 0)))),
      await crud({ table: 'influencer_profiles', title: 'Perfiles', noun: 'influencer', canWrite: true, reload: pageInfluencers,
        cols: [{ label: 'Nombre', get: p => [p.name, h('div', { class: 'muted small' }, (p.platform || '') + ' ' + (p.handle || ''))] }, { label: 'Seguidores', right: true, get: p => p.followers != null ? p.followers.toLocaleString('es-MX') : '—' },
          { label: 'Engagement', right: true, get: p => p.engagement_pct != null ? p.engagement_pct + '%' : '—' }, { label: 'Afinidad', right: true, get: p => p.affinity || '—' }, { label: 'Ciudad', get: p => p.city || '—' },
          { label: 'Estatus', get: p => badge(p.status) }],
        fields: [{ k: 'name', label: 'Nombre', required: true }, { k: 'handle', label: 'Usuario (@)' },
          { k: 'platform', label: 'Red principal', type: 'select', options: [['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['facebook', 'Facebook'], ['youtube', 'YouTube'], ['otro', 'Otro']] },
          { k: 'followers', label: 'Seguidores', type: 'number' }, { k: 'engagement_pct', label: 'Engagement %', type: 'number', step: '0.01' }, { k: 'affinity', label: 'Afinidad con SUKIVA (1-5)', type: 'number', min: 1 },
          { k: 'city', label: 'Ciudad' }, { k: 'contact', label: 'Contacto' },
          { k: 'status', label: 'Estatus', type: 'select', options: ['prospecto', 'contactada', 'aceptó', 'enviado', 'publicó', 'descartada'].map(s => [s, s]) }, { k: 'notes', label: 'Notas', type: 'textarea', wide: true }] }),
      h('div', { class: 'card stack' }, h('h2', {}, 'Obsequios y resultados'), table([{ label: 'Fecha', get: g => fmtDate(g.sent_at) }, { label: 'Influencer', get: g => g.influencer_profiles.name },
        { label: 'Prenda', get: g => g.qty + ' × ' + g.product_variants.sku }, { label: 'Costo', right: true, get: g => money(g.qty * g.unit_cost + Number(g.shipping_cost)) },
        { label: 'Publicaciones', right: true, get: g => g.posts_count }, { label: 'Alcance', right: true, get: g => g.reach != null ? g.reach.toLocaleString('es-MX') : '—' },
        { label: 'Ventas atribuidas', right: true, get: g => g.sales_attributed != null ? money(g.sales_attributed) : '—' }], gifts,
        g => formDialog('Resultados del obsequio', [{ k: 'delivered_at', label: 'Fecha de entrega', type: 'date' }, { k: 'posts_count', label: 'Publicaciones', type: 'number', min: 0 },
          { k: 'reach', label: 'Alcance', type: 'number', min: 0 }, { k: 'sales_attributed', label: 'Ventas atribuidas ($)', type: 'number', step: '0.01' }, { k: 'notes', label: 'Notas', type: 'textarea', wide: true }], g,
          async v => { v.posts_count = v.posts_count || 0; await run(db.from('influencer_gifts').update(v).eq('id', g.id), 'Resultados guardados'); pageInfluencers(); }))));
  }

  // ═════════════════════════ CONFIGURACIÓN
  async function pageConfig() {
    const [settings, profiles, logs] = await Promise.all([run(db.from('business_settings').select('*').order('key')),
      run(db.from('profiles').select('*').order('full_name')), run(db.from('audit_logs').select('*').order('id', { ascending: false }).limit(150))]);
    const names = Object.fromEntries(profiles.map(p => [p.id, p.full_name]));
    const fmtVal = v => typeof v === 'string' ? v || '—' : JSON.stringify(v);
    const url = (settings.find(s => s.key === 'catalog_url') || {}).value || new URL('./', location.href).href;
    const qr = qrcode(0, 'M'); qr.addData(String(url)); qr.make();
    const qrSrc = qr.createDataURL(10, 20);
    const diff = l => { if (l.action !== 'UPDATE') return l.action === 'INSERT' ? 'Alta' : 'Baja';
      return Object.keys(l.new_data || {}).filter(k => k !== 'updated_at' && JSON.stringify(l.new_data[k]) !== JSON.stringify((l.old_data || {})[k]))
        .map(k => k + ': ' + JSON.stringify((l.old_data || {})[k]) + ' → ' + JSON.stringify(l.new_data[k])).join(' · ').slice(0, 260); };
    const logoPath = (settings.find(s => s.key === 'logo_path') || {}).value || '';
    const logoFile = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp' });
    const setLogo = async path => {
      await run(db.from('business_settings').upsert({ key: 'logo_path', value: path, is_public: true,
        description: 'Logotipo (ruta en el almacenamiento de fotos). Se cambia desde Configuración → Logotipo' }), path ? 'Logotipo actualizado' : 'Logotipo eliminado');
      if (logoPath) await db.storage.from('product-images').remove([logoPath]);
      applyLogo(); pageConfig();
    };
    logoFile.addEventListener('change', async () => {
      const fl = logoFile.files[0]; if (!fl) return;
      const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[fl.type];
      if (!ext || fl.size > 2 * 1024 * 1024) return toast('Usa un PNG, JPG o WebP de hasta 2 MB (PNG con fondo transparente se ve mejor)', 'bad');
      const path = 'brand/logo-' + crypto.randomUUID() + '.' + ext;
      await run(db.storage.from('product-images').upload(path, fl, { contentType: fl.type, cacheControl: '31536000' }));
      await setLogo(path);
    });
    view().replaceChildren(head('Configuración'),
      h('div', { class: 'card stack' }, h('h2', {}, 'Logotipo'),
        h('div', { class: 'row' }, logoPath ? h('img', { src: imgUrl(logoPath), alt: 'Logotipo actual', class: 'logo-preview' }) : h('span', { class: 'badge warn' }, 'Sin logotipo: se muestra el nombre'),
          h('div', { class: 'stack grow' },
            h('p', { class: 'muted small' }, 'Aparece en el encabezado del catálogo, en el PDF del catálogo, en la pantalla de acceso y en el menú de este panel. Recomendado: PNG horizontal con fondo transparente, mínimo 600 px de ancho.'),
            isOwner() ? h('div', { class: 'row' }, h('div', { class: 'grow' }, logoFile),
              logoPath ? h('button', { class: 'btn sm danger', type: 'button', onclick: () => { if (confirm('¿Quitar el logotipo?')) setLogo(''); } }, 'Quitar logotipo') : null)
              : h('p', { class: 'muted small' }, 'Solo el superadministrador puede cambiarlo.')))),
      h('div', { class: 'card stack' }, h('h2', {}, 'Enlace y código QR permanentes'),
        h('div', { class: 'row' }, h('img', { src: qrSrc, alt: 'Código QR del catálogo', width: 180, height: 180 }),
          h('div', { class: 'stack grow' }, h('code', {}, String(url)), h('p', { class: 'muted small' }, 'El QR apunta al enlace fijo del catálogo; el contenido se lee de la base cada vez, así que no hay que regenerarlo cuando cambian productos, precios o existencias.'),
            h('div', {}, h('a', { class: 'btn sm', href: qrSrc, download: 'sukiva-catalogo-qr.gif' }, 'Descargar QR'))))),
      h('div', { class: 'card stack' }, h('h2', {}, 'Parámetros del negocio y cotizador'), isOwner() ? null : h('p', { class: 'muted small' }, 'Solo el superadministrador puede modificarlos.'),
        table([{ label: 'Parámetro', get: s => [h('b', {}, s.key), h('div', { class: 'muted small' }, s.description || '')] }, { label: 'Valor', get: s => fmtVal(s.value) },
          { label: 'Público', get: s => s.is_public ? badge('Catálogo', 'info') : badge('Interno') }, { label: 'Actualizado', get: s => fmtDate(s.updated_at, true) }], settings,
          isOwner() ? s => formDialog(s.key, [{ k: 'value', label: s.description || s.key, wide: true, help: 'Números con punto decimal (0.06 = 6%). true / false para sí o no.' }], { value: typeof s.value === 'string' ? s.value : JSON.stringify(s.value) },
            async v => { const raw = v.value == null ? '' : v.value; let val = raw;
              if (typeof s.value === 'number') { val = Number(raw); if (!isFinite(val)) { toast('Debe ser un número', 'bad'); throw new Error('nan'); } }
              else if (typeof s.value === 'boolean') { if (!['true', 'false'].includes(raw)) { toast('Escribe true o false', 'bad'); throw new Error('bool'); } val = raw === 'true'; }
              await run(db.from('business_settings').update({ value: val }).eq('key', s.key), 'Parámetro actualizado'); pageConfig(); }) : null)),
      await crud({ table: 'categories', title: 'Categorías y % de ganancia sobre costo', noun: 'categoría', order: 'sort', canWrite: isOwner(), reload: pageConfig,
        cols: [{ label: 'Categoría', get: c => c.name }, { label: '% sobre costo', right: true, get: c => Math.round(c.markup_pct * 100) + '%' }, { label: 'Activa', get: c => c.active ? 'Sí' : 'No' }],
        fields: [{ k: 'name', label: 'Nombre', required: true }, { k: 'markup_pct', label: '% a sumar sobre el costo (0.35 = 35%)', type: 'number', step: '0.01' },
          { k: 'sort', label: 'Orden', type: 'number', def: 0 }, { k: 'active', label: 'Activa', type: 'check', def: true }] }),
      await crud({ table: 'promotions', title: 'Promociones (se muestran en el catálogo)', noun: 'promoción', canWrite: true, reload: pageConfig,
        cols: [{ label: 'Promoción', get: p => [h('b', {}, p.name), h('div', { class: 'muted small' }, p.description || '')] }, { label: 'Vigencia', get: p => fmtDate(p.starts_at) + ' – ' + fmtDate(p.ends_at) },
          { label: 'Estado', get: p => p.active && p.show_in_catalog ? badge('En catálogo', 'ok') : badge('Oculta') }],
        fields: [{ k: 'name', label: 'Nombre', required: true, wide: true }, { k: 'description', label: 'Descripción', type: 'textarea', wide: true }, { k: 'starts_at', label: 'Inicia', type: 'date' },
          { k: 'ends_at', label: 'Termina', type: 'date' }, { k: 'active', label: 'Activa', type: 'check', def: true }, { k: 'show_in_catalog', label: 'Mostrar en catálogo', type: 'check', def: true }] }),
      await crud({ table: 'shipping_providers', title: 'Paqueterías', noun: 'paquetería', canWrite: true, reload: pageConfig,
        cols: [{ label: 'Nombre', get: p => p.name }, { label: 'Activa', get: p => p.active ? 'Sí' : 'No' }],
        fields: [{ k: 'name', label: 'Nombre', required: true }, { k: 'tracking_url', label: 'URL de rastreo (usa {guia})' }, { k: 'active', label: 'Activa', type: 'check', def: true }] }),
      await crud({ table: 'suppliers', title: 'Proveedores', noun: 'proveedor', canWrite: true, reload: pageConfig,
        cols: [{ label: 'Nombre', get: p => p.name }, { label: 'Contacto', get: p => p.contact || '—' }, { label: 'Activo', get: p => p.active ? 'Sí' : 'No' }],
        fields: [{ k: 'name', label: 'Nombre', required: true }, { k: 'contact', label: 'Contacto' }, { k: 'phone', label: 'Teléfono' }, { k: 'email', label: 'Correo', type: 'email' },
          { k: 'notes', label: 'Notas', type: 'textarea', wide: true }, { k: 'active', label: 'Activo', type: 'check', def: true }] }),
      h('div', { class: 'card stack' }, h('div', { class: 'row' }, h('h2', { class: 'grow' }, 'Usuarios y permisos'),
          isOwner() ? h('button', { class: 'btn sm primary', type: 'button', onclick: () => formDialog('Nuevo usuario', [
            { k: 'full_name', label: 'Nombre completo', required: true }, { k: 'email', label: 'Correo (será su usuario)', type: 'email', required: true },
            { k: 'role', label: 'Rol', type: 'select', options: [['vendedor', 'Vendedor(a): pedidos, pagos y clientes'], ['admin', 'Administrador: operación completa']] },
            pwField('password', 'Contraseña temporal')], {}, async v => {
              if (!v.full_name || !v.email) { toast('Nombre y correo son obligatorios', 'bad'); throw new Error('datos'); }
              if (!v.password || v.password.length < 12) { toast('La contraseña temporal debe tener al menos 12 caracteres', 'bad'); throw new Error('pw'); }
              const res = await adminUsers({ action: 'create', email: v.email, password: v.password });
              await run(db.from('profiles').update({ full_name: v.full_name, role: v.role, active: true }).eq('id', res.id), 'Usuario creado y activado');
              pageConfig();
            }) }, '+ Nuevo usuario') : null),
        h('p', { class: 'muted small' }, isOwner() ? 'Da de alta aquí a tus vendedoras: entran con su correo y la contraseña temporal, y la cambian con "Cambiar mi contraseña". Las ventas que capturen quedan registradas a su nombre.'
          : 'Solo el superadministrador da de alta usuarios y asigna roles.'),
        table([{ label: 'Nombre', get: p => p.full_name }, { label: 'Rol', get: p => badge(p.role, p.role === 'superadmin' ? 'info' : '') }, { label: 'Estado', get: p => p.active ? badge('Activo', 'ok') : badge('Inactivo', 'bad') },
          { label: 'Alta', get: p => fmtDate(p.created_at) }], profiles, isOwner() ? p => formDialog('Usuario', [{ k: 'full_name', label: 'Nombre', required: true },
            { k: 'role', label: 'Rol', type: 'select', options: [['vendedor', 'Vendedor(a): pedidos, pagos y clientes'], ['admin', 'Administrador: operación completa'], ['superadmin', 'Superadministrador: todo + configuración']] },
            { k: 'active', label: 'Cuenta activa', type: 'check' }], p, async v => { await run(db.from('profiles').update(v).eq('id', p.id), 'Usuario actualizado'); pageConfig(); },
            h('div', {}, h('button', { class: 'btn sm', type: 'button', onclick: () => formDialog('Nueva contraseña para ' + p.full_name, [pwField('password', 'Contraseña temporal')], {}, async v => {
              if (!v.password || v.password.length < 12) { toast('Mínimo 12 caracteres', 'bad'); throw new Error('pw'); }
              await adminUsers({ action: 'reset_password', user_id: p.id, password: v.password }); toast('Contraseña actualizada', 'ok');
            }) }, 'Restablecer contraseña'))) : null)),
      h('div', { class: 'card stack' }, h('h2', {}, 'Auditoría (últimos 150 cambios)'), table([{ label: 'Fecha', nowrap: true, get: l => fmtDate(l.at, true) },
        { label: 'Usuario', get: l => names[l.user_id] || (l.user_id ? 'Usuario' : 'Sistema / catálogo') }, { label: 'Tabla', get: l => l.table_name }, { label: 'Cambio', get: l => h('span', { class: 'small' }, diff(l)) }], logs)));
  }

  // ═════════════════════════ COMISIONES
  async function pageComisiones() {
    const from = h('input', { type: 'date', value: today().slice(0, 8) + '01' }), to = h('input', { type: 'date', value: today() });
    const out = h('div', { class: 'stack' });
    async function load() {
      const d = await run(db.rpc('commissions', { date_from: from.value, date_to: to.value }));
      const tot = k => d.rows.reduce((a, r) => a + Number(r[k] || 0), 0);
      const cols = [{ label: 'Vendedor(a)', get: r => r.seller_id ? r.seller : badge('Sin asignar', 'warn') }, { label: 'Pedidos', right: true, get: r => r.orders },
        { label: 'Piezas', right: true, get: r => r.pieces }, { label: 'Venta', right: true, get: r => money(r.sales) }];
      if (d.is_admin) cols.push({ label: 'Ganancia', right: true, get: r => money(r.profit) });
      cols.push({ label: 'Comisión', right: true, get: r => h('b', {}, money(r.commission)) });
      out.replaceChildren(
        h('div', { class: 'kpis' }, h('div', { class: 'kpi' }, h('span', { class: 'muted small' }, 'Venta del periodo'), h('b', {}, money(tot('sales')))),
          h('div', { class: 'kpi' }, h('span', { class: 'muted small' }, d.is_admin ? 'Comisiones por pagar' : 'Mi comisión'), h('b', {}, money(tot('commission')))),
          h('div', { class: 'kpi' }, h('span', { class: 'muted small' }, 'Piezas vendidas'), h('b', {}, tot('pieces')))),
        h('div', { class: 'card stack' }, table(cols, d.rows),
          h('p', { class: 'muted small' }, 'Comisión: ' + Math.round(d.pct * 100) + '% sobre ' + (d.base === 'Precio de venta' ? 'el precio de venta'
            : 'la ganancia (precio menos ' + Math.round(d.card_fee * 100) + '% de comisión de tarjeta, menos costo y descuentos)') +
            '. Cuenta solo pedidos Enviados o Entregados en el periodo; los devueltos y cancelados no generan comisión.' +
            (d.is_admin ? ' El porcentaje y la base se cambian en Configuración.' : ''))));
    }
    from.addEventListener('change', load); to.addEventListener('change', load);
    view().replaceChildren(head(isAdmin() ? 'Comisiones por vendedor(a)' : 'Mis ventas y comisión', h('label', { class: 'row small muted' }, 'Del', from), h('label', { class: 'row small muted' }, 'al', to)), out);
    await load();
  }

  // ═════════════════════════ ARRANQUE
  const PAGES = [
    { id: 'dashboard', label: 'Dashboard', admin: true, fn: pageDashboard }, { id: 'pedidos', label: 'Pedidos', fn: pagePedidos },
    { id: 'comisiones', label: 'Comisiones', fn: pageComisiones },
    { id: 'productos', label: 'Productos', admin: true, fn: pageProductos }, { id: 'inventario', label: 'Inventario', admin: true, fn: pageInventario },
    { id: 'compras', label: 'Compras', admin: true, fn: pageCompras }, { id: 'clientes', label: 'Clientes', fn: pageClientes },
    { id: 'politicas', label: 'Políticas', admin: true, fn: pagePoliticas }, { id: 'influencers', label: 'Influencers', admin: true, fn: pageInfluencers },
    { id: 'config', label: 'Configuración', admin: true, fn: pageConfig }];
  const allowed = () => PAGES.filter(p => !p.admin || isAdmin());

  async function route() {
    const pages = allowed(), page = pages.find(p => '#' + p.id === location.hash) || pages[0];
    $('nav').replaceChildren(...pages.map(p => h('a', { href: '#' + p.id, class: p === page ? 'active' : '' }, p.label)));
    $('sidebar').classList.remove('open');
    view().replaceChildren(h('p', { class: 'muted' }, 'Cargando…'));
    try { await page.fn(); } catch (e) { console.error(e); if (!view().querySelector('.card,.kpis')) view().replaceChildren(h('div', { class: 'notice' }, 'No se pudo cargar esta sección.')); }
  }

  // Logotipo: se lee de la configuración pública (misma fuente que el catálogo)
  async function applyLogo() {
    try {
      const { data } = await db.rpc('get_catalog');
      const path = data && data.settings && data.settings.logo_path, name = (data && data.settings && data.settings.business_name) || 'SUKIVA';
      document.querySelectorAll('.brand').forEach(el => {
        const sub = el.querySelector('span');
        el.replaceChildren(path ? h('img', { src: imgUrl(path), alt: name }) : name, sub || '');
      });
    } catch { /* sin logotipo: se queda el nombre */ }
  }

  async function boot() {
    if (ready) applyLogo();
    if (!ready) { $('login').classList.remove('hidden'); $('loginMsg').textContent = 'Falta configurar web/config.js con la URL y la llave publicable del proyecto.'; $('btnLogin').disabled = true; return; }
    const { data } = await db.auth.getSession(); session = data.session;
    if (!session) { $('app').classList.add('hidden'); $('login').classList.remove('hidden'); return; }
    role = (await db.rpc('my_role')).data;
    if (!role) { $('app').classList.add('hidden'); $('login').classList.remove('hidden');
      $('loginMsg').textContent = 'Tu cuenta existe pero aún no está activada. Pide al superadministrador que la active.'; await db.auth.signOut(); return; }
    $('login').classList.add('hidden'); $('app').classList.remove('hidden');
    $('who').textContent = session.user.email + ' · ' + role;
    route();
  }

  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault(); $('btnLogin').disabled = true; $('loginMsg').textContent = '';
    const { error } = await db.auth.signInWithPassword({ email: $('email').value.trim(), password: $('password').value });
    $('btnLogin').disabled = false; $('password').value = '';
    if (error) { $('loginMsg').textContent = 'Correo o contraseña incorrectos.'; return; }
    boot();
  });
  $('btnPassword').addEventListener('click', () => formDialog('Cambiar mi contraseña', [pwField('p1', 'Nueva contraseña'), pwField('p2', 'Repite la nueva contraseña')], {}, async v => {
    if (!v.p1 || v.p1.length < 12) { toast('Mínimo 12 caracteres', 'bad'); throw new Error('pw'); }
    if (v.p1 !== v.p2) { toast('Las contraseñas no coinciden', 'bad'); throw new Error('pw'); }
    const { error } = await db.auth.updateUser({ password: v.p1 });
    if (error) { toast('No se pudo cambiar la contraseña', 'bad'); throw error; }
    toast('Contraseña actualizada', 'ok');
  }));
  $('btnLogout').addEventListener('click', async () => { await db.auth.signOut(); location.hash = ''; location.reload(); });
  window.addEventListener('hashchange', () => { if (role) route(); });
  boot();
})();
