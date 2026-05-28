import type { MonitoredDomain, FuzzyVariant } from "./types";

// ─── WHOIS via who-dat (primary) ──────────────────────────────────────────────
// Free public WHOIS-over-HTTP API, no key required.
// Returns JSON with expiry and registrar data for most TLDs.

interface WhoDatResponse {
  domain?: {
    expiration_date?: string;
    updated_date?: string;
    creation_date?: string;
    registrar?: string;
    name?: string;
  };
  error?: string;
}

async function lookupViaWhoDat(domain: string): Promise<{
  expiresAt: string | null;
  registrar: string | null;
} | null> {
  try {
    const res = await fetch(`https://who-dat.as93.net/${encodeURIComponent(domain)}`, {
      headers: { Accept: "application/json", "User-Agent": "domain-watch/1.0" },
      signal: AbortSignal.timeout(12000),
    });
    console.log(`WHOIS who-dat ${domain} -> HTTP ${res.status}`);
    if (!res.ok) return null;

    const data = await res.json() as WhoDatResponse;
    if (data.error || !data.domain) {
      console.log(`WHOIS who-dat: no domain data for ${domain}`);
      return null;
    }

    const expiresAt = data.domain.expiration_date ?? null;
    const registrar = data.domain.registrar ?? null;
    if (expiresAt) console.log(`WHOIS success: ${domain} expires ${expiresAt}`);
    return { expiresAt, registrar };
  } catch (e) {
    console.log(`WHOIS who-dat ${domain} -> ERROR: ${String(e)}`);
    return null;
  }
}

// ─── RDAP (fallback) ─────────────────────────────────────────────────────────
// Used if WHOIS fails. Authoritative per-TLD servers based on IANA bootstrap.

const TLD_RDAP: Record<string, string> = {
  // gTLDs — Verisign
  "com":    "https://rdap.verisign.com/com/v1/domain/",
  "net":    "https://rdap.verisign.com/net/v1/domain/",
  // PIR
  "org":    "https://rdap.publicinterestregistry.org/rdap/domain/",
  // AFILIAS / various
  "info":   "https://rdap.afilias.net/rdap/info/domain/",
  "io":     "https://rdap.nic.io/domain/",
  "co":     "https://rdap.nic.co/domain/",
  "app":    "https://rdap.nic.google/domain/",
  "dev":    "https://rdap.nic.google/domain/",
  "ai":     "https://rdap.nic.ai/domain/",
  "me":     "https://rdap.nic.me/domain/",
  "biz":    "https://rdap.nic.biz/domain/",
  // NZ — NZRS
  "nz":     "https://rdap.nzrs.net.nz/domain/",
  "co.nz":  "https://rdap.nzrs.net.nz/domain/",
  "net.nz": "https://rdap.nzrs.net.nz/domain/",
  "org.nz": "https://rdap.nzrs.net.nz/domain/",
  // AU — auDA
  "au":     "https://rdap.auda.org.au/domain/",
  "com.au": "https://rdap.auda.org.au/domain/",
  "net.au": "https://rdap.auda.org.au/domain/",
  "org.au": "https://rdap.auda.org.au/domain/",
  // UK — Nominet
  "uk":     "https://rdap.nominet.uk/domain/",
  "co.uk":  "https://rdap.nominet.uk/domain/",
  "org.uk": "https://rdap.nominet.uk/domain/",
  "me.uk":  "https://rdap.nominet.uk/domain/",
  // Europe
  "de":     "https://rdap.denic.de/domain/",
  "fr":     "https://rdap.nic.fr/domain/",
  "nl":     "https://rdap.sidn.nl/domain/",
  "it":     "https://rdap.nic.it/domain/",
  "es":     "https://rdap.nic.es/domain/",
  "pl":     "https://rdap.dns.pl/domain/",
  "ch":     "https://rdap.nic.ch/domain/",
  "se":     "https://rdap.iis.se/domain/",
  "no":     "https://rdap.norid.no/domain/",
  "dk":     "https://rdap.dk-hostmaster.dk/domain/",
  "fi":     "https://rdap.fi/domain/",
  // Americas
  "ca":     "https://rdap.cira.ca/domain/",
  "br":     "https://rdap.registro.br/domain/",
  // Asia
  "jp":     "https://rdap.jprs.jp/domain/",
};

const RDAP_GENERIC = "https://rdap.org/domain/";

function getRdapUrl(domain: string): string {
  const lower = domain.toLowerCase();
  const parts = lower.split(".");
  // Try longest suffix match (e.g. "co.nz" before "nz")
  for (let i = 1; i < parts.length; i++) {
    const suffix = parts.slice(i).join(".");
    if (TLD_RDAP[suffix]) return TLD_RDAP[suffix];
  }
  return RDAP_GENERIC;
}

interface RdapResponse {
  events?: Array<{ eventAction: string; eventDate: string }>;
  entities?: Array<{ roles: string[]; vcardArray?: unknown[]; handle?: string }>;
  expirationDate?: string;
}

async function lookupViaRdap(domain: string): Promise<{
  expiresAt: string | null;
  registrar: string | null;
} | null> {
  const endpoint = getRdapUrl(domain);
  console.log(`RDAP trying ${endpoint}${domain}`);
  try {
    const res = await fetch(`${endpoint}${encodeURIComponent(domain)}`, {
      headers: { Accept: "application/rdap+json,application/json;q=0.9", "User-Agent": "domain-watch/1.0" },
      signal: AbortSignal.timeout(12000),
    });
    console.log(`RDAP ${endpoint}${domain} -> HTTP ${res.status}`);
    // 404 = domain not registered (valid response), not an endpoint error
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

    if (expiresAt) console.log(`RDAP success: ${domain} expires ${expiresAt}`);
    else console.log(`RDAP 200 but no expiry. Events: ${JSON.stringify(data.events?.map(e => e.eventAction))}`);
    return { expiresAt, registrar };
  } catch (e) {
    console.log(`RDAP ${domain} -> ERROR: ${String(e)}`);
    return null;
  }
}

// ─── Main expiry lookup ───────────────────────────────────────────────────────

export async function lookupDomainExpiry(domain: string): Promise<{
  expiresAt: string | null;
  registrar: string | null;
}> {
  // Try WHOIS first (broader TLD support, simpler)
  const whois = await lookupViaWhoDat(domain);
  if (whois?.expiresAt) return whois;

  // Fall back to RDAP
  const rdap = await lookupViaRdap(domain);
  if (rdap?.expiresAt) return rdap;

  // Return whatever partial data we have (registrar without expiry, etc.)
  return {
    expiresAt: whois?.expiresAt ?? rdap?.expiresAt ?? null,
    registrar: whois?.registrar ?? rdap?.registrar ?? null,
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
  } catch {
    return null;
  }
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

// Recheck unknowns with small batches and delays
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
  // Only alert on the SINGLE closest threshold not yet sent
  // (avoids sending multiple alerts for an already-expired domain on first check)
  const pending = domain.alertThresholds
    .filter(t => days <= t && !domain.alertsSent.includes(t))
    .sort((a, b) => a - b); // ascending — smallest threshold first
  // Return only the closest one
  return pending.length ? [pending[0]] : [];
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
