/**
 * Prop a Prop Teu — the internal management system (4 sections).
 *
 *   Products   what is sold on the public website
 *   Orders     Yerai enters what has to be made
 *   To-do      Albert's printing queue, grouped by material + colour
 *   Materials  filament left, in grams
 *
 * Google Sheets keeps the records nobody needs on screen:
 *   Operations!Order list / Pieces   the live data behind Orders and To-do
 *   Operations!Print history         one readable row per printed piece
 *   Operations!Deleted               pieces removed without being printed
 *   Finance!Finances                 one row per completed order (price, cost, profit)
 *   Inventory!To buy                 rolls flagged for repurchase
 *
 * Every write is keyed by an id and checks what is already there first, so a double
 * click, a refresh or a retry after an error never records anything twice.
 */

var MATERIAL_TYPES = ['PLA', 'PETG', 'ABS'];
var ORDER_TYPES = ['Product', 'Prototype', 'Personal'];

// The tabs this file owns: [spreadsheet, tab name, columns]. New columns go at the END only.
var MG = {
  orders:    ['ops', 'Order list', ['key', 'no', 'created', 'by', 'type', 'price', 'notes', 'source', 'status', 'completedAt', 'emailSent']],
  pieces:    ['ops', 'Pieces', ['id', 'orderKey', 'orderNo', 'created', 'productId', 'name', 'link', 'material', 'color', 'anyColor', 'copies', 'grams', 'status', 'preparedAt', 'printedAt', 'roll', 'cost', 'deducted']],
  history:   ['ops', 'Print history', ['Date', 'Order', 'Type', 'Product', 'Link', 'Copies', 'Material', 'Color', 'Grams', 'Cost (EUR)', 'Stock left (g)', 'By', 'Piece ID']],
  deleted:   ['ops', 'Deleted', ['Date', 'Order', 'Type', 'Product', 'Link', 'Copies', 'Material', 'Color', 'Order notes', 'By', 'Piece ID']],
  finances:  ['finance', 'Finances', ['Completed', 'Order', 'Type', 'Products', 'Grams', 'Selling price (EUR)', 'Internal cost (EUR)', 'Profit (EUR)', 'Notes', 'Order key']],
  tobuy:     ['inv', 'To buy', ['Date', 'Material', 'Color', 'Rolls', 'Cost per roll (EUR)', 'Added by']],
  materials: ['inv', 'Filaments', ['material', 'color', 'hex', 'grams', 'costPerRoll', 'lastTx']]
};

/* ---------- sheet access: each tab is read ONCE per request, rows become objects ---------- */

// tbl_('pieces') -> { sh, head, rows } with every row as an object keyed by header name
// (plus _row, its sheet row number). Creates the tab / missing columns on first use.
// The result is cached for the rest of the request and kept in step by the helpers below.
var MG_CACHE_ = {};
function tbl_(id) {
  if (MG_CACHE_[id]) return MG_CACHE_[id];
  var def = MG[id], ss = ss_(def[0]), sh = ss.getSheetByName(def[1]);
  if (!sh) { sh = ss.insertSheet(def[1]); sh.getRange(1, 1, 1, def[2].length).setValues([def[2]]); sh.setFrozenRows(1); }
  var v = sh.getDataRange().getValues();
  var head = v[0].map(function (h) { return String(h).trim(); });
  def[2].forEach(function (c) { if (head.indexOf(c) < 0) { head.push(c); sh.getRange(1, head.length).setValue(c); } });
  var rows = [];
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0] || '').trim() === '') continue;
    var o = { _row: i + 1 };
    head.forEach(function (h, j) { o[h] = v[i][j] === undefined ? '' : v[i][j]; });
    rows.push(o);
  }
  return (MG_CACHE_[id] = { sh: sh, head: head, rows: rows });
}
function rowArray_(t, obj) { return t.head.map(function (h) { return obj[h] != null ? obj[h] : ''; }); }
// Add a row (missing fields stay blank).
function addRow_(t, obj) {
  t.sh.appendRow(rowArray_(t, obj));
  var o = { _row: t.sh.getLastRow() };
  t.head.forEach(function (h) { o[h] = obj[h] != null ? obj[h] : ''; });
  t.rows.push(o);
  return o;
}
// Change some fields of an existing row; the whole row is written in ONE call.
function setRow_(t, row, patch) {
  for (var k in patch) row[k] = patch[k];
  t.sh.getRange(row._row, 1, 1, t.head.length).setValues([rowArray_(t, row)]);
}
function isTrue_(v) { return v === true || String(v).toLowerCase() === 'true'; }
function who_(session) { return session ? (session.name || session.email || '') : ''; }
function iso_(d) { return (d instanceof Date) ? d.toISOString() : String(d || ''); }
function money_(n) { return Math.round(Number(n || 0) * 100) / 100; }
function byKey_(t, field, value) { for (var i = 0; i < t.rows.length; i++) if (String(t.rows[i][field]) === String(value)) return t.rows[i]; return null; }

