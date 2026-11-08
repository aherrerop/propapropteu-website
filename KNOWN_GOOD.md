# Known-good baseline log

The `known-good` git tag (movable, pushed off-site) marks the last code we agreed
works. Promote with `npm run bless -- "note"` (only after the test gate passes).
Fall back with `git checkout known-good -- .` then redeploy.

- Engine (backend): `npm run deploy:backend -- "msg"` after a bless/fix.
- Site: `git push origin main` (GitHub Pages).

| Date | Commit | Engine ver. | Note |
|------|--------|-------------|------|
| 2026-11-08 | 18287e9 | 2026-11-08.1 (deploy @29) | First blessed baseline: full system + resilience layer (health/self-test/errors view/reconcile/backup/quota guard), tooling, docs. Live-tested. |
