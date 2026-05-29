import type { MonitoredDomain, FuzzyVariant, Env } from "./types";

// ─── Lookup strategy ─────────────────────────────────────────────────────────
// 1. KV cache (24h TTL) — avoids repeat hits on every refresh
// 2. rdap.org with redirect-following — handles gTLDs (.com .net .io etc)
//    rdap.org returns 302 to the authoritative RDAP server; following the
//    redirect is essential, fetch() must use redirect: "follow"
// 3. whoisjson.com — JSON WHOIS API, covers ccTLDs including .co.nz
//    Free plan: 1,000 req/month, no credit card, no expiry
//    Secret: WHOIS_API_KEY  (wrangler secret put WHOIS_API_KEY)
//    If no key set, still works for many TLDs at a lower rate limit
// 4. Manual expiry fallback (set in UI)

const CACHE_TTL_SECONDS = 60 * 60 * 24; // 24 hours

// ─── KV cache ─────────────────────────────────────────────────────────────────

async function getCached(env: Env, domain: string): Promise<{ expiresAt: string; registrar: string | null } | null> {
  try {
    const raw = await env.KV.get(`expiry:${domain}`, "json") as { expiresAt: string; registrar: string | null } | null;
    return raw;
  } catch { return null; }
}

async function setCached(env: Env, domain: string, expiresAt: string, registrar: string | null): Promise<void> {
  try {
    await env.KV.put(`expiry:${domain}`, JSON.stringify({ expiresAt, registrar }), { expirationTtl: CACHE_TTL_SECONDS });
  } catch { /* ignore cache write errors */ }
}

// ─── RDAP with redirect following ────────────────────────────────────────────

interface RdapResponse {
  events?: Array<{ eventAction: string; eventDate: string }>;
  entities?: Array<{ roles: string[]; vcardArray?: unknown[]; handle?: string }>;
  expirationDate?: string;
}

async function lookupViaRdap(domain: string): Promise<{ expiresAt: string | null; registrar: string | null } | null> {
  try {
    // redirect: "follow" is critical — rdap.org sends 302 to authoritative server
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      headers: { Accept: "application/rdap+json,application/json;q=0.9", "User-Agent": "domain-watch/1.0" },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    console.log(`RDAP rdap.org ${domain} -> HTTP ${res.status} (final URL: ${res.url})`);

    // 404 = domain not found in registry (unregistered), not a server error
    if (res.status === 404) return { expiresAt: null, registrar: null };
    if (!res.ok) return null;

    const data = await res.json() as RdapResponse;
    const expiryKeywords = ["expir", "deletion"];
    const evt = data.events?.find(e => expiryKeywords.some(k => e.eventAction?.toLowerCase().includes(k)));
    const expiresAt = evt?.eventDate ?? data.expirationDate ?? null;

    let registrar: string | null = null;
    const reg = data.entities?.find(e => e.roles?.includes("registrar"));
    if (reg?.vcardArray) {
      try {
        const vcard = reg.vcardArray as unknown[][];
        const props = Array.isArray(vcard[1]) ? vcard[1] as unknown[] : [];
        const fn = props.find(v => Array.isArray(v) && (v as unknown[])[0] === "fn");
        if (Array.isArray(fn) && fn[3]) registrar = String(fn[3]);
      } catch { /* ignore */ }
    }
    if (!registrar && reg?.handle) registrar = reg.handle;

    console.log(`RDAP ${domain}: expiresAt=${expiresAt}, events=${JSON.stringify(data.events?.map(e => e.eventAction))}`);
    return { expiresAt, registrar };
  } catch (e) {
    console.log(`RDAP error for ${domain}: ${String(e)}`);
    return null;
  }
}

// ─── WhoisJSON API (covers ccTLDs including .co.nz) ───────────────────────────
// Free plan: 1,000 req/month at whoisjson.com — sign up and set WHOIS_API_KEY secret
// Works without a key too, but at a much lower rate limit

