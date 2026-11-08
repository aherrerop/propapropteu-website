# Architecture — how Prop a Prop Teu is built

A map of the system so you (or anyone) can find the right place to change
something. Read this once; keep [RUNBOOK.md](RUNBOOK.md) open when fixing a bug.

---

## 1. The three moving parts

```
   Visitor / Manager browser
            │
   ┌────────┴─────────┐
   │                  │
Static site        Apps Script "engine"  ──►  6 Google Sheets (the database)
(GitHub Pages)      (one web app /exec)        + Google Drive (images, invoices)
propapropteu.com        │                      + Stripe (cards, optional)
                        └──► commits data/products.json back to the repo (Publicar)
```

| Part | What it is | Where it lives | How it ships |
|------|-----------|----------------|--------------|
| **Static site** | The public shop + the manager dashboard. Thin client over the API. | `*.html`, `js/`, `css/`, `data/products.json` in this repo | `git push` → GitHub Pages auto-deploys |
| **Engine** | All logic + auth + the database access | `backend/Code.gs` (+ `backend/Tests.gs`) | `clasp push` + `clasp redeploy` (see §6) |
| **Database** | 6 standalone Google Sheets | Google account `propapropteu@gmail.com` | Auto-created by `setupSystem()` |

The site **never** touches the sheets directly. It only calls the engine's one
`/exec` URL (`SITE_CONFIG.adminApi` in `js/config.js`). The engine owns all data.

---

## 2. The database — 6 sheets, their tabs

Defined in one place: **`systemSchema()`** in `backend/Code.gs`. Each sheet's id is
stored in a Script Property (`SS_CATALOG`, `SS_OPERATIONS`, …). Open one with
`ss_(key)`, a tab with `tab_(key, name)`.

| Sheet (Script Property) | Tabs |
|---|---|
| **Catalog** (`SS_CATALOG`) | `Products`, `Categories` |
| **Operations** (`SS_OPERATIONS`) | `Orders`, `Jobs`, `JobsDone`, `Links`, `History` |
| **Inventory** (`SS_INVENTORY`) | `Filaments`, `Purchases`, `Usage`, `History` |
| **Clients** (`SS_CLIENTS`) | `Accounts`, `Contacts` |
| **Config** (`SS_CONFIG`) | `Managers`, `Settings`, `Invoices`, `Messages` |
| **Finance** (`SS_FINANCE`) | `Expenses`, `Payouts`, `Monthly`, `Mes YYYY-MM` (one per closed month) |

The **exact column order of every tab is `systemSchema()`**. That function is the
source of truth — change a schema there, not by editing the sheet.

### Script Properties (engine secrets/config, set in the Apps Script editor)
`SESSION_SECRET` (signs login tokens), `GH_TOKEN`/`GH_OWNER`/`GH_REPO`/`GH_BRANCH`
(the Publicar → GitHub commit), `DRIVE_FOLDER_ID` (image + invoice folder),
`SS_*` (the six sheet ids). Fiscal/bank/Stripe values live in **Config!Settings**,
not here (editable from the dashboard — see §4 "Settings").

---

## 3. The engine — function groups in `backend/Code.gs`

~120 functions. They cluster like this (search the file for the names):

| Group | Key functions | Does |
|---|---|---|
| **Router** | `doPost` → `dispatch_`, `MUTATING`, `withLock_` | Every request enters here. `dispatch_` routes an `action` to a handler and returns a plain object; `doPost` wraps it with `json()`. Actions listed in `MUTATING` run under a script lock. |
| **Auth / managers** | `login`, `verifyToken`, `makeToken`, `findManager`, `register`, `findClient`, `listManagers`, `addManagerAccount`, `deleteManager` | Login returns a signed stateless token. Managers + clients are separate accounts. |
| **Products** | `readProducts`, `rowToProduct`, `saveProduct`, `deleteProduct`, `PRODUCT_COLS`, `publish` | `publish()` writes the **public** `data/products.json` to the repo, **stripping internal fields** (`cost`, `bom`, `active`, `printTimeMin`, `prodNotes`). |
| **Materials** | `readMaterials`, `saveMaterial`, `deleteMaterial`, `deductMaterial` | Filament stock in grams; `deductMaterial` floors at 0 and reports shortfalls. |
| **Orders** | `placeOrder`, `readOrders`, `setOrderStatus`, `deleteOrder`, `ensureOrdersSheet`, `normStatus_`, `ORDER_STATUS` | Orders carry `source` (web/phone/presencial). Status codes are English; `normStatus_` maps legacy Catalan. |
| **Invoices** | `fiscalData`, `assignInvoiceNo`, `getInvoice` | VAT PDF → Drive. Fiscal data + invoice counter come from **Settings**. |
| **Print jobs** | `readJobs`, `saveJob`, `setJobStatus`, `deleteJob`, `createJobsForOrder_`, `batchPlan` → `planQueue_`, `notifyNewJobs_` / `jobLines_`, `readJobsDone_` | Orders auto-create jobs. Marking a job done deducts filament + **archives it to `JobsDone`** and removes it from the live queue. `planQueue_` is the batch-order algorithm (pure, unit-tested). |
| **Finance / month-end** | `readFinance_`, `saveExpense`/`savePayout`, `pnl`, `closeMonth_`, `maybeCloseMonths_`, `readMonthly_`, `closeMonthAction_` | `maybeCloseMonths_` lazily closes finished months on dashboard load (no cron). `closeMonth_` writes the `Monthly` row + the `Mes YYYY-MM` detail sheet. |
| **Settings / config** | `getSetting_`, `setSetting_`, `SETTINGS_DEFS`, `getSettings`, `saveSettings`, `pubinfo`, `notifyEmail_`, `stripeKey_`, `cardEnabled_` | The editable "Configuració" screen. `pubinfo` is the only place public callers get config; **secrets never leave the engine**. |
| **Stripe (gated)** | `stripeApi_`, `stripeCheckout_`, `verifyPayment` | Dormant until `STRIPE_SECRET_KEY` is set. No webhook: payment is confirmed on return via `verifyPayment`. |
| **Clients** | `listClients`, `deleteClient` | Manager view of customer accounts + contacts. |
| **Infra helpers** | `ss_`, `tab_`, `ensureColumn_`, `ensureTab_`, `indexMap`, `uid_`, `period_`/`pstr_`/`textCol_`, `floodOk_`, `logOps_`/`logUsage_`/`logInvHistory_`/`logErr_`, `json`, `sha256Hex` | The spine. Read these before touching anything. |
| **Setup / schema** | `systemSchema`, `setupSystem`, `seedSettings_`, `migrateFromDraft_`, `systemStatus` | `setupSystem()` (manager action) creates everything, idempotent. |
| **Tests** | `backend/Tests.gs` → `runAllTests()` | Pure tests always; `runAllTests(true)` adds self-cleaning integration tests. |

