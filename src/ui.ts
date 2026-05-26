export function renderApp(csrfToken: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Domain Watch</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --green:#1D9E75;--green-light:#E1F5EE;--green-dark:#0F6E56;
  --amber:#BA7517;--amber-light:#FAEEDA;
  --red:#E24B4A;--red-light:#FCEBEB;--red-dark:#A32D2D;
  --blue:#185FA5;--blue-light:#E6F1FB;
  --gray:#888780;--gray-light:#F1EFE8;
  --text:#1a1a1a;--text-muted:#666;--text-hint:#999;
  --border:#e0e0de;--surface:#fff;--bg:#f5f5f3;
  --radius:8px;--radius-lg:12px;
}
@media(prefers-color-scheme:dark){
  :root{
    --text:#e8e8e6;--text-muted:#aaa;--text-hint:#777;
    --border:#333;--surface:#1e1e1c;--bg:#141412;
    --gray-light:#2a2a28;
    --green-light:#0a2e20;--amber-light:#2e1e00;--red-light:#2e0e0e;--blue-light:#0a1e36;
  }
}
body{font-family:system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--text);font-size:14px;line-height:1.5}
a{color:var(--green);text-decoration:none}

/* Layout */
.app{display:flex;flex-direction:column;min-height:100vh}
.topbar{background:var(--surface);border-bottom:0.5px solid var(--border);padding:0 20px;display:flex;align-items:center;justify-content:space-between;height:52px;position:sticky;top:0;z-index:100}
.topbar-left{display:flex;align-items:center;gap:10px}
.logo-icon{color:var(--green);font-size:20px}
.topbar-title{font-size:15px;font-weight:600}
.topbar-right{display:flex;align-items:center;gap:12px}
.logout-btn{font-size:13px;color:var(--text-muted);cursor:pointer;padding:6px 10px;border:0.5px solid var(--border);border-radius:var(--radius);background:none}
.logout-btn:hover{background:var(--gray-light)}
.tabs{background:var(--surface);border-bottom:0.5px solid var(--border);display:flex;padding:0 20px;gap:4px}
.tab{padding:12px 16px;font-size:13px;cursor:pointer;border-bottom:2px solid transparent;color:var(--text-muted);display:flex;align-items:center;gap:6px;white-space:nowrap;border-top:none;border-left:none;border-right:none;background:none}
.tab:hover{color:var(--text)}
.tab.active{color:var(--text);border-bottom-color:var(--green);font-weight:500}
.content{padding:24px 20px;flex:1;max-width:900px;width:100%;margin:0 auto}
.panel{display:none}
.panel.active{display:block}

/* Cards */
.card{background:var(--surface);border:0.5px solid var(--border);border-radius:var(--radius-lg);padding:16px 18px}
.card+.card,.domain-card+.domain-card{margin-top:10px}

/* Badges */
.badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:500;white-space:nowrap}
.badge-green{background:var(--green-light);color:var(--green-dark)}
.badge-amber{background:var(--amber-light);color:var(--amber)}
.badge-red{background:var(--red-light);color:var(--red-dark)}
.badge-gray{background:var(--gray-light);color:var(--gray)}
.badge-blue{background:var(--blue-light);color:var(--blue)}

