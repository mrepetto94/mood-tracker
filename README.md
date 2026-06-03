# 🌤️ Mood Tracker — a GitHub Pages toy

A single-page demo that **runs a form, saves each submission to GitHub, and
charts the results as a timeseries** — with **no backend server**. It works
entirely on GitHub Pages (static hosting) by using GitHub itself as the
database via the Contents API.

| | |
|---|---|
| **Reading** the chart | Free & anonymous — anyone can view it. |
| **Submitting** an entry | Needs a GitHub token you paste once (stored in your browser only). |
| **Stack** | Plain HTML/CSS/JS + [Chart.js](https://www.chartjs.org/) from a CDN. No build step. |

---

## How it works

- The page loads `data/entries.json` from your repo via the GitHub Contents
  API and draws a line chart (mood 1–10 over time).
- When you submit the form, the page fetches the current `entries.json` (+ its
  SHA), appends your entry, and `PUT`s it back — i.e. it makes **one commit per
  submission**. GitHub Pages then rebuilds the static file (~30–60s); the chart
  updates immediately in the meantime.

### Data model

Each entry in `data/entries.json`:

```json
{ "date": "2026-06-03", "mood": 9, "note": "shipped the toy", "createdAt": "2026-06-03T20:00:00.000Z" }
```

---

## Setup (≈ 5 minutes)

### 1. Create the repo

Create a **public** repo (e.g. `mood-tracker`) and push these files to its
default branch (`main`):

```bash
git init
git add .
git commit -m "Mood Tracker toy"
git branch -M main
git remote add origin https://github.com/<you>/mood-tracker.git
git push -u origin main
```

### 2. Enable GitHub Pages

Repo → **Settings → Pages** → *Build and deployment* → **Deploy from a branch**
→ Branch: **main**, Folder: **/(root)** → **Save**.

After a minute your site is live at `https://<you>.github.io/mood-tracker/`.
At this point the chart already works (it shows the seeded sample data). The
repo is auto-detected from the URL — no code edits needed.

### 3. Create a fine-grained token (to enable saving)

GitHub → **Settings → Developer settings → Personal access tokens →
Fine-grained tokens → Generate new token**:

- **Repository access:** *Only select repositories* → pick **this repo only**.
- **Permissions → Repository permissions → Contents:** **Read and write**.
- (Leave everything else at *No access*.) Set a short expiry.

Copy the token. On the live page, open **⚙️ Save settings**, paste it, and click
**Save token**. Now submit the form — your entry is committed and the chart
updates.

---

## ⚠️ Security — read this

This is a **toy/demo** pattern, not production authentication. Because a static
page has no server to hide a secret, **the token lives in your browser**
(`localStorage`). Keep it safe:

- Use a **fine-grained** token scoped to **only this one repo**, **Contents:
  Read and write only**. Nothing else.
- Use a repo you're fine with being **public** (so the chart is viewable).
- Anyone who has that token can write to that one repo — **don't paste it on a
  shared/public computer**. Use **Clear** to remove it.
- The token is never written to the repo; it only ever sits in your browser.

For shared, anonymous, no-token submissions you'd swap the storage backend for
a form service (Formspree) or a Google Apps Script → Sheet. This toy
deliberately uses GitHub-as-database instead.

---

## Run it locally

Auto-detection only fires on a `*.github.io` host, so to test locally set the
repo explicitly at the top of `app.js`:

```js
const CONFIG = { owner: '<you>', repo: 'mood-tracker', path: 'data/entries.json', branch: '' };
```

Then serve the folder (the GitHub API needs an `http(s)` origin, not `file://`):

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Reading works immediately; saving works once you paste a token.

## Files

```
index.html         form + chart + token settings
app.js             load JSON, render chart, commit on submit
styles.css         styling
data/entries.json  the datastore (seeded with sample data — clear to start fresh)
```
