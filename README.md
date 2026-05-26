# Domain Watch

A secure, self-hosted domain monitoring tool that runs entirely on Cloudflare's free tier. It tracks domain expiry dates, sends email alerts before they expire, and scans for typosquatting / alternate TLD variants of your domains.

**No servers. No subscriptions. Hosted on GitHub, runs on Cloudflare.**

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
GitHub repo → Cloudflare Workers (your domain-watch worker)
                     │
                     ├── Serves the SPA frontend (password-protected)
                     ├── REST API (/api/domains, /api/fuzzy, etc.)
                     ├── Cloudflare KV (persistent storage)
                     └── Cron trigger (daily at 08:00 UTC)
                               │
                               ├── Checks each domain via RDAP
                               └── Sends alerts via Resend / Mailgun / SendGrid
```

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
| Homoglyph substitution | `myc0mpany.com` (o→0), `myc0mpany.com` |

### Email alerts

The worker inspects which API key is set and auto-selects the provider:

| Env var set | Provider used |
|-------------|---------------|
| `RESEND_API_KEY` | Resend |
| `MAILGUN_API_KEY` + `MAILGUN_DOMAIN` | Mailgun |
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

There are three ways to deploy Domain Watch. All three require the same KV namespace and secrets setup — only the final deploy step differs. Choose the method that suits you best.

| Method | Best for | CI/CD |
|--------|----------|-------|
| [A — Wrangler CLI](#method-a--wrangler-cli-quickest) | Quickest first deploy, local testing | Manual |
| [B — GitHub Actions](#method-b--github-actions-recommended) | Full CI/CD, code review workflow | Auto on push to `main` |
| [C — Cloudflare Git integration](#method-c--cloudflare-dashboard-git-integration-no-cli-needed) | No local CLI needed, dashboard only | Auto on push to `main` |

---

### Prerequisites (all methods)

- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier is sufficient)
- A [GitHub account](https://github.com) with this repo forked or pushed
- An account with [Resend](https://resend.com), [Mailgun](https://mailgun.com), or [SendGrid](https://sendgrid.com) (all have free tiers)
- [Node.js 18+](https://nodejs.org/) and npm — required for Methods A and B; optional for Method C

---

### Shared setup — KV namespace and secrets

These steps are required regardless of which deploy method you choose. Methods A and B do this via the Wrangler CLI. Method C does it via the Cloudflare dashboard UI — see [Method C](#method-c--cloudflare-dashboard-git-integration-no-cli-needed) for the dashboard equivalent.

#### 1. Fork or push this repo to GitHub

If you downloaded the archive, create a new GitHub repo and push:

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/domain-watch.git
git push -u origin main
```

#### 2. Install dependencies and authenticate Wrangler

```bash
npm install
wrangler login
```

This opens a browser to authenticate with your Cloudflare account.

#### 3. Create the KV namespace

```bash
wrangler kv:namespace create DOMAIN_WATCH_KV
```

The output looks like:

```
🌀 Creating namespace with title "domain-watch-DOMAIN_WATCH_KV"
✅ Success!
Add the following to your configuration file in your kv_namespaces array:
{ binding = "KV", id = "abc123def456..." }
```

Also create a preview namespace for local development:

```bash
wrangler kv:namespace create DOMAIN_WATCH_KV --preview
```

Open `wrangler.toml` and replace both placeholder IDs with your real ones:

```toml
[[kv_namespaces]]
binding = "KV"
id = "YOUR_ACTUAL_KV_ID"       # from the first command
preview_id = "YOUR_PREVIEW_KV_ID"  # from the --preview command
```

Commit this change:

```bash
git add wrangler.toml && git commit -m "Add KV namespace IDs" && git push
```

#### 4. Set required secrets

Run each command and paste the value when prompted:

```bash
# Required — the login password you'll use to access the UI
wrangler secret put APP_PASSWORD

# Required — a random 32+ character string used to sign session tokens
# Generate one with: openssl rand -base64 32
wrangler secret put SESSION_SECRET
```

Set **at least one** email provider secret (the app auto-detects whichever is present):

