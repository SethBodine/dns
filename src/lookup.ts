import type { MonitoredDomain, FuzzyVariant } from "./types";

// ─── RDAP - Domain Expiry Lookup ─────────────────────────────────────────────
// Uses multiple public RDAP bootstrap endpoints with fallback

const RDAP_ENDPOINTS = [
  "https://rdap.org/domain/",
  "https://rdap.iana.org/domain/",
];

interface RdapResponse {
  events?: Array<{ eventAction: string; eventDate: string }>;
  entities?: Array<{ roles: string[]; vcardArray?: unknown[]; handle?: string }>;
}

async function tryRdapEndpoint(endpoint: string, domain: string): Promise<RdapResponse | null> {
  try {
    const res = await fetch(`${endpoint}${encodeURIComponent(domain)}`, {
      headers: {
        Accept: "application/rdap+json,application/json",
        "User-Agent": "domain-watch/1.0",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      console.log(`RDAP ${endpoint} returned ${res.status} for ${domain}`);
      return null;
    }
    return await res.json() as RdapResponse;
  } catch (e) {
    console.log(`RDAP ${endpoint} failed for ${domain}: ${String(e)}`);
    return null;
  }
}

export async function lookupDomainExpiry(domain: string): Promise<{
  expiresAt: string | null;
  registrar: string | null;
}> {
  let data: RdapResponse | null = null;

  for (const endpoint of RDAP_ENDPOINTS) {
    data = await tryRdapEndpoint(endpoint, domain);
    if (data?.events?.length) break;
  }

  if (!data) return { expiresAt: null, registrar: null };

  const expiryEvent = data.events?.find(
    (e) => e.eventAction === "expiration" || e.eventAction === "expires" || e.eventAction === "expiry"
  );
  const expiresAt = expiryEvent?.eventDate ?? null;

  let registrar: string | null = null;
  const registrarEntity = data.entities?.find((e) => e.roles?.includes("registrar"));
  if (registrarEntity?.vcardArray) {
    try {
      const vcard = registrarEntity.vcardArray as unknown[][];
      const props = Array.isArray(vcard[1]) ? vcard[1] : [];
      const fnEntry = (props as unknown[]).find((v: unknown) => Array.isArray(v) && (v as unknown[])[0] === "fn");
      if (Array.isArray(fnEntry) && fnEntry[3]) registrar = String(fnEntry[3]);
    } catch { /* ignore */ }
  }
  if (!registrar && registrarEntity?.handle) registrar = registrarEntity.handle;

  return { expiresAt, registrar };
}

// ─── DNS Existence Check ──────────────────────────────────────────────────────

const DOH_URL = "https://cloudflare-dns.com/dns-query";

async function dnsQuery(domain: string, type: string): Promise<number | null> {
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
    // Status 0 = NOERROR, 3 = NXDOMAIN
    if (data.Status === 0 && type !== "A") return data.Answer?.length ? 0 : 3;
    return data.Status;
  } catch {
    return null;
  }
}

export async function checkDomainExists(domain: string): Promise<boolean | null> {
  // Check A and NS in parallel; registered = either returns NOERROR with answers
  const [aStatus, nsStatus] = await Promise.all([
    dnsQuery(domain, "A"),
    dnsQuery(domain, "NS"),
  ]);

  // NXDOMAIN on both = definitively not registered
  if (aStatus === 3 && nsStatus === 3) return false;
  // NOERROR on either = registered
  if (aStatus === 0 || nsStatus === 0) return true;
  // One says NXDOMAIN, other unknown = trust NXDOMAIN
  if (aStatus === 3 || nsStatus === 3) return false;
  // Both unknown
  return null;
}

// Rescan only the unknown variants from a previous scan
export async function recheckUnknowns(
  unknownDomains: string[]
): Promise<Map<string, boolean | null>> {
  const results = new Map<string, boolean | null>();
  // Small batches with pause to reduce timeouts
  const batchSize = 8;
  for (let i = 0; i < unknownDomains.length; i += batchSize) {
    if (i > 0) await new Promise((r) => setTimeout(r, 300));
    const batch = unknownDomains.slice(i, i + batchSize);
    const checks = await Promise.all(
      batch.map(async (d) => ({ d, result: await checkDomainExists(d) }))
    );
    for (const { d, result } of checks) results.set(d, result);
  }
  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Fuzzy Variant Generation ────────────────────────────────────────────────

const HOMOGLYPHS: Record<string, string> = {
  o: "0", l: "1", i: "l", a: "4", e: "3", s: "5", t: "7",
};

const ADJACENT_KEYS: Record<string, string> = {
  a: "sq", b: "vn", c: "xv", d: "sf", e: "wr", f: "dg", g: "fh",
  h: "gj", i: "uo", j: "hk", k: "jl", l: "k", m: "n", n: "mb",
  o: "ip", p: "o", q: "wa", r: "et", s: "ad", t: "ry", u: "yi",
  v: "cb", w: "qe", x: "zc", y: "ut", z: "x",
};

export function generateFuzzyVariants(domain: string, tlds: string[]): Omit<FuzzyVariant, "registered">[] {
  const dotIdx = domain.indexOf(".");
  if (dotIdx === -1) return [];
  const label = domain.slice(0, dotIdx);
  const baseTld = domain.slice(dotIdx);

  const variants: Map<string, Omit<FuzzyVariant, "registered">> = new Map();

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
    const ch = label[i].toLowerCase();
    for (const replacement of (ADJACENT_KEYS[ch] || "")) {
      add(`${label.slice(0, i)}${replacement}${label.slice(i + 1)}${baseTld}`, "typo-swap");
    }
  }

  for (let i = 0; i < label.length; i++) {
    if (label.length > 3) add(`${label.slice(0, i)}${label.slice(i + 1)}${baseTld}`, "typo-drop");
  }

  for (let i = 0; i < label.length; i++) {
    add(`${label.slice(0, i)}${label[i]}${label[i]}${label.slice(i + 1)}${baseTld}`, "typo-double");
  }

  for (let i = 1; i < label.length - 1; i++) {
    add(`${label.slice(0, i)}-${label.slice(i)}${baseTld}`, "typo-hyphen");
  }

  for (let i = 0; i < label.length; i++) {
    const ch = label[i].toLowerCase();
    if (HOMOGLYPHS[ch]) {
      add(`${label.slice(0, i)}${HOMOGLYPHS[ch]}${label.slice(i + 1)}${baseTld}`, "typo-homoglyph");
    }
  }

  return [...variants.values()];
}

// ─── Expiry helpers ───────────────────────────────────────────────────────────

export function daysUntilExpiry(expiresAt: string): number {
  return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export function shouldAlert(domain: MonitoredDomain): number[] {
  if (!domain.expiresAt) return [];
  const days = daysUntilExpiry(domain.expiresAt);
  return domain.alertThresholds.filter(
    (t) => days <= t && !domain.alertsSent.includes(t)
  );
}

// suppress unused warning
void sleep;
