/**
 * Prop a Prop Teu — engine tests.
 *
 * Run from the Apps Script editor: choose `runAllTests` and press Run, then read
 * the execution log. Pure tests touch no sheets and send no email, so they are
 * always safe. Integration tests create and then delete their own scratch rows
 * (the job one also sends a single test alert email); run them with
 * `runAllTests(true)` only when you accept a couple of test writes.
 *
 *   runAllTests()       // pure logic only (safe, default)
 *   runAllTests(true)   // + integration tests against the live sheets
 */

var T_ = { pass: 0, fail: 0, log: [] };
function t_ok_(cond, msg) {
  if (cond) { T_.pass++; }
  else { T_.fail++; T_.log.push('FAIL: ' + msg); }
}
function t_eq_(a, b, msg) { t_ok_(a === b, msg + ' (got ' + a + ', want ' + b + ')'); }
function t_near_(a, b, msg) { t_ok_(Math.abs(a - b) < 1e-9, msg + ' (got ' + a + ', want ' + b + ')'); }

function runAllTests(includeIntegration) {
  T_ = { pass: 0, fail: 0, log: [] };

  test_status_();
  test_periods_();
  test_fmtMin_();
  test_uid_();
  test_planQueue_();
  test_iva_();
  test_inPeriod_();

  if (includeIntegration) {
    test_deductMaterial_integration_();
    test_jobArchive_integration_();
  }

  var summary = 'TESTS — PASS ' + T_.pass + '  FAIL ' + T_.fail +
    (includeIntegration ? '  (incl. integration)' : '  (pure only)');
  Logger.log(summary);
  T_.log.forEach(function (l) { Logger.log(l); });
  return { ok: T_.fail === 0, pass: T_.pass, fail: T_.fail, failures: T_.log };
}

/* ---------------- pure tests (no sheets, no email) ---------------- */

function test_status_() {
  t_eq_(normStatus_('pendent pagament'), 'awaiting_payment', 'legacy ca -> en');
  t_eq_(normStatus_('entregat'), 'delivered', 'legacy ca -> en 2');
  t_eq_(normStatus_('paid'), 'paid', 'en passthrough');
  t_eq_(normStatus_(''), 'new', 'empty -> new');
  t_ok_(ORDER_STATUS.indexOf('cancelled') >= 0, 'cancelled is a known status');
}

function test_periods_() {
  t_eq_(nextPeriod_('2026-11'), '2026-12', 'next month');
  t_eq_(nextPeriod_('2026-12'), '2027-01', 'year roll');
  t_ok_('2026-02' < '2026-10', 'periods sort lexicographically');
  t_eq_(period_(new Date(2026, 0, 15)).length, 7, 'period is YYYY-MM');
}

function test_fmtMin_() {
  t_eq_(fmtMin_(0), '?', 'zero -> ?');
  t_eq_(fmtMin_(90), '1h 30min', '90 min');
  t_eq_(fmtMin_(45), '45min', '45 min');
}

function test_uid_() {
  var a = uid_('ORD-'), b = uid_('ORD-');
  t_ok_(a.indexOf('ORD-') === 0, 'uid has prefix');
  t_ok_(a !== b, 'two uids differ');
}