```bash
# Option A: Resend (https://resend.com — recommended, simplest free tier)
wrangler secret put RESEND_API_KEY

# Option B: Mailgun (https://mailgun.com)
wrangler secret put MAILGUN_API_KEY
wrangler secret put MAILGUN_DOMAIN   # your Mailgun sending domain, e.g. mg.yourdomain.com

# Option C: SendGrid (https://sendgrid.com)
wrangler secret put SENDGRID_API_KEY
```

Optionally set default email addresses as secrets (these can also be configured in the UI after login):

```bash
wrangler secret put EMAIL_FROM            # e.g. alerts@yourdomain.com
wrangler secret put EMAIL_TO             # e.g. you@yourdomain.com
wrangler secret put EMAIL_SUBJECT_PREFIX # e.g. [Domain Watch]
```

#### 5. Configure limits (optional)

Open `wrangler.toml` and adjust any `[vars]` values to suit your needs — these control rate limits, caps, TLDs scanned, etc.:

```toml
[vars]
MAX_MONITORED_DOMAINS = "50"    # max domains tracked at once
MAX_FUZZY_HISTORY = "100"       # max saved fuzzy scan results
MAX_FUZZY_BATCH = "20"          # parallel DNS checks per fuzzy scan
DEFAULT_ALERT_THRESHOLDS = "90,60,30,14,7"
RATE_LIMIT_RPM = "60"           # general requests per minute per IP
RATE_LIMIT_LOOKUPS_RPM = "20"   # RDAP/DNS lookups per minute per IP
SESSION_MAX_AGE = "28800"       # session lifetime in seconds (8 hours)
FUZZY_TLDS = ".com,.net,.org,.io,.co,.ai,.app,.dev,.info,.biz,.co.uk,.co.nz,.com.au"
```

---

### Method A — Wrangler CLI (quickest)

Once the shared setup above is complete, deploy directly from your terminal:

```bash
wrangler deploy
```

Output will confirm the URL:

```
✅ Deployed domain-watch to https://domain-watch.YOUR_SUBDOMAIN.workers.dev
```

Visit that URL, enter your `APP_PASSWORD`, and you're in. This is a one-time manual deploy — to redeploy after changes, run `wrangler deploy` again.

---

### Method B — GitHub Actions (recommended)

This sets up automatic deployment to Cloudflare every time you push to `main`. The workflow file `.github/workflows/deploy.yml` is already included in the repo.

#### 1. Create a Cloudflare API token