/* ============================ MATERIALS ============================ */

function findMat_(t, id) { for (var i = 0; i < t.rows.length; i++) if (matId(t.rows[i].material, t.rows[i].color) === id) return t.rows[i]; return null; }
function matView_(r) {
  return {
    id: matId(r.material, r.color), material: String(r.material).trim(), color: String(r.color || '').trim(),
    hex: String(r.hex || ''), grams: Number(r.grams || 0),
    costPerRoll: (r.costPerRoll === '' || r.costPerRoll == null) ? '' : Number(r.costPerRoll)
  };
}
function readMaterials() { return tbl_('materials').rows.map(matView_); }

// New material (no id) or edit of an existing one (id = the entry being edited).
// Adding a material + colour that already exists adds its grams to that entry.
function saveMaterial(session, m) {
  m = m || {};
  var material = String(m.material || '').trim().toUpperCase(), color = String(m.color || '').trim();
  if (MATERIAL_TYPES.indexOf(material) < 0) return { ok: false, error: 'material', message: 'Choose PLA, PETG or ABS.' };
  if (!color) return { ok: false, error: 'color', message: 'Enter the color name.' };
  var grams = Math.max(0, Number(m.grams || 0));
  var cost = (m.costPerRoll === '' || m.costPerRoll == null) ? '' : Number(m.costPerRoll);
  var t = tbl_('materials'), key = matId(material, color), editId = String(m.id || '');
  var same = findMat_(t, key);

  if (editId) {
    var editing = findMat_(t, editId);
    if (!editing) return { ok: false, error: 'notfound', message: 'Material not found.' };
    if (same && same !== editing) return { ok: false, error: 'exists', message: material + ' ' + color + ' already exists.' };
    setRow_(t, editing, { material: material, color: color, hex: String(m.hex || ''), grams: grams, costPerRoll: cost });
    return { ok: true, id: key };
  }
  if (same) {
    var patch = { grams: Number(same.grams || 0) + grams };
    if (m.hex) patch.hex = String(m.hex);
    if (cost !== '') patch.costPerRoll = cost;
    setRow_(t, same, patch);
    return { ok: true, id: key, merged: true };
  }
  addRow_(t, { material: material, color: color, hex: String(m.hex || ''), grams: grams, costPerRoll: cost, active: true });
  return { ok: true, id: key };
}
function deleteMaterial(id) {
  var t = tbl_('materials'), r = findMat_(t, id);
  if (!r) return { ok: false, error: 'notfound', message: 'Material not found.' };
  t.sh.deleteRow(r._row); delete MG_CACHE_.materials;
  return { ok: true };
}
// Repurchase icon: add one roll of this material + colour to the Inventory!To buy list.
function repurchase(session, id) {
  var r = findMat_(tbl_('materials'), id);
  if (!r) return { ok: false, error: 'notfound', message: 'Material not found.' };
  tbl_('tobuy').sh.appendRow([new Date(), r.material, r.color, 1, r.costPerRoll === '' ? '' : Number(r.costPerRoll || 0), who_(session)]);
  return { ok: true };
}
// One-off: replace the whole inventory with a given list (used to load the starting stock).
function resetMaterials(session, list) {
  if (!list || !list.length) return { ok: false, error: 'missing', message: 'Empty list.' };
  var t = tbl_('materials');
  if (t.sh.getLastRow() > 1) t.sh.deleteRows(2, t.sh.getLastRow() - 1);
  t.rows = [];
  list.forEach(function (m) {
    addRow_(t, { material: String(m.material).toUpperCase(), color: m.color, hex: m.hex || '', grams: Number(m.grams || 0),
      costPerRoll: (m.costPerRoll == null ? '' : m.costPerRoll), active: true });
  });
  return { ok: true, count: list.length };
}

