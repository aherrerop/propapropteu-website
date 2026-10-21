# Manager login — one-time setup

You do this once, in your personal Google account. ~15 minutes. After this,
you and other managers log in at `/acceso` and manage products with no code.

## 1. Create the Google Sheet
1. Go to https://sheets.new — name it **Prop a Prop Teu — Admin**.
2. Make two tabs (rename at the bottom):
   - **Managers** — row 1 headers exactly: `email` `salt` `hash` `name` `role` `active`
   - **Products** — row 1 headers exactly:
     `id` `type` `price` `stock` `featured` `codename` `labels` `images` `name` `short` `description` `heroTagline` `heroDesc` `specs`

## 2. Create the Drive image folder
1. In Google Drive, new folder **PropAProp product images**.
2. Open it; copy the ID from the URL (`.../folders/THIS_PART`). Keep it for step 5.

## 3. Add the Apps Script
1. In the Sheet: **Extensions → Apps Script**.
2. Delete the sample code; paste all of [`backend/Code.gs`](Code.gs). Save.

## 4. Create the GitHub token (so Publish works)
1. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new**.
2. Repository access: **Only select repositories → propapropteu-website**.
3. Permissions → Repository permissions → **Contents: Read and write**.
4. Generate, copy the token (starts with `github_pat_`). Keep it for step 5.

## 5. Add Script Properties
In Apps Script: **Project Settings (gear) → Script properties → Add**. Add these:

| Property | Value |
|---|---|
| `SESSION_SECRET` | any long random string (e.g. mash the keyboard) |
| `GH_TOKEN` | the `github_pat_...` from step 4 |
| `GH_OWNER` | your GitHub username/org that owns the repo |
| `GH_REPO` | `propapropteu-website` |
| `GH_BRANCH` | `main` |
| `DRIVE_FOLDER_ID` | the folder ID from step 2 |

## 6. Create your manager account
1. In the editor, open `Code.gs`, find `addManager()` at the bottom.
2. Edit `email`, `name`, and `password` to yours.
3. Run ▶ `addManager` once. Approve the permissions prompt (it's your own script).
4. **Delete the password** you typed, and save. (It's now stored only as a hash.)
   Repeat for each manager, or I can add a "Team" screen later.

## 7. Deploy the web app
1. **Deploy → New deployment → type: Web app**.
2. Execute as: **Me**. Who has access: **Anyone**. Deploy.
3. Copy the **Web app URL** (ends in `/exec`).

## 8. Tell the website the URL
Paste that URL into `js/config.js` as `ADMIN_API` (I've left the field ready),
commit, and you're live. Log in at `https://propapropteu.com/acceso`.

> If you ever redeploy with code changes, use **Deploy → Manage deployments →
> edit → New version** so the URL stays the same.