interface WhoisJsonResponse {
  // Flat response fields (confirmed from live API)
  name?: string;
  expires?: string | null;
  expiry_date?: string | null;
  expiration_date?: string | null;
  registered?: boolean | null;
  registrar?: { name?: string } | null;
  // Nested domain object (some endpoints)
  domain?: {
    expiration_date?: string;
    expiry_date?: string;
    expires?: string;
    registrar?: string;
  };
  [key: string]: unknown;
}

async function lookupViaWhoisJson(domain: string, apiKey?: string): Promise<{ expiresAt: string | null; registrar: string | null } | null> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "domain-watch/1.0",
    };
    if (apiKey) headers["Authorization"] = `TOKEN=${apiKey}`;

    const res = await fetch(`https://whoisjson.com/api/v1/whois/?domain=${encodeURIComponent(domain)}`, {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    console.log(`WhoisJSON ${domain} -> HTTP ${res.status}`);
    if (res.status === 429) {
      console.log("WhoisJSON rate limited — add WHOIS_API_KEY secret for more capacity");
      return null;
    }
    if (!res.ok) return null;

    const data = await res.json() as WhoisJsonResponse;
    // Actual response shape (confirmed): { expires, registered, registrar: { name }, ... }
    // Some registries (e.g. .co.nz) return expires: null — registry policy, not an error
    const expiresAt =
      (data.expires as string | null) ??
      (data.expiry_date as string | null) ??
      (data.expiration_date as string | null) ??
      data.domain?.expiration_date ??
      data.domain?.expiry_date ??
      null;

    const registrar =
      (data.registrar as { name?: string } | null)?.name ??
      data.domain?.registrar ??
      null;

    const registered = data.registered as boolean | null;
    console.log(`WhoisJSON ${domain}: expires=${expiresAt}, registrar=${registrar}, registered=${registered}`);

    // If domain is registered but expiry is null, the registry doesn't publish it
    if (registered && !expiresAt) {
      console.log(`WhoisJSON ${domain}: registered but registry does not publish expiry date (common for ccTLDs like .co.nz)`);
    }

    return { expiresAt: expiresAt || null, registrar: registrar || null };
  } catch (e) {
    console.log(`WhoisJSON error for ${domain}: ${String(e)}`);
    return null;
  }
}

// ─── Main expiry lookup ───────────────────────────────────────────────────────

export async function lookupDomainExpiry(domain: string, env?: Env): Promise<{
  expiresAt: string | null;
  registrar: string | null;
}> {
  // 1. Check KV cache first
  if (env) {
    const cached = await getCached(env, domain);
    if (cached) {
      console.log(`Cache hit for ${domain}: expires ${cached.expiresAt}`);
      return cached;
    }
  }

  // 2. Try RDAP with redirect following (best for gTLDs)
  const rdap = await lookupViaRdap(domain);
  if (rdap?.expiresAt) {
    if (env) await setCached(env, domain, rdap.expiresAt, rdap.registrar);
    return rdap;
  }

  // 3. Try WhoisJSON (better ccTLD coverage, including .co.nz)
  const apiKey = env?.WHOIS_API_KEY;
  const whois = await lookupViaWhoisJson(domain, apiKey);
  if (whois?.expiresAt) {
    if (env) await setCached(env, domain, whois.expiresAt, whois.registrar);
    return whois;
  }

  // Return partial data if we got registrar but no expiry
  return {
    expiresAt: null,
    registrar: rdap?.registrar ?? whois?.registrar ?? null,
  };
}

// ─── DNS Existence Check ──────────────────────────────────────────────────────

const DOH_URL = "https://cloudflare-dns.com/dns-query";

async function dnsQuery(domain: string, type: string): Promise<{ status: number; hasAnswers: boolean } | null> {
  try {
    const url = new URL(DOH_URL);
    url.searchParams.set("name", domain);
    url.searchParams.set("type", type);
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/dns-json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { Status: number; Answer?: unknown[] };
    return { status: data.Status, hasAnswers: !!(data.Answer?.length) };
  } catch { return null; }
}

