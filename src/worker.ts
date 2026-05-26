import type { Env, MonitoredDomain, FuzzyScanResult, FuzzyVariant } from "./types";
import {
  verifySession, createSessionToken, verifyPassword,
  checkRateLimit, getClientIp, secureHeaders,
  jsonResponse, errorResponse, checkCsrf, generateCsrfToken,
  validateDomain, sanitizeText, parseJsonBody,
} from "./security";
import { lookupDomainExpiry, isDomainRegistered, generateFuzzyVariants, daysUntilExpiry, shouldAlert } from "./lookup";
import { sendEmail, getEmailSettings, detectEmailProvider, buildExpiryEmail } from "./email";
import {
  getAllDomains, getDomain, saveDomain, deleteDomain, deleteDomains,
  saveFuzzyScan, getAllFuzzyScans, deleteFuzzyScan,
  getRecentAlerts, saveAlert, getSettings, saveSettings,
} from "./kv";
import { renderApp } from "./ui";

export default {
  // ─── HTTP Handler ──────────────────────────────────────────────────────────
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const ip = getClientIp(request);

    // Rate limit all requests
    const allowed = await checkRateLimit(env, ip, "general");
    if (!allowed) {
      return new Response("Too many requests", {
        status: 429,
        headers: secureHeaders({ "Retry-After": "60" }),
      });
    }

    // Serve static assets
    if (path === "/" || path === "/app") {
      const authed = await verifySession(request, env);
      if (!authed) return serveLogin();
      const csrfToken = await generateCsrfToken(
        request.headers.get("Cookie")?.match(/dw_session=([^;]+)/)?.[1] || "",
        env
      );
      return new Response(renderApp(csrfToken), {
        headers: secureHeaders({ "Content-Type": "text/html; charset=utf-8" }),
      });
    }

    // ─── Auth endpoints ──────────────────────────────────────────────────────
    if (path === "/auth/login" && method === "POST") {
      return handleLogin(request, env, ip);
    }
    if (path === "/auth/logout" && method === "POST") {
      return handleLogout();
    }

    // ─── All other routes require auth ────────────────────────────────────────
    const authed = await verifySession(request, env);
    if (!authed) return errorResponse("Unauthorized", 401);

    // CSRF check for state-changing requests
    if (["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
      const csrfOk = checkCsrf(request);
      if (!csrfOk) return errorResponse("CSRF check failed", 403);
    }

    // ─── Domain Monitor API ──────────────────────────────────────────────────
    if (path === "/api/domains" && method === "GET") {
      return handleGetDomains(env);
    }
    if (path === "/api/domains" && method === "POST") {
      return handleAddDomain(request, env, ip);
    }
    if (path.match(/^\/api\/domains\/[^/]+$/) && method === "DELETE") {
      const id = path.split("/")[3];
      return handleDeleteDomain(env, id);
    }
    if (path === "/api/domains/bulk-delete" && method === "POST") {
      return handleBulkDeleteDomains(request, env);
    }
    if (path === "/api/domains/bulk-monitor" && method === "POST") {
      return handleBulkMonitor(request, env);
    }
    if (path.match(/^\/api\/domains\/[^/]+\/refresh$/) && method === "POST") {
      const id = path.split("/")[3];
      return handleRefreshDomain(env, id, ip);
    }
    if (path.match(/^\/api\/domains\/[^/]+\/thresholds$/) && method === "PUT") {
      const id = path.split("/")[3];
      return handleUpdateThresholds(request, env, id);
    }

    // ─── Fuzzy Finder API ────────────────────────────────────────────────────
    if (path === "/api/fuzzy" && method === "GET") {
      return handleGetFuzzyScans(env);
    }
    if (path === "/api/fuzzy" && method === "POST") {
      return handleRunFuzzyScan(request, env, ip);
    }
    if (path.match(/^\/api\/fuzzy\/[^/]+$/) && method === "DELETE") {
      const id = path.split("/")[3];
      await deleteFuzzyScan(env, id);
      return jsonResponse({ ok: true });
    }

    // ─── Alerts API ──────────────────────────────────────────────────────────
    if (path === "/api/alerts" && method === "GET") {
      const alerts = await getRecentAlerts(env);
      return jsonResponse(alerts);
    }

    // ─── Settings API ────────────────────────────────────────────────────────
    if (path === "/api/settings" && method === "GET") {
      return handleGetSettings(env);
    }
    if (path === "/api/settings" && method === "PUT") {
      return handleSaveSettings(request, env);
    }

    return new Response("Not found", { status: 404, headers: secureHeaders() });
  },

  // ─── Cron Handler (daily domain checks) ───────────────────────────────────
  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    const domains = await getAllDomains(env);
    const settings = await getEmailSettings(env);

    for (const domain of domains) {
      try {
        // Refresh expiry data
        const { expiresAt, registrar } = await lookupDomainExpiry(domain.domain);
        const updated: MonitoredDomain = {
          ...domain,
          expiresAt: expiresAt ?? domain.expiresAt,
          registrar: registrar ?? domain.registrar,
          lastChecked: new Date().toISOString(),
        };

        // Determine which alerts to send
        const toAlert = shouldAlert(updated);

        for (const threshold of toAlert) {
          if (!settings.emailTo) continue;
          const days = updated.expiresAt ? daysUntilExpiry(updated.expiresAt) : 0;
          const { subject, html, text } = buildExpiryEmail(
            domain.domain, days, updated.expiresAt!, settings.emailSubjectPrefix
          );
          const success = await sendEmail({
            to: settings.emailTo,
            from: settings.emailFrom,
            subject,
            html,
            text,
          }, env);

          await saveAlert(env, {
            id: crypto.randomUUID(),
            domain: domain.domain,
            type: days <= 0 ? "expired" : "expiry-warning",
            daysRemaining: days,
            sentAt: new Date().toISOString(),
            emailProvider: detectEmailProvider(env),
            success,
          });

          if (success) updated.alertsSent = [...updated.alertsSent, threshold];
        }

        await saveDomain(env, updated);
      } catch (e) {
        console.error(`Cron: failed to process ${domain.domain}`, e);
      }
    }
  },
};