/* ============================ ORDERS ============================ */

function pieceView_(p) {
  return {
    id: String(p.id), orderKey: String(p.orderKey), orderNo: Number(p.orderNo || 0), created: iso_(p.created),
    productId: String(p.productId || ''), name: String(p.name || ''), link: String(p.link || ''),
    material: String(p.material || ''), color: String(p.color || ''), anyColor: isTrue_(p.anyColor),
    copies: Math.max(1, Number(p.copies || 1)), grams: (p.grams === '' || p.grams == null) ? '' : Number(p.grams),
    status: String(p.status || 'todo')
  };
}
function isActive_(status) { return status === 'todo' || status === 'prepared' || status === 'printing'; }
// Order numbers simply continue from the highest one in the Order list.
function nextOrderNo_() {
  var max = 0;
  tbl_('orders').rows.forEach(function (r) { max = Math.max(max, Number(r.no) || 0); });
  return max + 1;
}
// Validate + normalise one product line coming from the order form.
function cleanPiece_(p) {
  var material = String(p.material || '').trim().toUpperCase();
  var any = p.anyColor ? true : false;
  var out = {
    id: String(p.id || '').trim(), productId: String(p.productId || '').trim(), name: String(p.name || '').trim(),
    link: String(p.link || '').trim(), material: material, color: any ? '' : String(p.color || '').trim(), anyColor: any,
    copies: Math.max(1, Math.floor(Number(p.copies || 1))),
    grams: (p.grams === '' || p.grams == null) ? '' : Math.max(0, Number(p.grams))
  };
  if (out.id.length < 8) return { error: 'A product line has no id.' };
  if (!out.name) return { error: 'Every product needs a name.' };
  if (MATERIAL_TYPES.indexOf(material) < 0) return { error: 'Choose a material for "' + out.name + '".' };
  if (!any && !out.color) return { error: 'Choose a color (or "Color not important") for "' + out.name + '".' };
  return out;
}
function newPiece_(key, no, when, c) {
  addRow_(tbl_('pieces'), { id: c.id, orderKey: key, orderNo: no, created: when, productId: c.productId, name: c.name, link: c.link,
    material: c.material, color: c.color, anyColor: c.anyColor, copies: c.copies, grams: c.grams, status: 'todo' });
}

