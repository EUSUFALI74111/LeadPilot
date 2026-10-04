# LeadPilot SaaS — Production & Hostinger Deployment Guide

LeadPilot is a multi-tenant lead-management and authorized SMTP campaign platform. The existing Lovable React/TypeScript design is retained, while PHP 8.2+, MySQL, PHPMailer, secure OTP authentication, encrypted customer SMTP accounts, imports, queue workers, reporting, and tenant isolation provide the production backend.

For development use `npm run dev`. A production-ready deployment package is generated with one command:

```sh
npm ci
npm run build
```

The command recreates `dist/` as the exact public document-root payload. It contains only the compiled frontend, PHP API, Composer manifest, and required public server files. The database schema remains at `database/platform.sql`; `.env` and writable storage must be created privately on the server and are never copied into `dist`.

## Architecture

The existing TanStack Start/React frontend is retained. It calls same-origin REST-style PHP endpoints under `/api`. MySQL stores platform and tenant data, PHPMailer sends through tenant-authorized SMTP accounts, and CLI workers process email and import queues. Browser code never receives database credentials, SMTP passwords, password hashes, session tokens, or tenant identifiers used for authorization.

This release uses one shared MySQL database with a mandatory `tenant_id` on every tenant-owned table. Tenant identity comes only from the opaque authenticated server session. Every resource query includes the authenticated tenant and, for members, the applicable ownership rule. Composite foreign keys prevent records from referencing a resource in another tenant.

Database-per-tenant was evaluated but not selected because the target database/hosting limits, expected tenant count, backup system, and permission to create databases dynamically are unknown. It would be unsafe to assume that shared PHP hosting grants `CREATE DATABASE`, supports a large connection/database count, or can run coordinated migrations and restores across many schemas. The current model is operationally predictable and indexed for multi-tenant load. A future database-per-tenant migration should only happen after measuring those constraints and building centralized credential rotation, migrations, backup verification, and connection management.

Key files:

- `database/platform.sql`: complete MySQL schema and schema version table.
- `api/bootstrap.php`: PDO, sessions, CSRF, authorization helpers, rate limiting, encryption, mail configuration, validation, and safe errors.
- `api/workers/send-queue.php`: bounded SMTP queue worker with provider limits, retry/backoff, and interrupted-job recovery.
- `api/workers/process-imports.php`: background, batched CSV/XLS/XLSX import worker.
- `src/lib/api.ts`: credentialed API client, CSRF handling, and access-session refresh.
- `src/lib/auth.tsx`: real server-backed authentication state.

## API inventory

Authentication:

- `POST /api/auth/register.php`
- `POST /api/auth/verify-otp.php`
- `POST /api/auth/resend-otp.php`
- `POST /api/auth/login.php`
- `POST /api/auth/logout.php`
- `POST /api/auth/refresh.php`
- `POST /api/auth/forgot-password.php`
- `POST /api/auth/verify-reset-otp.php`
- `POST /api/auth/reset-password.php`
- `GET /api/auth/me.php`
- `POST /api/auth/change-password.php`
- `GET /api/auth/sessions.php`
- `POST /api/auth/logout-all.php`

Tenant resources:

- `GET|POST /api/leads.php`; `GET /api/leads/view.php`; `PUT /api/leads/update.php`; `DELETE /api/leads/delete.php`; `DELETE /api/leads/purge-status.php`; `GET /api/leads/export.php`
- `POST /api/email-preview.php`; `POST /api/quick-mail.php`
- `GET /api/replies.php`; `POST /api/replies/send.php`; `POST /api/smtp/reply-tracking.php`

### Sending account controls

The Sending Accounts screen provides Hostinger, Gmail/Google Workspace, Microsoft 365, and custom SMTP presets. Presets fill conservative minute/hour/day limits; the provider plan remains authoritative and users may edit every limit. New accounts are saved only after SMTP authentication and a real test delivery to the recipient chosen by the user. Campaign sending and IMAP reply tracking are independent controls. Any authentication failure blocks the sending account until it passes another user-initiated test. Test recipients and passwords are never returned by the API.

Campaign history does not query or render inbox replies. Replies are fetched only on the dedicated Replies page to keep campaign pages lightweight.

Queued, running, and paused campaigns with pending recipients can switch to another enabled, connected SMTP account with unused daily capacity. Sent recipient records remain attached to their original delivery logs; only pending recipients continue through the new sender, and a paused campaign resumes automatically.

