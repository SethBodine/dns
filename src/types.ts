export interface Env {
  KV: KVNamespace;

  // App config (from wrangler.toml [vars])
  MAX_MONITORED_DOMAINS: string;
  MAX_FUZZY_HISTORY: string;
  MAX_FUZZY_BATCH: string;
  DEFAULT_ALERT_THRESHOLDS: string;
  RATE_LIMIT_RPM: string;
  RATE_LIMIT_LOOKUPS_RPM: string;
  SESSION_MAX_AGE: string;
  FUZZY_TLDS: string;

  // Secrets (wrangler secret put)
  APP_PASSWORD: string;
  SESSION_SECRET: string;

  // Email secrets (optional, at least one set)
  RESEND_API_KEY?: string;
  MAILGUN_API_KEY?: string;
  MAILGUN_DOMAIN?: string;
  SENDGRID_API_KEY?: string;

  // Email defaults (can be overridden via UI/KV)
  EMAIL_FROM?: string;
  EMAIL_TO?: string;
  EMAIL_SUBJECT_PREFIX?: string;
}

export interface MonitoredDomain {
  id: string;
  domain: string;
  addedAt: string;
  expiresAt: string | null;
  registrar: string | null;
  lastChecked: string | null;
  alertThresholds: number[]; // days before expiry to alert
  alertsSent: number[];      // thresholds already alerted
  notes: string;
}

export interface FuzzyScanResult {
  id: string;
  baseDomain: string;
  scannedAt: string;
  results: FuzzyVariant[];
}

export interface FuzzyVariant {
  domain: string;
  type: "tld" | "typo-swap" | "typo-drop" | "typo-double" | "typo-hyphen" | "typo-homoglyph";
  registered: boolean | null; // null = unknown/error
}

export interface AlertLog {
  id: string;
  domain: string;
  type: "expiry-warning" | "expired";
  daysRemaining: number;
  sentAt: string;
  emailProvider: string;
  success: boolean;
}

export interface AppSettings {
  emailFrom: string;
  emailTo: string;
  emailSubjectPrefix: string;
  emailProvider: string; // auto-detected but stored after first detection
}

export interface RateLimitEntry {
  count: number;
  windowStart: number;
}