// Create or update an order. The key and the piece ids are made by the browser when the
// form opens, so saving the same form twice updates the same order instead of adding one.
function saveOrder(session, o) {
  o = o || {};
  var key = String(o.key || '').trim();
  if (key.length < 8) return { ok: false, error: 'key', message: 'Missing order key.' };
  var type = ORDER_TYPES.indexOf(String(o.type)) >= 0 ? String(o.type) : 'Product';
  var price = (o.price === '' || o.price == null) ? '' : money_(o.price);
  var notes = String(o.notes || '').trim();
  if (!o.pieces || !o.pieces.length) return { ok: false, error: 'pieces', message: 'Add at least one product.' };
  var clean = [];
  for (var i = 0; i < o.pieces.length; i++) {
    var c = cleanPiece_(o.pieces[i]);
    if (c.error) return { ok: false, error: 'piece', message: c.error };
    clean.push(c);
  }

  var ot = tbl_('orders'), pt = tbl_('pieces'), order = byKey_(ot, 'key', key);

  if (!order) {
    var no = nextOrderNo_(), now = new Date();
    order = addRow_(ot, { key: key, no: no, created: now, by: who_(session), type: type, price: price, notes: notes, source: 'manual', status: 'active' });
    clean.forEach(function (c) { newPiece_(key, no, now, c); });
    var mailed = notifyNewOrder_(order);
    return { ok: true, key: key, no: no, created: true, emailed: mailed };
  }

  if (String(order.status) !== 'active') return { ok: false, error: 'closed', message: 'This order is already closed.' };
  setRow_(ot, order, { type: type, price: price, notes: notes });
  var mine = pt.rows.filter(function (r) { return String(r.orderKey) === key; }), seen = {};
  clean.forEach(function (c) {
    seen[c.id] = true;
    var ex = null; mine.forEach(function (r) { if (String(r.id) === c.id) ex = r; });
    if (!ex) { newPiece_(key, order.no, new Date(), c); return; }
    var st = String(ex.status);
    if (st !== 'todo' && st !== 'prepared') return;            // printed / deleted / mid-print: leave as is
    setRow_(pt, ex, { productId: c.productId, name: c.name, link: c.link, material: c.material, color: c.color, anyColor: c.anyColor, copies: c.copies, grams: c.grams });
  });
  // Lines removed from the form are deleted (and kept in the Deleted tab).
  mine.forEach(function (r) {
    var st = String(r.status);
    if (!seen[String(r.id)] && (st === 'todo' || st === 'prepared')) removePiece_(r, order, session);
  });
  closeOrderIfDone_(key);
  return { ok: true, key: key, no: Number(order.no), created: false };
}
// Mark a piece deleted and write a readable row in Operations!Deleted (once).
function removePiece_(r, order, session) {
  var dt = tbl_('deleted');
  if (!byKey_(dt, 'Piece ID', r.id))
    addRow_(dt, { 'Date': new Date(), 'Order': '#' + r.orderNo, 'Type': order ? order.type : '', 'Product': r.name, 'Link': r.link, 'Copies': Number(r.copies || 1),
      'Material': r.material, 'Color': isTrue_(r.anyColor) ? 'Color not important' : r.color, 'Order notes': order ? order.notes : '', 'By': who_(session), 'Piece ID': r.id });
  setRow_(tbl_('pieces'), r, { status: 'deleted' });
}

// The single "new order" alert. Sent once, only when the order row is first created.
function notifyNewOrder_(order) {
  var sent = false, to = notifyEmail_(), subject = 'New order added to the to-do list';
  try { MailApp.sendEmail(to, subject, ''); sent = true; }
  catch (e) {
    try { MailApp.sendEmail(to, subject, ' '); sent = true; }
    catch (e2) { logErr_('new-order email ' + order.key, e2); }
  }
  if (sent) setRow_(tbl_('orders'), order, { emailSent: true });
  return sent;
}

// Active orders with their open product lines, newest first (the Orders screen).
function listOrders() {
  var ot = tbl_('orders'), pt = tbl_('pieces'), byOrder = {}, printed = {};
  pt.rows.forEach(function (p) {
    var k = String(p.orderKey), st = String(p.status);
    if (st === 'printed') printed[k] = (printed[k] || 0) + 1;
    if (isActive_(st)) (byOrder[k] = byOrder[k] || []).push(pieceView_(p));
  });
  var out = [];
  ot.rows.forEach(function (o) {
    if (String(o.status) !== 'active') return;
    out.push({ key: String(o.key), no: Number(o.no), created: iso_(o.created), type: String(o.type), price: o.price === '' ? '' : Number(o.price),
      notes: String(o.notes || ''), source: String(o.source || ''), pieces: byOrder[String(o.key)] || [], printed: printed[String(o.key)] || 0 });
  });
  out.sort(function (a, b) { return b.no - a.no; });
  return { ok: true, data: out };
}

// Delete a whole order: every open line goes to the Deleted tab.
function deleteOrder(session, key) {
  key = String(key || '');
  var order = byKey_(tbl_('orders'), 'key', key);
  if (!order) return { ok: false, error: 'notfound', message: 'Order not found.' };
  tbl_('pieces').rows.forEach(function (r) { if (String(r.orderKey) === key && isActive_(String(r.status))) removePiece_(r, order, session); });
  closeOrderIfDone_(key);
  return { ok: true };
}

/* ============================ TO-DO ============================ */