Sending accounts are capped at 500 accepted attempts per UTC day. Reaching the application or upstream provider quota never marks a recipient as failed: the recipient remains queued and resumes after the next daily reset. Authentication failures pause and disable the sender without disqualifying the lead. Only recipient-side permanent rejection or a matched asynchronous bounce moves a lead to a failed/bounced status.
- `GET /api/campaigns.php`; `POST /api/campaigns/create.php`; `GET /api/campaigns/view.php`
- `POST /api/campaigns/start.php|pause.php|resume.php|cancel.php|retry-failed.php`
- `GET /api/campaigns/stats.php`; `GET /api/email-logs.php`
- `GET /api/smtp/accounts.php`; `POST /api/smtp/add.php|test.php|toggle.php`; `PUT /api/smtp/update.php`; `DELETE /api/smtp/delete.php`
- `POST /api/import/upload.php|process.php`; `GET /api/import/status.php|failed-report.php`
- `GET /api/dashboard/stats.php`; `GET|PUT /api/settings.php`; `GET|PUT /api/users.php`

All responses use `{ "data": ..., "meta": ... }`; failures use `{ "error": { "message": ..., "details": ... } }`. List endpoints are paginated and cap a page at 100 rows.

The customer-facing Contacts and Email Templates pages and endpoints are disabled in this release. Their existing database tables are deliberately retained because deleting them would violate the no-data-loss migration policy and historical campaign rows still reference email templates. The Campaigns screen is now read-only **Sending History**; new sends are prepared from **Quick Mail**.

## Lead data, adaptive import, and Quick Mail

Lead records support first name, last name, email, personal phone, company name, job title, website, LinkedIn, Facebook, Instagram, X/Twitter, TikTok, location, country, source, status, notes, and arbitrary JSON custom fields. Email is unique per tenant. A normalized personal phone is also unique per tenant when supplied; shared company or office phone values belong in a custom/company-phone field and may repeat.

CSV and XLS/XLSX imports normalize headings and suggest mappings for common alternate labels such as `First Name`, `Given Name`, `Title`, `Organization`, `Person Linkedin Url`, and `Company Phone`. Unknown columns remain available as `custom:*` fields rather than being discarded. The reviewed Veterans Affairs workbook maps its repeating `Company Phone` to `custom:company_phone`, not the unique personal-phone field. Invalid/missing emails and duplicate tenant email/personal-phone rows are rejected with row-level failure reporting.

Quick Mail supports all eligible leads, a status segment, the current search result, explicitly selected leads, or combined advanced filters for company, source/category, job title, location, country, status, and any imported custom field such as `company_category`. Recipient resolution and the exact confirmation count are calculated on the server under the authenticated tenant. Both preview and delivery use the same personalization and HTML sanitization code, including standard and custom-field variables. Messages are queued for the existing bounded worker; the browser never sends SMTP mail directly.

Each Quick Mail batch snapshots its recipient rows once. It can start immediately or at a user-selected local date/time, which is converted to UTC server-side. A unique campaign/lead key prevents the same person from being queued twice inside that batch. When the sending account reaches a minute, hourly, or daily limit, all remaining rows for that account are moved to the exact next reset time; the campaign remains queued/running and resumes from those pending rows rather than selecting the first leads again. Sending History shows the next attempt time while work remains.

Reply tracking is optional per Sending Account. From **Sending Accounts → Replies**, the user supplies and tests the account's IMAP host, port, security, and username; the IMAP password may be supplied separately or the already-encrypted SMTP password can be reused without returning it to the browser. The inbox worker opens INBOX read-only and matches `In-Reply-To`/`References` or bounce recipient details against outgoing logs. Messages are classified as human replies, automatic replies, or delivery bounces. Only human replies appear in Replies/campaign detail. A matched bounce atomically changes its recipient/log from `SENT` to `FAILED`, marks the lead `BOUNCED`, and corrects campaign totals. SMTP-accepted attempts remain in the provider quota counter because a provider may count an accepted attempt even when a later asynchronous bounce arrives.

The Replies page strips quoted campaign history, common mobile-mail signatures, and forwarded headers so it shows only the recipient's concise message, sender, received time, and source campaign. An authorized user can send a direct threaded reply from the same connected SMTP account. Direct replies do not create campaigns or campaign recipients, but they respect that account's minute/hour/day limits and are recorded in `email_reply_messages` for audit and failure diagnosis.

