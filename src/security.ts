import type { Env, RateLimitEntry } from "./types";

// ─── OWASP A01: Broken Access Control ───────────────────────────────────────

/**
 * Verify a session token from the cookie.
 * Token = HMAC-SHA256(sessionId + ":" + issuedAt, SESSION_SECRET)
 * We validate the signature and expiry client-side data can't be forged.
 */
export async function verifySession(request: Request, env: Env): Promise<boolean> {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|;\s*)dw_session=([^;]+)/);
  if (!match) return false;

  const token = match[1];
  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const [sessionId, issuedAt, sig] = parts;
  const maxAge = parseInt(env.SESSION_MAX_AGE || "28800", 10);
  const now = Math.floor(Date.now() / 1000);

  if (now - parseInt(issuedAt, 10) > maxAge) return false;

  const expected = await hmacSign(`${sessionId}:${issuedAt}`, env.SESSION_SECRET);
  return expected === sig;
}

export async function createSessionToken(env: Env): Promise<string> {
  const sessionId = crypto.randomUUID();
  const issuedAt = Math.floor(Date.now() / 1000).toString();
  const sig = await hmacSign(`${sessionId}:${issuedAt}`, env.SESSION_SECRET);
  return `${sessionId}.${issuedAt}.${sig}`;
}

async function hmacSign(data: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

/** Constant-time password comparison to prevent timing attacks */
export async function verifyPassword(input: string, stored: string): Promise<boolean> {
  const enc = new TextEncoder();
  const a = enc.encode(input);
  const b = enc.encode(stored);
  // Use HMAC comparison for constant-time behaviour
  const key = await crypto.subtle.importKey(
    "raw", enc.encode("timing-safe-compare"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const [sigA, sigB] = await Promise.all([
    crypto.subtle.sign("HMAC", key, a),
    crypto.subtle.sign("HMAC", key, b),
  ]);
  const ua = new Uint8Array(sigA);
  const ub = new Uint8Array(sigB);
  if (ua.length !== ub.length) return false;
  let diff = 0;
  for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i];
  return diff === 0;
}

// ─── OWASP A03: Injection ────────────────────────────────────────────────────

const DOMAIN_REGEX = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

export function validateDomain(input: string): string | null {
  const trimmed = (input || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!trimmed || trimmed.length > 253) return null;
  if (!DOMAIN_REGEX.test(trimmed)) return null;
  return trimmed;
}

export function sanitizeText(input: string, maxLen = 200): string {
  return (input || "").slice(0, maxLen).replace(/[<>"'&]/g, (c) => ({
    "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;", "&": "&amp;"
  }[c] || c));
}

export function parseJsonBody(text: string): unknown {
  try { return JSON.parse(text); } catch { return null; }
}

// ─── OWASP A04: Insecure Design / Rate Limiting ──────────────────────────────

export async function checkRateLimit(
  env: Env,
  ip: string,
  type: "general" | "lookup",
  windowMs = 60_000
): Promise<boolean> {
  const limit = type === "lookup"
    ? parseInt(env.RATE_LIMIT_LOOKUPS_RPM || "20", 10)
    : parseInt(env.RATE_LIMIT_RPM || "60", 10);

  const key = `ratelimit:${type}:${ip}`;
  const raw = await env.KV.get(key, "json") as RateLimitEntry | null;
  const now = Date.now();

  if (!raw || now - raw.windowStart > windowMs) {
    await env.KV.put(key, JSON.stringify({ count: 1, windowStart: now }), { expirationTtl: 120 });
    return true;
  }

  if (raw.count >= limit) return false;

  await env.KV.put(key, JSON.stringify({ count: raw.count + 1, windowStart: raw.windowStart }), { expirationTtl: 120 });
  return true;
}

export function getClientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP")
    || request.headers.get("X-Forwarded-For")?.split(",")[0].trim()
    || "unknown";
}

// ─── OWASP A05: Security Misconfiguration / Secure Headers ──────────────────

export function secureHeaders(extra: Record<string, string> = {}): HeadersInit {
  return {
    "Content-Security-Policy": [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self'",
      "font-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Cache-Control": "no-store",
    ...extra,
  };
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: secureHeaders({ "Content-Type": "application/json" }),
  });
}

export function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

// ─── OWASP A07: Auth failures / CSRF ────────────────────────────────────────

/** Simple origin/referer check as CSRF mitigation for state-changing requests */
export function checkCsrf(request: Request): boolean {
  const origin = request.headers.get("Origin");
  const referer = request.headers.get("Referer");
  const host = request.headers.get("Host");
  if (!host) return false;
  const check = origin || referer || "";
  if (!check) return request.method === "GET";
  try {
    const url = new URL(check);
    return url.host === host;
  } catch {
    return false;
  }
}

/** Generate a CSRF token tied to the session */
export async function generateCsrfToken(sessionToken: string, env: Env): Promise<string> {
  return hmacSign(sessionToken.split(".")[0], env.SESSION_SECRET + ":csrf");
}

export async function verifyCsrfToken(token: string, sessionToken: string, env: Env): Promise<boolean> {
  const expected = await generateCsrfToken(sessionToken, env);
  const enc = new TextEncoder();
  const a = enc.encode(token);
  const b = enc.encode(expected);
  if (a.length !== b.length) return false;
  // constant-time compare
  let diff = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