// Group the open pieces for printing. PURE (no sheets) so it can be unit-tested.
//  - same material + same colour = one group
//  - "color not important" joins the smallest group of its material (own group if none)
//  - inside a group: prepared first, then oldest first
//  - groups: those with something prepared first, then heaviest, then oldest
function groupTodo_(pieces, mats) {
  var hex = {};
  (mats || []).forEach(function (m) { hex[String(m.material).toUpperCase() + '|' + String(m.color).toLowerCase()] = m.hex || ''; });
  var byTime = function (a, b) { return String(a.created).localeCompare(String(b.created)) || (a.orderNo - b.orderNo) || String(a.id).localeCompare(String(b.id)); };
  var sorted = pieces.slice().sort(byTime), groups = {}, list = [];
  function group(key, material, color, label) {
    if (!groups[key]) { groups[key] = { key: key, material: material, color: color, label: label, hex: hex[key] || '', pieces: [] }; list.push(groups[key]); }
    return groups[key];
  }
  sorted.forEach(function (p) {
    if (!p.material || p.anyColor) return;
    var key = String(p.material).toUpperCase() + '|' + String(p.color).toLowerCase();
    group(key, p.material, p.color, p.material + ' · ' + p.color).pieces.push(p);
  });
  var weight = function (g) { return g.pieces.reduce(function (s, p) { return s + Number(p.grams || 0); }, 0); };
  var copies = function (g) { return g.pieces.reduce(function (s, p) { return s + Number(p.copies || 1); }, 0); };
  // Sizes are measured before any "color not important" piece joins, so the choice is stable.
  var size = {}; list.forEach(function (g) { size[g.key] = { w: weight(g), c: copies(g), t: String(g.pieces[0].created) }; });
  sorted.forEach(function (p) {
    if (!p.material || !p.anyColor) return;
    var cands = list.filter(function (g) { return size[g.key] && String(g.material).toUpperCase() === String(p.material).toUpperCase(); });
    if (!cands.length) { group(String(p.material).toUpperCase() + '|*', p.material, '', p.material + ' · Any color').pieces.push(p); return; }
    cands.sort(function (a, b) { return (size[a.key].w - size[b.key].w) || (size[a.key].c - size[b.key].c) || size[a.key].t.localeCompare(size[b.key].t); });
    cands[0].pieces.push(p);
  });
  sorted.forEach(function (p) { if (!p.material) group('?', '', '', 'Material not set').pieces.push(p); });

  var prepared = function (p) { return p.status === 'prepared' || p.status === 'printing'; };
  list.forEach(function (g) {
    g.pieces.sort(function (a, b) { return (prepared(b) ? 1 : 0) - (prepared(a) ? 1 : 0) || byTime(a, b); });
    g.grams = weight(g);
    g.hasPrepared = g.pieces.some(prepared);
    g.oldest = g.pieces.reduce(function (m, p) { return (!m || String(p.created) < m) ? String(p.created) : m; }, '');
  });
  list.sort(function (a, b) {
    return ((a.key === '?') - (b.key === '?')) || ((b.hasPrepared ? 1 : 0) - (a.hasPrepared ? 1 : 0)) || (b.grams - a.grams) || a.oldest.localeCompare(b.oldest);
  });
  return list;
}

// The To-do screen: open pieces (with their order's details) already grouped and ordered.
function todo() {
  var orders = {};
  tbl_('orders').rows.forEach(function (o) { orders[String(o.key)] = o; });
  var pieces = [];
  tbl_('pieces').rows.forEach(function (p) {
    if (!isActive_(String(p.status))) return;
    var v = pieceView_(p), o = orders[v.orderKey] || {};
    v.orderType = String(o.type || ''); v.orderPrice = (o.price === '' || o.price == null) ? '' : Number(o.price); v.orderNotes = String(o.notes || '');
    pieces.push(v);
  });
  var mats = readMaterials();
  return { ok: true, groups: groupTodo_(pieces, mats), materials: mats };
}