---

## 4. The static site — files

| File | Role |
|---|---|
| `js/config.js` | `SITE_CONFIG`: the `/exec` URL (`adminApi`), bank fallback, languages, etc. |
| `js/session.js` | `Admin` object: holds the login token in `sessionStorage`, `Admin.call(action, body)` posts to the API. |
| `js/layout.js` | Header/footer, the **Cart** (checkout → `placeOrder`, Stripe redirect, `handlePaymentReturn`). |
| `js/admin.js` | The manager dashboard. `switchView(v)` + one `render*()` per screen (Productes, Comandes, Cua d'impressió, Materials, Finances, Clients, Missatges, Configuració). |
| `js/shop.js`, `product.js`, `catalog.js`, `packs.js`, `pack-config.js`, `i18n.js`, `client.js` | Storefront, product page, catalogue helpers, packs, trilingual i18n, client portal. |
| `acceso.html` | Login + register. `admin.html` | Dashboard shell (the `<section id="view-*">` holders). `client.html` | Customer portal. |

**Request flow (every dashboard action):**
`render*()` → `Admin.call("someAction", {...})` → `fetch(adminApi)` →
`doPost` → `dispatch_("someAction")` → handler → `json(obj)` → back to the UI.

---

## 5. Invariants — the rules that keep it from breaking

Breaking one of these is the cause of almost every bug. Full explanations +
symptoms in [RUNBOOK.md §6 Invariants](RUNBOOK.md#6-invariants-never-break-these).

1. **Read by header NAME (`indexMap`), update by `id`.** Never a hard-coded column index.
2. **Add new columns only at the END** of a `systemSchema()` array. Mid-insert shifts every existing row's data.
3. **New tabs via `ensureTab_`, new columns via `ensureColumn_`.** They self-heal live sheets without re-running `setupSystem()`.
4. **Every state-changing action must be in `MUTATING`** so it runs under the lock.
5. **`YYYY-MM` period values must be written as text** (`textCol_`) and normalized on read (`pstr_`) — Sheets silently turns `"2026-10"` into a date.
6. **`setValues` rows must match the range's column count exactly.**
7. **Internal product fields stay internal** — add any new internal field to the strip-list in `publish()`.
8. **Public endpoints get honeypot + `floodOk_`.**

---

## 6. Deploy mechanics

```bash
# Backend (engine): from backend/, after editing Code.gs
clasp -u propapat push -f
clasp -u propapat redeploy AKfycbx03Ql3nWT1bFbsRDfTm6AXQXG-hS4J6KHPxpaKsnIviajJxj56xyFh9dF77qCp84sn -d "what changed"
```

- clasp profile **`propapat`** = owner `propapropteu@gmail.com`. The default clasp
  profile has no access — always pass `-u propapat`.
- Script id: `1n4CyWT6Zs8AkbwpuX71yaGO6vvHvXkas-Sqh9Ek49AvZj9ZZUKH-Absy`
- **Redeploy keeps the same `/exec` URL** (the one in `js/config.js`). The id above
  is the live deployment. `clasp -u propapat deployments` lists them.

```bash
# Frontend (site): from repo root
git add -A && git commit -m "…" && git push origin main    # GitHub Pages deploys in ~1 min
```

- **Data** (products, prices, filaments, settings, managers): via the dashboard,
  or the API with a manager token. No deploy needed.

---

## 7. Where things are stored, at a glance

| Thing | Lives in |
|---|---|
| Public catalogue (what visitors see) | `data/products.json` (committed by `publish()`) |
| Full product data (incl. internal) | Catalog!Products |
| Orders / print queue / done jobs | Operations!Orders / Jobs / JobsDone |
| Filament stock + usage | Inventory!Filaments / Usage |
| Customers | Clients!Accounts + Contacts |
| Managers, settings, invoices, messages | Config!Managers / Settings / Invoices / Messages |
| Expenses, payouts, monthly books | Finance!Expenses / Payouts / Monthly / Mes YYYY-MM |
| Images + invoice PDFs | Google Drive (`DRIVE_FOLDER_ID`) |
| Audit trail / errors | Operations!History (`logOps_`, `logErr_`), Inventory!Usage + History |