1. Go to [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click **Create Token**
3. Select the **Edit Cloudflare Workers** template
4. Under **Account Resources**, select your account
5. Click **Continue to summary** → **Create Token**
6. Copy the token — you won't see it again

#### 2. Find your Cloudflare Account ID

1. Log in to [dash.cloudflare.com](https://dash.cloudflare.com)
2. Select any domain (or go to Workers & Pages)
3. Your **Account ID** is shown in the right sidebar

#### 3. Add secrets to GitHub

1. Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret** and add:
   - Name: `CLOUDFLARE_API_TOKEN` — Value: the token from step 1
   - Name: `CLOUDFLARE_ACCOUNT_ID` — Value: your account ID from step 2

#### 4. Trigger the first deploy

Push any change to `main` — even a whitespace edit — to trigger the workflow:

```bash
git commit --allow-empty -m "Trigger initial deploy" && git push
```

Go to your GitHub repo → **Actions** tab to watch the deployment run. On success, your worker URL will appear in the Cloudflare dashboard under **Workers & Pages**.

> **After this point**, any `git push` to `main` will automatically redeploy the worker within ~30 seconds.

---

### Method C — Cloudflare Dashboard Git integration (no CLI needed)

This method connects Cloudflare Workers directly to your GitHub repo via the Cloudflare dashboard — no local CLI or GitHub Actions secrets required.

> **Note:** You still need to create the KV namespace and set secrets via the Cloudflare dashboard. Steps are below.

#### 1. Push the repo to GitHub

If not done already:

```bash
git init && git add . && git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/domain-watch.git
git push -u origin main
```

#### 2. Connect GitHub to Cloudflare

1. Log in to [dash.cloudflare.com](https://dash.cloudflare.com)
2. In the left sidebar, click **Workers & Pages**
3. Click **Create** → **Pages** → **Connect to Git**

> We use **Pages** here because it supports the Git-connected build pipeline. The Worker source is built and deployed the same way.

4. Click **Connect GitHub** and authorise Cloudflare to access your repositories
5. Select your `domain-watch` repository
6. Click **Begin setup**

#### 3. Configure the build

On the build settings screen:

| Setting | Value |
|---------|-------|
| Production branch | `main` |
| Build command | `npm run deploy` |
| Build output directory | *(leave blank)* |
| Root directory | *(leave blank)* |

> **Important:** The build command `npm run deploy` calls `wrangler deploy` which compiles the TypeScript and pushes to Workers — this is correct for a Worker (not a static site).

Click **Save and Deploy** — this will attempt a first build. It will likely fail at this point because the KV namespace and secrets aren't configured yet. That's fine — continue below.

#### 4. Create the KV namespace in the dashboard

1. In the Cloudflare dashboard, go to **Workers & Pages** → **KV**
2. Click **Create a namespace**
3. Name it `DOMAIN_WATCH_KV` and click **Add**
4. Note the **Namespace ID** shown in the list

Now bind it to your worker:

1. Go to **Workers & Pages** → your `domain-watch` worker → **Settings** → **Bindings**
2. Click **Add binding** → **KV Namespace**
3. Set **Variable name** to `KV`
4. Select `DOMAIN_WATCH_KV` from the dropdown
5. Click **Save**

Update `wrangler.toml` with the namespace ID and push — Cloudflare needs this in the config to wire up KV during builds:

```toml
[[kv_namespaces]]
binding = "KV"
id = "YOUR_NAMESPACE_ID_FROM_DASHBOARD"
preview_id = "YOUR_NAMESPACE_ID_FROM_DASHBOARD"  # same ID is fine for dashboard deploys
```

```bash
git add wrangler.toml && git commit -m "Add KV namespace ID" && git push
```

#### 5. Set secrets in the dashboard

1. Go to **Workers & Pages** → your worker → **Settings** → **Variables**
2. Under **Environment Variables**, click **Add variable** for each secret below
3. Tick **Encrypt** for every one of them (this makes them Cloudflare secrets, not plain vars)

| Variable name | Value | Encrypt? |
|---------------|-------|----------|
| `APP_PASSWORD` | Your chosen login password | ✅ Yes |
| `SESSION_SECRET` | Random 32+ char string (`openssl rand -base64 32`) | ✅ Yes |
| `RESEND_API_KEY` | Your Resend API key (or Mailgun/SendGrid equivalent) | ✅ Yes |
| `EMAIL_FROM` | e.g. `alerts@yourdomain.com` | ✅ Yes |
| `EMAIL_TO` | e.g. `you@yourdomain.com` | ✅ Yes |
| `EMAIL_SUBJECT_PREFIX` | e.g. `[Domain Watch]` | ✅ Yes |

Click **Save and deploy** after adding all variables.

#### 6. Trigger a clean deploy

Go to **Workers & Pages** → your worker → **Deployments** → click **Retry deployment** on the latest entry (or push an empty commit):

```bash
git commit --allow-empty -m "Trigger deploy after secrets" && git push
```

The build will now succeed. Your worker URL (`https://domain-watch.YOUR_SUBDOMAIN.workers.dev`) appears in the **Deployments** tab.

> **After this point**, every `git push` to `main` triggers an automatic Cloudflare build and deploy — no GitHub Actions or local CLI needed.

---

### Custom domain (all methods)

To serve Domain Watch from your own domain instead of `*.workers.dev`:

1. Go to **Workers & Pages** → your worker → **Settings** → **Triggers** → **Custom Domains**
2. Click **Add Custom Domain**
3. Enter your domain (e.g. `watch.yourdomain.com`)
4. Cloudflare handles the DNS record automatically if your domain is on Cloudflare; otherwise add a CNAME manually

---

### First login

Visit your worker URL, enter your `APP_PASSWORD`, and you're in.

Go to **Settings** to configure your email from/to/subject prefix and confirm the detected email provider is correct.

---

## Local development

```bash
# Start local dev server (uses preview KV)
wrangler dev

# To test with .dev.vars for secrets (create this file, it's gitignored):
# .dev.vars
# APP_PASSWORD=mypassword
# SESSION_SECRET=a-long-random-string-here
# RESEND_API_KEY=re_xxx
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