// Tick / untick "prepared for printing" (G-code sent). Never touches inventory.
function setPrepared(session, id, on) {
  var pt = tbl_('pieces'), p = byKey_(pt, 'id', id);
  if (!p) return { ok: false, error: 'notfound', message: 'Not found.' };
  var st = String(p.status);
  if (st !== 'todo' && st !== 'prepared') return { ok: true, status: st };
  setRow_(pt, p, on ? { status: 'prepared', preparedAt: new Date() } : { status: 'todo', preparedAt: '' });
  return { ok: true, status: on ? 'prepared' : 'todo' };
}
// Albert enters the real weight (total grams for the card).
function setGrams(session, id, grams) {
  var pt = tbl_('pieces'), p = byKey_(pt, 'id', id);
  if (!p) return { ok: false, error: 'notfound', message: 'Not found.' };
  var st = String(p.status);
  if (st !== 'todo' && st !== 'prepared') return { ok: false, error: 'closed', message: 'This product is already closed.' };
  setRow_(pt, p, { grams: (grams === '' || grams == null) ? '' : Math.max(0, Number(grams)) });
  return { ok: true };
}
// The X on a card: remove that product from the to-do (kept in the Deleted tab).
function deletePiece(session, id) {
  var p = byKey_(tbl_('pieces'), 'id', id);
  if (!p) return { ok: false, error: 'notfound', message: 'Not found.' };
  var st = String(p.status);
  if (st === 'deleted' || st === 'printed') return { ok: true };
  if (st === 'printing') return { ok: false, error: 'printing', message: 'This product is half-recorded as printed. Press Printed again to finish it.' };
  removePiece_(p, byKey_(tbl_('orders'), 'key', p.orderKey), session);
  closeOrderIfDone_(String(p.orderKey));
  return { ok: true };
}

// PRINTED: deduct the real grams, write the history row, close the order if it was the last
// piece. Each step first checks whether it already happened, so pressing twice (or retrying
// after an error half-way) finishes the same transaction instead of repeating it.
function printPiece(session, id, roll) {
  var pt = tbl_('pieces'), p = byKey_(pt, 'id', id);
  if (!p) return { ok: false, error: 'notfound', message: 'Not found.' };
  var st = String(p.status);
  if (st === 'printed') return { ok: true, already: true };
  if (st === 'deleted') return { ok: false, error: 'deleted', message: 'This product was deleted.' };
  var grams = Number(p.grams || 0);
  if (!(grams > 0)) return { ok: false, error: 'weight', message: 'Enter the weight in grams before marking it as printed.' };

  // Which roll was used: the one already recorded, the one chosen now, or the piece's own colour.
  var rollId = String(p.roll || '') || String(roll || '') || (isTrue_(p.anyColor) || !p.material ? '' : matId(p.material, p.color));
  var mt = tbl_('materials'), m = findMat_(mt, rollId);
  if (!m) return { ok: false, error: 'roll', message: 'Choose the roll that was used.' };

  // 1. Remember the decision, so a retry uses the same roll and weight.
  if (st !== 'printing') setRow_(pt, p, { status: 'printing', roll: rollId, printedAt: new Date() });

  // 2. Deduct once. The roll remembers the last piece deducted from it (lastTx), written
  //    in the same call as the new grams, so a retry can tell it already happened.
  var left = Number(m.grams || 0), shortBy = 0;
  if (!isTrue_(p.deducted)) {
    if (String(m.lastTx) !== String(p.id)) {
      left = left - grams; if (left < 0) { shortBy = -left; left = 0; }
      setRow_(mt, m, { grams: left, lastTx: String(p.id) });
    }
    setRow_(pt, p, { deducted: true });
  }

  // 3. One readable history row per piece.
  var cost = money_(grams * Number(m.costPerRoll || 0) / 1000);
  var order = byKey_(tbl_('orders'), 'key', p.orderKey), ht = tbl_('history');
  if (!byKey_(ht, 'Piece ID', p.id))
    addRow_(ht, { 'Date': new Date(), 'Order': '#' + p.orderNo, 'Type': order ? order.type : '', 'Product': p.name, 'Link': p.link, 'Copies': Number(p.copies || 1),
      'Material': m.material, 'Color': m.color, 'Grams': grams, 'Cost (EUR)': cost, 'Stock left (g)': left, 'By': who_(session), 'Piece ID': p.id });

  // 4. Done: it leaves the to-do.  5. Last piece of the order -> one finance row.
  setRow_(pt, p, { status: 'printed', cost: cost });
  closeOrderIfDone_(String(p.orderKey));
  return { ok: true, stockLeft: left, warning: shortBy ? ('Stock for ' + m.material + ' ' + m.color + ' was ' + shortBy + ' g short; it is now 0.') : '' };
}

