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

.app{display:flex;flex-direction:column;min-height:100vh}
.topbar{background:var(--surface);border-bottom:0.5px solid var(--border);padding:0 20px;display:flex;align-items:center;justify-content:space-between;height:52px;position:sticky;top:0;z-index:100}
.topbar-left{display:flex;align-items:center;gap:10px}
.logo-icon{color:var(--green)}
.topbar-title{font-size:15px;font-weight:600}
.topbar-right{display:flex;align-items:center;gap:12px}
.logout-btn{font-size:13px;color:var(--text-muted);cursor:pointer;padding:6px 10px;border:0.5px solid var(--border);border-radius:var(--radius);background:none;color:var(--text-muted)}
.logout-btn:hover{background:var(--gray-light)}

.tabs{background:var(--surface);border-bottom:0.5px solid var(--border);display:flex;padding:0 20px;gap:4px}
.tab{padding:12px 16px;font-size:13px;cursor:pointer;border-bottom:2px solid transparent;color:var(--text-muted);display:flex;align-items:center;gap:6px;white-space:nowrap;border-top:none;border-left:none;border-right:none;background:none;font-family:inherit}
.tab:hover{color:var(--text)}
.tab.active{color:var(--text);border-bottom-color:var(--green);font-weight:500}

.content{padding:24px 20px;flex:1;max-width:960px;width:100%;margin:0 auto}
.panel{display:none}
.panel.active{display:block}

.card{background:var(--surface);border:0.5px solid var(--border);border-radius:var(--radius-lg);padding:16px 18px}

.badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:500;white-space:nowrap}
.badge-green{background:var(--green-light);color:var(--green-dark)}
.badge-amber{background:var(--amber-light);color:var(--amber)}
.badge-red{background:var(--red-light);color:var(--red-dark)}
.badge-gray{background:var(--gray-light);color:var(--gray)}
.badge-blue{background:var(--blue-light);color:var(--blue)}

.btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border:0.5px solid var(--border);border-radius:var(--radius);font-size:13px;cursor:pointer;background:var(--surface);color:var(--text);font-family:inherit}
.btn:hover{background:var(--gray-light)}
.btn-primary{background:var(--green);color:#fff;border-color:var(--green)}
.btn-primary:hover{background:var(--green-dark);border-color:var(--green-dark)}
.btn-danger{background:var(--red-light);color:var(--red-dark);border-color:transparent}
.btn-danger:hover{background:#f7c1c1}
.btn-sm{padding:5px 10px;font-size:12px}
.btn-icon{width:32px;height:32px;padding:0;display:inline-flex;align-items:center;justify-content:center;border:0.5px solid var(--border);border-radius:var(--radius);cursor:pointer;background:var(--surface);color:var(--text-muted);font-size:15px;font-family:inherit}
.btn-icon:hover{background:var(--gray-light);color:var(--text)}
.btn:disabled,.btn-icon:disabled{opacity:0.5;cursor:not-allowed}

input,select,textarea{width:100%;padding:9px 12px;border:0.5px solid var(--border);border-radius:var(--radius);font-size:13px;background:var(--surface);color:var(--text);font-family:inherit;outline:none}
input:focus,select:focus,textarea:focus{border-color:var(--green);box-shadow:0 0 0 3px rgba(29,158,117,0.1)}
label{display:block;font-size:12px;font-weight:500;color:var(--text-muted);margin-bottom:5px}
.form-row{display:flex;gap:10px;align-items:flex-end}
.form-row>*{flex:1}
.form-row>.btn{flex:0 0 auto}
.field{margin-bottom:16px}

.section-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.section-title{font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em}
.section-actions{display:flex;gap:8px;align-items:center}

/* Domain cards */
.domain-card{background:var(--surface);border:0.5px solid var(--border);border-radius:var(--radius-lg);padding:14px 16px;display:flex;align-items:flex-start;gap:12px;transition:border-color 0.15s;margin-bottom:10px}
.domain-card.selected{border-color:var(--green);background:var(--green-light)}
.domain-card.status-expired{border-color:var(--red)}
.domain-card.status-expiring{border-color:var(--amber)}
.domain-checkbox{width:16px;height:16px;cursor:pointer;accent-color:var(--green);flex-shrink:0;margin-top:2px}
.domain-icon{width:34px;height:34px;border-radius:var(--radius);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.icon-green{background:var(--green-light);color:var(--green)}
.icon-amber{background:var(--amber-light);color:var(--amber)}
.icon-red{background:var(--red-light);color:var(--red)}
.domain-body{flex:1;min-width:0}
.domain-name{font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.domain-meta{font-size:12px;color:var(--text-muted);margin-top:2px}
.domain-thresholds{margin-top:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.threshold-label{font-size:11px;color:var(--text-muted);white-space:nowrap}
.domain-actions{display:flex;align-items:center;gap:6px;flex-shrink:0;margin-top:1px}

/* Threshold pills */
.threshold-pills{display:flex;gap:6px;flex-wrap:wrap}
.threshold-pill{padding:4px 11px;border:0.5px solid var(--border);border-radius:20px;font-size:12px;cursor:pointer;background:var(--surface);color:var(--text-muted);font-family:inherit;transition:all 0.1s}
.threshold-pill.selected{background:var(--green);color:#fff;border-color:var(--green)}
.threshold-pill:hover:not(.selected){background:var(--gray-light)}

/* Fuzzy results */
.fuzzy-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(165px,1fr));gap:8px;margin-top:12px}
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
.spinner{display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,0.4);border-top-color:#fff;border-radius:50%;animation:spin 0.6s linear infinite;vertical-align:middle}
.spinner-dark{border-color:var(--border);border-top-color:var(--green)}
@keyframes spin{to{transform:rotate(360deg)}}

/* Toast */
.toast-wrap{position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:8px}
.toast{padding:12px 16px;border-radius:var(--radius-lg);font-size:13px;font-weight:500;border:0.5px solid;animation:slideUp 0.2s ease;max-width:320px}
.toast-success{background:var(--green-light);color:var(--green-dark);border-color:var(--green)}
.toast-error{background:var(--red-light);color:var(--red-dark);border-color:var(--red)}
@keyframes slideUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}

/* Stats */
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:20px}
.stat{background:var(--surface);border:0.5px solid var(--border);border-radius:var(--radius-lg);padding:14px 16px;text-align:center}
.stat-num{font-size:24px;font-weight:600;line-height:1.2}
.stat-label{font-size:11px;color:var(--text-muted);margin-top:4px}
.stat-num.green{color:var(--green)}
.stat-num.amber{color:var(--amber)}
.stat-num.red{color:var(--red)}

/* Scan history */
.scan-item{padding:12px 14px;background:var(--surface);border:0.5px solid var(--border);border-radius:var(--radius-lg);display:flex;align-items:center;gap:10px;cursor:pointer;margin-bottom:8px}
.scan-item:hover{background:var(--gray-light)}
.scan-domain{font-weight:600;font-size:13px;flex:1}
.scan-meta{font-size:12px;color:var(--text-muted)}

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
.settings-section-title{font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:14px;padding-bottom:8px;border-bottom:0.5px solid var(--border)}
.provider-status{display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:var(--radius);border:0.5px solid var(--border);font-size:13px;margin-bottom:16px}
.provider-dot{width:8px;height:8px;border-radius:50%;background:var(--gray)}
.provider-dot.active{background:var(--green)}

/* Inline threshold editor on card */
.threshold-editor{background:var(--gray-light);border-radius:var(--radius);padding:10px 12px;margin-top:8px;display:none}
.threshold-editor.open{display:block}
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
      <span id="providerStatusBadge" class="badge badge-gray" style="font-size:11px"></span>
      <button class="logout-btn" onclick="logout()">Sign out</button>
    </div>
  </div>

  <div class="tabs" role="tablist">
    <button class="tab active" role="tab" onclick="switchTab('monitor')" id="tab-monitor">&#x1F6E1; Monitor</button>
    <button class="tab" role="tab" onclick="switchTab('fuzzy')" id="tab-fuzzy">&#x1F50D; Fuzzy finder</button>
    <button class="tab" role="tab" onclick="switchTab('alerts')" id="tab-alerts">&#x1F514; Alerts</button>
    <button class="tab" role="tab" onclick="switchTab('settings')" id="tab-settings">&#x2699; Settings</button>
  </div>

  <div class="content">

    <!-- MONITOR -->
    <div id="panel-monitor" class="panel active">
      <div class="stats" id="monitorStats"></div>

      <div class="section-header">
        <span class="section-title">Add domain</span>
      </div>
      <div class="card" style="margin-bottom:20px">
        <div class="form-row" style="align-items:flex-start;flex-wrap:wrap;gap:12px">
          <div style="flex:1;min-width:200px">
            <label for="addDomainInput">Domain name</label>
            <input type="text" id="addDomainInput" placeholder="e.g. example.com" autocomplete="off" spellcheck="false">
          </div>
          <div style="flex:2;min-width:220px">
            <label>Alert thresholds — days before expiry</label>
            <div class="threshold-pills" id="addThresholds">
              <button class="threshold-pill selected" data-days="90" type="button">90d</button>
              <button class="threshold-pill selected" data-days="60" type="button">60d</button>
              <button class="threshold-pill selected" data-days="30" type="button">30d</button>
              <button class="threshold-pill selected" data-days="14" type="button">14d</button>
              <button class="threshold-pill selected" data-days="7" type="button">7d</button>
            </div>
          </div>
          <div style="flex:0 0 auto;margin-top:20px">
            <button class="btn btn-primary" id="addDomainBtn" onclick="addDomain()">
              <span id="addDomainSpinner" class="spinner hidden"></span>
              Add &amp; check
            </button>
          </div>
        </div>
        <div style="margin-top:10px;font-size:12px;color:var(--text-muted)">
          Need to add several at once? <a href="#" onclick="openBulkModal();return false">Bulk add</a>
        </div>
      </div>

      <div class="section-header">
        <span class="section-title">Monitored domains</span>
        <div class="section-actions">
          <label style="margin:0;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:5px;color:var(--text-muted)">
            <input type="checkbox" id="selectAllDomains" onchange="toggleSelectAll(this.checked)" style="width:auto;accent-color:var(--green)"> Select all
          </label>
        </div>
      </div>

      <div class="bulk-bar" id="domainBulkBar">
        <span class="bulk-count" id="domainBulkCount">0 selected</span>
        <button class="btn btn-sm btn-danger" onclick="bulkDeleteDomains()">Delete selected</button>
        <button class="btn btn-sm" onclick="clearDomainSelection()">Cancel</button>
      </div>

      <div id="domainList">
        <div class="empty"><div class="empty-icon">&#x1F310;</div><p>No domains monitored yet.</p><p style="margin-top:8px;font-size:12px">Add your first domain above.</p></div>
      </div>
    </div>

    <!-- FUZZY FINDER -->
    <div id="panel-fuzzy" class="panel">
      <div class="card" style="margin-bottom:20px">
        <div class="form-row">
          <div>
            <label for="fuzzyInput">Domain to scan</label>
            <input type="text" id="fuzzyInput" placeholder="e.g. mycompany.com" autocomplete="off" spellcheck="false">
          </div>
          <button class="btn btn-primary" id="fuzzyScanBtn" onclick="runFuzzyScan()" style="margin-top:20px">
            <span id="fuzzySpinner" class="spinner hidden"></span>
            Scan
          </button>
        </div>
        <div style="margin-top:8px;font-size:12px;color:var(--text-muted)">
          Checks alternate TLDs and typo variants via live DNS. Results are saved to history.
        </div>
      </div>

      <div id="fuzzyResults"></div>

      <div class="section-header" style="margin-top:24px">
        <span class="section-title">Scan history</span>
        <span id="fuzzyScanCount" class="badge badge-gray"></span>
      </div>
      <div id="fuzzyHistory">
        <div class="empty"><div class="empty-icon">&#x1F50D;</div><p>No scans yet.</p></div>
      </div>
    </div>

    <!-- ALERTS -->
    <div id="panel-alerts" class="panel">
      <div class="section-header">
        <span class="section-title">Alert history</span>
        <button class="btn btn-sm" onclick="loadAlerts()">&#x21BB; Refresh</button>
      </div>
      <div id="alertsList">
        <div class="empty"><div class="empty-icon">&#x1F514;</div><p>No alerts sent yet.</p></div>
      </div>
    </div>

    <!-- SETTINGS -->
    <div id="panel-settings" class="panel">

      <div class="settings-section">
        <div class="settings-section-title">Email provider</div>
        <div id="providerInfo"></div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:4px">
          Provider is auto-detected from whichever API key secret is set (RESEND_API_KEY, MAILGUN_API_KEY, or SENDGRID_API_KEY).
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">Email addresses</div>
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
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-primary" onclick="saveSettings()">Save settings</button>
          <button class="btn" id="testEmailBtn" onclick="sendTestEmail()">Send test email</button>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">Current limits (from wrangler.toml)</div>
        <div id="limitsDisplay" style="font-size:13px;color:var(--text-muted);line-height:2.2"></div>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">Security posture</div>
        <div style="font-size:13px;color:var(--text-muted);line-height:2">
          &#x2714; Password stored as Cloudflare secret (APP_PASSWORD)<br>
          &#x2714; Session tokens HMAC-signed (SESSION_SECRET)<br>
          &#x2714; HttpOnly / Secure / SameSite=Strict cookies<br>
          &#x2714; CSRF protection on all state-changing requests<br>
          &#x2714; Rate limiting per IP (general + lookup)<br>
          &#x2714; Content Security Policy headers on all responses<br>
          &#x2714; Input validation and output encoding<br>
          &#x2714; Constant-time password comparison
        </div>
      </div>
    </div>

  </div>
</div>

<!-- Bulk Add Modal -->
<div class="modal-overlay hidden" id="bulkModal" onclick="if(event.target===this)closeBulkModal()">
  <div class="modal">
    <div class="modal-title">Bulk add domains</div>
    <div class="field">
      <label>Paste domains, one per line</label>
      <textarea id="bulkDomainsInput" rows="8" placeholder="example.com&#10;mysite.io&#10;anotherdomain.net" style="font-family:monospace;resize:vertical"></textarea>
    </div>
    <div class="field">
      <label>Alert thresholds</label>
      <div class="threshold-pills" id="bulkThresholds">
        <button class="threshold-pill selected" data-days="90" type="button">90d</button>
        <button class="threshold-pill selected" data-days="60" type="button">60d</button>
        <button class="threshold-pill selected" data-days="30" type="button">30d</button>
        <button class="threshold-pill selected" data-days="14" type="button">14d</button>
        <button class="threshold-pill selected" data-days="7" type="button">7d</button>
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
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Request failed (' + r.status + ')');
  return data;
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
  setTimeout(() => t.remove(), 4000);
}

// ── Logout ─────────────────────────────────────────────────────────────────
async function logout() {
  await fetch('/auth/logout', {method:'POST'});
  window.location.href = '/';
}

// ── Threshold pills (generic, works for any container) ──────────────────────
document.addEventListener('click', e => {
  if (e.target.classList.contains('threshold-pill')) {
    e.target.classList.toggle('selected');
  }
});

function getSelectedThresholds(containerId) {
  return [...document.querySelectorAll('#'+containerId+' .threshold-pill.selected')]
    .map(el => parseInt(el.dataset.days));
}

// ── Monitor ────────────────────────────────────────────────────────────────
let allDomains = [];
let selectedDomainIds = new Set();

async function loadDomains() {
  try {
    const domains = await api('GET', '/api/domains');
    if (!domains) return;
    allDomains = domains;
    renderDomains();
    renderStats();
  } catch(e) { toast('Failed to load domains: ' + e.message, 'error'); }
}

function renderStats() {
  const total = allDomains.length;
  const expired = allDomains.filter(d => d.expiresAt && daysLeft(d.expiresAt) <= 0).length;
  const expiring = allDomains.filter(d => d.expiresAt && daysLeft(d.expiresAt) > 0 && daysLeft(d.expiresAt) <= 30).length;
  const healthy = total - expired - expiring;
  document.getElementById('monitorStats').innerHTML =
    stat(total, 'Monitored', '') +
    stat(healthy, 'Healthy', 'green') +
    stat(expiring, 'Expiring soon', 'amber') +
    stat(expired, 'Expired', 'red');
}

function stat(num, label, cls) {
  return '<div class="stat"><div class="stat-num ' + cls + '">' + num + '</div><div class="stat-label">' + label + '</div></div>';
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
  const sorted = [...allDomains].sort((a, b) => {
    const da = a.expiresAt ? daysLeft(a.expiresAt) : 9999;
    const db = b.expiresAt ? daysLeft(b.expiresAt) : 9999;
    return da - db;
  });
  list.innerHTML = sorted.map(d => domainCard(d)).join('');
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function domainCard(d) {
  const days = d.expiresAt ? daysLeft(d.expiresAt) : null;
  const isExpired = days !== null && days <= 0;
  const isExpiring = days !== null && days > 0 && days <= 30;
  const iconClass = isExpired ? 'icon-red' : isExpiring ? 'icon-amber' : 'icon-green';
  const cardStatus = isExpired ? 'status-expired' : isExpiring ? 'status-expiring' : '';
  const isSelected = selectedDomainIds.has(d.id);
  const id = d.id;

  let badge = '';
  if (days === null) badge = '<span class="badge badge-gray">Expiry unknown</span>';
  else if (isExpired) badge = '<span class="badge badge-red">Expired ' + Math.abs(days) + 'd ago</span>';
  else if (days <= 7) badge = '<span class="badge badge-red">' + days + 'd left</span>';
  else if (days <= 30) badge = '<span class="badge badge-amber">' + days + 'd left</span>';
  else badge = '<span class="badge badge-green">' + days + 'd left</span>';

  const expiry = d.expiresAt
    ? new Date(d.expiresAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})
    : 'Expiry date unavailable \u2014 click refresh to retry';
  const registrarHtml = d.registrar ? ' &middot; ' + esc(d.registrar) : '';
  const lastChecked = d.lastChecked
    ? ' &middot; Checked ' + new Date(d.lastChecked).toLocaleDateString('en-GB',{day:'numeric',month:'short'})
    : '';

  const allThresholds = [90,60,30,14,7];
  const pills = allThresholds.map(t =>
    '<button class="threshold-pill' + (d.alertThresholds.includes(t)?' selected':'') +
    '" data-days="' + t + '" type="button">' + t + 'd</button>'
  ).join('');

  // All user-supplied data is in data-* attributes only — no interpolation inside event handler strings
  return [
    '<div class="domain-card ' + cardStatus + (isSelected?' selected':'') + '" id="dc-' + id + '" data-id="' + id + '">',
      '<input type="checkbox" class="domain-checkbox" ' + (isSelected?'checked':'') + ' data-action="select" data-id="' + id + '" title="Select">',
      '<div class="domain-icon ' + iconClass + '">&#x1F310;</div>',
      '<div class="domain-body">',
        '<div class="domain-name">' + esc(d.domain) + '</div>',
        '<div class="domain-meta">' + (d.expiresAt ? 'Expires ' + expiry : expiry) + registrarHtml + lastChecked + '</div>',
        '<div class="domain-thresholds">',
          '<span class="threshold-label">Alert at:</span>',
          badge,
          '<button class="btn btn-sm" style="font-size:11px;padding:3px 8px" data-action="edit-thresholds" data-id="' + id + '" type="button">Edit alerts</button>',
        '</div>',
        '<div class="threshold-editor" id="te-' + id + '">',
          '<div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Alert when domain expires within:</div>',
          '<div class="threshold-pills" id="tp-' + id + '">' + pills + '</div>',
          '<div style="margin-top:8px;display:flex;gap:6px">',
            '<button class="btn btn-sm btn-primary" data-action="save-thresholds" data-id="' + id + '" type="button">Save</button>',
            '<button class="btn btn-sm" data-action="cancel-thresholds" data-id="' + id + '" type="button">Cancel</button>',
          '</div>',
        '</div>',
      '</div>',
      '<div class="domain-actions">',
        badge,
        '<button class="btn-icon" title="Refresh RDAP data" data-action="refresh" data-id="' + id + '" type="button">&#x21BB;</button>',
        '<button class="btn-icon" title="Fuzzy scan" data-action="fuzzy" data-id="' + id + '" type="button">&#x1F50D;</button>',
        '<button class="btn-icon" title="Delete" data-action="delete" data-id="' + id + '" type="button">&#x1F5D1;</button>',
      '</div>',
    '</div>'
  ].join('');
}

// Event delegation for all domain card actions — avoids any user data in onclick strings
document.addEventListener('click', function(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  if (action === 'select') {
    toggleDomainSelect(id, btn.checked);
  } else if (action === 'edit-thresholds') {
    const el = document.getElementById('te-' + id);
    if (el) el.classList.toggle('open');
  } else if (action === 'cancel-thresholds') {
    const el = document.getElementById('te-' + id);
    if (el) el.classList.remove('open');
  } else if (action === 'save-thresholds') {
    saveThresholds(id);
  } else if (action === 'refresh') {
    refreshDomain(id, btn);
  } else if (action === 'fuzzy') {
    const domain = allDomains.find(d => d.id === id);
    if (domain) quickFuzzyScan(domain.domain);
  } else if (action === 'delete') {
    deleteDomain(id);
  } else if (action === 'rescan') {
    const domain = btn.dataset.domain;
    if (domain) { document.getElementById('fuzzyInput').value = domain; runFuzzyScan(); }
  }
});

async function saveThresholds(id) {
  const thresholds = getSelectedThresholds('tp-' + id);
  try {
    const updated = await api('PUT', '/api/domains/' + id + '/thresholds', {thresholds});
    if (!updated) return;
    allDomains = allDomains.map(d => d.id === id ? updated : d);
    renderDomains();
    toast('Alert thresholds updated');
  } catch(e) { toast(e.message, 'error'); }
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
  document.getElementById('domainBulkCount').textContent = count + ' selected';
}

async function addDomain() {
  const input = document.getElementById('addDomainInput');
  const domain = input.value.trim();
  if (!domain) return;
  const thresholds = getSelectedThresholds('addThresholds');
  const btn = document.getElementById('addDomainBtn');
  const spinner = document.getElementById('addDomainSpinner');
  btn.disabled = true;
  spinner.classList.remove('hidden');
  try {
    const result = await api('POST', '/api/domains', {domain, alertThresholds: thresholds});
    if (!result) return;
    allDomains.push(result);
    renderDomains();
    renderStats();
    input.value = '';
    if (!result.expiresAt) {
      toast('Domain added — expiry lookup returned no data (check the domain is registered)', 'error');
    } else {
      toast('Domain added and checked');
    }
  } catch(e) { toast(e.message, 'error'); }
  btn.disabled = false;
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
  if (!confirm('Delete ' + ids.length + ' domain(s) from monitoring?')) return;
  try {
    await api('POST', '/api/domains/bulk-delete', {ids});
    allDomains = allDomains.filter(d => !ids.includes(d.id));
    selectedDomainIds.clear();
    renderDomains();
    renderStats();
    updateBulkBar();
    document.getElementById('selectAllDomains').checked = false;
    toast(ids.length + ' domain(s) deleted');
  } catch(e) { toast(e.message, 'error'); }
}

async function refreshDomain(id, btn) {
  if (btn) btn.disabled = true;
  try {
    const updated = await api('POST', '/api/domains/'+id+'/refresh');
    if (!updated) return;
    allDomains = allDomains.map(d => d.id === id ? updated : d);
    renderDomains();
    renderStats();
    toast(updated.expiresAt ? 'Domain data refreshed' : 'Refresh complete — expiry data unavailable for this domain');
  } catch(e) { toast(e.message, 'error'); }
  btn.disabled = false;
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
    toast(added + ' domain(s) added' + (results.length > added ? ', some skipped (duplicates or invalid)' : ''));
    document.getElementById('bulkDomainsInput').value = '';
  } catch(e) { toast(e.message, 'error'); }
}