/* Buttons */
.btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border:0.5px solid var(--border);border-radius:var(--radius);font-size:13px;cursor:pointer;background:var(--surface);color:var(--text);font-family:inherit}
.btn:hover{background:var(--gray-light)}
.btn-primary{background:var(--green);color:#fff;border-color:var(--green)}
.btn-primary:hover{background:var(--green-dark)}
.btn-danger{background:var(--red-light);color:var(--red-dark);border-color:transparent}
.btn-danger:hover{background:#f7c1c1}
.btn-sm{padding:5px 10px;font-size:12px}
.btn-icon{width:32px;height:32px;padding:0;display:inline-flex;align-items:center;justify-content:center;border:0.5px solid var(--border);border-radius:var(--radius);cursor:pointer;background:var(--surface);color:var(--text-muted);font-size:16px}
.btn-icon:hover{background:var(--gray-light);color:var(--text)}

/* Forms */
input,select,textarea{width:100%;padding:9px 12px;border:0.5px solid var(--border);border-radius:var(--radius);font-size:13px;background:var(--surface);color:var(--text);font-family:inherit;outline:none}
input:focus,select:focus,textarea:focus{border-color:var(--green);box-shadow:0 0 0 3px rgba(29,158,117,0.1)}
label{display:block;font-size:12px;font-weight:500;color:var(--text-muted);margin-bottom:5px}
.form-row{display:flex;gap:10px;align-items:flex-end}
.form-row>*{flex:1}
.form-row>.btn{flex:0 0 auto}
.field{margin-bottom:16px}

/* Section headers */
.section-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.section-title{font-size:13px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em}
.section-actions{display:flex;gap:8px;align-items:center}

/* Domain cards */
.domain-card{background:var(--surface);border:0.5px solid var(--border);border-radius:var(--radius-lg);padding:14px 16px;display:flex;align-items:center;gap:12px;transition:border-color 0.15s}
.domain-card.selected{border-color:var(--green);background:var(--green-light)}
.domain-card.expired{border-color:var(--red)}
.domain-card.expiring{border-color:var(--amber)}
.domain-checkbox{width:18px;height:18px;cursor:pointer;accent-color:var(--green);flex-shrink:0}
.domain-icon{width:36px;height:36px;border-radius:var(--radius);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
.icon-green{background:var(--green-light);color:var(--green)}
.icon-amber{background:var(--amber-light);color:var(--amber)}
.icon-red{background:var(--red-light);color:var(--red)}
.domain-info{flex:1;min-width:0}
.domain-name{font-size:14px;font-weight:600;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.domain-meta{font-size:12px;color:var(--text-muted)}
.domain-actions{display:flex;align-items:center;gap:6px}

/* Fuzzy results */
.fuzzy-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px;margin-top:12px}
.fuzzy-item{background:var(--surface);border:0.5px solid var(--border);border-radius:var(--radius);padding:10px 12px}
.fuzzy-item.registered{border-color:var(--red);background:var(--red-light)}
.fuzzy-item.available{border-color:var(--green)}
.fi-top{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:4px}
.fi-name{font-size:12px;font-weight:600;font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.dot-red{background:var(--red)}
.dot-green{background:var(--green)}
.dot-gray{background:var(--gray)}
.fi-tags{display:flex;gap:4px;flex-wrap:wrap}
.fi-tag{padding:1px 6px;border-radius:4px;font-size:10px;font-weight:500}
.tag-tld{background:var(--blue-light);color:var(--blue)}
.tag-typo{background:var(--amber-light);color:var(--amber)}

/* Alerts */
.alert-item{display:flex;align-items:flex-start;gap:12px;padding:12px 14px;background:var(--surface);border:0.5px solid var(--border);border-radius:var(--radius-lg);margin-bottom:8px}
.alert-icon{font-size:18px;flex-shrink:0;margin-top:1px}
.alert-body{flex:1}
.alert-domain{font-weight:600;font-size:13px}
.alert-msg{font-size:12px;color:var(--text-muted);margin-top:2px}
.alert-time{font-size:11px;color:var(--text-hint);white-space:nowrap}

/* Bulk bar */
.bulk-bar{display:none;align-items:center;gap:10px;padding:10px 14px;background:var(--green-light);border:0.5px solid var(--green);border-radius:var(--radius-lg);margin-bottom:14px}
.bulk-bar.visible{display:flex}
.bulk-count{font-size:13px;font-weight:500;color:var(--green-dark)}

/* Legend */
.legend{display:flex;gap:16px;align-items:center;padding:10px 14px;background:var(--surface);border:0.5px solid var(--border);border-radius:var(--radius);margin-top:12px;flex-wrap:wrap}
.leg-item{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-muted)}

/* Spinner */
.spinner{display:inline-block;width:16px;height:16px;border:2px solid var(--border);border-top-color:var(--green);border-radius:50%;animation:spin 0.6s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}

/* Toast */
.toast-wrap{position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:8px}
.toast{padding:12px 16px;border-radius:var(--radius-lg);font-size:13px;font-weight:500;border:0.5px solid;animation:slideUp 0.2s ease}
.toast-success{background:var(--green-light);color:var(--green-dark);border-color:var(--green)}
.toast-error{background:var(--red-light);color:var(--red-dark);border-color:var(--red)}
@keyframes slideUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}

/* Stat cards */
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:20px}
.stat{background:var(--surface);border:0.5px solid var(--border);border-radius:var(--radius-lg);padding:14px 16px;text-align:center}
.stat-num{font-size:24px;font-weight:600;line-height:1.2}
.stat-label{font-size:11px;color:var(--text-muted);margin-top:4px}
.stat-num.green{color:var(--green)}
.stat-num.amber{color:var(--amber)}
.stat-num.red{color:var(--red)}

/* Scan history list */
.scan-item{padding:12px 14px;background:var(--surface);border:0.5px solid var(--border);border-radius:var(--radius-lg);display:flex;align-items:center;gap:10px;cursor:pointer;margin-bottom:8px}
.scan-item:hover{background:var(--gray-light)}
.scan-domain{font-weight:600;font-size:13px;flex:1}
.scan-meta{font-size:12px;color:var(--text-muted)}

/* Threshold multi-select */
.threshold-pills{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
.threshold-pill{padding:5px 12px;border:0.5px solid var(--border);border-radius:20px;font-size:12px;cursor:pointer;background:var(--surface);color:var(--text-muted)}
.threshold-pill.selected{background:var(--green);color:#fff;border-color:var(--green)}

/* Empty state */
.empty{text-align:center;padding:48px 20px;color:var(--text-muted)}
.empty-icon{font-size:32px;margin-bottom:12px;opacity:0.4}

/* Modal */
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:500;display:flex;align-items:center;justify-content:center;padding:20px}
.modal{background:var(--surface);border-radius:var(--radius-lg);padding:24px;max-width:480px;width:100%;border:0.5px solid var(--border)}
.modal-title{font-size:16px;font-weight:600;margin-bottom:16px}
.modal-footer{display:flex;gap:8px;justify-content:flex-end;margin-top:20px}
.hidden{display:none!important}

/* Settings */
.settings-section{margin-bottom:28px}
.settings-section-title{font-size:13px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:14px;padding-bottom:8px;border-bottom:0.5px solid var(--border)}
.provider-badge{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:var(--radius);border:0.5px solid var(--border);font-size:13px;margin-bottom:12px}
</style>
</head>
<body>
<div class="app">
  <div class="topbar">
    <div class="topbar-left">
      <svg class="logo-icon" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
      <span class="topbar-title">Domain Watch</span>
    </div>
    <div class="topbar-right">
      <span id="providerStatus" class="badge badge-gray" style="font-size:11px"></span>
      <button class="logout-btn" onclick="logout()">Sign out</button>
    </div>
  </div>

  <div class="tabs" role="tablist">
    <button class="tab active" role="tab" onclick="switchTab('monitor')" id="tab-monitor">&#x1F6E1; Monitor</button>
    <button class="tab" role="tab" onclick="switchTab('fuzzy')" id="tab-fuzzy">&#x1F50D; Fuzzy finder</button>
    <button class="tab" role="tab" onclick="switchTab('alerts')" id="tab-alerts">&#x1F514; Alerts</button>
    <button class="tab" role="tab" onclick="switchTab('settings')" id="tab-settings">&#x2699;&#xFE0F; Settings</button>
  </div>

  <div class="content">

    <!-- ══ MONITOR PANEL ══════════════════════════════════════════════════ -->
    <div id="panel-monitor" class="panel active">
      <div class="stats" id="monitorStats"></div>

      <div class="section-header">
        <span class="section-title">Add domain</span>
      </div>
      <div class="card" style="margin-bottom:20px">
        <div class="form-row" style="align-items:flex-start">
          <div>
            <label for="addDomainInput">Domain name</label>
            <input type="text" id="addDomainInput" placeholder="e.g. example.com" autocomplete="off" spellcheck="false">
          </div>
          <div>
            <label>Alert thresholds (days before expiry)</label>
            <div class="threshold-pills" id="addThresholds">
              <span class="threshold-pill selected" data-days="90">90d</span>
              <span class="threshold-pill selected" data-days="60">60d</span>
              <span class="threshold-pill selected" data-days="30">30d</span>
              <span class="threshold-pill selected" data-days="14">14d</span>
              <span class="threshold-pill selected" data-days="7">7d</span>
            </div>
          </div>
          <button class="btn btn-primary" onclick="addDomain()" style="margin-top:20px">
            <span id="addDomainSpinner" class="spinner hidden"></span>
            Add &amp; check
          </button>
        </div>
        <div style="margin-top:12px;font-size:12px;color:var(--text-muted)">
          Paste multiple domains (one per line):
          <a href="#" onclick="openBulkModal();return false">bulk add</a>
        </div>
      </div>

      <div class="section-header">
        <span class="section-title">Monitored domains</span>
        <div class="section-actions">
          <label style="margin:0;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:5px;color:var(--text-muted)">
            <input type="checkbox" id="selectAllDomains" onchange="toggleSelectAll(this.checked)" style="width:auto"> Select all
          </label>
        </div>
      </div>

      <div class="bulk-bar" id="domainBulkBar">
        <span class="bulk-count" id="domainBulkCount">0 selected</span>
        <button class="btn btn-sm btn-danger" onclick="bulkDeleteDomains()">&#x1F5D1; Delete selected</button>
        <button class="btn btn-sm" onclick="clearDomainSelection()">Cancel</button>
      </div>

      <div id="domainList"><div class="empty"><div class="empty-icon">&#x1F310;</div><p>No domains monitored yet.</p><p style="margin-top:8px;font-size:12px">Add your first domain above.</p></div></div>
    </div>

    <!-- ══ FUZZY FINDER PANEL ═════════════════════════════════════════════ -->
    <div id="panel-fuzzy" class="panel">
      <div class="card" style="margin-bottom:20px">
        <div class="form-row">
          <div>
            <label for="fuzzyInput">Domain to scan</label>
            <input type="text" id="fuzzyInput" placeholder="e.g. mycompany.com" autocomplete="off" spellcheck="false">
          </div>
          <button class="btn btn-primary" onclick="runFuzzyScan()" style="margin-top:20px">
            <span id="fuzzySpinner" class="spinner hidden"></span>
            Scan
          </button>
        </div>
        <div style="margin-top:8px;font-size:12px;color:var(--text-muted)">
          Checks alternate TLDs and typo variants against live DNS. Results saved to history.
        </div>
      </div>

      <div id="fuzzyResults"></div>

      <div class="section-header" style="margin-top:24px">
        <span class="section-title">Scan history</span>
        <span id="fuzzyScanCount" class="badge badge-gray"></span>
      </div>
      <div id="fuzzyHistory"><div class="empty"><div class="empty-icon">&#x1F50D;</div><p>No scans yet.</p></div></div>
    </div>

    <!-- ══ ALERTS PANEL ═══════════════════════════════════════════════════ -->
    <div id="panel-alerts" class="panel">
      <div class="section-header">
        <span class="section-title">Alert history</span>
        <button class="btn btn-sm" onclick="loadAlerts()">&#x21BB; Refresh</button>
      </div>
      <div id="alertsList"><div class="empty"><div class="empty-icon">&#x1F514;</div><p>No alerts sent yet.</p></div></div>
    </div>

    <!-- ══ SETTINGS PANEL ═════════════════════════════════════════════════ -->
    <div id="panel-settings" class="panel">
      <div class="settings-section">
        <div class="settings-section-title">Email configuration</div>
        <div id="providerInfo" class="provider-badge badge-gray" style="margin-bottom:16px"></div>

        <div class="field">
          <label for="emailFrom">From address</label>
          <input type="email" id="emailFrom" placeholder="alerts@yourdomain.com">
        </div>
        <div class="field">
          <label for="emailTo">To address (alert recipient)</label>
          <input type="email" id="emailTo" placeholder="you@yourdomain.com">
        </div>
        <div class="field">
          <label for="subjectPrefix">Subject prefix</label>
          <input type="text" id="subjectPrefix" placeholder="[Domain Watch]" maxlength="100">
        </div>
        <button class="btn btn-primary" onclick="saveSettings()">Save email settings</button>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">Current limits (set in wrangler.toml)</div>
        <div id="limitsDisplay" style="font-size:13px;color:var(--text-muted);line-height:2"></div>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">Security</div>
        <div style="font-size:13px;color:var(--text-muted);line-height:1.8">
          &#x2714; Password stored as Cloudflare secret (APP_PASSWORD)<br>
          &#x2714; Session tokens HMAC-signed (SESSION_SECRET)<br>
          &#x2714; HttpOnly / Secure / SameSite=Strict cookies<br>
          &#x2714; CSRF protection on all state-changing requests<br>
          &#x2714; Rate limiting per IP (general + lookup)<br>
          &#x2714; Content Security Policy headers<br>
          &#x2714; Input validation &amp; output encoding<br>
          &#x2714; Constant-time password comparison
        </div>
      </div>
    </div>

  </div><!-- /content -->
</div><!-- /app -->

<!-- Bulk Add Modal -->
<div class="modal-overlay hidden" id="bulkModal" onclick="if(event.target===this)closeBulkModal()">
  <div class="modal">
    <div class="modal-title">Bulk add domains</div>
    <div class="field">
      <label>Paste domains — one per line</label>
      <textarea id="bulkDomainsInput" rows="8" placeholder="example.com&#10;mysite.io&#10;anotherdomain.net" style="font-family:monospace;resize:vertical"></textarea>
    </div>
    <div class="field">
      <label>Alert thresholds</label>
      <div class="threshold-pills" id="bulkThresholds">
        <span class="threshold-pill selected" data-days="90">90d</span>
        <span class="threshold-pill selected" data-days="60">60d</span>
        <span class="threshold-pill selected" data-days="30">30d</span>
        <span class="threshold-pill selected" data-days="14">14d</span>
        <span class="threshold-pill selected" data-days="7">7d</span>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeBulkModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitBulkAdd()">Add domains</button>
    </div>
  </div>
</div>

<div class="toast-wrap" id="toastWrap"></div>

<script>
const CSRF = ${JSON.stringify(csrfToken)};

// ── API ────────────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const headers = {'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'};
  if (CSRF && method !== 'GET') headers['X-CSRF-Token'] = CSRF;
  const r = await fetch(path, {method, headers, body: body ? JSON.stringify(body) : undefined});
  if (r.status === 401) { window.location.href = '/'; return null; }
  return r.ok ? r.json() : r.json().then(d => { throw new Error(d.error || 'Request failed'); });
}

// ── Tabs ───────────────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-'+name).classList.add('active');
  document.getElementById('panel-'+name).classList.add('active');
  if (name === 'alerts') loadAlerts();
  if (name === 'settings') loadSettings();
  if (name === 'fuzzy') loadFuzzyHistory();
}