// When an order has no open pieces left: completed (one Finances row) if anything was
// printed, otherwise just closed as deleted. Safe to call any number of times.
function closeOrderIfDone_(key) {
  var ot = tbl_('orders'), order = byKey_(ot, 'key', key);
  if (!order || String(order.status) !== 'active') return;
  var mine = tbl_('pieces').rows.filter(function (r) { return String(r.orderKey) === key; });
  if (mine.some(function (r) { return isActive_(String(r.status)); })) return;
  var printed = mine.filter(function (r) { return String(r.status) === 'printed'; });
  if (!printed.length) { setRow_(ot, order, { status: 'deleted', completedAt: new Date() }); return; }

  var ft = tbl_('finances');
  if (!byKey_(ft, 'Order key', key)) {
    var grams = 0, cost = 0, names = [];
    printed.forEach(function (r) {
      grams += Number(r.grams || 0); cost += Number(r.cost || 0);
      names.push((Number(r.copies || 1) > 1 ? r.copies + 'x ' : '') + r.name);
    });
    var price = Number(order.price || 0);
    addRow_(ft, { 'Completed': new Date(), 'Order': '#' + order.no, 'Type': order.type, 'Products': names.join(', '), 'Grams': grams,
      'Selling price (EUR)': money_(price), 'Internal cost (EUR)': money_(cost), 'Profit (EUR)': money_(price - cost), 'Notes': order.notes, 'Order key': key });
  }
  setRow_(ot, order, { status: 'completed', completedAt: new Date() });
}

// A checkout on the public website also lands in the to-do (material still to be chosen).
function addWebOrderToTodo_(orderId, lines, total, note) {
  var ot = tbl_('orders');
  if (byKey_(ot, 'key', orderId)) return;
  var no = nextOrderNo_(), now = new Date();
  var order = addRow_(ot, { key: orderId, no: no, created: now, by: 'website', type: 'Product', price: money_(total),
    notes: 'Web order ' + orderId + (note ? ' — ' + note : ''), source: 'web', status: 'active' });
  lines.forEach(function (l, i) {
    newPiece_(orderId, no, now, { id: orderId + '-' + (i + 1), productId: l.id, name: l.name, link: '', material: '', color: '', anyColor: false, copies: Math.max(1, Number(l.qty || 1)), grams: '' });
  });
  notifyNewOrder_(order);
}

/* ============================ PRODUCTS ============================ */

// Only the fields the Products screen shows.
function productView_(p) {
  var tri = function (v) { v = v || {}; return (typeof v === 'string') ? { en: v, ca: v, es: v } : { en: v.en || '', ca: v.ca || '', es: v.es || '' }; };
  return { id: p.id, code: p.codename || '', name: tri(p.name), price: Number(p.price || 0),
    printTime: p.printTimeMin == null ? '' : p.printTimeMin, short: tri(p.short), description: tri(p.description), image: (p.images && p.images[0]) || '' };
}
function listProductsSimple() { return { ok: true, data: readProducts().map(productView_) }; }

