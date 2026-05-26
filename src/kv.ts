import type { Env, MonitoredDomain, FuzzyScanResult, AlertLog, AppSettings } from "./types";

// ─── Key conventions ──────────────────────────────────────────────────────────
// domains:list           → string[] of domain IDs
// domains:{id}           → MonitoredDomain
// fuzzy:list             → string[] of scan IDs
// fuzzy:{id}             → FuzzyScanResult
// alerts:list            → string[] of alert IDs (last 200)
// alerts:{id}            → AlertLog
// settings:email         → AppSettings (partial)

// ─── Monitored Domains ───────────────────────────────────────────────────────

export async function getDomainList(env: Env): Promise<string[]> {
  return (await env.KV.get("domains:list", "json") as string[] | null) ?? [];
}

export async function getAllDomains(env: Env): Promise<MonitoredDomain[]> {
  const ids = await getDomainList(env);
  const domains = await Promise.all(ids.map((id) => getDomain(env, id)));
  return domains.filter(Boolean) as MonitoredDomain[];
}

export async function getDomain(env: Env, id: string): Promise<MonitoredDomain | null> {
  return env.KV.get(`domains:${id}`, "json") as Promise<MonitoredDomain | null>;
}

export async function saveDomain(env: Env, domain: MonitoredDomain): Promise<void> {
  const ids = await getDomainList(env);
  if (!ids.includes(domain.id)) {
    ids.push(domain.id);
    await env.KV.put("domains:list", JSON.stringify(ids));
  }
  await env.KV.put(`domains:${domain.id}`, JSON.stringify(domain));
}

export async function deleteDomain(env: Env, id: string): Promise<void> {
  const ids = (await getDomainList(env)).filter((i) => i !== id);
  await env.KV.put("domains:list", JSON.stringify(ids));
  await env.KV.delete(`domains:${id}`);
}

export async function deleteDomains(env: Env, ids: string[]): Promise<void> {
  const all = await getDomainList(env);
  const remaining = all.filter((i) => !ids.includes(i));
  await env.KV.put("domains:list", JSON.stringify(remaining));
  await Promise.all(ids.map((id) => env.KV.delete(`domains:${id}`)));
}

// ─── Fuzzy Scan History ───────────────────────────────────────────────────────

export async function getFuzzyList(env: Env): Promise<string[]> {
  return (await env.KV.get("fuzzy:list", "json") as string[] | null) ?? [];
}

export async function getAllFuzzyScans(env: Env): Promise<FuzzyScanResult[]> {
  const ids = await getFuzzyList(env);
  const scans = await Promise.all(ids.map((id) => getFuzzyScan(env, id)));
  return scans.filter(Boolean) as FuzzyScanResult[];
}

export async function getFuzzyScan(env: Env, id: string): Promise<FuzzyScanResult | null> {
  return env.KV.get(`fuzzy:${id}`, "json") as Promise<FuzzyScanResult | null>;
}

export async function saveFuzzyScan(env: Env, scan: FuzzyScanResult): Promise<void> {
  const maxHistory = parseInt(env.MAX_FUZZY_HISTORY || "100", 10);
  let ids = await getFuzzyList(env);

  // Remove oldest if at limit
  while (ids.length >= maxHistory) {
    const oldest = ids.shift()!;
    await env.KV.delete(`fuzzy:${oldest}`);
  }

  ids.push(scan.id);
  await env.KV.put("fuzzy:list", JSON.stringify(ids));
  await env.KV.put(`fuzzy:${scan.id}`, JSON.stringify(scan));
}

export async function deleteFuzzyScan(env: Env, id: string): Promise<void> {
  const ids = (await getFuzzyList(env)).filter((i) => i !== id);
  await env.KV.put("fuzzy:list", JSON.stringify(ids));
  await env.KV.delete(`fuzzy:${id}`);
}

// ─── Alert Log ───────────────────────────────────────────────────────────────

export async function getAlertList(env: Env): Promise<string[]> {
  return (await env.KV.get("alerts:list", "json") as string[] | null) ?? [];
}

export async function getRecentAlerts(env: Env, limit = 50): Promise<AlertLog[]> {
  const ids = (await getAlertList(env)).slice(-limit).reverse();
  const alerts = await Promise.all(ids.map((id) => env.KV.get(`alerts:${id}`, "json")));
  return alerts.filter(Boolean) as AlertLog[];
}

export async function saveAlert(env: Env, alert: AlertLog): Promise<void> {
  let ids = await getAlertList(env);
  ids.push(alert.id);
  if (ids.length > 200) ids = ids.slice(-200);
  await env.KV.put("alerts:list", JSON.stringify(ids));
  await env.KV.put(`alerts:${alert.id}`, JSON.stringify(alert), { expirationTtl: 60 * 60 * 24 * 90 }); // 90 days
}

// ─── Settings ────────────────────────────────────────────────────────────────

export async function getSettings(env: Env): Promise<Partial<AppSettings>> {
  return (await env.KV.get("settings:email", "json") as Partial<AppSettings> | null) ?? {};
}

export async function saveSettings(env: Env, settings: Partial<AppSettings>): Promise<void> {
  const existing = await getSettings(env);
  await env.KV.put("settings:email", JSON.stringify({ ...existing, ...settings }));
}
