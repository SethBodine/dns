import type { Env, AppSettings } from "./types";

export type EmailProvider = "resend" | "mailgun" | "sendgrid" | "none";

export function detectEmailProvider(env: Env): EmailProvider {
  if (env.RESEND_API_KEY) return "resend";
  if (env.MAILGUN_API_KEY && env.MAILGUN_DOMAIN) return "mailgun";
  if (env.SENDGRID_API_KEY) return "sendgrid";
  return "none";
}

export async function getEmailSettings(env: Env): Promise<AppSettings> {
  const stored = await env.KV.get("settings:email", "json") as Partial<AppSettings> | null;
  return {
    emailFrom: stored?.emailFrom || env.EMAIL_FROM || "alerts@domain-watch.local",
    emailTo: stored?.emailTo || env.EMAIL_TO || "",
    emailSubjectPrefix: stored?.emailSubjectPrefix || env.EMAIL_SUBJECT_PREFIX || "[Domain Watch]",
    emailProvider: detectEmailProvider(env),
  };
}

interface SendParams {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendEmail(params: SendParams, env: Env): Promise<boolean> {
  const provider = detectEmailProvider(env);
  try {
    switch (provider) {
      case "resend":    return await sendViaResend(params, env);
      case "mailgun":   return await sendViaMailgun(params, env);
      case "sendgrid":  return await sendViaSendgrid(params, env);
      default:
        console.warn("No email provider configured");
        return false;
    }
  } catch (e) {
    console.error("Email send failed:", e);
    return false;
  }
}

async function sendViaResend(params: SendParams, env: Env): Promise<boolean> {
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
  return res.ok;
}

async function sendViaMailgun(params: SendParams, env: Env): Promise<boolean> {
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
      headers: {
        Authorization: `Basic ${btoa(`api:${env.MAILGUN_API_KEY}`)}`,
      },
      body: form,
    }
  );
  return res.ok;
}

async function sendViaSendgrid(params: SendParams, env: Env): Promise<boolean> {
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
  return res.ok;
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

  const expDate = new Date(expiresAt).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;max-width:560px;margin:40px auto;padding:0 20px;color:#1a1a1a">
  <div style="border-left:4px solid ${isExpired ? "#E24B4A" : daysRemaining <= 7 ? "#BA7517" : "#1D9E75"};padding-left:16px;margin-bottom:24px">
    <h1 style="font-size:18px;font-weight:600;margin:0 0 4px">${isExpired ? "Domain Expired" : `Domain Expiry ${urgency}`}</h1>
    <p style="margin:0;color:#555;font-size:14px">${subjectPrefix} automated alert</p>
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <tr><td style="padding:10px 0;border-bottom:1px solid #eee;color:#555;width:140px">Domain</td>
        <td style="padding:10px 0;border-bottom:1px solid #eee;font-weight:600">${domain}</td></tr>
    <tr><td style="padding:10px 0;border-bottom:1px solid #eee;color:#555">Expiry date</td>
        <td style="padding:10px 0;border-bottom:1px solid #eee">${expDate}</td></tr>
    <tr><td style="padding:10px 0;color:#555">Status</td>
        <td style="padding:10px 0;color:${isExpired ? "#E24B4A" : daysRemaining <= 7 ? "#BA7517" : "#1D9E75"};font-weight:600">
          ${isExpired ? "Expired" : `${daysRemaining} days remaining`}</td></tr>
  </table>
  ${isExpired
    ? `<div style="margin-top:24px;padding:14px;background:#FCEBEB;border-radius:8px;font-size:13px;color:#A32D2D">
        This domain has expired and may be available for others to register. Act immediately if you wish to recover it.
       </div>`
    : `<p style="margin-top:24px;font-size:13px;color:#555">Log in to your registrar to renew this domain before it expires.</p>`
  }
  <p style="margin-top:32px;font-size:12px;color:#999">Sent by Domain Watch &mdash; automated domain monitoring</p>
</body>
</html>`;

  const text = `${subject}\n\nDomain: ${domain}\nExpiry: ${expDate}\nStatus: ${isExpired ? "EXPIRED" : `${daysRemaining} days remaining`}\n\n${isExpired ? "This domain has expired. Act immediately to recover it." : "Log in to your registrar to renew this domain."}\n\n-- Domain Watch`;

  return { subject, html, text };
}
