import type { MonitoredDomain, FuzzyVariant } from "./types";

// ─── RDAP - Domain Expiry Lookup ─────────────────────────────────────────────
// Uses multiple RDAP endpoints with fallback for reliability

const RDAP_ENDPOINTS = [
  "https://rdap.org/domain/",
  "https://rdap.iana.org/domain/",
];

interface RdapResponse {
  events?: Array<{ eventAction: string; eventDate: string }>;
  entities?: Array<{ roles: string[]; vcardArray?: unknown[]; handle?: string }>;
  nameservers?: Array<{ ldhName: string }>;
}

async function tryRdapEndpoint(endpoint: string, domain: string): Promise<RdapResponse | null> {
  try {
    const res = await fetch(`${endpoint}${encodeURIComponent(domain)}`, {
      headers: {
        Accept: "application/rdap+json,application/json",
        "User-Agent": "domain-watch/1.0",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return await res.json() as RdapResponse;
  } catch {
    return null;
  }
}

export async function lookupDomainExpiry(domain: string): Promise<{
  expiresAt: string | null;
  registrar: string | null;
}> {
  let data: RdapResponse | null = null;

  // Try primary, then fallback
  for (const endpoint of RDAP_ENDPOINTS) {
    data = await tryRdapEndpoint(endpoint, domain);
    if (data?.events) break;
  }

  if (!data) return { expiresAt: null, registrar: null };

  // Find expiry — RDAP uses "expiration" but some registries use "expires"
  const expiryEvent = data.events?.find(
    (e) => e.eventAction === "expiration" || e.eventAction === "expires"
  );
  const expiresAt = expiryEvent?.eventDate ?? null;

  // Extract registrar name from entities
  let registrar: string | null = null;
  const registrarEntity = data.entities?.find((e) => e.roles?.includes("registrar"));
  if (registrarEntity?.vcardArray) {
    try {
      const vcard = registrarEntity.vcardArray as unknown[][];
      // vcard[1] is the array of properties
      const props = Array.isArray(vcard[1]) ? vcard[1] : [];
      const fnEntry = props.find((v: unknown) => Array.isArray(v) && (v as unknown[])[0] === "fn");
      if (Array.isArray(fnEntry) && fnEntry[3]) registrar = String(fnEntry[3]);
    } catch { /* ignore parse errors */ }
  }
  // Fallback: use handle if no name found
  if (!registrar && registrarEntity?.handle) registrar = registrarEntity.handle;

  return { expiresAt, registrar };
}

// ─── DNS Existence Check (for fuzzy finder) ──────────────────────────────────

const DOH_URL = "https://cloudflare-dns.com/dns-query";

// Check with retries and a slightly longer timeout to reduce unknowns
export async function isDomainRegistered(domain: string, retries = 1): Promise<boolean | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const url = new URL(DOH_URL);
      url.searchParams.set("name", domain);
      url.searchParams.set("type", "A");

      const res = await fetch(url.toString(), {
        headers: { Accept: "application/dns-json" },
        signal: AbortSignal.timeout(7000),
      });

      if (!res.ok) continue;
      const data = await res.json() as { Status: number };
      // Status 0 = NOERROR (exists), 3 = NXDOMAIN (not registered)
      if (data.Status === 0) return true;
      if (data.Status === 3) return false;
      // Other statuses (SERVFAIL etc) — retry
    } catch {
      if (attempt < retries) await sleep(500);
    }
  }
  return null;
}

// Also check NS records — a domain can be registered without an A record
export async function isDomainRegisteredNS(domain: string): Promise<boolean | null> {
  try {
    const url = new URL(DOH_URL);
    url.searchParams.set("name", domain);
    url.searchParams.set("type", "NS");

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/dns-json" },
      signal: AbortSignal.timeout(7000),
    });

    if (!res.ok) return null;
    const data = await res.json() as { Status: number; Answer?: unknown[] };
    if (data.Status === 0 && data.Answer && data.Answer.length > 0) return true;
    if (data.Status === 3) return false;
    return null;
  } catch {
    return null;
  }
}

// Combined check: domain registered if A or NS records found
export async function checkDomainExists(domain: string): Promise<boolean | null> {
  const [a, ns] = await Promise.all([
    isDomainRegistered(domain, 1),
    isDomainRegisteredNS(domain),
  ]);
  if (a === true || ns === true) return true;
  if (a === false && ns === false) return false;
  // If one says false and other unknown, trust the false
  if (a === false || ns === false) return false;
  return null;
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
  const baseTld = domain.slice(dotIdx); // includes the dot

  const variants: Map<string, Omit<FuzzyVariant, "registered">> = new Map();

  const add = (d: string, type: FuzzyVariant["type"]) => {
    const clean = d.toLowerCase();
    if (clean !== domain && !variants.has(clean) && clean.length > 3) {
      variants.set(clean, { domain: clean, type });
    }
  };

  // TLD variants
  for (const tld of tlds) {
    const normalised = tld.startsWith(".") ? tld : `.${tld}`;
    if (normalised !== baseTld) add(`${label}${normalised}`, "tld");
  }

  // Character swap (adjacent keys)
  for (let i = 0; i < label.length; i++) {
    const ch = label[i].toLowerCase();
    const adj = ADJACENT_KEYS[ch] || "";
    for (const replacement of adj) {
      add(`${label.slice(0, i)}${replacement}${label.slice(i + 1)}${baseTld}`, "typo-swap");
    }
  }

  // Dropped character
  for (let i = 0; i < label.length; i++) {
    if (label.length > 3) {
      add(`${label.slice(0, i)}${label.slice(i + 1)}${baseTld}`, "typo-drop");
    }
  }

  // Doubled character
  for (let i = 0; i < label.length; i++) {
    add(`${label.slice(0, i)}${label[i]}${label[i]}${label.slice(i + 1)}${baseTld}`, "typo-double");
  }

  // Hyphen insert
  for (let i = 1; i < label.length - 1; i++) {
    add(`${label.slice(0, i)}-${label.slice(i)}${baseTld}`, "typo-hyphen");
  }

  // Homoglyph substitution
  for (let i = 0; i < label.length; i++) {
    const ch = label[i].toLowerCase();
    if (HOMOGLYPHS[ch]) {
      add(`${label.slice(0, i)}${HOMOGLYPHS[ch]}${label.slice(i + 1)}${baseTld}`, "typo-homoglyph");
    }
  }

  return [...variants.values()];
}

// ─── Days Until Expiry ────────────────────────────────────────────────────────

export function daysUntilExpiry(expiresAt: string): number {
  const expiry = new Date(expiresAt).getTime();
  const now = Date.now();
  return Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
}

export function shouldAlert(domain: MonitoredDomain): number[] {
  if (!domain.expiresAt) return [];
  const days = daysUntilExpiry(domain.expiresAt);
  return domain.alertThresholds.filter(
    (threshold) =>
      days <= threshold &&
      !domain.alertsSent.includes(threshold)
  );
}
