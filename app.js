'use strict';

/* ── Config ──────────────────────────────────────────────────────────
   Leave owner/repo empty to auto-detect from the GitHub Pages URL
   (https://<owner>.github.io/<repo>/). Set them explicitly only to run
   locally or to point the toy at a different repo. */
const CONFIG = {
  owner: '',
  repo: '',
  path: 'data/entries.json',
  branch: '', // empty → the repo's default branch
};

const API = 'https://api.github.com';
const TOKEN_KEY = 'mood-tracker:token';

let entries = [];   // in-memory dataset
let fileSha = null; // SHA of entries.json (null = file does not exist yet)
let chart = null;

/* ── Repo detection ──────────────────────────────────────────────── */
function detectRepo() {
  let { owner, repo } = CONFIG;
  const host = location.hostname;            // e.g. marco.github.io
  const parts = location.pathname.split('/').filter(Boolean);
  if (host.endsWith('github.io')) {
    owner = owner || host.split('.')[0];
    // project page → /<repo>/...  ·  user page → repo is "<owner>.github.io"
    repo = repo || (parts.length ? parts[0] : host);
  }
  return { owner, repo };
}
const { owner, repo } = detectRepo();

/* ── Token helpers ───────────────────────────────────────────────── */
const getToken = () => localStorage.getItem(TOKEN_KEY) || '';
const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
const clearToken = () => localStorage.removeItem(TOKEN_KEY);

/* ── base64 <-> UTF-8 (robust) ───────────────────────────────────── */
function toB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}
function fromB64(b64) {
  const bin = atob((b64 || '').replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/* ── GitHub Contents API ─────────────────────────────────────────── */
function contentsUrl() {
  return `${API}/repos/${owner}/${repo}/contents/${CONFIG.path}`;
}

async function ghGet() {
  if (!owner || !repo) throw new Error('Repo not configured');
  const url = contentsUrl() + (CONFIG.branch ? `?ref=${CONFIG.branch}` : '');
  const headers = { Accept: 'application/vnd.github+json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers, cache: 'no-store' });
  if (res.status === 404) return { data: [], sha: null }; // file not created yet
  if (!res.ok) throw new Error(`Read failed (${res.status})`);
  const json = await res.json();
  let data;
  try { data = JSON.parse(fromB64(json.content)); } catch { data = []; }
  if (!Array.isArray(data)) data = [];
  return { data, sha: json.sha };
}

async function ghPut(nextEntries, sha, message) {
  const body = { message, content: toB64(JSON.stringify(nextEntries, null, 2) + '\n') };
  if (sha) body.sha = sha;
  if (CONFIG.branch) body.branch = CONFIG.branch;
  return fetch(contentsUrl(), {
    method: 'PUT',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

/* Commit one new entry. On a 409 (someone else committed first) refetch
   the latest file once and retry against the fresh SHA. */
async function saveEntry(entry) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const next = [...entries, entry];
    const res = await ghPut(next, fileSha, `mood ${entry.mood} on ${entry.date}`);
    if (res.ok) {
      const json = await res.json();
      fileSha = json.content.sha;
      entries = next;
      return;
    }
    if (res.status === 409 && attempt === 0) {
      const fresh = await ghGet();
      entries = fresh.data;
      fileSha = fresh.sha;
      continue;
    }
    if (res.status === 401 || res.status === 403)
      throw new Error('Token invalid or missing “Contents: Read and write”.');
    if (res.status === 404)
      throw new Error('Repo or path not found — check CONFIG / README.');
    throw new Error(`Save failed (${res.status}).`);
  }
  throw new Error('Save failed after a conflict retry.');
}

/* ── Chart ───────────────────────────────────────────────────────── */
function sortedEntries() {
  return [...entries].sort((a, b) =>
    (a.createdAt || a.date).localeCompare(b.createdAt || b.date));
}

function renderChart() {
  const data = sortedEntries();
  const labels = data.map((e) => e.date);
  const values = data.map((e) => e.mood);

  document.getElementById('empty-state').classList.toggle('hidden', data.length > 0);
  document.getElementById('count').textContent =
    data.length ? `${data.length} ${data.length === 1 ? 'entry' : 'entries'}` : '';

  if (chart) {
    chart.data.labels = labels;
    chart.data.datasets[0].data = values;
    chart.update();
    return;
  }
  const ctx = document.getElementById('chart').getContext('2d');
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Mood',
        data: values,
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99,102,241,0.15)',
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: '#6366f1',
      }],
    },
    options: {
      responsive: true,
      animation: { duration: 350 },
      scales: {
        y: { min: 0, max: 10, ticks: { stepSize: 2 }, title: { display: true, text: 'Mood' } },
        x: { title: { display: true, text: 'Date' } },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            afterBody: (items) => {
              const e = data[items[0].dataIndex];
              return e && e.note ? `📝 ${e.note}` : '';
            },
          },
        },
      },
    },
  });
}

