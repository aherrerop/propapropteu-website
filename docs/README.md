# Documentation

The current, authoritative docs for the Prop a Prop Teu system.

| Doc | For | When to read it |
|---|---|---|
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | Developers | Understand how the system is built: the 3 parts, the 6 sheets, the engine's function groups, the invariants, deploy mechanics. Read once. |
| **[RUNBOOK.md](RUNBOOK.md)** | Whoever fixes a bug | The protocol: reproduce → locate → fix → test → deploy. Symptom→cause table, the invariants, extension recipes, emergencies. Keep open while debugging. |
| **[../GOING-LIVE.md](../GOING-LIVE.md)** | The owner (Albert) | The last-minute inputs to go live, all from the dashboard. |
| **[../MANAGER-GUIDE.md](../MANAGER-GUIDE.md)** | Managers (Yerai, Albert) | Day-to-day dashboard usage. |

> The root `README.md` covers routine site edits. The root `ARCHITECTURE.md` and
> `SYSTEM-PLAN.md` are earlier/higher-level notes — this folder supersedes them for
> the current multi-sheet system.

## The 60-second mental model

- **Static site** (GitHub Pages) is a thin client. It only calls one URL: the
  **engine** (Apps Script web app, `backend/Code.gs`).
- The **engine** owns the **database** (6 Google Sheets) and all logic.
- Change code → deploy (engine via `clasp`, site via `git push`). Change data →
  the dashboard. The source of truth for the data shape is `systemSchema()`.
- Almost every bug is a broken **invariant** — see [RUNBOOK §6](RUNBOOK.md#6-invariants-never-break-these).
