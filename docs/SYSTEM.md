# Prop a Prop Teu — how the internal system works

One page. It replaces the older architecture / flows / runbook documents, which
described screens that no longer exist (they remain in git history, tag
`pre-simplify-2026-11-11`).

## What it is

The management page (`/admin.html`, after logging in at `/acceso.html`) has four
sections and nothing else:

| Section | Who | What it does |
|---|---|---|
| **Products** | both | Add / edit / delete what is sold on the public website. Saving updates the website by itself (1–2 minutes). |
| **Orders** | Yerai | Enter an order: type, agreed price, notes, and one line per product (existing product or external link, name, material, colour or "Color not important", copies). |
| **To-do** | Albert | One list of everything to print, in red-outlined groups that can be printed together. |
| **Materials** | both | Filament left, in grams, split into PLA / PETG / ABS. |

Albert and Yerai have identical permissions.

## The workflow

1. **Yerai saves an order.** It appears in To-do and one email
   ("New order added to the to-do list") goes to propapropteu@gmail.com. Editing or
   deleting never sends email. Saving twice by mistake updates the same order.
2. **To-do groups the products** by material + colour. "Color not important" joins
   the smallest group of its material. Prepared items come first, then the heaviest
   group, then the oldest.
3. **Albert works each card** with its four icons: pencil (edit), tick (prepared =
   G-code sent; nothing is deducted), printer (printed), X (delete). He types the
   real weight in grams on the card; Printed is refused without it.
4. **Printed** deducts the grams from that material and colour (for "Color not
   important" it asks which roll was used), writes a row in *Print history*, and the
   card disappears. When the last product of an order is printed, one row is written
   in *Finances*: price, cost (grams × cost per roll ÷ 1000) and profit.
5. **Deleted** products disappear too and are kept in the *Deleted* tab.

## Where the records are (Google Sheets)

| Spreadsheet | Tab | Contents |
|---|---|---|
| Operations | `Order list`, `Pieces` | the live data behind Orders and To-do |
| Operations | `Print history` | one readable row per printed product: date, order, product, material, colour, grams, cost, stock left |
| Operations | `Deleted` | products removed without being printed |
| Finance | `Finances` | one row per completed order: price, internal cost, profit |
| Inventory | `Filaments` | the Materials screen |
| Inventory | `To buy` | one line each time the cart icon is pressed |
| Catalog | `Products` | the Products screen |

Older tabs (Jobs, Usage, Expenses, …) are left in place as an archive and are not
used any more. The Config and Clients spreadsheets (logins, bank / fiscal settings,
customer accounts) are untouched.

## Where the code is

| File | Role |
|---|---|
| `admin.html`, `js/admin.js` | the four screens (they only draw and call the engine) |
| `backend/Manage.gs` | everything the four screens do: products, orders, to-do grouping (`groupTodo_`), printed (`printPiece`), materials |
| `backend/Code.gs` | login, the router (`dispatch_`), website checkout, customer accounts, contact form, publishing `data/products.json` |
| `tools/run-tests.js` | `npm test` — syntax, duplicate functions, router check, and the grouping rules |

Rules that keep the data safe:
- Every tab is read by column **name**; new columns are added at the **end**.
- Every write is keyed by an id and first checks what already exists, so a double
  click, refresh or retry never records a deduction, a history row, a finance row,
  an order or an email twice.
- Actions that change data run one at a time (`MUTATING` + script lock).

## Changing and deploying

```bash
npm test                                   # must pass
npm run deploy:backend -- "what changed"   # engine (runs the tests first)
git add -A && git commit -m "…" && git push origin main   # website + admin page
npm run bless -- "note"                    # mark a version you trust (known-good tag)
```

Roll back: `git checkout known-good -- .`, then deploy the engine and push.
Backups: the `snapshot` engine action writes every tab to a dated JSON file in the
Drive `Backups` folder.

## If something looks wrong

| Symptom | Check |
|---|---|
| A screen says it could not reach the server | Reload; the engine (Apps Script) may be slow for a few seconds. |
| No email on a new order | Operations → `Order list` → column `emailSent`. Empty means the send failed: the Gmail permission (run `authorizeGmail` in the Apps Script editor as propapropteu@gmail.com) or the daily quota (~100). |
| A product stays in To-do after pressing Printed | Press Printed again — it finishes the same transaction and never deducts twice. |
| Stock looks wrong | `Print history` shows every deduction with the stock left after it. |
| "Saved, but the website update failed" | The GitHub publish failed; save the product again. |
| Website order shows "Material not set" | Normal: open it with the pencil and choose material and colour. |
