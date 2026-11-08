# System flows — the full lifecycle

How the business runs through the system, step by step, end to end. Verified by a
live run on 2026-11-08 (engine @31). Function/sheet names in `code` point into
[ARCHITECTURE.md](ARCHITECTURE.md); fix anything here with [RUNBOOK.md](RUNBOOK.md).

**The cast:** **Yerai** takes orders (in person / phone / web). **Albert** runs the
print queue. The **customer** buys. The **engine** (Apps Script) owns the data in 6
Google Sheets.

---

## 1. Buying materials (restock filament)

**Who:** Yerai or Albert, dashboard → **Materials → Comprar** (on a filament).

1. Enter grams bought + total € paid + supplier → `purchaseMaterial`.
2. The engine **adds** the grams to that filament's stock (does not overwrite),
   refreshes **€/g** (= cost ÷ grams), and records the buy in **Inventory!Purchases**
   (date, material, color, grams, cost, supplier, by). Logged in Inventory!History.

- "**Ajustar**" (the other button) is a manual correction of stock/€/g/min — use it
  to fix a count, not to record a purchase.
- **Purchases are the filament cost in the P&L** (cash basis — see §5). So always buy
  through **Comprar**, not by hand-editing stock.

*Verified: bought 1000 g for €25 → stock 0→1000 g, €/g 0.025, Purchases row written.*

---

## 2. An order comes in

### 2a. Yerai takes it (in person / phone) — the common case
Dashboard → **Comandes → + Nova comanda**:
1. Customer name (email optional), **Origen** = Presencial / Telèfon, **Pagament** =
   Efectiu / Transferència / Targeta, add product lines → `placeOrder`.
2. The engine records the order in **Operations!Orders** (totals, IVA split, profit),
   sets status: **cash → `paid`** (collected on the spot), transfer/card →
   `awaiting_payment`.

### 2b. Customer orders on the website
Shop → cart → checkout (`placeOrder`, source `web`). Transfer shows the IBAN;
card (if Stripe is on) redirects to Stripe and flips to `paid` on return.

### Both paths then do the same thing
3. **Print jobs are created** from each product's bill-of-materials — one job per
   material per line — in **Operations!Jobs** (`createJobsForOrder_`): material, color,
   grams (= BOM grams × qty), **print-time estimate** (= product `printTimeMin` × qty).
4. **One alert email** goes to the shop (`NOTIFY_EMAIL`, default propapropteu@gmail.com)
   with the order **and** its print jobs. One confirmation to the customer if an email
   was given. *(Needs Gmail authorized once — GOING-LIVE §0.)*

*Verified: in-person cash order ×2 → status `paid`, revenue €100, profit €80; one job
DEMO 80 g / 240 min created.*

---

## 3. Albert prints (the queue)

Dashboard → **Cua d'impressió**. The to-do list is split by type (Products /
Research / Personal) feeding one queue.

1. **Planificador** (`batchPlan` → `planQueue_`): enter category % (e.g. 60/30/10) →
   the engine orders the queue to **group the same material/colour together** (fewer
   filament changes) while honouring the category mix. Albert prints **top-down**.
2. As each print finishes, Albert hits **Fet** (done) on that job.

*Verified: the planner returned the job at the top, 0 filament changes.*

---

## 4. Marking a job done → stock adapts + it's archived

When Albert marks a job **Fet** (`setJobStatus … 'done'`), the engine, under a lock:
1. **Deducts the filament** from stock (`deductMaterial`); if stock would go negative
   it floors at 0 and shows a shortage **warning** (Albert still prints).
2. Logs the consumption in **Inventory!Usage** (grams + value) and Inventory!History.
3. **Archives** the job to **Operations!JobsDone** (with done-date / by / month) and
   **removes it from the live queue** — so the queue only ever shows outstanding work.

*Verified: marking done dropped stock 1000 → 920 g (−80 g), job left the queue and
landed in JobsDone.*

---

## 5. The money

**Per order:** revenue, cost and profit are stored on the order (profit = revenue −
the product's cost estimate), shown in **Comandes**.

**Overall (Finances → `pnl`), cash basis — the real money:**

> **Net = Ingressos − Filament comprat − Altres despeses − Pagaments gestors**

- **Ingressos** = sales (orders, excluding cancelled).
- **Filament comprat** = what you actually spent buying filament (Inventory!Purchases).
- **Altres despeses** = non-filament costs (domain, tools…) you add in
  **Finances → + Despesa**.
- **Pagaments gestors** = what you pay Yerai/Albert (**+ Pagament**).
- *Info only (not in Net):* filament **consumed** value (Usage) and the per-product
  cost estimate.

**Month-end (automatic):** on the first dashboard load of a new month the previous
month closes itself (`maybeCloseMonths_`) — a row in **Finance!Monthly** and a
**`Mes YYYY-MM`** sheet (P&L + that month's jobs printed + expenses) for taxes. Force
or redo it with **Finances → Tancar mes**.

*Verified: after the order, Net = €100 − €25 − 0 − 0 = €75; after purge, back to €0.*

---

## 6. Where each thing lives

| Step | Lands in |
|---|---|
| Filament bought | Inventory!Filaments (stock) + Inventory!Purchases (cost) |
| Filament used | Inventory!Usage (on job done) |
| Order | Operations!Orders |
| Print jobs (to do) | Operations!Jobs |
| Printed jobs (done) | Operations!JobsDone → monthly `Mes YYYY-MM` |
| Expenses / manager pay | Finance!Expenses / Finance!Payouts |
| Monthly books | Finance!Monthly + `Mes YYYY-MM` |
| Customers | Clients!Accounts + Contacts |
| Every change / error | Operations!History, Inventory!History (seen in **Estat**) |

## Order status lifecycle
`new`/`awaiting_payment` → `paid` → `in_production` → `ready` → `delivered`
(or `cancelled`). Stored in English; shown in Catalan in the dashboard. Cash orders
start at `paid`. Change it on the order card in **Comandes**.

## Launch hygiene
Clear test/demo rows (incl. the append-only logs) in one call with `purgeDemo`
(marker-based; default `DEMO-RUN`). Used to clean this run completely.
