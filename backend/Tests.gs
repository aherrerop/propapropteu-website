/**
 * Engine check you can run from the Apps Script editor: choose `runAllTests` and press Run.
 * It only exercises pure logic (no sheets, no email). The full local suite is `npm test`.
 */
function runAllTests() {
  var fails = [];
  function eq(a, b, msg) { if (a !== b) fails.push(msg + ' (got ' + a + ', want ' + b + ')'); }
  var mk = function (id, material, color, extra) {
    var p = { id: id, orderNo: 1, created: '2026-01-01T00:00:0' + id, material: material, color: color, anyColor: false, copies: 1, grams: '', status: 'todo' };
    for (var k in (extra || {})) p[k] = extra[k];
    return p;
  };
  var g = groupTodo_([mk('1', 'PLA', 'Black'), mk('2', 'PETG', 'White'), mk('3', 'PLA', 'Black')], []);
  eq(g.length, 2, 'two groups');
  eq(g[0].pieces.length, 2, 'PLA Black holds two pieces');
  g = groupTodo_([mk('1', 'PLA', 'Black', { grams: 200 }), mk('2', 'PLA', 'Red', { grams: 20 }), mk('3', 'PLA', '', { anyColor: true })], []);
  eq(g.filter(function (x) { return x.label === 'PLA · Red'; })[0].pieces.length, 2, 'any-colour joins the smallest group');
  eq(sanitizeHtml_('<b onclick="x">a</b><script>1</script>'), '<b>a</b>', 'sanitize');
  Logger.log(fails.length ? ('FAILED:\n' + fails.join('\n')) : 'All tests passed.');
  return { ok: !fails.length, failures: fails };
}