export async function checkDomainExists(domain: string): Promise<boolean | null> {
  const [a, ns] = await Promise.all([
    dnsQuery(domain, "A"),
    dnsQuery(domain, "NS"),
  ]);
  if (a?.status === 3 && ns?.status === 3) return false;
  if ((a?.status === 0 && a.hasAnswers) || (ns?.status === 0 && ns.hasAnswers)) return true;
  if (a?.status === 0 || ns?.status === 0) return true;
  if (a?.status === 3 || ns?.status === 3) return false;
  return null;
}

export async function recheckUnknowns(unknownDomains: string[]): Promise<Map<string, boolean | null>> {
  const results = new Map<string, boolean | null>();
  const batchSize = 5;
  for (let i = 0; i < unknownDomains.length; i += batchSize) {
    if (i > 0) await sleep(500);
    const batch = unknownDomains.slice(i, i + batchSize);
    const checks = await Promise.all(batch.map(async d => ({ d, result: await checkDomainExists(d) })));
    for (const { d, result } of checks) results.set(d, result);
  }
  return results;
}

// ─── Fuzzy Variant Generation ────────────────────────────────────────────────

const HOMOGLYPHS: Record<string, string> = { o:"0",l:"1",i:"l",a:"4",e:"3",s:"5",t:"7" };
const ADJACENT_KEYS: Record<string, string> = {
  a:"sq",b:"vn",c:"xv",d:"sf",e:"wr",f:"dg",g:"fh",h:"gj",i:"uo",j:"hk",
  k:"jl",l:"k",m:"n",n:"mb",o:"ip",p:"o",q:"wa",r:"et",s:"ad",t:"ry",
  u:"yi",v:"cb",w:"qe",x:"zc",y:"ut",z:"x",
};

export function generateFuzzyVariants(domain: string, tlds: string[]): Omit<FuzzyVariant, "registered">[] {
  const dotIdx = domain.indexOf(".");
  if (dotIdx === -1) return [];
  const label = domain.slice(0, dotIdx);
  const baseTld = domain.slice(dotIdx);
  const variants = new Map<string, Omit<FuzzyVariant, "registered">>();

  const add = (d: string, type: FuzzyVariant["type"]) => {
    const clean = d.toLowerCase();
    if (clean !== domain && !variants.has(clean) && clean.length > 3) {
      variants.set(clean, { domain: clean, type });
    }
  };

  for (const tld of tlds) {
    const t = tld.startsWith(".") ? tld : `.${tld}`;
    if (t !== baseTld) add(`${label}${t}`, "tld");
  }
  for (let i = 0; i < label.length; i++) {
    for (const r of (ADJACENT_KEYS[label[i].toLowerCase()] || "")) {
      add(`${label.slice(0,i)}${r}${label.slice(i+1)}${baseTld}`, "typo-swap");
    }
  }
  for (let i = 0; i < label.length; i++) {
    if (label.length > 3) add(`${label.slice(0,i)}${label.slice(i+1)}${baseTld}`, "typo-drop");
  }
  for (let i = 0; i < label.length; i++) {
    add(`${label.slice(0,i)}${label[i]}${label[i]}${label.slice(i+1)}${baseTld}`, "typo-double");
  }
  for (let i = 1; i < label.length - 1; i++) {
    add(`${label.slice(0,i)}-${label.slice(i)}${baseTld}`, "typo-hyphen");
  }
  for (let i = 0; i < label.length; i++) {
    const ch = label[i].toLowerCase();
    if (HOMOGLYPHS[ch]) add(`${label.slice(0,i)}${HOMOGLYPHS[ch]}${label.slice(i+1)}${baseTld}`, "typo-homoglyph");
  }
  return [...variants.values()];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function daysUntilExpiry(expiresAt: string): number {
  return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export function shouldAlert(domain: MonitoredDomain): number[] {
  const effectiveExpiry = domain.expiresAt || domain.manualExpiresAt;
  if (!effectiveExpiry) return [];
  const days = daysUntilExpiry(effectiveExpiry);
  // Return only the single closest pending threshold to avoid burst alerts
  const pending = domain.alertThresholds
    .filter(t => days <= t && !domain.alertsSent.includes(t))
    .sort((a, b) => a - b);
  return pending.length ? [pending[0]] : [];
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