Common IMAP values are Gmail `imap.gmail.com:993` with SSL and an App Password, or Hostinger `imap.hostinger.com:993` with SSL and the complete mailbox address/password. Provider IMAP access must be enabled. After configuration, this production cron checks for replies every five minutes:

```cron
*/5 * * * * /opt/alt/php83/usr/bin/php /home/u640393277/domains/leadpilot.webrayz.com/public_html/api/workers/process-replies.php
```

## Authentication and OTP

Registration creates a pending tenant and owner in one transaction, stores a `password_hash()` password, generates the OTP with `random_int(100000, 999999)`, stores only `password_hash()` of the code, and sends it using the platform SMTP account. Codes expire after five minutes, allow five attempts, have a 60-second resend cooldown, and are limited by IP and email. Resending consumes all previous codes. Verification activates both owner and tenant and creates the first session.

Authentication uses random opaque access and refresh tokens. Only SHA-256 token hashes are stored. Access expires in 15 minutes; refresh is rotated and expires after 7 or 30 days. Cookies are `HttpOnly`, `Secure` in production, `SameSite=Strict`, and scoped to `/api`. Mutations require the matching double-submit CSRF token. Logout revokes one session; logout-all/password reset can revoke all sessions. Login uses both IP/email throttles and temporary account locks.

Password recovery always returns the same message regardless of account existence. Its OTP is separately scoped, and successful reset revokes existing sessions.

## SMTP and sending queue

Add only SMTP accounts the tenant owns or is authorized to use. The **Test & Save SMTP** flow authenticates against the submitted server and sends a real message to the submitted test recipient before any row is inserted. A failed connection, authentication, or send returns a safe diagnostic and does not save the account. After success, credentials are encrypted with AES-256-GCM using `APP_KEY`; the API only returns `passwordConfigured: true`. SMTP host DNS is checked and private/reserved targets are rejected to reduce SSRF risk. Editing an existing account saves without sending mail (a blank password retains the encrypted value); the separate **Test** action explicitly sends the branded connection test.

### Platform OTP SMTP: exact configuration location

Registration/OTP and future system mail use the reusable `MailService::platform()` method in `api/services/MailService.php`. Configuration is read server-side by `api/bootstrap.php`. The current live Hostinger file is `/home/u640393277/domains/leadpilot.webrayz.com/public_html/.env`; root `.htaccess` denies HTTP access and this has been verified with a `403` response. The preferred manual alternative is `/home/u640393277/domains/leadpilot.webrayz.com/.env`, beside and **not inside** `public_html`; the loader supports both locations. Credentials must not be added to React, TypeScript/JavaScript, `VITE_*` variables, `dist`, or committed files. Set exactly:

```dotenv
PLATFORM_SMTP_HOST=smtp.example.com
PLATFORM_SMTP_PORT=587
PLATFORM_SMTP_ENCRYPTION=tls
PLATFORM_SMTP_USERNAME=no-reply@example.com
PLATFORM_SMTP_PASSWORD=replace-with-provider-password-or-app-password
PLATFORM_FROM_EMAIL=no-reply@example.com
PLATFORM_FROM_NAME=LeadPilot
```

For Gmail authenticated SMTP:

```dotenv
PLATFORM_SMTP_HOST=smtp.gmail.com
PLATFORM_SMTP_PORT=587
PLATFORM_SMTP_ENCRYPTION=tls
PLATFORM_SMTP_USERNAME=your-full-address@gmail.com
PLATFORM_SMTP_PASSWORD=your-16-character-google-app-password
PLATFORM_FROM_EMAIL=your-full-address@gmail.com
PLATFORM_FROM_NAME=LeadPilot
```

Google requires the full account address and, for this username/password SMTP flow, an App Password on an eligible account with 2-Step Verification; do not use the normal Google account password. Port 465 can be used with `PLATFORM_SMTP_ENCRYPTION=ssl`. Google Workspace administrators may instead configure the separately governed `smtp-relay.gmail.com` service. See Google's official [SMTP application setup](https://support.google.com/a/answer/176600) and [App Password guidance](https://support.google.com/accounts/answer/2461835).

For Hostinger Email:

```dotenv
PLATFORM_SMTP_HOST=smtp.hostinger.com
PLATFORM_SMTP_PORT=465
PLATFORM_SMTP_ENCRYPTION=ssl
PLATFORM_SMTP_USERNAME=no-reply@yourdomain.com
PLATFORM_SMTP_PASSWORD=the-password-of-that-email-mailbox
PLATFORM_FROM_EMAIL=no-reply@yourdomain.com
PLATFORM_FROM_NAME=LeadPilot
```

Hostinger also documents port `587` with `PLATFORM_SMTP_ENCRYPTION=tls` as the fallback. The username is the complete mailbox address and the password is the mailbox password, not the hPanel login password. Confirm current provider settings and allowed volume before deployment using Hostinger's official [email configuration guide](https://support.hostinger.com/en/articles/1575756-how-to-get-email-account-configuration-details-for-hostinger-email).

Quick Mail snapshots its subject/body and creates one deduplicated queue record per eligible lead. No HTTP request sends campaign mail. The worker uses a MySQL advisory lock to prevent overlapping cron processes, claims a bounded batch with `FOR UPDATE SKIP LOCKED`, reserves minute/hour/day capacity atomically, waits short send intervals inside the same worker run, personalizes supported standard and custom variables, sanitizes HTML, and writes a delivery log. Temporary failures retry up to three attempts with backoff; recognized permanent SMTP failures do not loop. Pause prevents new claims; cancel preserves already-sent records.

Capacity is never unlimited. Actual throughput is the lowest of the configured limits and the SMTP provider's allowed limits.

The UI exposes minute, hour, and day limits; the one-second internal pacing interval is managed automatically and is not user-configurable. Delivery bounces are classified separately from human replies. Matched hard/policy bounces suppress the lead with `BOUNCED`, so it is excluded from every future recipient selection while the audit trail remains intact. Lead rows are not automatically destroyed because temporary/policy blocks can affect a valid mailbox and campaign history must remain reconcilable. A campaign auto-pauses after at least 20 bounces when bounces reach 20% of finalized attempts; clean the source list before resuming.

On each successful SMTP-accepted delivery, the queue worker promotes the lead to `QUALIFIED` unless it is already `BOUNCED` or `UNSUBSCRIBED`. A final non-recipient delivery error is categorized as `SEND_FAILED`; a recognized invalid recipient/hard bounce is categorized as `BOUNCED`. The Leads page can filter and permanently purge either quarantined status, while the campaign detail preserves the exact failure category and provider diagnostic until it is deleted. The Composer's visible **Filter by lead status → Qualified only** selection therefore targets the successfully delivered segment (and any leads deliberately marked Qualified by a user).

The dashboard header intentionally has no notification bell; campaign status, failures, and replies are available in their dedicated pages. The language menu switches the persistent application navigation between English and Bangla.

Email Composer supports deterministic filtered-list ranges such as `1-500`, `501-1000`, and custom-sized partitions. Active campaigns atomically claim each lead in `lead_campaign_claims`, so concurrent campaigns and sender accounts cannot queue the same lead. Claims are released on campaign completion or cancellation. Successful delivery promotes the lead to `QUALIFIED`.

`Use all connected accounts` creates one linked campaign per available sender and divides the selected filtered range as evenly as possible (up to 100 accounts). Each campaign keeps its own SMTP rate limits and queue state. Sending History includes a combined multi-sender result card with total, sent/qualified, pending, failed, and suppressed counts; individual sender campaigns remain available underneath for diagnosis.

Completed, failed, and cancelled campaign history can be permanently deleted. The delete cascades through recipient activity, delivery logs, replies, and active-claim rows while retaining quarantined `SEND_FAILED`/`BOUNCED` leads until the user explicitly purges them. The dashboard groups failures as hard bounce, sender authentication, provider/policy rejection, temporary delivery problem, or other; recent campaign cards open the campaign detail directly. Hard recipient bounces persist their exact reason, and sender/account failures remain distinguishable so they are never presented as proof that a recipient address is invalid.

Cron examples (run as the application user, with the actual absolute Hostinger path; hPanel cron schedules are UTC):

```cron
* * * * * /opt/alt/php83/usr/bin/php /home/u640393277/domains/leadpilot.webrayz.com/public_html/api/workers/send-queue.php
* * * * * /opt/alt/php83/usr/bin/php /home/u640393277/domains/leadpilot.webrayz.com/public_html/api/workers/process-imports.php
```

Use `flock` if the host does not support `SKIP LOCKED` correctly or if only one worker is desired. Multiple email workers are safe on MySQL 8, though SMTP limits should be load-tested conservatively.

