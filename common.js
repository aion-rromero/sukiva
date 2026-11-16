// SUKIVA — utilidades compartidas. Todo el contenido dinámico se inserta como TEXTO (nunca innerHTML)
// para que datos capturados por terceros (nombres, notas) no puedan inyectar código.
window.SK = (() => {
  const cfg = window.SUKIVA_CONFIG || {};
  const ready = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(cfg.supabaseUrl || '') && !!cfg.supabaseKey;
  const db = ready ? supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey) : null;

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'value') el.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'required' || k === 'open') el[k] = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  const money = n => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN',
    minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(Number(n) || 0);
  const fmtDate = (d, time) => d ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(d) ? d + 'T12:00:00' : d).toLocaleString('es-MX',
    time ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }) : '—';
  const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  function toast(msg, kind) {
    let box = document.getElementById('toasts');
    if (!box) { box = h('div', { id: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(box); }
    const t = h('div', { class: 'toast ' + (kind || '') }, msg);
    box.append(t); setTimeout(() => t.remove(), kind === 'bad' ? 7000 : 3500);
  }

  // Solo rutas del bucket público de fotos; se codifica cada segmento.
  const imgUrl = path => cfg.supabaseUrl + '/storage/v1/object/public/product-images/' +
    String(path).split('/').map(encodeURIComponent).join('/');

  function dialog(title, body, actions) {
    const d = h('dialog', {},
      h('div', { class: 'dlg-head' }, h('h2', { class: 'grow' }, title),
        h('button', { class: 'btn sm', 'aria-label': 'Cerrar', onclick: () => d.close() }, '✕')),
      h('div', { class: 'dlg-body' }, body),
      actions && actions.length ? h('div', { class: 'dlg-foot' }, actions) : null);
    d.addEventListener('close', () => d.remove());
    document.body.append(d); d.showModal();
    return d;
  }

  return { cfg, ready, db, h, money, fmtDate, today, toast, imgUrl, dialog };
})();
