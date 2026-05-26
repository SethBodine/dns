import type { MonitoredDomain, FuzzyVariant } from "./types";

// ─── RDAP - Domain Expiry Lookup ─────────────────────────────────────────────

const RDAP_BOOTSTRAP = "https://rdap.org/domain/";

interface RdapResponse {
  events?: Array<{ eventAction: string; eventDate: string }>;
  entities?: Array<{ roles: string[]; vcardArray?: unknown[] }>;
}

export async function lookupDomainExpiry(domain: string): Promise<{
  expiresAt: string | null;
  registrar: string | null;
}> {
  try {
    const res = await fetch(`${RDAP_BOOTSTRAP}${encodeURIComponent(domain)}`, {
      headers: { Accept: "application/rdap+json" },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return { expiresAt: null, registrar: null };

    const data = await res.json() as RdapResponse;

    const expiryEvent = data.events?.find(
      (e) => e.eventAction === "expiration"
    );
    const expiresAt = expiryEvent?.eventDate ?? null;

    // Try to extract registrar name from entities
    const registrarEntity = data.entities?.find(
      (e) => e.roles?.includes("registrar")
    );
    let registrar: string | null = null;
    if (registrarEntity?.vcardArray) {
      const vcard = registrarEntity.vcardArray as unknown[][];
      const fnEntry = vcard[1]?.find?.((v: unknown) => Array.isArray(v) && v[0] === "fn");
      if (Array.isArray(fnEntry)) registrar = String(fnEntry[3] ?? "");
    }

    return { expiresAt, registrar };
  } catch {
    return { expiresAt: null, registrar: null };
  }
}

// ─── DNS Existence Check (for fuzzy finder) ──────────────────────────────────

const DOH_URL = "https://cloudflare-dns.com/dns-query";

export async function isDomainRegistered(domain: string): Promise<boolean | null> {
  try {
    const url = new URL(DOH_URL);
    url.searchParams.set("name", domain);
    url.searchParams.set("type", "A");

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/dns-json" },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return null;
    const data = await res.json() as { Status: number };
    // Status 0 = NOERROR (found), 3 = NXDOMAIN (not found)
    if (data.Status === 0) return true;
    if (data.Status === 3) return false;
    return null;
  } catch {
    return null;
  }
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
  const [label, ...tldParts] = domain.split(".");
  const baseTld = "." + tldParts.join(".");
  const variants: Map<string, Omit<FuzzyVariant, "registered">> = new Map();

  const add = (d: string, type: FuzzyVariant["type"]) => {
    if (d !== domain && !variants.has(d)) variants.set(d, { domain: d, type });
  };

  // TLD variants
  for (const tld of tlds) {
    if (tld !== baseTld) add(`${label}${tld}`, "tld");
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
    if (label.length > 2) {
      add(`${label.slice(0, i)}${label.slice(i + 1)}${baseTld}`, "typo-drop");
    }
  }

  // Doubled character
  for (let i = 0; i < label.length; i++) {
    add(`${label.slice(0, i)}${label[i]}${label[i]}${label.slice(i + 1)}${baseTld}`, "typo-double");
  }

  // Hyphen insert
  for (let i = 1; i < label.length; i++) {
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