## Installation and deployment

Requirements:

- PHP 8.2+ with `pdo_mysql`, `mbstring`, `openssl`, `json`, `fileinfo`, `zip`, `xml`, `dom`, `simplexml`, `xmlreader`, `xmlwriter`, and `gd` (PhpSpreadsheet may require additional extensions depending on formats).
- MySQL 8.0.16+ with InnoDB and UTC time configured.
- Composer 2, Node.js 20+ (or the Bun version represented by `bun.lock`), HTTPS, and cron/another scheduler.

Steps:

1. Set the web root to the built frontend while preserving `/api` as executable PHP, or configure the reverse proxy to serve the frontend and forward `/api/*.php` to PHP-FPM. Deny web access to `/database`, `/docs`, `/storage`, `.env`, Composer metadata, and worker PHP files.
2. Run `composer install --no-dev --classmap-authoritative`.
3. Run `npm install` and `npm run build` (or `bun install --frozen-lockfile && bun run build`). Deploy the generated frontend output according to the TanStack Start adapter used by the host.
4. Create a least-privilege MySQL user limited to the LeadPilot database. Apply `mysql --default-character-set=utf8mb4 -u USER -p DATABASE < database/platform.sql`.
5. Copy `.env.example` to the private domain-root `.env` beside `public_html`, set restrictive filesystem permissions, and populate every secret. Generate the application key with `php -r "echo 'base64:'.base64_encode(random_bytes(32)), PHP_EOL;"`.
6. Make the configured `STORAGE_PATH` writable by the PHP/worker user and not web-accessible. The bundled `.htaccess` is defense in depth, not a substitute for placing storage outside the document root.
7. Configure platform SMTP for OTP/reset messages, install both cron entries, and test registration, SMTP test, import, and a small campaign before adding customers.
8. Run `find api -name '*.php' -print0 | xargs -0 -n1 php -l`, `npm run lint`, and `npm run build` during every release.

Environment variables are documented in `.env.example`. `APP_ALLOWED_ORIGINS` must contain exact HTTPS origins. Keep `COOKIE_SECURE=true` in production. Never commit `.env` or reuse `APP_KEY` between unrelated environments; rotating `APP_KEY` requires re-entering every stored SMTP password.

## Exact Hostinger release procedure

The deployable directory is `dist`. Upload its contents directly into the document root for `leadpilot.webrayz.com`; do not create another nested `public_html` directory. `.env`, writable storage, and the database schema deliberately remain outside `dist` and the public web root.

1. In hPanel, create the `leadpilot` subdomain or add an `A` record named `leadpilot` pointing to the hosting plan IP. Wait for DNS resolution before enabling/testing SSL.
2. Select PHP 8.2 or newer and enable `pdo_mysql`, `mbstring`, `openssl`, `json`, `fileinfo`, `zip`, `xml`, `dom`, `simplexml`, `xmlreader`, `xmlwriter`, and `gd`.
3. Create a MySQL database and a least-privilege database user in hPanel. Import the source file `database/platform.sql` through phpMyAdmin; it is intentionally excluded from the public build.
4. Upload `dist/*` including the hidden `.htaccess` file directly to the website document root. Create `/home/YOUR_HOSTINGER_USER/domains/leadpilot.webrayz.com/.env` from the source `.env.example`, replace every placeholder, and never move it into a frontend asset directory.
5. Upload/create `/home/YOUR_HOSTINGER_USER/domains/leadpilot.webrayz.com/storage`, make it writable by the site PHP user, and set its absolute value in `STORAGE_PATH`.
6. Through SSH, run `composer install --no-dev --classmap-authoritative` inside the subdomain's `public_html`. If SSH/Composer is unavailable, install dependencies locally with the same PHP version and upload `vendor`.
7. Enable SSL in hPanel and verify `https://leadpilot.webrayz.com/api/health.php` returns a success response. Do not begin marketing while DNS, health, OTP, or queue tests fail.
8. Add both once-per-minute PHP cron jobs shown above using the real hPanel home path. Verify the worker paths are denied over HTTP but execute successfully through CLI.
9. Complete the end-to-end checklist below with two separate tenants and a low-volume SMTP account before onboarding users.

The exact current live production secrets file is:

```text
/home/u640393277/domains/leadpilot.webrayz.com/public_html/.env
```

For Hostinger platform mail, the password goes only in:

