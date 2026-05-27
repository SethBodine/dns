import type { Env, AppSettings } from "./types";

export type EmailProvider = "resend" | "mailgun" | "sendgrid" | "none";

// Detect ALL configured providers (not just the first)
export function detectAllProviders(env: Env): EmailProvider[] {
  const found: EmailProvider[] = [];
  if (env.RESEND_API_KEY) found.push("resend");
  if (env.MAILGUN_API_KEY && env.MAILGUN_DOMAIN) found.push("mailgun");
  if (env.SENDGRID_API_KEY) found.push("sendgrid");
  return found;
}

// Get the active provider — use saved preference if valid, else first available
export function detectEmailProvider(env: Env, preferred?: string): EmailProvider {
  const all = detectAllProviders(env);
  if (!all.length) return "none";
  if (preferred && all.includes(preferred as EmailProvider)) return preferred as EmailProvider;
  return all[0];
}

export async function getEmailSettings(env: Env): Promise<AppSettings & { availableProviders: string[] }> {
  const stored = await env.KV.get("settings:email", "json") as Partial<AppSettings> | null;
  const available = detectAllProviders(env);
  const preferred = stored?.emailProvider;
  return {
    emailFrom: stored?.emailFrom || env.EMAIL_FROM || "",
    emailTo: stored?.emailTo || env.EMAIL_TO || "",
    emailSubjectPrefix: stored?.emailSubjectPrefix || env.EMAIL_SUBJECT_PREFIX || "[Domain Watch]",
    emailProvider: detectEmailProvider(env, preferred),
    availableProviders: available,
  };
}

interface SendParams {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
}

// Returns { ok, error } so callers can report the actual failure reason
export async function sendEmail(
  params: SendParams,
  env: Env,
  providerOverride?: string
): Promise<{ ok: boolean; error?: string }> {
  const provider = detectEmailProvider(env, providerOverride);
  if (provider === "none") return { ok: false, error: "No email provider configured" };

  // Validate from address — can't be a placeholder
  if (!params.from || params.from.includes("domain-watch.local") || !params.from.includes("@")) {
    return { ok: false, error: "Invalid 'from' address — set a real sending address in Settings" };
  }
  if (!params.to || !params.to.includes("@")) {
    return { ok: false, error: "Invalid 'to' address — set a recipient address in Settings" };
  }

  try {
    switch (provider) {
      case "resend":   return await sendViaResend(params, env);
      case "mailgun":  return await sendViaMailgun(params, env);
      case "sendgrid": return await sendViaSendgrid(params, env);
      default:         return { ok: false, error: "Unknown provider" };
    }
  } catch (e) {
    console.error("Email send failed:", e);
    return { ok: false, error: String(e) };
  }
}

async function sendViaResend(params: SendParams, env: Env): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
    }),
  });
  if (res.ok) return { ok: true };
  let detail = "";
  try { const d = await res.json() as { message?: string; name?: string }; detail = d.message || d.name || ""; } catch { /* ignore */ }
  return { ok: false, error: `Resend error ${res.status}: ${detail || res.statusText}` };
}

async function sendViaMailgun(params: SendParams, env: Env): Promise<{ ok: boolean; error?: string }> {
  const form = new FormData();
  form.append("from", params.from);
  form.append("to", params.to);
  form.append("subject", params.subject);
  form.append("html", params.html);
  form.append("text", params.text);

  const res = await fetch(
    `https://api.mailgun.net/v3/${env.MAILGUN_DOMAIN}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`api:${env.MAILGUN_API_KEY}`)}` },
      body: form,
    }
  );
  if (res.ok) return { ok: true };
  let detail = "";
  try { const d = await res.json() as { message?: string }; detail = d.message || ""; } catch { /* ignore */ }
  return { ok: false, error: `Mailgun error ${res.status}: ${detail || res.statusText}` };
}

async function sendViaSendgrid(params: SendParams, env: Env): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: params.to }] }],
      from: { email: params.from },
      subject: params.subject,
      content: [
        { type: "text/plain", value: params.text },
        { type: "text/html", value: params.html },
      ],
    }),
  });
  if (res.ok) return { ok: true };
  let detail = "";
  try { const d = await res.json() as { errors?: Array<{ message: string }> }; detail = d.errors?.[0]?.message || ""; } catch { /* ignore */ }
  return { ok: false, error: `SendGrid error ${res.status}: ${detail || res.statusText}` };
}

// ─── Email Templates ─────────────────────────────────────────────────────────

export function buildExpiryEmail(
  domain: string,
  daysRemaining: number,
  expiresAt: string,
  subjectPrefix: string
): { subject: string; html: string; text: string } {
  const isExpired = daysRemaining <= 0;
  const urgency = isExpired ? "EXPIRED" : daysRemaining <= 7 ? "URGENT" : "Warning";
  const subject = `${subjectPrefix} ${urgency}: ${domain} ${isExpired ? "has expired" : `expires in ${daysRemaining} days`}`;
  const expDate = new Date(expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const color = isExpired ? "#E24B4A" : daysRemaining <= 7 ? "#BA7517" : "#1D9E75";

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;max-width:560px;margin:40px auto;padding:0 20px;color:#1a1a1a">
  <div style="border-left:4px solid ${color};padding-left:16px;margin-bottom:24px">
    <h1 style="font-size:18px;font-weight:600;margin:0 0 4px">${isExpired ? "Domain Expired" : `Domain Expiry ${urgency}`}</h1>
    <p style="margin:0;color:#555;font-size:14px">${subjectPrefix} automated alert</p>
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <tr><td style="padding:10px 0;border-bottom:1px solid #eee;color:#555;width:140px">Domain</td><td style="padding:10px 0;border-bottom:1px solid #eee;font-weight:600">${domain}</td></tr>
    <tr><td style="padding:10px 0;border-bottom:1px solid #eee;color:#555">Expiry</td><td style="padding:10px 0;border-bottom:1px solid #eee">${expDate}</td></tr>
    <tr><td style="padding:10px 0;color:#555">Status</td><td style="padding:10px 0;color:${color};font-weight:600">${isExpired ? "Expired" : `${daysRemaining} days remaining`}</td></tr>
  </table>
  <p style="margin-top:24px;font-size:13px;color:#555">${isExpired ? "This domain has expired and may be available to others. Act immediately." : "Log in to your registrar to renew this domain."}</p>
  <p style="margin-top:32px;font-size:12px;color:#999">Sent by Domain Watch</p>
</body></html>`;

  const text = `${subject}\n\nDomain: ${domain}\nExpiry: ${expDate}\nStatus: ${isExpired ? "EXPIRED" : `${daysRemaining} days remaining`}\n\n${isExpired ? "Act immediately." : "Renew via your registrar."}\n\n-- Domain Watch`;
  return { subject, html, text };
}
