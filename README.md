# Domain Watch

A secure, self-hosted domain monitoring tool that runs entirely on Cloudflare's free tier. It tracks domain expiry dates, sends email alerts before they expire, and scans for typosquatting / alternate TLD variants of your domains.

**No servers. No subscriptions. Hosted on GitHub, deployed and run by Cloudflare.**

---

## Features

- **Domain Monitor** — Track expiry dates via RDAP (the modern WHOIS standard). See days remaining at a glance.
- **Automated alerts** — Email notifications at configurable thresholds (90, 60, 30, 14, 7 days before expiry, and on expiry).
- **Fuzzy finder** — Checks alternate TLDs (`.net`, `.io`, `.ai`, `.co.nz`, etc.) and typo variants (character swaps, dropped letters, homoglyphs) against live DNS to identify taken look-alike domains.
- **Multi-select** — Bulk delete or manage multiple domains at once.
- **Scan history** — Fuzzy scan results stored in KV, browseable anytime.
- **Email provider auto-detection** — Works with Resend, Mailgun, or SendGrid — whichever API key you set.
- **Configurable limits** — All rate limits, caps, and TLD lists in `wrangler.toml`.
- **Password protected** — Single-password auth with HMAC-signed session tokens.
- **OWASP Top 10 mitigations** — See [Security](#security) section.

---

## How it works

### Architecture

```
GitHub repo (source only)
       │
       └── Cloudflare Git integration (auto-deploy on push)
                     │
                     ▼
           Cloudflare Workers (runtime)
                     │
                     ├── Serves the SPA frontend (password-protected)
                     ├── REST API (/api/domains, /api/fuzzy, etc.)
                     ├── Cloudflare KV (persistent storage)
                     └── Cron trigger (daily at 08:00 UTC)
                               │
                               ├── Checks each domain via RDAP
                               └── Sends alerts via Resend / Mailgun / SendGrid
```

GitHub is **source control only**. All building, deployment, and hosting happens inside Cloudflare's infrastructure — no GitHub Actions, no external CI tokens, no third-party runners.

### Domain expiry checking

Domain expiry dates are fetched using **RDAP** (Registration Data Access Protocol), the modern structured replacement for WHOIS. The public endpoint `https://rdap.org/domain/{domain}` returns JSON including the expiry date — no API key required.

### Fuzzy finder / DNS existence checks

Whether a domain variant exists is determined by a **DNS-over-HTTPS** query to `https://cloudflare-dns.com/dns-query`. A `NOERROR` response means registered; `NXDOMAIN` means available. No WHOIS needed for existence checks — DNS is faster and more reliable.

### Fuzzy variants generated

For a domain like `mycompany.com`, Domain Watch generates:

| Type | Example |
|------|---------|
| Alternate TLD | `mycompany.net`, `mycompany.io`, `mycompany.co.nz` |
| Character swap (adjacent keys) | `mycompamy.com`, `mycomoany.com` |
| Dropped character | `mycompan.com`, `mcompany.com` |
| Doubled character | `myycompany.com`, `mycompanyy.com` |
| Hyphen insert | `my-company.com` |
| Homoglyph substitution | `myc0mpany.com` (o→0) |

### Email alerts

The worker inspects which API key is set and auto-selects the provider:

| Env var set | Provider used |
|-------------|---------------|
| `RESEND_API_KEY` | Resend |
| `MAILGUN_API_KEY` + `MAILGUN_SENDING_DOMAIN` | Mailgun |
| `SENDGRID_API_KEY` | SendGrid |

Alert thresholds are configurable per-domain via the UI. The daily cron tracks which thresholds have already been alerted to avoid duplicates.

### Storage (Cloudflare KV)

All data is stored in Cloudflare KV with a simple key convention:

| Key pattern | Contents |
|-------------|----------|
| `domains:list` | Ordered list of domain IDs |
| `domains:{uuid}` | MonitoredDomain record |
| `fuzzy:list` | Ordered list of fuzzy scan IDs |
| `fuzzy:{uuid}` | FuzzyScanResult record |
| `alerts:list` | Alert log IDs (last 200) |
| `alerts:{uuid}` | AlertLog record (90-day TTL) |
| `settings:email` | Email config (from/to/prefix) |
| `ratelimit:{type}:{ip}` | Rate limit counters (120s TTL) |

---

## Deployment

Domain Watch is deployed **entirely through Cloudflare** — Cloudflare builds it, hosts it, and manages CI/CD. GitHub is used only as the source code repository that Cloudflare watches for changes.

There are two deployment paths:

| Method | Best for |
|--------|----------|
| [A — Wrangler CLI](#method-a--wrangler-cli) | Quick first deploy, local development |
| [B — Cloudflare Git integration](#method-b--cloudflare-git-integration-recommended) | Production — auto-deploys on every push to `main`, no local CLI needed after setup |

---

### Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier is sufficient)
- A GitHub account with this repo pushed to it
- An account with [Resend](https://resend.com), [Mailgun](https://mailgun.com), or [SendGrid](https://sendgrid.com) for email alerts (all have free tiers)
- [Node.js 22+](https://nodejs.org/) and npm — required for Method A only

---

### Method A — Wrangler CLI

Use this for a quick local deploy, or for the initial setup before switching to Method B.

#### 1. Push the repo to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/domain-watch.git
git push -u origin main
```

#### 2. Install dependencies and authenticate

```bash
npm install
npx wrangler login
```

This opens a browser window to authenticate with your Cloudflare account.

#### 3. Create the KV namespace

```bash
npx wrangler kv:namespace create DOMAIN_WATCH_KV
```

The output looks like:

```
✅ Success!
{ binding = "KV", id = "abc123def456..." }
```

Also create a preview namespace for local dev:

```bash
npx wrangler kv:namespace create DOMAIN_WATCH_KV --preview
```

Open `wrangler.toml` and replace the placeholder IDs:

```toml
[[kv_namespaces]]
binding = "KV"
id = "YOUR_ACTUAL_KV_ID"
preview_id = "YOUR_PREVIEW_KV_ID"
```

Commit and push:

```bash
git add wrangler.toml && git commit -m "Add KV namespace IDs" && git push
```

#### 4. Set secrets

```bash
# Required
npx wrangler secret put APP_PASSWORD       # your UI login password
npx wrangler secret put SESSION_SECRET     # random 32+ chars: openssl rand -base64 32

# Email — set at least one provider
npx wrangler secret put RESEND_API_KEY     # https://resend.com (recommended)
# OR
npx wrangler secret put MAILGUN_API_KEY
npx wrangler secret put MAILGUN_SENDING_DOMAIN     # e.g. mg.yourdomain.com
# OR
npx wrangler secret put SENDGRID_API_KEY

# Optional defaults (can also be set in the UI after login)
npx wrangler secret put EMAIL_FROM
npx wrangler secret put EMAIL_TO
npx wrangler secret put EMAIL_SUBJECT_PREFIX

# Optional: improves ccTLD lookups (.co.nz, .com.au, .co.uk etc)
# Get a free key at https://whoisjson.com — 1,000 req/month, no credit card
npx wrangler secret put WHOIS_API_KEY
```

#### 5. Configure limits (optional)

Edit the `[vars]` section of `wrangler.toml` before deploying:

```toml
[vars]
MAX_MONITORED_DOMAINS = "50"
MAX_FUZZY_HISTORY = "100"
MAX_FUZZY_BATCH = "20"
DEFAULT_ALERT_THRESHOLDS = "90,60,30,14,7"
RATE_LIMIT_RPM = "60"
RATE_LIMIT_LOOKUPS_RPM = "20"
SESSION_MAX_AGE = "28800"
FUZZY_TLDS = ".com,.net,.org,.io,.co,.ai,.app,.dev,.info,.biz,.co.uk,.co.nz,.com.au"
```

#### 6. Deploy

```bash
npx wrangler deploy
```

Your worker is live at `https://domain-watch.YOUR_SUBDOMAIN.workers.dev`. To redeploy after any code change, run `npx wrangler deploy` again.

---

### Method B — Cloudflare Git integration (recommended)

This connects your GitHub repo directly to Cloudflare Workers. Every push to `main` triggers an automatic build and deploy — entirely within Cloudflare's infrastructure.

> **How it works:** Cloudflare connects to GitHub via OAuth (you authorise it once in the dashboard). When you push, Cloudflare clones your repo into its own secure build environment and deploys the Worker using your account context — already authenticated. Your Cloudflare credentials never leave Cloudflare. No GitHub Actions, no external CI tokens.

#### Step 1 — Push the repo to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/domain-watch.git
git push -u origin main
```

#### Step 2 — Create the KV namespace in the dashboard

You need a KV namespace ID before connecting the repo, so Cloudflare can wire up storage during the first build.

1. Log in to [dash.cloudflare.com](https://dash.cloudflare.com)
2. Go to **Workers & Pages** → **KV** (left sidebar, under Storage & Databases)
3. Click **Create a namespace**, name it `DOMAIN_WATCH_KV`, click **Add**
4. Copy the **Namespace ID** shown next to it in the list

Now update `wrangler.toml` with the real ID and push:

```toml
[[kv_namespaces]]
binding = "KV"
id = "YOUR_NAMESPACE_ID"
preview_id = "YOUR_NAMESPACE_ID"
```

```bash
git add wrangler.toml && git commit -m "Add KV namespace ID" && git push
```

#### Step 3 — Create the Worker and connect GitHub

1. In the Cloudflare dashboard, go to **Workers & Pages**
2. Click **Create**
3. Select the **Worker** tab (not Pages)
4. Look for **"Import a repository"** or **"Deploy from a Git repository"**

   > Cloudflare updates their dashboard UI periodically — the exact label may vary, but the Git-connected Worker option is always under Worker creation, not Pages.

5. Click **Connect to GitHub** and authorise Cloudflare to access your repositories
6. Select your `domain-watch` repository and the `main` branch
7. Confirm the build settings — Cloudflare will detect the `wrangler.toml` automatically
8. Click **Save and Deploy**

The first deploy will fail because secrets are not set yet. That is expected — continue to Step 4.

#### Step 4 — Set secrets in the dashboard

1. Go to **Workers & Pages** → **domain-watch** → **Settings** → **Variables and Secrets**
2. Under **Secrets**, click **Add** for each entry below

| Secret name | Value |
|-------------|-------|
| `APP_PASSWORD` | Your chosen UI login password |
| `SESSION_SECRET` | Random 32+ char string — generate with `openssl rand -base64 32` |
| `RESEND_API_KEY` | Your Resend API key — **or** use Mailgun/SendGrid below |
| `MAILGUN_API_KEY` | *(if using Mailgun)* |
| `MAILGUN_SENDING_DOMAIN` | *(if using Mailgun)* e.g. `mg.yourdomain.com` |
| `SENDGRID_API_KEY` | *(if using SendGrid)* |
| `EMAIL_FROM` | e.g. `alerts@yourdomain.com` |
| `EMAIL_TO` | e.g. `you@yourdomain.com` |
| `EMAIL_SUBJECT_PREFIX` | e.g. `[Domain Watch]` |
| `WHOIS_API_KEY` | *(optional but recommended)* Free key from [whoisjson.com](https://whoisjson.com) — improves `.co.nz`, `.com.au`, `.co.uk` and other ccTLD expiry lookups. Without it, ccTLD lookups may hit rate limits. |

Secrets are encrypted at rest and never visible after saving.

#### Step 5 — Bind the KV namespace

1. Still in **Settings**, go to **Bindings**
2. Click **Add** → **KV Namespace**
3. Set **Variable name** to `KV`
4. Select `DOMAIN_WATCH_KV` from the dropdown
5. Click **Save**

#### Step 6 — Trigger a clean deploy

Go to **Workers & Pages** → **domain-watch** → **Deployments** and click **Retry deployment** on the most recent entry. With secrets and bindings now in place, the build will succeed.

Your worker is live at `https://domain-watch.YOUR_SUBDOMAIN.workers.dev`.

> **From this point on**, every `git push` to `main` triggers an automatic Cloudflare build and deploy — no CLI, no GitHub Actions, no tokens required.

---

### Custom domain (both methods)

To serve Domain Watch from your own domain instead of `*.workers.dev`:

1. Go to **Workers & Pages** → **domain-watch** → **Settings** → **Domains & Routes**
2. Click **Add** → **Custom Domain**
3. Enter your domain (e.g. `watch.yourdomain.com`)
4. If your domain's DNS is managed by Cloudflare, the record is created automatically. Otherwise add a `CNAME` pointing to `domain-watch.YOUR_SUBDOMAIN.workers.dev`

---

### First login

Visit your worker URL, enter your `APP_PASSWORD`, and you're in.

Go to **Settings** to configure email from/to/subject prefix and confirm the detected email provider is correct.

---

## Local development

```bash
# Create a .dev.vars file for local secrets (gitignored)
cat > .dev.vars << EOF
APP_PASSWORD=mypassword
SESSION_SECRET=a-long-random-string-here-at-least-32-chars
RESEND_API_KEY=re_xxx
EMAIL_FROM=test@example.com
EMAIL_TO=you@example.com
EMAIL_SUBJECT_PREFIX=[Domain Watch Dev]
EOF

# Start local dev server (uses preview KV)
npx wrangler dev
```

---

## Security

Domain Watch is designed with the [OWASP Top 10](https://owasp.org/www-project-top-ten/) in mind:

| OWASP Category | Mitigation |
|----------------|------------|
| **A01 Broken Access Control** | All routes (except login) require a valid HMAC-signed session cookie. Session tokens expire per `SESSION_MAX_AGE`. |
| **A02 Cryptographic Failures** | Session tokens signed with HMAC-SHA256. Password comparison is constant-time (timing-safe). No sensitive data stored in plaintext. |
| **A03 Injection** | All domain inputs validated against a strict regex. All text inputs sanitised (HTML entity encoding). JSON bodies parsed safely with error handling. |
| **A04 Insecure Design** | Rate limiting per IP for both general requests and RDAP/DNS lookups (configurable). Login attempts separately rate-limited. |
| **A05 Security Misconfiguration** | Strict `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `HSTS`, `Referrer-Policy`, `Permissions-Policy` on every response. `Cache-Control: no-store` on all authenticated responses. |
| **A06 Vulnerable Components** | No external dependencies at runtime — zero npm packages in the worker itself. |
| **A07 Auth & Session Failures** | HttpOnly + Secure + SameSite=Strict cookies. CSRF origin/referer check on all state-changing requests. Constant-time password comparison. |
| **A08 Software & Data Integrity** | No `eval()` or dynamic code execution. CSP blocks inline scripts from external origins. |
| **A09 Logging & Monitoring** | Alert log (success/failure) stored in KV. Cron failures logged to Cloudflare's built-in logging. |
| **A10 SSRF** | Outbound requests go only to hardcoded trusted hosts (`rdap.org`, `cloudflare-dns.com`, email provider APIs). No user-supplied URLs are fetched. |

All secrets are stored as **Cloudflare secrets** (encrypted at rest, never in code or `wrangler.toml`).

---

## Cloudflare free tier limits

Cloudflare's free tier is more than sufficient for personal/small team use:

| Resource | Free limit | Domain Watch usage |
|----------|-----------|-------------------|
| Worker requests | 100,000/day | Very low (personal tool) |
| Cron triggers | 1 per worker | 1 (daily check) |
| KV reads | 100,000/day | Low |
| KV writes | 1,000/day | Very low |
| KV storage | 1 GB | Negligible |

---

## License

MIT License

Copyright (c) 2024 Domain Watch Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
