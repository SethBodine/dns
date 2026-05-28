import type { Env, MonitoredDomain, FuzzyScanResult, FuzzyVariant } from "./types";
import {
  verifySession, createSessionToken, verifyPassword,
  checkRateLimit, getClientIp, secureHeaders,
  jsonResponse, errorResponse, checkCsrf, generateCsrfToken,
  validateDomain, sanitizeText, parseJsonBody,
} from "./security";
import {
  lookupDomainExpiry, checkDomainExists, recheckUnknowns,
  generateFuzzyVariants, daysUntilExpiry, shouldAlert,
} from "./lookup";
import {
  sendEmail, getEmailSettings, detectEmailProvider,
  detectAllProviders, buildExpiryEmail,
} from "./email";
import {
  getAllDomains, getDomain, saveDomain, deleteDomain, deleteDomains,
  saveFuzzyScan, getAllFuzzyScans, deleteFuzzyScan,
  getRecentAlerts, saveAlert, getSettings, saveSettings,
} from "./kv";
import { renderApp } from "./ui";
import { appJs } from "./app-js";

export default {
  // ─── HTTP Handler ──────────────────────────────────────────────────────────
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const ip = getClientIp(request);

    // Rate limit all requests
    if (!await checkRateLimit(env, ip, "general")) {
      return new Response("Too many requests", {
        status: 429,
        headers: secureHeaders({ "Retry-After": "60" }),
      });
    }

    // ─── Public static assets ────────────────────────────────────────────────
    if (path === "/" || path === "/app") {
      const authed = await verifySession(request, env);
      if (!authed) return serveLogin();
      const sessionToken = request.headers.get("Cookie")?.match(/dw_session=([^;]+)/)?.[1] || "";
      const csrfToken = await generateCsrfToken(sessionToken, env);
      return new Response(renderApp(csrfToken), {
        headers: secureHeaders({ "Content-Type": "text/html; charset=utf-8" }),
      });
    }

    if (path === "/app.js") {
      return new Response(appJs, {
        headers: {
          ...secureHeaders(),
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    // ─── Auth endpoints ──────────────────────────────────────────────────────
    if (path === "/auth/login" && method === "POST") return handleLogin(request, env, ip);
    if (path === "/auth/logout" && method === "POST") return handleLogout();

    // ─── All other routes require auth ───────────────────────────────────────
    if (!await verifySession(request, env)) return errorResponse("Unauthorized", 401);

    // CSRF check for mutating requests
    if (["POST", "PUT", "DELETE", "PATCH"].includes(method) && !checkCsrf(request)) {
      return errorResponse("CSRF check failed", 403);
    }

    // ─── Domain Monitor API ──────────────────────────────────────────────────
    if (path === "/api/domains" && method === "GET") return handleGetDomains(env);
    if (path === "/api/domains" && method === "POST") return handleAddDomain(request, env, ip);
    if (path.match(/^\/api\/domains\/[^/]+$/) && method === "DELETE") {
      return handleDeleteDomain(env, path.split("/")[3]);
    }
    if (path === "/api/domains/bulk-delete" && method === "POST") return handleBulkDeleteDomains(request, env);
    if (path === "/api/domains/bulk-monitor" && method === "POST") return handleBulkMonitor(request, env, ip);
    if (path.match(/^\/api\/domains\/[^/]+\/refresh$/) && method === "POST") {
      return handleRefreshDomain(env, path.split("/")[3], ip);
    }
    if (path.match(/^\/api\/domains\/[^/]+\/thresholds$/) && method === "PUT") {
      return handleUpdateThresholds(request, env, path.split("/")[3]);
    }
    if (path.match(/^\/api\/domains\/[^/]+\/manual-expiry$/) && method === "PUT") {
      return handleSetManualExpiry(request, env, path.split("/")[3]);
    }

    // ─── Fuzzy Finder API ────────────────────────────────────────────────────
    if (path === "/api/fuzzy" && method === "GET") return handleGetFuzzyScans(env);
    if (path === "/api/fuzzy" && method === "POST") return handleRunFuzzyScan(request, env, ip);
    if (path.match(/^\/api\/fuzzy\/[^/]+$/) && method === "DELETE") {
      await deleteFuzzyScan(env, path.split("/")[3]);
      return jsonResponse({ ok: true });
    }
    if (path.match(/^\/api\/fuzzy\/[^/]+\/rescan-unknowns$/) && method === "POST") {
      return handleRescanUnknowns(env, path.split("/")[3], ip);
    }

    // ─── Alerts API ──────────────────────────────────────────────────────────
    if (path === "/api/alerts" && method === "GET") {
      return jsonResponse(await getRecentAlerts(env));
    }

    // ─── Settings API ────────────────────────────────────────────────────────
    if (path === "/api/settings" && method === "GET") return handleGetSettings(env);
    if (path === "/api/settings" && method === "PUT") return handleSaveSettings(request, env);
    if (path === "/api/settings/test-email" && method === "POST") return handleTestEmail(request, env);

    return new Response("Not found", { status: 404, headers: secureHeaders() });
  },

  // ─── Cron Handler ─────────────────────────────────────────────────────────
  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    const domains = await getAllDomains(env);
    const settings = await getEmailSettings(env);

    for (const domain of domains) {
      try {
        const { expiresAt, registrar } = await lookupDomainExpiry(domain.domain, env);
        const updated: MonitoredDomain = {
          ...domain,
          expiresAt: expiresAt ?? domain.expiresAt,
          registrar: registrar ?? domain.registrar,
          lastChecked: new Date().toISOString(),
        };

        const toAlert = shouldAlert(updated);
        // shouldAlert returns at most one threshold per run to avoid burst alerts
        for (const threshold of toAlert) {
          if (!settings.emailTo) continue;
          const effectiveExpiry = updated.expiresAt || updated.manualExpiresAt;
          const days = effectiveExpiry ? daysUntilExpiry(effectiveExpiry) : 0;
          const thresholdLabel = threshold === 0 ? "Expiry day" : `${threshold}-day`;
          const { subject, html, text } = buildExpiryEmail(
            domain.domain, days, effectiveExpiry!, settings.emailSubjectPrefix, thresholdLabel
          );
          const result = await sendEmail({ to: settings.emailTo, from: settings.emailFrom, subject, html, text }, env, settings.emailProvider);
          await saveAlert(env, {
            id: crypto.randomUUID(),
            domain: domain.domain,
            type: days <= 0 ? "expired" : "expiry-warning",
            daysRemaining: days,
            sentAt: new Date().toISOString(),
            emailProvider: settings.emailProvider,
            success: result.ok,
          });
          if (result.ok) updated.alertsSent = [...updated.alertsSent, threshold];
        }
        await saveDomain(env, updated);
      } catch (e) {
        console.error(`Cron: failed to process ${domain.domain}:`, e);
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
<title>Domain Watch</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f5f5f3;color:#1a1a1a}
.card{background:#fff;border:0.5px solid #ddd;border-radius:12px;padding:40px;width:100%;max-width:360px}
.logo{display:flex;align-items:center;gap:10px;margin-bottom:32px}
svg{color:#1D9E75}
h1{font-size:20px;font-weight:600}
.sub{font-size:13px;color:#888;margin-top:4px}
label{display:block;font-size:13px;font-weight:500;margin-bottom:6px;margin-top:20px}
input{width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;outline:none}
input:focus{border-color:#1D9E75}
button{margin-top:24px;width:100%;padding:11px;background:#1D9E75;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer}
button:hover{background:#0F6E56}
.err{margin-top:12px;padding:10px 12px;background:#FCEBEB;color:#A32D2D;border-radius:8px;font-size:13px;display:none}
</style>
</head>
<body>
<div class="card">
  <div class="logo">
    <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
    <div><h1>Domain Watch</h1><div class="sub">Secure domain monitoring</div></div>
  </div>
  <form id="f">
    <label for="p">Password</label>
    <input type="password" id="p" autocomplete="current-password" autofocus required>
    <button type="submit">Sign in</button>
    <div class="err" id="e">Incorrect password.</div>
  </form>
</div>
<script>
document.getElementById('f').addEventListener('submit', async ev => {
  ev.preventDefault();
  const e = document.getElementById('e');
  e.style.display = 'none';
  const r = await fetch('/auth/login', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:document.getElementById('p').value})});
  if (r.ok) location.href = '/';
  else { e.style.display = 'block'; document.getElementById('p').value = ''; }
});
</script>
</body></html>`;
  return new Response(html, { headers: secureHeaders({ "Content-Type": "text/html; charset=utf-8" }) });
}

async function handleLogin(request: Request, env: Env, ip: string): Promise<Response> {
  if (!await checkRateLimit(env, `login:${ip}`, "lookup", 60_000)) {
    return errorResponse("Too many login attempts", 429);
  }
  const body = parseJsonBody(await request.text()) as Record<string, string> | null;
  if (!body?.password) return errorResponse("Missing password", 400);
  if (!await verifyPassword(body.password, env.APP_PASSWORD)) return errorResponse("Invalid password", 401);

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
  return jsonResponse(await getAllDomains(env));
}

async function handleAddDomain(request: Request, env: Env, ip: string): Promise<Response> {
  const max = parseInt(env.MAX_MONITORED_DOMAINS || "50", 10);
  const existing = await getAllDomains(env);
  if (existing.length >= max) return errorResponse(`Maximum monitored domains reached (${max})`, 400);

  const body = parseJsonBody(await request.text()) as Record<string, unknown> | null;
  if (!body) return errorResponse("Invalid JSON", 400);

  const domain = validateDomain(String(body.domain || ""));
  if (!domain) return errorResponse("Invalid domain name", 400);
  if (existing.some((d) => d.domain === domain)) return errorResponse("Domain already monitored", 409);

  const thresholds = Array.isArray(body.alertThresholds)
    ? (body.alertThresholds as unknown[]).map(Number).filter((n) => [90, 60, 30, 14, 7].includes(n))
    : [90, 60, 30, 14, 7];

  if (!await checkRateLimit(env, ip, "lookup")) return errorResponse("Lookup rate limit exceeded", 429);

  const { expiresAt, registrar } = await lookupDomainExpiry(domain, env);

  const newDomain: MonitoredDomain = {
    id: crypto.randomUUID(), domain,
    addedAt: new Date().toISOString(),
    expiresAt, registrar,
    manualExpiresAt: null,
    lastChecked: new Date().toISOString(),
    alertThresholds: thresholds, alertsSent: [], notes: "",
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
  const ids = (body.ids as unknown[]).map(String).filter((id) => /^[0-9a-f-]{36}$/.test(id));
  await deleteDomains(env, ids);
  return jsonResponse({ ok: true, deleted: ids.length });
}

async function handleBulkMonitor(request: Request, env: Env, ip: string): Promise<Response> {
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

    if (!await checkRateLimit(env, ip, "lookup")) { results.push({ domain, status: "rate_limited" }); continue; }

    const thresholds = Array.isArray(body?.alertThresholds)
      ? (body.alertThresholds as unknown[]).map(Number).filter((n) => [90, 60, 30, 14, 7].includes(n))
      : [90, 60, 30, 14, 7];

    const { expiresAt, registrar } = await lookupDomainExpiry(domain, env);
    const d: MonitoredDomain = {
      id: crypto.randomUUID(), domain, addedAt: new Date().toISOString(),
      expiresAt, registrar, manualExpiresAt: null,
      lastChecked: new Date().toISOString(),
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
  if (!await checkRateLimit(env, ip, "lookup")) return errorResponse("Lookup rate limit exceeded", 429);

  const { expiresAt, registrar } = await lookupDomainExpiry(domain.domain, env);
  const updated = {
    ...domain,
    expiresAt: expiresAt ?? domain.expiresAt,
    registrar: registrar ?? domain.registrar,
    lastChecked: new Date().toISOString(),
  };
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
  if (!await checkRateLimit(env, ip, "lookup")) return errorResponse("Lookup rate limit exceeded", 429);

  const tlds = (env.FUZZY_TLDS || ".com,.net,.org,.io,.co,.ai,.app,.dev,.info,.biz").split(",").map((t) => t.trim());
  const maxBatch = Math.min(parseInt(env.MAX_FUZZY_BATCH || "6", 10), 6);

  const variants = generateFuzzyVariants(domain, tlds).slice(0, 120);

  const results: FuzzyVariant[] = [];
  for (let i = 0; i < variants.length; i += maxBatch) {
    if (i > 0) await new Promise((r) => setTimeout(r, 400));
    const batch = variants.slice(i, i + maxBatch);
    const checks = await Promise.all(
      batch.map(async (v) => ({ ...v, registered: await checkDomainExists(v.domain) }))
    );
    results.push(...checks);
  }

  // Replace existing scan for same domain rather than duplicating
  const allScans = await getAllFuzzyScans(env);
  const existingForDomain = allScans.find((s) => s.baseDomain === domain);
  if (existingForDomain) await deleteFuzzyScan(env, existingForDomain.id);

  const scan: FuzzyScanResult = {
    id: crypto.randomUUID(),
    baseDomain: domain,
    scannedAt: new Date().toISOString(),
    results,
  };
  await saveFuzzyScan(env, scan);
  return jsonResponse(scan, 201);
}

async function handleRescanUnknowns(env: Env, id: string, ip: string): Promise<Response> {
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) return errorResponse("Invalid ID", 400);
  const scans = await getAllFuzzyScans(env);
  const scan = scans.find((s) => s.id === id);
  if (!scan) return errorResponse("Scan not found", 404);
  if (!await checkRateLimit(env, ip, "lookup")) return errorResponse("Lookup rate limit exceeded", 429);

  const unknowns = scan.results.filter((r) => r.registered === null).map((r) => r.domain);
  if (!unknowns.length) return jsonResponse(scan); // nothing to recheck

  const recheckMap = await recheckUnknowns(unknowns);

  const updatedResults = scan.results.map((r) =>
    r.registered === null && recheckMap.has(r.domain)
      ? { ...r, registered: recheckMap.get(r.domain)! }
      : r
  );

  const updated: FuzzyScanResult = { ...scan, scannedAt: new Date().toISOString(), results: updatedResults };
  await deleteFuzzyScan(env, id);
  await saveFuzzyScan(env, updated);
  return jsonResponse(updated);
}

async function handleGetSettings(env: Env): Promise<Response> {
  const stored = await getSettings(env);
  const availableProviders = detectAllProviders(env);
  const allPossibleProviders = ["resend", "mailgun", "sendgrid"];
  const preferred = stored.emailProvider || "";
  const activeProvider = detectEmailProvider(env, preferred);
  // Return all three providers with configured flag so UI can show green/grey dots
  const providerStatus = allPossibleProviders.map(p => ({
    id: p,
    configured: availableProviders.includes(p as "resend" | "mailgun" | "sendgrid"),
  }));
  return jsonResponse({
    emailFrom: stored.emailFrom || env.EMAIL_FROM || "",
    emailTo: stored.emailTo || env.EMAIL_TO || "",
    emailSubjectPrefix: stored.emailSubjectPrefix || env.EMAIL_SUBJECT_PREFIX || "[Domain Watch]",
    emailProvider: activeProvider,
    availableProviders,
    providerStatus,
    // Limits
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
    emailProvider: sanitizeText(String(body.emailProvider || ""), 20),
  });
  return jsonResponse({ ok: true });
}

async function handleSetManualExpiry(request: Request, env: Env, id: string): Promise<Response> {
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) return errorResponse("Invalid ID", 400);
  const domain = await getDomain(env, id);
  if (!domain) return errorResponse("Domain not found", 404);
  const body = parseJsonBody(await request.text()) as Record<string, unknown> | null;
  const dateStr = body?.expiresAt ? String(body.expiresAt) : null;
  // Validate date format if provided
  if (dateStr && isNaN(new Date(dateStr).getTime())) return errorResponse("Invalid date", 400);
  const updated = { ...domain, manualExpiresAt: dateStr };
  await saveDomain(env, updated);
  return jsonResponse(updated);
}

async function handleTestEmail(request: Request, env: Env): Promise<Response> {
  const body = parseJsonBody(await request.text()) as Record<string, unknown> | null;
  const providerOverride = body?.provider ? String(body.provider) : undefined;

  const allProviders = detectAllProviders(env);
  if (!allProviders.length) {
    return errorResponse("No email provider configured — set RESEND_API_KEY, MAILGUN_API_KEY, or SENDGRID_API_KEY as secrets.", 400);
  }

  const settings = await getEmailSettings(env);
  const provider = detectEmailProvider(env, providerOverride || settings.emailProvider);

  if (!settings.emailTo) {
    return errorResponse("No recipient address set — add an Email To address in Settings and save first.", 400);
  }
  if (!settings.emailFrom || !settings.emailFrom.includes("@")) {
    return errorResponse("No valid From address set — add an Email From address in Settings and save first.", 400);
  }

  const result = await sendEmail({
    to: settings.emailTo,
    from: settings.emailFrom,
    subject: `${settings.emailSubjectPrefix || "[Domain Watch]"} Test email`,
    html: `<p>This is a test email from <strong>Domain Watch</strong>.</p><p>Email via <strong>${provider}</strong> is working correctly.</p>`,
    text: `Domain Watch test email — ${provider} is configured correctly.`,
  }, env, provider);

  if (result.ok) return jsonResponse({ ok: true, provider });
  return errorResponse(result.error || `Send failed via ${provider}`, 500);
}