// ── Fuzzy Finder ──────────────────────────────────────────────────────────
let fuzzyScans = [];
let currentScanId = null;

async function loadFuzzyHistory() {
  try {
    const scans = await api('GET', '/api/fuzzy');
    if (!scans) return;
    fuzzyScans = scans;
    renderFuzzyHistory();
    // Re-show last active scan if still in list
    if (currentScanId) {
      const scan = fuzzyScans.find(s => s.id === currentScanId);
      if (scan) renderFuzzyResults(scan);
    }
  } catch(e) { toast('Failed to load scan history', 'error'); }
}

function renderFuzzyHistory() {
  const el = document.getElementById('fuzzyHistory');
  const countEl = document.getElementById('fuzzyScanCount');
  countEl.textContent = fuzzyScans.length + ' scan' + (fuzzyScans.length === 1 ? '' : 's');
  if (!fuzzyScans.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">&#x1F50D;</div><p>No scans yet.</p></div>';
    return;
  }
  el.innerHTML = fuzzyScans.map(s => {
    const reg = s.results.filter(r => r.registered === true).length;
    const avail = s.results.filter(r => r.registered === false).length;
    const unk = s.results.filter(r => r.registered === null).length;
    const date = new Date(s.scannedAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
    return '<div class="scan-item" onclick="showFuzzyScan(\'' + s.id + '\')">' +
      '<span>&#x1F50D;</span>' +
      '<span class="scan-domain">' + esc(s.baseDomain) + '</span>' +
      '<span class="badge badge-red" style="font-size:11px">' + reg + ' taken</span>' +
      '<span class="badge badge-green" style="font-size:11px">' + avail + ' free</span>' +
      (unk ? '<span class="badge badge-gray" style="font-size:11px">' + unk + ' unknown</span>' : '') +
      '<span class="scan-meta">' + date + '</span>' +
      '<button class="btn-icon btn-sm" title="Rescan this domain" data-action="rescan" data-domain="' + esc(s.baseDomain) + '" type="button">&#x21BB;</button>' +
      '<button class="btn-icon btn-sm" title="Delete scan" onclick="deleteScan(event,\'' + s.id + '\')" type="button">&#x1F5D1;</button>' +
    '</div>';
  }).join('');
}



async function deleteScan(e, id) {
  e.stopPropagation();
  if (!confirm('Delete this scan from history?')) return;
  try {
    await api('DELETE', '/api/fuzzy/'+id);
    fuzzyScans = fuzzyScans.filter(s => s.id !== id);
    if (currentScanId === id) {
      currentScanId = null;
      document.getElementById('fuzzyResults').innerHTML = '';
    }
    renderFuzzyHistory();
    toast('Scan deleted');
  } catch(e) { toast(e.message, 'error'); }
}

function showFuzzyScan(id) {
  const scan = fuzzyScans.find(s => s.id === id);
  if (!scan) return;
  currentScanId = id;
  renderFuzzyResults(scan);
  document.getElementById('fuzzyInput').value = scan.baseDomain;
  window.scrollTo({top:0, behavior:'smooth'});
}

async function runFuzzyScan() {
  const domain = document.getElementById('fuzzyInput').value.trim();
  if (!domain) return;
  const btn = document.getElementById('fuzzyScanBtn');
  const spinner = document.getElementById('fuzzySpinner');
  btn.disabled = true;
  spinner.classList.remove('hidden');
  document.getElementById('fuzzyResults').innerHTML =
    '<div style="text-align:center;padding:40px;color:var(--text-muted)">' +
    '<div class="spinner spinner-dark" style="width:24px;height:24px;margin:0 auto 14px"></div>' +
    '<p style="font-size:13px">Scanning DNS for variants of <strong>' + esc(domain) + '</strong></p>' +
    '<p style="font-size:12px;margin-top:6px;color:var(--text-hint)">Checking TLDs and typo variants — may take 15-30 seconds...</p>' +
    '</div>';
  try {
    const scan = await api('POST', '/api/fuzzy', {domain});
    if (!scan) return;
    currentScanId = scan.id;
    // Update or prepend in history
    const idx = fuzzyScans.findIndex(s => s.id === scan.id);
    if (idx >= 0) fuzzyScans[idx] = scan;
    else fuzzyScans = [scan, ...fuzzyScans];
    renderFuzzyHistory();
    renderFuzzyResults(scan);
  } catch(e) {
    toast(e.message, 'error');
    document.getElementById('fuzzyResults').innerHTML = '';
  }
  btn.disabled = false;
  spinner.classList.add('hidden');
}

function renderFuzzyResults(scan) {
  const registered = scan.results.filter(r => r.registered === true);
  const available = scan.results.filter(r => r.registered === false);
  const unknown = scan.results.filter(r => r.registered === null);
  const date = new Date(scan.scannedAt).toLocaleString('en-GB');

  const typeLabel = t => ({'tld':'TLD','typo-swap':'swap','typo-drop':'drop','typo-double':'double','typo-hyphen':'hyphen','typo-homoglyph':'homoglyph'}[t] || t);

  const renderGroup = (items, cls) => items.map(v =>
    '<div class="fuzzy-item ' + cls + '">' +
    '<div class="fi-top"><span class="fi-name" title="' + esc(v.domain) + '">' + esc(v.domain) + '</span>' +
    '<span class="dot ' + (cls==='registered'?'dot-red':cls==='available'?'dot-green':'dot-gray') + '"></span></div>' +
    '<div class="fi-tags"><span class="fi-tag ' + (v.type==='tld'?'tag-tld':'tag-typo') + '">' + typeLabel(v.type) + '</span></div>' +
    '</div>'
  ).join('');

  document.getElementById('fuzzyResults').innerHTML =
    '<div class="card">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px">' +
      '<div>' +
        '<span style="font-size:15px;font-weight:600">' + esc(scan.baseDomain) + '</span>' +
        '<span style="font-size:12px;color:var(--text-muted);margin-left:10px">scanned ' + date + '</span>' +
      '</div>' +
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
        '<span class="badge badge-red">' + registered.length + ' taken</span>' +
        '<span class="badge badge-green">' + available.length + ' free</span>' +
        (unknown.length ? '<span class="badge badge-gray">' + unknown.length + ' unknown</span>' : '') +
        '<button class="btn btn-sm" data-action="rescan" data-domain="' + esc(scan.baseDomain) + '" type="button">&#x21BB; Rescan</button>' +
      '</div>' +
    '</div>' +
    (registered.length ? '<div style="font-size:11px;font-weight:600;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.06em">Registered (taken)</div><div class="fuzzy-grid">' + renderGroup(registered,'registered') + '</div>' : '') +
    (available.length ? '<div style="font-size:11px;font-weight:600;color:var(--text-muted);margin:14px 0 6px;text-transform:uppercase;letter-spacing:0.06em">Available</div><div class="fuzzy-grid">' + renderGroup(available,'available') + '</div>' : '') +
    (unknown.length ? '<div style="font-size:11px;font-weight:600;color:var(--text-muted);margin:14px 0 6px;text-transform:uppercase;letter-spacing:0.06em">Unknown (DNS error — rescan to retry)</div><div class="fuzzy-grid">' + renderGroup(unknown,'') + '</div>' : '') +
    '<div class="legend">' +
      '<div class="leg-item"><span class="dot dot-red"></span> Taken</div>' +
      '<div class="leg-item"><span class="dot dot-green"></span> Available</div>' +
      '<div class="leg-item"><span class="dot dot-gray"></span> Unknown</div>' +
    '</div>' +
    '</div>';
}

// ── Alerts ────────────────────────────────────────────────────────────────
async function loadAlerts() {
  try {
    const alerts = await api('GET', '/api/alerts');
    if (!alerts) return;
    const el = document.getElementById('alertsList');
    if (!alerts.length) {
      el.innerHTML = '<div class="empty"><div class="empty-icon">&#x1F514;</div><p>No alerts sent yet.</p></div>';
      return;
    }
    el.innerHTML = alerts.map(a => {
      const icon = a.type === 'expired' ? '&#x1F6AB;' : a.daysRemaining <= 7 ? '&#x26A0;' : '&#x1F514;';
      const badgeCls = a.type === 'expired' ? 'badge-red' : a.daysRemaining <= 14 ? 'badge-amber' : 'badge-green';
      const msg = a.type === 'expired' ? 'Domain has expired' : 'Expires in ' + a.daysRemaining + ' days';
      const date = new Date(a.sentAt).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
      return '<div class="alert-item">' +
        '<div class="alert-icon">' + icon + '</div>' +
        '<div class="alert-body">' +
          '<div class="alert-domain">' + esc(a.domain) + '</div>' +
          '<div class="alert-msg">' + msg + ' &middot; via ' + esc(a.emailProvider) + ' &middot; ' + (a.success ? '&#x2714; sent' : '&#x2716; failed') + '</div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">' +
          '<span class="badge ' + badgeCls + '" style="font-size:11px">' + (a.type==='expired'?'expired':a.daysRemaining+'d') + '</span>' +
          '<span class="alert-time">' + date + '</span>' +
        '</div>' +
      '</div>';
    }).join('');
  } catch(e) { toast('Failed to load alerts', 'error'); }
}

// ── Settings ──────────────────────────────────────────────────────────────
async function loadSettings() {
  try {
    const s = await api('GET', '/api/settings');
    if (!s) return;
    document.getElementById('emailFrom').value = s.emailFrom || '';
    document.getElementById('emailTo').value = s.emailTo || '';
    document.getElementById('subjectPrefix').value = s.emailSubjectPrefix || '';

    const providerLabels = {resend:'Resend',mailgun:'Mailgun',sendgrid:'SendGrid',none:'None configured'};
    const label = providerLabels[s.emailProvider] || s.emailProvider;
    const isActive = s.emailProvider !== 'none';

    document.getElementById('providerInfo').innerHTML =
      '<div class="provider-status">' +
      '<span class="provider-dot ' + (isActive?'active':'') + '"></span>' +
      '<strong>' + label + '</strong>' +
      (isActive ? '' : ' &mdash; set an API key secret to enable') +
      '</div>';

    // Update topbar badge — plain text, no HTML entities
    document.getElementById('providerStatusBadge').textContent =
      isActive ? ('Email: ' + label) : 'No email';
    document.getElementById('providerStatusBadge').className =
      'badge ' + (isActive ? 'badge-green' : 'badge-gray');

    document.getElementById('limitsDisplay').innerHTML = [
      ['Max monitored domains', s.maxMonitoredDomains],
      ['Max fuzzy scan history', s.maxFuzzyHistory],
      ['Default alert thresholds', s.defaultThresholds + ' days'],
      ['Fuzzy TLDs checked', s.fuzzyTlds],
    ].map(([k,v]) => '<div><strong>' + k + ':</strong> ' + esc(String(v)) + '</div>').join('');
  } catch(e) { toast('Failed to load settings', 'error'); }
}

async function saveSettings() {
  try {
    await api('PUT', '/api/settings', {
      emailFrom: document.getElementById('emailFrom').value,
      emailTo: document.getElementById('emailTo').value,
      emailSubjectPrefix: document.getElementById('subjectPrefix').value,
    });
    toast('Settings saved');
    loadSettings(); // refresh provider badge
  } catch(e) { toast(e.message, 'error'); }
}

async function sendTestEmail() {
  const btn = document.getElementById('testEmailBtn');
  btn.disabled = true;
  btn.textContent = 'Sending...';
  try {
    const r = await api('POST', '/api/settings/test-email');
    if (r) toast('Test email sent via ' + r.provider + ' — check your inbox');
  } catch(e) { toast(e.message, 'error'); }
  btn.disabled = false;
  btn.textContent = 'Send test email';
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