```dotenv
PLATFORM_SMTP_PASSWORD=YOUR_HOSTINGER_EMAIL_PASSWORD
```

`PLATFORM_SMTP_*` is intentionally distinct from customer campaign SMTP accounts. Customer secrets are accepted only by the authenticated SMTP API after a successful real test, then encrypted in MySQL; they are never written into this file or returned to the browser.

## Migrations, backup, and recovery

`schema_migrations` records the installed version and each tenant has `schema_version`. For future releases, add one reviewed, idempotent, numbered migration per version, back up first, apply centrally during a maintenance window, verify it, then update the migration rows. Never edit an already-applied production migration. Test forward and rollback/recovery procedures on a restored copy.

The additive lead-personalization migration is `database/migrations/20260928_001_lead_personalization.sql` (version `2026092801`). Before applying it to the current Hostinger database, production was backed up to `storage/backups/pre-lead-personalization-20260928-084907.sql`. It adds fields and indexes only; it does not drop or rewrite customer data.

The additive reply-tracking migration is `database/migrations/20260928_002_reply_tracking.sql` (version `2026092802`). Its production pre-migration backup is `storage/backups/pre-reply-tracking-20260928-092112.sql`. SMTP/IMAP passwords remain encrypted with `APP_KEY`; API responses expose configuration status only, never plaintext credentials.

The additive bounce-classification migration is `database/migrations/20260928_003_bounce_classification.sql` (version `2026092803`). Its production pre-migration backup is `storage/backups/pre-bounce-scheduling-20260928-155403.sql`. It adds reply classification and bounce-reason fields/indexes, then existing matched inbox events are reclassified and campaign counts reconciled idempotently.

The additive notification migration is `database/migrations/20260928_004_notifications.sql` (version `2026092804`). It stores only each user's last-read time; notification content is derived tenant-safely from real campaign, human-reply, import, and SMTP-account events.

Recommended backups:

- Encrypted MySQL full backup daily, binary logs continuously for point-in-time recovery, and a weekly restore test.
- Encrypted import storage backup daily if failed-row reports must be retained; raw uploads should have a short documented retention policy.
- Keep at least 30 daily and 12 monthly database restore points, adjusted for policy and regulation.

To restore one tenant in the shared model, restore the full backup into an isolated database, export rows for the target `tenant_id` in foreign-key order, validate counts/checksums, place the tenant into `SUSPENDED`, import inside a transaction or controlled maintenance procedure, validate ownership, then reactivate. For complete disaster recovery, restore MySQL plus storage, apply binary logs to the target time, verify `schema_migrations`, start the app without workers, validate, then resume workers.

## Security and test checklist

- Register, verify, resend cooldown, expiration, five failed OTP attempts, login lock, refresh rotation, logout, logout-all, and password reset enumeration behavior.
- Create Tenant A and Tenant B. While authenticated as A, attempt every B lead, campaign, recipient, template, SMTP account, log, import job, setting, and guessed UUID through every HTTP method. Expect 404/403 and no state change. Repeat as Owner, Admin, and Member; verify Members only see/modify assigned leads and their campaigns.
- Attempt `tenant_id` injection and mass assignment; it must be ignored. Try numeric IDs and UUID guessing.
- Test SQL injection in search/filter/body inputs, stored/reflected XSS in every text field, unsupported template placeholders, CSRF without/wrong token, cross-origin credentialed calls, malicious MIME/extension combinations, zip bombs and oversized/over-row-limit files.
- Confirm SMTP passwords, token values, OTPs, database errors, stack traces, and secrets never appear in API output, application logs, audit logs, or browser state.
- Verify pause/resume/cancel races, retry caps, interrupted-worker recovery, minute/hour/day limits, send interval, provider rejection, and concurrent workers.
- Load-test paginated lead/log queries, queue claim contention, dashboard aggregate queries, large streaming CSV, chunk-filtered XLSX, and representative tenant counts. Monitor slow queries, PHP memory, MySQL connections, worker duration, failure rates, and queue age.
- Review HTTPS/HSTS, CSP, proxy IP trust, storage permissions, database privileges, backup encryption/restore tests, dependency updates, and secret rotation before launch.

The dashboard uses indexed aggregates from campaign counters and bounded recent queries rather than loading full tenant tables. At higher scale, move daily chart aggregates to a rollup table/cache, archive old logs, partition only after measurement, and size the database connection/worker counts against the actual MySQL limit.