function test_planQueue_() {
  var same = [mkJob_('product', 'PLA', 'red'), mkJob_('product', 'PLA', 'red'), mkJob_('product', 'PLA', 'red')];
  var r1 = planQueue_(same, { product: 60, research: 30, personal: 10 });
  t_eq_(r1.count, 3, 'same: count');
  t_eq_(r1.filamentChanges, 0, 'same: no filament changes');

  var mix = [mkJob_('product', 'PETG', 'red'), mkJob_('product', 'PLA', 'red'), mkJob_('product', 'PETG', 'red'), mkJob_('product', 'PLA', 'red')];
  var r2 = planQueue_(mix, { product: 100, research: 0, personal: 0 });
  t_eq_(r2.count, 4, 'mix: count');
  t_eq_(r2.filamentChanges, 1, 'mix: grouped to a single change');

  var jobs = [];
  for (var a = 0; a < 6; a++) jobs.push(mkJob_('product', 'PLA', 'c' + a));
  for (var b = 0; b < 3; b++) jobs.push(mkJob_('research', 'PLA', 'r' + b));
  jobs.push(mkJob_('personal', 'PLA', 'x'));
  var r3 = planQueue_(jobs, { product: 60, research: 30, personal: 10 });
  t_eq_(r3.count, 10, '6/3/1: all consumed');
  t_eq_(r3.order.filter(function (j) { return j.category === 'product'; }).length, 6, '6/3/1: products');
  t_eq_(r3.order.filter(function (j) { return j.category === 'research'; }).length, 3, '6/3/1: research');
  t_eq_(r3.order.filter(function (j) { return j.category === 'personal'; }).length, 1, '6/3/1: personal');

  var anyc = [mkJob_('product', 'PLA', 'red'), mkJobAny_('product', 'PLA')];
  t_eq_(planQueue_(anyc, { product: 100, research: 0, personal: 0 }).filamentChanges, 0, 'anyColor avoids a change');
}
function mkJob_(cat, mat, col) { return { category: cat, material: mat, color: col, anyColor: false, gramsEst: 10, timeEst: 30, units: 1 }; }
function mkJobAny_(cat, mat) { return { category: cat, material: mat, color: '', anyColor: true, gramsEst: 10, timeEst: 30, units: 1 }; }

function test_iva_() {
  var total = 121, base = total / 1.21, iva = total - base;
  t_near_(base, 100, 'IVA base');
  t_near_(iva, 21, 'IVA amount');
}

function test_inPeriod_() {
  t_ok_(inPeriod_(new Date(2026, 9, 15), '2026-10'), 'date in period');
  t_ok_(!inPeriod_(new Date(2026, 10, 1), '2026-10'), 'date outside period');
  t_ok_(inPeriod_('2026-10-05', '2026-10'), 'string date in period');
}

/* ---------------- integration tests (create + clean up real rows) ---------------- */

// Deduct more filament than is in stock: stock floors at 0 and the shortfall is reported.
function test_deductMaterial_integration_() {
  var sh = ensureMaterialsSheet();
  var mat = 'TESTPLA', col = '__test__' + Math.floor(Math.random() * 1e6);
  var m = { material: mat, color: col, stock: 50, costPerGram: 0.02, lowAt: 10, hex: '', brand: 'test', active: true };
  saveMaterial(m, { email: 'test@local' });
  try {
    var d = deductMaterial(mat, col, 80);     // only 50 available
    t_ok_(d != null, 'shortage: filament found');
    t_eq_(d.remaining, 0, 'shortage: stock floored at 0');
    t_eq_(d.short, 30, 'shortage: 30 g reported short');
  } finally {
    // Remove the scratch filament row.
    var v = sh.getDataRange().getValues(), ci = indexMap(v[0]);
    for (var i = v.length - 1; i >= 1; i--)
      if (String(v[i][ci.material]) === mat && String(v[i][ci.color]) === col) { sh.deleteRow(i + 1); break; }
  }
}

// Mark a job done: it leaves the live queue and lands in JobsDone.
function test_jobArchive_integration_() {
  var created = saveJob({ category: 'research', material: 'TESTPLA', color: '__t__', anyColor: false, gramsEst: 0, units: 1, notes: '__test archive__', status: 'pending' }, { email: 'test@local' });
  var id = created.id;
  try {
    setJobStatus({ email: 'test@local' }, id, 'done');
    var stillOpen = readJobs({}).some(function (j) { return j.id === id; });
    t_ok_(!stillOpen, 'archive: job removed from live queue');
    var inDone = readJobsDone_('').some(function (j) { return String(j.id) === id; });
    t_ok_(inDone, 'archive: job present in JobsDone');
  } finally {
    // Remove the scratch JobsDone row.
    try {
      var sh = ensureTab_('ops', 'JobsDone', JOBSDONE_COLS), v = sh.getDataRange().getValues();
      for (var i = v.length - 1; i >= 1; i--) if (String(v[i][0]) === id) { sh.deleteRow(i + 1); break; }
    } catch (e) {}
  }
}