/* ── UI helpers ──────────────────────────────────────────────────── */
function moodEmoji(v) {
  const faces = ['😣', '😞', '🙁', '😕', '😐', '🙂', '😊', '😄', '😁', '🤩'];
  return faces[Math.min(9, Math.max(0, v - 1))];
}
function setStatus(msg, kind = '') {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = 'status' + (kind ? ' ' + kind : '');
}
function todayStr() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
function refreshTokenStatus() {
  document.getElementById('token-status').textContent =
    getToken() ? '✓ token saved' : 'no token — viewing only';
}

/* ── Submit ──────────────────────────────────────────────────────── */
async function onSubmit(ev) {
  ev.preventDefault();
  if (!owner || !repo) {
    setStatus('Repo not configured — set CONFIG.owner/repo in app.js.', 'err');
    return;
  }
  if (!getToken()) {
    setStatus('Paste a GitHub token under ⚙️ to save.', 'err');
    document.querySelector('.settings').open = true;
    return;
  }
  const entry = {
    date: document.getElementById('date').value || todayStr(),
    mood: +document.getElementById('mood').value,
    note: document.getElementById('note').value.trim(),
    createdAt: new Date().toISOString(),
  };
  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  setStatus('Saving to GitHub…');
  try {
    await saveEntry(entry);
    renderChart(); // entries already updated → chart reflects it immediately
    document.getElementById('note').value = '';
    setStatus('Saved ✓ — chart updated. The public file rebuilds in ~30–60s.', 'ok');
  } catch (e) {
    setStatus(e.message, 'err');
  } finally {
    btn.disabled = false;
  }
}

/* ── Init ────────────────────────────────────────────────────────── */
async function init() {
  document.getElementById('repo-info').textContent =
    owner && repo
      ? `Target: ${owner}/${repo} → ${CONFIG.path}`
      : '⚠️ Could not detect repo. Set CONFIG.owner/CONFIG.repo in app.js.';

  if (owner && repo) {
    const link = document.getElementById('repo-link');
    link.href = `https://github.com/${owner}/${repo}`;
    link.hidden = false;
  }

  refreshTokenStatus();
  document.getElementById('date').value = todayStr();

  const moodInput = document.getElementById('mood');
  const syncMood = () => {
    document.getElementById('mood-out').textContent = moodInput.value;
    document.getElementById('mood-emoji').textContent = moodEmoji(+moodInput.value);
  };
  moodInput.addEventListener('input', syncMood);
  syncMood();

  document.getElementById('save-token').addEventListener('click', () => {
    const t = document.getElementById('token').value.trim();
    if (!t) return;
    setToken(t);
    document.getElementById('token').value = '';
    refreshTokenStatus();
    setStatus('Token saved to this browser.', 'ok');
  });
  document.getElementById('clear-token').addEventListener('click', () => {
    clearToken();
    refreshTokenStatus();
    setStatus('Token cleared.', '');
  });

  document.getElementById('entry-form').addEventListener('submit', onSubmit);

  setStatus('Loading…');
  try {
    const { data, sha } = await ghGet();
    entries = data;
    fileSha = sha;
    setStatus('');
  } catch (e) {
    setStatus(`Couldn't load data: ${e.message}`, 'err');
  }
  renderChart();
}

init();
