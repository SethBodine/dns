export function renderApp(csrfToken: string): string {
  return `<!DOCTYPE html>
<html lang="en">
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
        <div class="field" style="margin-top:12px">
          <label for="providerSelect">Active provider</label>
          <select id="providerSelect">
            <option value="">Loading...</option>
          </select>
        </div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:4px">
          Providers are auto-detected from secrets set in Cloudflare (RESEND_API_KEY, MAILGUN_API_KEY, SENDGRID_API_KEY). Select which one to use for alerts.
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

<script>const CSRF=${JSON.stringify(csrfToken)};</script>
<script src="/app.js"></script>
</body>
</html>`;
}
