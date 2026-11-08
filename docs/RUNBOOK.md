# Runbook — what to check when something breaks

The protocol for fixing bugs and improving the system safely. Pair it with
[ARCHITECTURE.md](ARCHITECTURE.md) (the map this points into).

**Golden rule:** almost every bug is a broken [invariant](#6-invariants-never-break-these).
Check those first.

---

## 0. The debugging loop (always the same 6 steps)

1. **Reproduce** — make the failure happen on demand (see §1).
2. **Locate** — find the handler. Dashboard shows an error toast? The failing
   `action` is in the network request; open that handler in `dispatch_` (Code.gs).
   Storefront? It's in `js/layout.js` / `js/shop.js` / `js/product.js`.
3. **Read the logs** (§2) — the real exception is usually already recorded.
4. **Fix** — change `backend/Code.gs` or the relevant `js/*.js`.
5. **Test** (§3) — `node --check`, `runAllTests()`, and a live API call.
6. **Deploy + verify** (§4) — deploy, then re-run the reproduction and confirm it's gone.

Never skip 5–6. Three of the bugs we shipped were only caught by live testing.

---

## 1. How to reproduce (drive the real engine)

The engine only answers properly inside a browser (its `/exec` redirects through
Google; raw `curl` gets an HTML interstitial). So reproduce from the **live site
origin** in a browser console / the built-in browser pane:

```js
const API = SITE_CONFIG.adminApi;               // on any propapropteu.com page
async function call(a, b){ const r = await fetch(API,{method:'POST',redirect:'follow',
  body: JSON.stringify(Object.assign({action:a, token: window.__tok||''}, b||''))}); return r.json(); }

// manager token (rotate this account once Yerai/Albert exist)
const lr = await call('login',{email:'infopropapropteu@gmail.com',password:'ZzzTest'});
window.__tok = lr.token;

await call('listOrders');                        // read anything
await call('placeOrder', { name:'TEST', items:[{id:'SOME-ID', qty:1}] });  // then clean up!
```

**Rules for live testing:** use `TEST` names, and **delete anything you create**
(`deleteOrder`, `deleteJob`, `deleteClient`, `deleteManager`). Read-only actions and
`closeMonth` are safe. Expect one alert email when you place a real order.

---

## 2. Where the logs are

**First stop: the dashboard → Estat screen.** It shows the engine version, sheet
health, pending/order counts, remaining Gmail quota, and the recent error rows
(from `listErrors`) — plus buttons for self-test, reconcile, and backup. Most
problems are visible there without opening a sheet.

| Log | Location | Written by |
|---|---|---|
| Swallowed engine errors | **Operations!History**, rows with `type = error` (shown in Estat) | `logErr_` |
| Order/job/status/delete audit | **Operations!History** | `logOps_` |
| Filament movements | **Inventory!History** + **Inventory!Usage** | `logInvHistory_`, `logUsage_` |
| Raw exceptions + `Logger.log` | Apps Script editor → **Executions** | the runtime |

First move on any backend bug: open **Operations!History**, filter `type = error`.
If the handler wraps work in `try { … } catch (e) { logErr_(...) }`, the cause is there.

---

## 3. How to test a change

```bash
npm test          # the gate: syntax-checks every .gs/.js, fails on duplicate
                  # functions, and runs the engine's pure functions (loaded from
                  # the REAL Code.gs via vm, no drift) against assertions.
```

- `npm test` runs automatically before `npm run deploy:backend` and `npm run bless`
  — a red gate blocks the deploy (nothing ships broken).
- **Deeper logic tests:** in the Apps Script editor, run `runAllTests()` (pure,
  safe) or `runAllTests(true)` (adds self-cleaning integration tests).
- **Live self-test:** dashboard **Estat → Executar auto-test** (or call `selfTest`)
  exercises the real write path (filament → job → done → archive → cleanup) and
  times each step. Use it after every deploy.
- **Sheets behavior** (coercion, column counts, formats): only a real run catches
  these — the self-test and a live API call (§1) are how.

---

## 4. Deploy + verify / rollback

```bash
# deploy the engine — runs the test gate FIRST and aborts if red
npm run deploy:backend -- "fix: …"      # bump ENGINE_VERSION in Code.gs first
# deploy the site
git add -A && git commit -m "fix: …" && git push origin main   # bump SITE_VERSION
```

- After deploying, confirm the live engine version in **Estat** (or `health`) and
  run the **self-test**. Bump `ENGINE_VERSION` (Code.gs) / `SITE_VERSION`
  (js/config.js + the `?v=` on admin.html scripts) so you can see the deploy took.

**Known-good baseline (safety net):**
```bash
npm run knowngood     # show the blessed commit
npm run compare       # what changed since known-good
npm run bless -- "note"   # promote HEAD → known-good (only if the gate passes); logs in KNOWN_GOOD.md
```
**Roll back to known-good:** `git checkout known-good -- .` then redeploy
(`npm run deploy:backend` for the engine, `git push` for the site). Or `git revert`
a single bad commit. `clasp -u propapat deployments` lists engine versions.

---

## 5. Symptom → cause → where to look

| Symptom | Most likely cause | Go to |
|---|---|---|
| **Dashboard shows "Error"/blank on one screen** | That screen's `action` threw. | Network tab → the action name → its handler in `dispatch_`; then Operations!History `type=error`. |
| **A column's values look shifted / wrong field** | A column was inserted mid-array in `systemSchema()`. | Invariant #2. Move the new column to the END; the old rows need realigning. |
| **New field is always blank / 0** | The column doesn't exist on the live sheet yet, or a name typo. | `ensureColumn_`/`ensureTab_` for that tab; check the key name matches `systemSchema()`. |
| **`period` shows a date like `2026-09-30T22:00Z`** | Sheets coerced `"YYYY-MM"` to a Date. | Invariant #5: write with `textCol_`, read with `pstr_`. |
| **"El número de columnas… no coincide"** (setValues error) | A row passed to `setValues` has the wrong length. | Invariant #6: every row must match the range width (watch spacer rows like `['','']`). |
| **Duplicate rows for the same key** (e.g. a month) | An upsert matched on a coerced/renamed value and appended. | Match with a normalizer (`pstr_`), and dedupe like `closeMonth_` does. |
| **Invoice numbers repeat / jump** | Two invoices generated at once, or `INVOICE_SEQ` edited. | `getInvoice` must stay in `MUTATING` (lock). Counter lives in Config!Settings `INVOICE_SEQ`. |
| **Filament didn't go down after a print** | Job wasn't marked *done*, or grams/material empty on the job. | `setJobStatus` deducts only on first `done`; needs `gramsEst>0` and a `material`. |
| **Stock warning "sense estoc"** | Deduction exceeded stock (expected). | `deductMaterial` floors at 0 and returns `short`; restock in Materials. |
| **No new-order / new-job email** | (a) Gmail scope not authorized → Estat shows "No tienes permiso para llamar a MailApp.sendEmail"; (b) `NOTIFY_EMAIL` wrong; (c) MailApp daily quota (~100/day) — Estat shows "mail-quota skipped". | (a) authorize once: Apps Script editor → Run `health` → Allow (see GOING-LIVE §0); (b) Config!Settings `NOTIFY_EMAIL`; all sends go through `sendMail_` which logs to Estat. |
| **Order status in a weird language/value** | Legacy Catalan value or a typo'd code. | `normStatus_` maps it; labels live in `ORDER_STATE_LABELS` (admin.js). |
| **"Publicar" didn't update the public site** | GitHub token/commit failed, or Pages still building (~1 min). | `publish()` + `GH_TOKEN`/`GH_REPO` Script Properties; check Executions log. |
| **Public product shows an internal field** (cost, BOM…) | New internal field not stripped. | Invariant #7: add it to the strip-list in `publish()`. |
| **Card checkout does nothing / "coming soon"** | No Stripe key set (by design), or Stripe call failed. | Config!Settings `STRIPE_SECRET_KEY`; `stripeCheckout_`/`verifyPayment`; Operations!History. |
| **Payment didn't flip order to "paid"** | Return URL lost `cs`, or verify failed. | `Cart.handlePaymentReturn` (layout.js) → `verifyPayment`; check the session in Stripe dashboard. |
| **"El sistema està ocupat"** | Lock contention (someone else's action held it >25s). | Normal under load; retry. If constant, a `MUTATING` handler is too slow — profile it. |
| **Everything 'auth' / logged out** | Token expired (8h) or `SESSION_SECRET` changed. | Log in again. Never rotate `SESSION_SECRET` casually — it invalidates all sessions. |
| **A whole sheet "Missing tab" error** | A tab was renamed/deleted by hand. | Re-run `setupSystem()` (manager action) — idempotent, recreates missing tabs/headers. |

---

## 6. Invariants (never break these)

Each line is also a bug you can cause by ignoring it.

1. **Read by header name, write by id.** Use `indexMap(head)` then `col.fieldName`.
   *Break it →* values read from the wrong column the moment anyone reorders the sheet.
2. **New columns go at the END** of the `systemSchema()` array. *Break it →* every
   existing row's data is off by one (the classic "images.slice is not a function").
3. **Create tabs/columns with `ensureTab_` / `ensureColumn_`.** *Break it →* a new
   field silently never saves on sheets made before it existed.
4. **State-changing actions must be in `MUTATING`.** *Break it →* two managers
   racing corrupt the invoice counter or lose a filament deduction.
5. **Periods (`YYYY-MM`) are text:** `textCol_` on write, `pstr_` on read. *Break it →*
   Sheets turns them into dates and month matching/filtering silently fails.
6. **`setValues` row length == range width.** *Break it →* "número de columnas no coincide".
7. **Keep internal product fields internal:** add new ones to `publish()`'s strip-list.
   *Break it →* cost/BOM leak into the public `products.json`.
8. **Public endpoints: honeypot (`company_hp`) + `floodOk_`.** *Break it →* spam/abuse.

---

## 7. How to extend the system safely (recipes)

**Add a field to a product (or any tab)**
1. Append the column name to the END of that tab in `systemSchema()`.
2. Read it in the relevant `rowTo…`/reader; write it in the `save…` (by header name).
3. If it's internal to products, add it to the strip-list in `publish()`.
4. Add the input to the editor in `js/admin.js`.
5. Deploy. `ensureColumn_`/next `setupSystem()` adds the column to the live sheet.

**Add a new API action**
1. Write the handler returning a plain object `{ ok: true, … }`.
2. Add a `case` in `dispatch_`. If it changes data, add its name to `MUTATING`.
3. Call it from the UI with `Admin.call("yourAction", {...})`.
4. Add a test in `Tests.gs` if there's logic worth pinning.

**Add a new dashboard screen**
1. Add a `<button data-view="x">` + `<section id="view-x">` in `admin.html`.
2. Handle `view-x` in `switchView` and write `renderX()` in `js/admin.js`.

**Add a new sheet/tab**
1. Add it to `systemSchema()`, or create on demand with `ensureTab_(key, name, cols)`.
2. Access via `tab_(key, name)`.

---

## 8. Emergency procedures

- **Site is broken for visitors:** `git revert` the last site commit and `git push`.
  Pages redeploys the previous version in ~1 min.
- **Engine is throwing on everything:** rollback the deploy (§4). The site degrades
  gracefully (dashboards show errors) but the sheets are untouched.
- **A sheet looks corrupted:** the data is append-only and audited. Reconstruct from
  **Operations!History** / **Inventory!History** (every create/delete/stock move is
  logged with who + when). Delete-order/-job/-client snapshots are in those logs too.
- **Locked out of the dashboard:** log in with another manager account
  (Config!Managers). You can't delete the account you're logged in as, so there's
  always at least one way in.
- **Suspected spam flood:** `floodOk_` caps 20/min per public endpoint globally;
  honeypot drops bots. Check Config!Messages / Operations for the influx.

---

## 9. Quick reference

- **Engine source:** `backend/Code.gs` · **Tests:** `npm test` + `backend/Tests.gs` (`runAllTests()`)
- **Schema (source of truth):** `systemSchema()` · **Router:** `doPost` → `dispatch_` · **Lock list:** `MUTATING`
- **API URL:** `SITE_CONFIG.adminApi` (`js/config.js`) · **Dashboard:** `js/admin.js` · **Health/version:** `health()` / Estat screen
- **Deploy engine:** `npm run deploy:backend -- "msg"` (gated) · **Site:** `git push`
- **Baseline:** `npm run bless` / `git checkout known-good -- .` · log in `KNOWN_GOOD.md`
- **Resilience:** Estat screen (health, errors, self-test, reconcile, backup); `snapshot` → dated JSON in Drive/Backups
- **Last-minute setup for the owner:** [../GOING-LIVE.md](../GOING-LIVE.md) (start with §0 Gmail auth)
