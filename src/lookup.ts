import type { MonitoredDomain, FuzzyVariant } from "./types";

// ─── RDAP - Domain Expiry Lookup ─────────────────────────────────────────────

const RDAP_ENDPOINTS = [
  "https://rdap.org/domain/",
  "https://rdap.iana.org/domain/",
];

interface RdapEvent { eventAction: string; eventDate: string }
interface RdapEntity { roles: string[]; vcardArray?: unknown[]; handle?: string }
interface RdapResponse {
  events?: RdapEvent[];
  entities?: RdapEntity[];
  // Some registries nest under links or use different field names
  expirationDate?: string;
}

async function tryRdapEndpoint(endpoint: string, domain: string): Promise<{ data: RdapResponse | null; status: number | null }> {
  try {
    const res = await fetch(`${endpoint}${encodeURIComponent(domain)}`, {
      headers: {
        Accept: "application/rdap+json,application/json;q=0.9",
        "User-Agent": "domain-watch/1.0 (monitoring tool)",
      },
      signal: AbortSignal.timeout(15000),
    });
    console.log(`RDAP ${endpoint}${domain} -> HTTP ${res.status}`);
    if (!res.ok) return { data: null, status: res.status };
    const data = await res.json() as RdapResponse;
    console.log(`RDAP events: ${JSON.stringify(data.events?.map(e => e.eventAction))}`);
    return { data, status: res.status };
  } catch (e) {
    console.log(`RDAP ${endpoint}${domain} -> ERROR: ${String(e)}`);
    return { data: null, status: null };
  }
}

function extractExpiry(data: RdapResponse): string | null {
  if (!data) return null;
  // Standard RDAP event actions for expiry (registries vary)
  const expiryActions = ["expiration", "expires", "expiry", "domain expiration", "registrar expiration"];
  const evt = data.events?.find(e => expiryActions.some(a => e.eventAction?.toLowerCase().includes(a)));
  if (evt?.eventDate) return evt.eventDate;
  // Some registries put it at top level
  if (data.expirationDate) return data.expirationDate;
  // Log all event actions so we can diagnose unknown formats
  if (data.events?.length) {
    console.log(`RDAP: no expiry event found. All events: ${JSON.stringify(data.events.map(e => e.eventAction))}`);
  } else {
    console.log("RDAP: response has no events array");
  }
  return null;
}

function extractRegistrar(data: RdapResponse): string | null {
  const registrarEntity = data.entities?.find(e => e.roles?.includes("registrar"));
  if (!registrarEntity) return null;
  if (registrarEntity.vcardArray) {
    try {
      const vcard = registrarEntity.vcardArray as unknown[][];
      const props = Array.isArray(vcard[1]) ? vcard[1] as unknown[] : [];
      const fnEntry = props.find(v => Array.isArray(v) && (v as unknown[])[0] === "fn");
      if (Array.isArray(fnEntry) && fnEntry[3]) return String(fnEntry[3]);
    } catch { /* ignore */ }
  }
  return registrarEntity.handle ?? null;
}

export async function lookupDomainExpiry(domain: string): Promise<{
  expiresAt: string | null;
  registrar: string | null;
}> {
  for (const endpoint of RDAP_ENDPOINTS) {
    const { data, status } = await tryRdapEndpoint(endpoint, domain);
    if (!data || status !== 200) continue;
    const expiresAt = extractExpiry(data);
    const registrar = extractRegistrar(data);
    if (expiresAt) {
      console.log(`RDAP success: ${domain} expires ${expiresAt}`);
      return { expiresAt, registrar };
    }
    // Got a response but no expiry — log full response for diagnosis
    console.log(`RDAP: got response but no expiry for ${domain}. Keys: ${Object.keys(data).join(", ")}`);
  }
  return { expiresAt: null, registrar: null };
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
  // NXDOMAIN (3) on both = not registered
  if (a?.status === 3 && ns?.status === 3) return false;
  // NOERROR with answers on either = registered
  if ((a?.status === 0 && a.hasAnswers) || (ns?.status === 0 && ns.hasAnswers)) return true;
  // NOERROR without answers can mean parked/registered but no records
  if (a?.status === 0 || ns?.status === 0) return true;
  // One NXDOMAIN + one unknown = trust NXDOMAIN
  if (a?.status === 3 || ns?.status === 3) return false;
  return null;
}

// Recheck only unknown variants — smaller batches, longer delay
export async function recheckUnknowns(unknownDomains: string[]): Promise<Map<string, boolean | null>> {
  const results = new Map<string, boolean | null>();
  const batchSize = 5;
  for (let i = 0; i < unknownDomains.length; i += batchSize) {
    if (i > 0) await sleep(400);
    const batch = unknownDomains.slice(i, i + batchSize);
    const checks = await Promise.all(batch.map(async d => ({ d, result: await checkDomainExists(d) })));
    for (const { d, result } of checks) results.set(d, result);
  }
  return results;
}

// ─── Fuzzy Variant Generation ────────────────────────────────────────────────

const HOMOGLYPHS: Record<string, string> = {
  o: "0", l: "1", i: "l", a: "4", e: "3", s: "5", t: "7",
};
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
  if (!domain.expiresAt) return [];
  const days = daysUntilExpiry(domain.expiresAt);
  return domain.alertThresholds.filter(t => days <= t && !domain.alertsSent.includes(t));
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