// Keep only simple formatting in the long description.
function sanitizeHtml_(s) {
  var allowed = ['b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'p', 'br'];
  s = String(s || '').replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  s = s.replace(/<\s*(\/?)\s*([a-zA-Z0-9]+)[^>]*>/g, function (all, slash, tag) {
    tag = tag.toLowerCase(); if (tag === 'div') tag = 'p';
    return allowed.indexOf(tag) < 0 ? '' : '<' + slash + tag + '>';
  });
  return s.replace(/&nbsp;/g, ' ').trim();
}
// "Easy Hang ATLAS" -> "easy-hang-atlas" (made unique among existing ids).
function slug_(name, taken) {
  var s = String(name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'product';
  var out = s, n = 2;
  while (taken[out]) out = s + '-' + (n++);
  return out;
}
// English is what the manager types. A missing Catalan/Spanish text is machine-translated;
// if that fails the English text is copied, so no language is ever left empty.
function fillLanguages_(v, html) {
  v = v || {};
  var en = html ? sanitizeHtml_(v.en) : String(v.en || '').trim(), out = { en: en };
  ['ca', 'es'].forEach(function (l) {
    var t = html ? sanitizeHtml_(v[l]) : String(v[l] || '').trim();
    if (!t && en) {
      try { t = LanguageApp.translate(en, 'en', l, html ? { contentType: 'html' } : {}); } catch (e) { t = ''; }
      t = html ? sanitizeHtml_(t) : String(t || '').trim();
      if (!t) t = en;
    }
    out[l] = t;
  });
  return out;
}

// Save a product and put it on the public website straight away (no Publish button).
function saveProductSimple(session, d) {
  d = d || {};
  if (!d.name || !String(d.name.en || '').trim()) return { ok: false, error: 'name', message: 'Enter the product name.' };
  var all = readProducts(), taken = {}, existing = null;
  all.forEach(function (p) { taken[p.id] = true; if (d.id && p.id === d.id) existing = p; });
  if (d.id && !existing) return { ok: false, error: 'notfound', message: 'Product not found.' };

  var p = existing || { type: 'own', labels: [], images: [] };
  p.id = existing ? existing.id : slug_(d.name.en, taken);
  p.name = fillLanguages_(d.name, false);
  p.short = fillLanguages_(d.short, false);
  p.description = fillLanguages_(d.description, true);
  p.price = Number(d.price || 0);
  p.codename = String(d.code || '').trim();
  p.printTimeMin = (d.printTime === '' || d.printTime == null) ? '' : Number(d.printTime);
  if (d.image) p.images = [String(d.image)];
  if (!p.labels) p.labels = [];
  p.active = true;

  var saved = saveProduct(p);
  if (!saved.ok) return saved;
  var pub = publish(session);
  return { ok: true, id: p.id, published: pub.ok, message: pub.ok ? '' : ('Saved, but the website update failed: ' + (pub.message || '')) };
}
function deleteProductSimple(session, id) {
  var del = deleteProduct(id);
  if (!del.ok) return del;
  var pub = publish(session);
  return { ok: true, published: pub.ok, message: pub.ok ? '' : ('Deleted, but the website update failed: ' + (pub.message || '')) };
}

/* ============================ MAINTENANCE ============================ */

// Remove TEST rows (their product name or notes contain `marker`) from the tabs this file
// owns, so a test run leaves the records clean. Not used by any screen.
function purgeTest(session, marker) {
  marker = String(marker || '').trim();
  if (marker.length < 6) return { ok: false, error: 'marker', message: 'Marker too short.' };
  var removed = {}, rows = {};
  function purge(id, cols) {
    var t = tbl_(id), n = 0; rows[id] = [];
    for (var i = t.rows.length - 1; i >= 0; i--) {
      var r = t.rows[i];
      if (cols.some(function (c) { return String(r[c] == null ? '' : r[c]).indexOf(marker) >= 0; })) {
        rows[id].push(t.head.map(function (h) { return String(r[h]); }).join(' | '));
        t.sh.deleteRow(r._row); n++;
      }
    }
    delete MG_CACHE_[id];
    removed[id] = n;
  }
  // Pieces of a test order go too, whatever their name (website orders use the product name).
  var keys = {};
  tbl_('orders').rows.forEach(function (o) { if (String(o.notes).indexOf(marker) >= 0) keys[String(o.key)] = true; });
  tbl_('pieces').rows.forEach(function (p) { if (keys[String(p.orderKey)]) p._test = marker; });
  purge('pieces', ['name', '_test']);
  purge('orders', ['notes']);
  purge('history', ['Product']);
  purge('deleted', ['Product', 'Order notes']);
  purge('finances', ['Products', 'Notes']);
  purge('tobuy', ['Color']);
  // The website checkout also writes its own row in the older Operations!Orders tab.
  try {
    var sh = tab_('ops', 'Orders'), v = sh.getDataRange().getValues(), n = 0;
    for (var i = v.length - 1; i >= 1; i--) if (v[i].join(' ').indexOf(marker) >= 0) { sh.deleteRow(i + 1); n++; }
    removed.webOrders = n;
  } catch (e) {}
  return { ok: true, removed: removed, rows: rows };
}