// ─── Route Handlers ───────────────────────────────────────────────────────────

function serveLogin(): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Domain Watch — Login</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f5f5f3;color:#1a1a1a}
.card{background:#fff;border:0.5px solid #ddd;border-radius:12px;padding:40px;width:100%;max-width:360px}
.logo{display:flex;align-items:center;gap:10px;margin-bottom:32px}
.logo svg{color:#1D9E75}
h1{font-size:20px;font-weight:600}
.sub{font-size:13px;color:#888;margin-top:4px}
label{display:block;font-size:13px;font-weight:500;margin-bottom:6px;margin-top:20px}
input[type=password]{width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;outline:none;transition:border 0.15s}
input[type=password]:focus{border-color:#1D9E75}
button{margin-top:24px;width:100%;padding:11px;background:#1D9E75;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer}
button:hover{background:#0F6E56}
.error{margin-top:12px;padding:10px 12px;background:#FCEBEB;color:#A32D2D;border-radius:8px;font-size:13px;display:none}
</style>
</head>
<body>
<div class="card">
  <div class="logo">
    <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
    <div>
      <h1>Domain Watch</h1>
      <div class="sub">Secure domain monitoring</div>
    </div>
  </div>
  <form id="loginForm">
    <label for="password">Password</label>
    <input type="password" id="password" name="password" autocomplete="current-password" autofocus required>
    <button type="submit">Sign in</button>
    <div class="error" id="error">Incorrect password. Please try again.</div>
  </form>
</div>
<script>
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pw = document.getElementById('password').value;
  const err = document.getElementById('error');
  err.style.display = 'none';
  const r = await fetch('/auth/login', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({password: pw})
  });
  if (r.ok) { window.location.href = '/'; }
  else { err.style.display = 'block'; document.getElementById('password').value = ''; }
});
</script>
</body>
</html>`;
  return new Response(html, {
    headers: secureHeaders({ "Content-Type": "text/html; charset=utf-8" }),
  });
}

async function handleLogin(request: Request, env: Env, ip: string): Promise<Response> {
  // Rate limit login attempts more strictly
  const allowed = await checkRateLimit(env, `login:${ip}`, "lookup", 60_000);
  if (!allowed) return errorResponse("Too many login attempts", 429);

  const body = parseJsonBody(await request.text()) as Record<string, string> | null;
  if (!body?.password) return errorResponse("Missing password", 400);

  const valid = await verifyPassword(body.password, env.APP_PASSWORD);
  if (!valid) return errorResponse("Invalid password", 401);

  const token = await createSessionToken(env);
  const maxAge = parseInt(env.SESSION_MAX_AGE || "28800", 10);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      ...secureHeaders({ "Content-Type": "application/json" }),
      "Set-Cookie": `dw_session=${token}; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}; Path=/`,
    },
  });
}

function handleLogout(): Response {
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      ...secureHeaders({ "Content-Type": "application/json" }),
      "Set-Cookie": "dw_session=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/",
    },
  });
}

async function handleGetDomains(env: Env): Promise<Response> {
  const domains = await getAllDomains(env);
  return jsonResponse(domains);
}

async function handleAddDomain(request: Request, env: Env, ip: string): Promise<Response> {
  const max = parseInt(env.MAX_MONITORED_DOMAINS || "50", 10);
  const existing = await getAllDomains(env);
  if (existing.length >= max) {
    return errorResponse(`Maximum monitored domains reached (${max})`, 400);
  }

  const body = parseJsonBody(await request.text()) as Record<string, unknown> | null;
  if (!body) return errorResponse("Invalid JSON", 400);

  const domain = validateDomain(String(body.domain || ""));
  if (!domain) return errorResponse("Invalid domain name", 400);

  if (existing.some((d) => d.domain === domain)) {
    return errorResponse("Domain already monitored", 409);
  }

  const thresholds = Array.isArray(body.alertThresholds)
    ? (body.alertThresholds as unknown[])
        .map(Number)
        .filter((n) => [90, 60, 30, 14, 7].includes(n))
    : [90, 60, 30, 14, 7];

  // Rate limit lookups
  const lookupOk = await checkRateLimit(env, ip, "lookup");
  if (!lookupOk) return errorResponse("Lookup rate limit exceeded", 429);

  const { expiresAt, registrar } = await lookupDomainExpiry(domain);

  const newDomain: MonitoredDomain = {
    id: crypto.randomUUID(),
    domain,
    addedAt: new Date().toISOString(),
    expiresAt,
    registrar,
    lastChecked: new Date().toISOString(),
    alertThresholds: thresholds,
    alertsSent: [],
    notes: sanitizeText(String(body.notes || ""), 500),
  };

  await saveDomain(env, newDomain);
  return jsonResponse(newDomain, 201);
}

async function handleDeleteDomain(env: Env, id: string): Promise<Response> {
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) return errorResponse("Invalid ID", 400);
  await deleteDomain(env, id);
  return jsonResponse({ ok: true });
}

async function handleBulkDeleteDomains(request: Request, env: Env): Promise<Response> {
  const body = parseJsonBody(await request.text()) as Record<string, unknown> | null;
  if (!Array.isArray(body?.ids)) return errorResponse("ids must be an array", 400);
  const ids = (body.ids as unknown[])
    .map(String)
    .filter((id) => /^[0-9a-f-]{36}$/.test(id));
  await deleteDomains(env, ids);
  return jsonResponse({ ok: true, deleted: ids.length });
}

async function handleBulkMonitor(request: Request, env: Env): Promise<Response> {
  // Add multiple domains at once (CSV paste)
  const body = parseJsonBody(await request.text()) as Record<string, unknown> | null;
  if (!Array.isArray(body?.domains)) return errorResponse("domains must be an array", 400);

  const max = parseInt(env.MAX_MONITORED_DOMAINS || "50", 10);
  const existing = await getAllDomains(env);
  const results: { domain: string; status: string }[] = [];

  for (const raw of (body.domains as unknown[]).slice(0, 20)) {
    const domain = validateDomain(String(raw));
    if (!domain) { results.push({ domain: String(raw), status: "invalid" }); continue; }
    if (existing.length >= max) { results.push({ domain, status: "limit_reached" }); continue; }
    if (existing.some((d) => d.domain === domain)) { results.push({ domain, status: "duplicate" }); continue; }

    const thresholds = Array.isArray(body?.alertThresholds)
      ? (body.alertThresholds as unknown[]).map(Number).filter((n) => [90, 60, 30, 14, 7].includes(n))
      : [90, 60, 30, 14, 7];

    const { expiresAt, registrar } = await lookupDomainExpiry(domain);
    const d: MonitoredDomain = {
      id: crypto.randomUUID(), domain, addedAt: new Date().toISOString(),
      expiresAt, registrar, lastChecked: new Date().toISOString(),
      alertThresholds: thresholds, alertsSent: [], notes: "",
    };
    await saveDomain(env, d);
    existing.push(d);
    results.push({ domain, status: "added" });
  }

  return jsonResponse(results, 201);
}

async function handleRefreshDomain(env: Env, id: string, ip: string): Promise<Response> {
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) return errorResponse("Invalid ID", 400);
  const domain = await getDomain(env, id);
  if (!domain) return errorResponse("Domain not found", 404);

  const lookupOk = await checkRateLimit(env, ip, "lookup");
  if (!lookupOk) return errorResponse("Lookup rate limit exceeded", 429);

  const { expiresAt, registrar } = await lookupDomainExpiry(domain.domain);
  const updated = { ...domain, expiresAt: expiresAt ?? domain.expiresAt, registrar: registrar ?? domain.registrar, lastChecked: new Date().toISOString() };
  await saveDomain(env, updated);
  return jsonResponse(updated);
}

async function handleUpdateThresholds(request: Request, env: Env, id: string): Promise<Response> {
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) return errorResponse("Invalid ID", 400);
  const domain = await getDomain(env, id);
  if (!domain) return errorResponse("Domain not found", 404);

  const body = parseJsonBody(await request.text()) as Record<string, unknown> | null;
  if (!Array.isArray(body?.thresholds)) return errorResponse("thresholds must be array", 400);
  const thresholds = (body.thresholds as unknown[]).map(Number).filter((n) => [90, 60, 30, 14, 7].includes(n));

  const updated = { ...domain, alertThresholds: thresholds, alertsSent: [] };
  await saveDomain(env, updated);
  return jsonResponse(updated);
}

async function handleGetFuzzyScans(env: Env): Promise<Response> {
  const scans = await getAllFuzzyScans(env);
  return jsonResponse(scans.sort((a, b) => b.scannedAt.localeCompare(a.scannedAt)));
}

async function handleRunFuzzyScan(request: Request, env: Env, ip: string): Promise<Response> {
  const body = parseJsonBody(await request.text()) as Record<string, unknown> | null;
  const domain = validateDomain(String(body?.domain || ""));
  if (!domain) return errorResponse("Invalid domain", 400);

  const lookupOk = await checkRateLimit(env, ip, "lookup");
  if (!lookupOk) return errorResponse("Lookup rate limit exceeded", 429);

  const tlds = (env.FUZZY_TLDS || ".com,.net,.org,.io,.co,.ai,.app,.dev,.info,.biz").split(",").map((t) => t.trim());
  const maxBatch = parseInt(env.MAX_FUZZY_BATCH || "20", 10);

  const variants = generateFuzzyVariants(domain, tlds).slice(0, 100);

  // Check DNS in parallel batches
  const results: FuzzyVariant[] = [];
  for (let i = 0; i < variants.length; i += maxBatch) {
    const batch = variants.slice(i, i + maxBatch);
    const checks = await Promise.all(
      batch.map(async (v) => ({ ...v, registered: await isDomainRegistered(v.domain) }))
    );
    results.push(...checks);
  }

  const scan: FuzzyScanResult = {
    id: crypto.randomUUID(),
    baseDomain: domain,
    scannedAt: new Date().toISOString(),
    results,
  };

  await saveFuzzyScan(env, scan);
  return jsonResponse(scan, 201);
}

async function handleGetSettings(env: Env): Promise<Response> {
  const stored = await getSettings(env);
  return jsonResponse({
    emailFrom: stored.emailFrom || env.EMAIL_FROM || "",
    emailTo: stored.emailTo || env.EMAIL_TO || "",
    emailSubjectPrefix: stored.emailSubjectPrefix || env.EMAIL_SUBJECT_PREFIX || "[Domain Watch]",
    emailProvider: detectEmailProvider(env),
    // Limits from env for display
    maxMonitoredDomains: env.MAX_MONITORED_DOMAINS || "50",
    maxFuzzyHistory: env.MAX_FUZZY_HISTORY || "100",
    defaultThresholds: env.DEFAULT_ALERT_THRESHOLDS || "90,60,30,14,7",
    fuzzyTlds: env.FUZZY_TLDS || "",
  });
}

async function handleSaveSettings(request: Request, env: Env): Promise<Response> {
  const body = parseJsonBody(await request.text()) as Record<string, unknown> | null;
  if (!body) return errorResponse("Invalid JSON", 400);

  await saveSettings(env, {
    emailFrom: sanitizeText(String(body.emailFrom || ""), 200),
    emailTo: sanitizeText(String(body.emailTo || ""), 200),
    emailSubjectPrefix: sanitizeText(String(body.emailSubjectPrefix || ""), 100),
  });
  return jsonResponse({ ok: true });
}