// ── Toast ──────────────────────────────────────────────────────────────────
function toast(msg, type='success') {
  const w = document.getElementById('toastWrap');
  const t = document.createElement('div');
  t.className = 'toast toast-'+type;
  t.textContent = msg;
  w.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ── Logout ─────────────────────────────────────────────────────────────────
async function logout() {
  await fetch('/auth/logout', {method:'POST'});
  window.location.href = '/';
}

// ── Threshold pills ─────────────────────────────────────────────────────────
document.querySelectorAll('.threshold-pills').forEach(container => {
  container.addEventListener('click', e => {
    if (e.target.classList.contains('threshold-pill')) {
      e.target.classList.toggle('selected');
    }
  });
});

function getSelectedThresholds(containerId) {
  return [...document.querySelectorAll('#'+containerId+' .threshold-pill.selected')]
    .map(el => parseInt(el.dataset.days));
}

// ── Monitor ────────────────────────────────────────────────────────────────
let allDomains = [];
let selectedDomainIds = new Set();

async function loadDomains() {
  const domains = await api('GET', '/api/domains');
  if (!domains) return;
  allDomains = domains;
  renderDomains();
  renderStats();
}

function renderStats() {
  const total = allDomains.length;
  const expired = allDomains.filter(d => d.expiresAt && daysLeft(d.expiresAt) <= 0).length;
  const expiring = allDomains.filter(d => d.expiresAt && daysLeft(d.expiresAt) > 0 && daysLeft(d.expiresAt) <= 30).length;
  const healthy = total - expired - expiring;
  document.getElementById('monitorStats').innerHTML = \`
    <div class="stat"><div class="stat-num">\${total}</div><div class="stat-label">Monitored</div></div>
    <div class="stat"><div class="stat-num green">\${healthy}</div><div class="stat-label">Healthy</div></div>
    <div class="stat"><div class="stat-num amber">\${expiring}</div><div class="stat-label">Expiring soon</div></div>
    <div class="stat"><div class="stat-num red">\${expired}</div><div class="stat-label">Expired</div></div>
  \`;
}

function daysLeft(expiresAt) {
  return Math.ceil((new Date(expiresAt) - Date.now()) / 86400000);
}

function renderDomains() {
  const list = document.getElementById('domainList');
  if (!allDomains.length) {
    list.innerHTML = '<div class="empty"><div class="empty-icon">&#x1F310;</div><p>No domains monitored yet.</p><p style="margin-top:8px;font-size:12px">Add your first domain above.</p></div>';
    return;
  }
  // Sort: expired first, then by days remaining asc
  const sorted = [...allDomains].sort((a, b) => {
    const da = a.expiresAt ? daysLeft(a.expiresAt) : 9999;
    const db = b.expiresAt ? daysLeft(b.expiresAt) : 9999;
    return da - db;
  });
  list.innerHTML = sorted.map(d => domainCard(d)).join('');
}

function domainCard(d) {
  const days = d.expiresAt ? daysLeft(d.expiresAt) : null;
  const isExpired = days !== null && days <= 0;
  const isExpiring = days !== null && days > 0 && days <= 30;
  const iconClass = isExpired ? 'icon-red' : isExpiring ? 'icon-amber' : 'icon-green';
  const cardClass = isExpired ? 'expired' : isExpiring ? 'expiring' : '';
  const selected = selectedDomainIds.has(d.id) ? 'selected' : '';
  let badge = '';
  if (days === null) badge = '<span class="badge badge-gray">Unknown</span>';
  else if (isExpired) badge = '<span class="badge badge-red">&#x26A0; Expired</span>';
  else if (days <= 7) badge = \`<span class="badge badge-red">\${days}d</span>\`;
  else if (days <= 30) badge = \`<span class="badge badge-amber">\${days}d</span>\`;
  else badge = \`<span class="badge badge-green">\${days}d</span>\`;

  const expiry = d.expiresAt ? new Date(d.expiresAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : '—';
  const registrar = d.registrar ? \`· \${d.registrar}\` : '';

  return \`<div class="domain-card \${cardClass} \${selected}" id="dc-\${d.id}">
    <input type="checkbox" class="domain-checkbox" \${selected?'checked':''} onchange="toggleDomainSelect('\${d.id}',this.checked)" title="Select">
    <div class="domain-icon \${iconClass}">\${isExpired?'&#x1F6AB;':'&#x1F310;'}</div>
    <div class="domain-info">
      <div class="domain-name" title="\${d.domain}">\${d.domain}</div>
      <div class="domain-meta">Expires \${expiry} \${registrar}</div>
    </div>
    \${badge}
    <div class="domain-actions">
      <button class="btn-icon" title="Refresh RDAP data" onclick="refreshDomain('\${d.id}')">&#x21BB;</button>
      <button class="btn-icon" title="Quick fuzzy scan" onclick="quickFuzzyScan('\${d.domain}')">&#x1F50D;</button>
      <button class="btn-icon" title="Delete" onclick="deleteDomain('\${d.id}')">&#x1F5D1;</button>
    </div>
  </div>\`;
}

function toggleDomainSelect(id, checked) {
  if (checked) selectedDomainIds.add(id);
  else selectedDomainIds.delete(id);
  const card = document.getElementById('dc-'+id);
  if (card) card.classList.toggle('selected', checked);
  updateBulkBar();
}

function toggleSelectAll(checked) {
  allDomains.forEach(d => {
    if (checked) selectedDomainIds.add(d.id);
    else selectedDomainIds.delete(d.id);
  });
  document.querySelectorAll('.domain-checkbox').forEach(cb => cb.checked = checked);
  document.querySelectorAll('.domain-card').forEach(c => c.classList.toggle('selected', checked));
  updateBulkBar();
}

function clearDomainSelection() {
  selectedDomainIds.clear();
  document.querySelectorAll('.domain-checkbox').forEach(cb => cb.checked = false);
  document.querySelectorAll('.domain-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('selectAllDomains').checked = false;
  updateBulkBar();
}

function updateBulkBar() {
  const bar = document.getElementById('domainBulkBar');
  const count = selectedDomainIds.size;
  bar.classList.toggle('visible', count > 0);
  document.getElementById('domainBulkCount').textContent = count+' selected';
}

async function addDomain() {
  const input = document.getElementById('addDomainInput');
  const domain = input.value.trim();
  if (!domain) return;
  const thresholds = getSelectedThresholds('addThresholds');
  const spinner = document.getElementById('addDomainSpinner');
  spinner.classList.remove('hidden');
  try {
    const result = await api('POST', '/api/domains', {domain, alertThresholds: thresholds});
    if (!result) return;
    allDomains.push(result);
    renderDomains();
    renderStats();
    input.value = '';
    toast('Domain added and checked ✓');
  } catch(e) { toast(e.message, 'error'); }
  spinner.classList.add('hidden');
}

async function deleteDomain(id) {
  if (!confirm('Remove this domain from monitoring?')) return;
  try {
    await api('DELETE', '/api/domains/'+id);
    allDomains = allDomains.filter(d => d.id !== id);
    selectedDomainIds.delete(id);
    renderDomains();
    renderStats();
    updateBulkBar();
    toast('Domain removed');
  } catch(e) { toast(e.message, 'error'); }
}

async function bulkDeleteDomains() {
  const ids = [...selectedDomainIds];
  if (!ids.length) return;
  if (!confirm(\`Delete \${ids.length} domain(s) from monitoring?\`)) return;
  try {
    await api('POST', '/api/domains/bulk-delete', {ids});
    allDomains = allDomains.filter(d => !ids.includes(d.id));
    selectedDomainIds.clear();
    renderDomains();
    renderStats();
    updateBulkBar();
    document.getElementById('selectAllDomains').checked = false;
    toast(\`\${ids.length} domain(s) deleted\`);
  } catch(e) { toast(e.message, 'error'); }
}

async function refreshDomain(id) {
  try {
    const updated = await api('POST', '/api/domains/'+id+'/refresh');
    if (!updated) return;
    allDomains = allDomains.map(d => d.id === id ? updated : d);
    renderDomains();
    renderStats();
    toast('Domain data refreshed ✓');
  } catch(e) { toast(e.message, 'error'); }
}

function quickFuzzyScan(domain) {
  switchTab('fuzzy');
  document.getElementById('fuzzyInput').value = domain;
  runFuzzyScan();
}

// Bulk add modal
function openBulkModal() { document.getElementById('bulkModal').classList.remove('hidden'); }
function closeBulkModal() { document.getElementById('bulkModal').classList.add('hidden'); }

async function submitBulkAdd() {
  const raw = document.getElementById('bulkDomainsInput').value;
  const domains = raw.split('\\n').map(s => s.trim()).filter(Boolean);
  if (!domains.length) return;
  const thresholds = getSelectedThresholds('bulkThresholds');
  try {
    const results = await api('POST', '/api/domains/bulk-monitor', {domains, alertThresholds: thresholds});
    if (!results) return;
    const added = results.filter(r => r.status === 'added').length;
    closeBulkModal();
    await loadDomains();
    toast(\`\${added} domain(s) added\${results.length > added ? ', some skipped' : ''}\`);
    document.getElementById('bulkDomainsInput').value = '';
  } catch(e) { toast(e.message, 'error'); }
}

// ── Fuzzy Finder ──────────────────────────────────────────────────────────
let fuzzyScans = [];

async function loadFuzzyHistory() {
  const scans = await api('GET', '/api/fuzzy');
  if (!scans) return;
  fuzzyScans = scans;
  renderFuzzyHistory();
}

function renderFuzzyHistory() {
  const el = document.getElementById('fuzzyHistory');
  const countEl = document.getElementById('fuzzyScanCount');
  countEl.textContent = fuzzyScans.length + ' scans';
  if (!fuzzyScans.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">&#x1F50D;</div><p>No scans yet.</p></div>';
    return;
  }
  el.innerHTML = fuzzyScans.map(s => {
    const reg = s.results.filter(r => r.registered === true).length;
    const avail = s.results.filter(r => r.registered === false).length;
    const date = new Date(s.scannedAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
    return \`<div class="scan-item" onclick="showFuzzyScan('\${s.id}')">
      <span>&#x1F50D;</span>
      <span class="scan-domain">\${s.baseDomain}</span>
      <span class="badge badge-red" style="font-size:11px">\${reg} taken</span>
      <span class="badge badge-green" style="font-size:11px">\${avail} free</span>
      <span class="scan-meta">\${date}</span>
      <button class="btn-icon btn-sm" title="Delete scan" onclick="deleteScan(event,'\${s.id}')">&#x1F5D1;</button>
    </div>\`;
  }).join('');
}

async function deleteScan(e, id) {
  e.stopPropagation();
  if (!confirm('Delete this scan from history?')) return;
  await api('DELETE', '/api/fuzzy/'+id);
  fuzzyScans = fuzzyScans.filter(s => s.id !== id);
  renderFuzzyHistory();
  toast('Scan deleted');
}

function showFuzzyScan(id) {
  const scan = fuzzyScans.find(s => s.id === id);
  if (!scan) return;
  renderFuzzyResults(scan);
  window.scrollTo(0,0);
}

async function runFuzzyScan() {
  const domain = document.getElementById('fuzzyInput').value.trim();
  if (!domain) return;
  const spinner = document.getElementById('fuzzySpinner');
  spinner.classList.remove('hidden');
  document.getElementById('fuzzyResults').innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-muted)"><div class="spinner" style="width:24px;height:24px;margin:0 auto 12px"></div><p>Scanning DNS for variants — this may take a moment…</p></div>';
  try {
    const scan = await api('POST', '/api/fuzzy', {domain});
    if (!scan) return;
    fuzzyScans = [scan, ...fuzzyScans.filter(s => s.baseDomain !== scan.baseDomain || s.id !== scan.id)];
    renderFuzzyHistory();
    renderFuzzyResults(scan);
  } catch(e) {
    toast(e.message, 'error');
    document.getElementById('fuzzyResults').innerHTML = '';
  }
  spinner.classList.add('hidden');
}

function renderFuzzyResults(scan) {
  const registered = scan.results.filter(r => r.registered === true);
  const available = scan.results.filter(r => r.registered === false);
  const unknown = scan.results.filter(r => r.registered === null);
  const date = new Date(scan.scannedAt).toLocaleString('en-GB');

  const typeLabel = t => ({
    'tld':'TLD','typo-swap':'swap','typo-drop':'drop','typo-double':'double',
    'typo-hyphen':'hyphen','typo-homoglyph':'homoglyph'
  }[t] || t);

  const renderGroup = (items, cls) => items.map(v => \`
    <div class="fuzzy-item \${cls}">
      <div class="fi-top">
        <span class="fi-name" title="\${v.domain}">\${v.domain}</span>
        <span class="dot \${cls==='registered'?'dot-red':cls==='available'?'dot-green':'dot-gray'}"></span>
      </div>
      <div class="fi-tags">
        <span class="fi-tag \${v.type==='tld'?'tag-tld':'tag-typo'}">\${typeLabel(v.type)}</span>
      </div>
    </div>\`).join('');

  document.getElementById('fuzzyResults').innerHTML = \`
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
        <div>
          <span style="font-size:15px;font-weight:600">\${scan.baseDomain}</span>
          <span style="font-size:12px;color:var(--text-muted);margin-left:8px">scanned \${date}</span>
        </div>
        <div style="display:flex;gap:8px">
          <span class="badge badge-red">\${registered.length} registered</span>
          <span class="badge badge-green">\${available.length} available</span>
          \${unknown.length?'<span class="badge badge-gray">'+unknown.length+' unknown</span>':''}
        </div>
      </div>
      \${registered.length?'<div style="font-size:12px;font-weight:500;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.04em">Registered (taken)</div><div class="fuzzy-grid">'+renderGroup(registered,'registered')+'</div>':''}
      \${available.length?'<div style="font-size:12px;font-weight:500;color:var(--text-muted);margin:14px 0 6px;text-transform:uppercase;letter-spacing:0.04em">Available</div><div class="fuzzy-grid">'+renderGroup(available,'available')+'</div>':''}
      \${unknown.length?'<div style="font-size:12px;font-weight:500;color:var(--text-muted);margin:14px 0 6px;text-transform:uppercase;letter-spacing:0.04em">Unknown</div><div class="fuzzy-grid">'+renderGroup(unknown,'')+'</div>':''}
      <div class="legend">
        <div class="leg-item"><span class="dot dot-red"></span> Registered &mdash; someone owns it</div>
        <div class="leg-item"><span class="dot dot-green"></span> Available &mdash; unregistered</div>
        <div class="leg-item"><span class="dot dot-gray"></span> Unknown / DNS error</div>
      </div>
    </div>
  \`;
}

// ── Alerts ────────────────────────────────────────────────────────────────
async function loadAlerts() {
  const alerts = await api('GET', '/api/alerts');
  if (!alerts) return;
  const el = document.getElementById('alertsList');
  if (!alerts.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">&#x1F514;</div><p>No alerts sent yet.</p></div>';
    return;
  }
  el.innerHTML = alerts.map(a => {
    const icon = a.type === 'expired' ? '&#x1F6AB;' : a.daysRemaining <= 7 ? '&#x26A0;&#xFE0F;' : '&#x1F514;';
    const badgeCls = a.type === 'expired' ? 'badge-red' : a.daysRemaining <= 14 ? 'badge-amber' : 'badge-green';
    const msg = a.type === 'expired' ? 'Domain has expired' : \`Expires in \${a.daysRemaining} days\`;
    const date = new Date(a.sentAt).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
    return \`<div class="alert-item">
      <div class="alert-icon">\${icon}</div>
      <div class="alert-body">
        <div class="alert-domain">\${a.domain}</div>
        <div class="alert-msg">\${msg} · via \${a.emailProvider} · \${a.success?'&#x2714; sent':'&#x2716; failed'}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
        <span class="badge \${badgeCls}" style="font-size:11px">\${a.type==='expired'?'expired':a.daysRemaining+'d'}</span>
        <span class="alert-time">\${date}</span>
      </div>
    </div>\`;
  }).join('');
}

// ── Settings ──────────────────────────────────────────────────────────────
async function loadSettings() {
  const s = await api('GET', '/api/settings');
  if (!s) return;
  document.getElementById('emailFrom').value = s.emailFrom || '';
  document.getElementById('emailTo').value = s.emailTo || '';
  document.getElementById('subjectPrefix').value = s.emailSubjectPrefix || '';

  const providerNames = {resend:'Resend',mailgun:'Mailgun',sendgrid:'SendGrid',none:'No provider'};
  const providerColors = {resend:'badge-green',mailgun:'badge-blue',sendgrid:'badge-blue',none:'badge-gray'};
  document.getElementById('providerInfo').textContent = '&#x2709; Email provider: ' + (providerNames[s.emailProvider] || s.emailProvider);
  document.getElementById('providerInfo').className = 'provider-badge ' + (providerColors[s.emailProvider] || 'badge-gray');

  document.getElementById('providerStatus').textContent = providerNames[s.emailProvider] || 'No email';

  document.getElementById('limitsDisplay').innerHTML = [
    ['Max monitored domains', s.maxMonitoredDomains],
    ['Max fuzzy scan history', s.maxFuzzyHistory],
    ['Default alert thresholds (days)', s.defaultThresholds],
    ['Fuzzy TLDs checked', s.fuzzyTlds],
  ].map(([k,v]) => \`<div><strong>\${k}:</strong> \${v}</div>\`).join('');
}

async function saveSettings() {
  try {
    await api('PUT', '/api/settings', {
      emailFrom: document.getElementById('emailFrom').value,
      emailTo: document.getElementById('emailTo').value,
      emailSubjectPrefix: document.getElementById('subjectPrefix').value,
    });
    toast('Settings saved ✓');
  } catch(e) { toast(e.message, 'error'); }
}

// ── Init ──────────────────────────────────────────────────────────────────
document.getElementById('addDomainInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') addDomain();
});
document.getElementById('fuzzyInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') runFuzzyScan();
});

loadDomains();
loadSettings();
</script>
</body>
</html>`;
}
