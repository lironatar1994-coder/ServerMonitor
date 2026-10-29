# DOX framework

- DOX is highly performant AGENTS.md hierarchy installed here
- Agent must follow DOX instructions across any edits

## Core Contract

- AGENTS.md files are binding work contracts for their subtrees
- Work products, source materials, instructions, records, assets, and durable docs must stay understandable from the nearest applicable AGENTS.md plus every parent AGENTS.md above it

## Read Before Editing

1. Read the root AGENTS.md
2. Identify every file or folder you expect to touch
3. Walk from the repository root to each target path
4. Read every AGENTS.md found along each route
5. If a parent AGENTS.md lists a child AGENTS.md whose scope contains the path, read that child and continue from there
6. Use the nearest AGENTS.md as the local contract and parent docs for repo-wide rules
7. If docs conflict, the closer doc controls local work details, but no child doc may weaken DOX

Do not rely on memory. Re-read the applicable DOX chain in the current session before editing.

## Update After Editing

Every meaningful change requires a DOX pass before the task is done.

Update the closest owning AGENTS.md when a change affects:

- purpose, scope, ownership, or responsibilities
- durable structure, contracts, workflows, or operating rules
- required inputs, outputs, permissions, constraints, side effects, or artifacts
- user preferences about behavior, communication, process, organization, or quality
- AGENTS.md creation, deletion, move, rename, or index contents

Update parent docs when parent-level structure, ownership, workflow, or child index changes. Update child docs when parent changes alter local rules. Remove stale or contradictory text immediately. Small edits that do not change behavior or contracts may leave docs unchanged, but the DOX pass still must happen.

## Hierarchy

- Root AGENTS.md is the DOX rail: project-wide instructions, global preferences, durable workflow rules, and the top-level Child DOX Index
- Child AGENTS.md files own domain-specific instructions and their own Child DOX Index
- Each parent explains what its direct children cover and what stays owned by the parent
- The closer a doc is to the work, the more specific and practical it must be

## Child Doc Shape

- Create a child AGENTS.md when a folder becomes a durable boundary with its own purpose, rules, responsibilities, workflow, materials, or quality standards
- Work Guidance must reflect the current standards of the project or user instructions; if there are no specific standards or instructions yet, leave it empty
- Verification must reflect an existing check; if no verification framework exists yet, leave it empty and update it when one exists

Default section order:
- Purpose
- Ownership
- Local Contracts
- Work Guidance
- Verification
- Child DOX Index

## Style

- Keep docs concise, current, and operational
- Document stable contracts, not diary entries
- Put broad rules in parent docs and concrete details in child docs
- Prefer direct bullets with explicit names
- Do not duplicate rules across many files unless each scope needs a local version
- Delete stale notes instead of explaining history
- Trim obvious statements, repeated rules, misplaced detail, and warnings for risks that no longer exist

## Closeout

1. Re-check changed paths against the DOX chain
2. Update nearest owning docs and any affected parents or children
3. Refresh every affected Child DOX Index
4. Remove stale or contradictory text
5. Run existing verification when relevant
6. Report any docs intentionally left unchanged and why

## User Preferences

When the user requests a durable behavior change, record it here or in the relevant child AGENTS.md

- Visitor screens must use plain Hebrew for nontechnical readers: estimated visitors, measured visits, page views and contact actions. Keep browser/IP methodology in hints and expandable diagnostics; never turn estimates into confirmed people.
- Page rankings must open a useful drill-down with friendly names, recorded next pages and later contact/outbound actions within the same anonymous visit. Keep low samples explicit and distinguish observed sequences from causes or confirmed inquiries.
- LA webs must measure project/button attribution and bounded engagement, and keep contacted/qualified/won business outcomes separate from clicks. Run recurring browser and telemetry checks through the existing health scheduler.
- Keep lightweight health checks every 15 minutes and full browser checks every six hours plus after deployment. Bound browser CPU, memory and runtime so verification cannot crowd out production websites.
- Report emails use natural, professional Hebrew with minimal instructions; avoid patronizing prompts such as `גלה עוד`. Prioritize useful comparisons and observed actions, and link each app directly to its own Server Monitor page.
- Daily and weekly emails must be compact on a phone: quiet colors, one aligned site table with column labels once, short visit changes, positive contact counts and concise measurement notes. Keep repeated explanations, full URLs and per-site server diagnostics in the linked detailed views.

- Client growth is internal only under `/clients`: goals, source-confirmed and manual leads, tasks, campaigns, evidence, and activity. No new client-facing access and no Search Console integration. Summaries must be editable drafts opened manually through mailto/WhatsApp or copied; never auto-send them or expose internal notes.
- Keep click observations, verified source records, and manual business outcomes separate. Source adapters are read-only and must not copy customer contact details or message contents; existing native visitor trackers and CMS assets remain intact.

- Keep website visitor monitoring and server/resource monitoring as separate product workspaces. The default dashboard must prioritize a clear cross-site visitor picture with both quick and deep views; infrastructure data belongs under the single `תפעול` destination (`שרת ושירותים`), whose tabs are `משאבים`, `שירותים`, `זמינות ומהירות` and `גיבויים ותעודות`, all in the graphite workspace.
- Design for a quick daily check: what changed, what needs attention, which site to open. Use the porcelain/white/slate/petrol system in `DESIGN.md`, self-hosted Heebo and tabular numbers throughout. Keep infrastructure graphite using the same primitives. No decorative animation, glass, new visual dependencies, or tracking/database changes made solely for visual design.
- Keep `/visitors` labeled `אתרים` as the landing page, default to 24 hours only without a saved or linked period, and preserve exact dates through site switching and authentication. Website, client follow-up, and server operations remain separate workspaces.
- Optimise every screen for scanning and doing, not for reading. Keep copy minimal, put numbers and controls above the fold on desktop and mobile alike, and move explanations into on-demand hints. Do not reintroduce oversized display headlines or marketing paragraphs.
- Prefer short nouns and familiar action icons. Show numeric column labels once per list; use accessible icon controls for repeated edit/copy/site-switch actions. Keep source distinctions, failures and low-sample limitations available without repeating explanatory paragraphs.
- Keep the whole interface consistent and professional: slate navigation, porcelain canvas, white summaries/tables/plots, restrained petrol actions and selection, and graphite infrastructure. Use shared surface and status tokens, aligned numbers, compact headers and subtle boundaries. Activity bars must encode actual measurements. Avoid decorative animation, glow, decorative badges and repeated metric icons. Keep brief labels, functional accessible icons, real failures and measurement uncertainty; explanations open on demand.
- Production city/region enrichment reads `GEOIP_DB_PATH`, defaulting to `/usr/share/GeoIP/GeoLite2-City.mmdb`; deployment must warn but continue when the local database is unavailable.
- Send one client-website comparison email daily and one weekly, using completed Israel calendar periods and the production recipient configured in `REPORT_EMAIL_TO`.
- Use `ops/maintenance.py` through the single `lawebs-maintenance.timer` at 03:00; `server_maintenance.sh` is only a compatibility wrapper. Keep seven days of compressed PM2 logs, SQLite backups, and Manager Site data/upload backups; retain only the newest three deployment backups; remove expired deployment/build caches and Libi rollback directories; report disk thresholds; and never force Linux kernel cache drops.
- Keep Seder Calendar (`seder-calendar`) in operational monitoring. Verified daily backups include Seder's live SQLite database and current WhatsApp pairing state. Health checks must detect uncatalogued running apps and probe every catalogued service and website; never restart a message sender as part of monitoring.
- Never present traffic that merely escaped bot heuristics as confirmed human. Use candidate/estimated language, keep classification uncertainty visible, and require exact host-aware log attribution for every monitored website.
- Libi Diamonds (live and preview), the Dfus preview, the Vee application and its WhatsApp worker were retired from production on 2026-10-20 (archives in `/root/retired-20261020`). Keep them in the retired-app purge list; `vee-app.co.il/` remains monitored as the static `Vee Landing`. `libidiamonds.co.il` still resolves here and must answer a neutral 410 page with a renewing certificate (`ops/install-retired-sites.sh`), never fall through to another client's site. The LA webs portfolio no longer lists Libi; its eight case pages are koral, miryam, pinhas, reuven, sos, seder, pdf and pizza.
- Monitor every production web app. Under `lawebs.co.il`: Alenu (`/alenu`) and Mila Tova CV (`/cv`) are client websites with visitor reports; Pizza Manager storefronts (`/PizzaManager/p`) have visitor analytics and their own navigation tag without client reports; Alenu CRM (formerly Maavar), CV Manager, Desk, AllSee and Video Library are operational services. LA webs owns only paths no sibling app owns.
- Alerts go by email through the existing Resend configuration to `ALERT_EMAIL_TO` (default `REPORT_EMAIL_TO`) and as browser push to every subscribed member device: one batched message per monitor cycle for outages (after two consecutive failed checks), slowness (over 4 seconds twice in a row), a silent browser measurement (real server visits but no browser signal for 6 hours after prior activity), and recovery. Problems repeat every six hours; silent measurement at most daily.
- The monitor installs as a phone app and pushes insights per device: new and waiting inquiries, a 08:00 summary of yesterday, unusual visits or contact clicks, new campaigns, newly popular or missing pages, and slower pages. Each insight is sent once; devices choose categories, quiet hours (outages still break through) and a daily cap, and held-back insights are counted in the morning summary. Wording stays estimate-based; clicks are never inquiries.
- Visits from hosting networks (cloud servers, data centres) are automation on the server side; in the browser they count only after a real interaction, so VPN and office users who use the page are still counted.
- Show how visitors arrived per site (channel, campaign, referring site) and offer tracked short links per channel on the site's own domain (`/l/<code>`), so WhatsApp, Facebook, QR and other posts are measurable without exposing visitor identity.
- Every site must reach the shared monitor access log: a server block with its own `access_log` also logs to `monitor_host_access.log` (`ops/ensure-monitor-logging.py`, run on deploy).
- Keep availability history (status transitions), response times, runtime-start markers, chart notes, real-user Core Web Vitals and real-visitor 404 reports inside the existing 10-minute cycle and authenticated reads; they must not add schedulers or noticeable server load.
- Monitoring sessions stay signed in for two idle hours (12 hours maximum); the vault still locks after five idle minutes. After a full password and code sign-in a person may opt to remember a personal device for 30 days (not sliding): it reopens monitoring without password or code, but sensitive vault actions still ask for a fresh code and the vault keeps its own passphrase. Remembered devices are listed and removable in Settings → אבטחה, alert by push when added, and end on sign-out, password change or `ניתוק מכשירים אחרים`.
- Use successful page-level navigations—not images, scripts, fonts, API calls, or failed requests—for visitor activity, page rankings, and email comparisons; retain raw requests only as diagnostic data.
- Keep the small production server bounded by clearing disposable build caches, keeping the current plus three newest `/opt/*/releases` for every release-based app, clearing the NPM download cache when disk usage reaches 70%, and capping deployment backups by age and count.
- Keep production SSH key-only: root administration may use authorized keys, while password and keyboard-interactive login remain disabled and deployment must validate `sshd` before reload.
- Let Manager Site expose analytics for a client only through the shared server-to-server key and an exact stored website-URL match. Never let a Manager Site browser choose a ServerMonitor app ID or access the cross-site overview.
- Prefetch and reset the production checkout before invoking `deploy_linux.sh` so deploy-script changes apply in the same run; restart an existing PM2 monitor process without emitting a false launch error.
- Attribute runtime memory and CPU to complete PM2 process trees, not only their wrapper processes. In `תפעול › משאבים`, expose ranked application, process, and bounded storage ownership, including dependency, rollback, backup, log, and cache totals.
- Keep the production app catalog synchronized from `backend/database.js`, including canonical and preview sites, PM2 services, health URLs, visitor-log ownership, and exact log ownership. ToDoFast and Toren Hazak are retired at the user request; keep their runtime, routes, storage, and catalog entries absent.
- Pixel Dungeon is fully retired from production. Keep its website, analytics records, static visitor bridge, storage ownership, and deployment artifacts absent unless the user explicitly requests a new deployment.
- PDF Studio at `https://lawebs.co.il/pdf-studio/` (moved from `vee-app.co.il/pdf-studio/`, which redirects) replaces the retired `PDF Generator`/`text-to-pdf` runtime. Monitor PDF Studio as a static canonical application with exact `/pdf-studio` log ownership on both hosts and a signed first-party browser signal; keep the legacy PM2 service and source checkout absent.
- Monitor Seder at `https://lawebs.co.il/seder` as a canonical application through PM2 process `seder-live`, exact host-and-path access-log ownership, full process-tree and storage attribution, daily/weekly comparison reporting, and a signed first-party browser signal.
- Measure PDF Studio product use through its first-party bridge: anonymous tool opens/completions, file opens, downloads, editor saves, failures, viewport heat cells, named click zones, visible-area dwell, scroll reach, and bot-filtered counts. Never transmit file names or document contents.
- Measure Miryam Zelig engagement through its first-party bridge: coarse viewport heat cells, named click zones, visible-section dwell, and scroll reach. Keep the canonical domain and legacy preview route attributed to their exact monitored records, and never capture screenshots, page text, form values, or personal content.
- Measure every canonical client website with two separate signals where a trusted server bridge is installed: conservative host-aware log candidates and signed first-party browser signals. Hash anonymous browser/session identifiers per site at ingestion, exclude automation hints, and never present either signal as proof of a person or customer.
- Share the browser-signal secret only through `/root/.visitor-signal-key` (or matching server-only environment variables); never expose it through browser code or public build-time values such as `NEXT_PUBLIC_*` or `VITE_*`.
- Keep static visitor-signal bridges POST-only and cap request bodies at 16 KB so bounded engagement batches fit without opening a general upload surface.
- Health features must help the server, never load it: run inside the existing 10-minute cycle or on authenticated reads, keep tables bounded (latest-only rows, daily aggregates, hourly samples), and keep builds off the production server. `deploy.ps1` deploys only committed `main`, refuses secret-looking files, runs backend tests, lint and the dashboard build on the PC, and uploads that build; `deploy_linux.sh` installs it (removing the server's unused dashboard `node_modules`) and reinstalls backend dependencies only when the lock file or Node version changes, at low CPU/I/O priority.
- The server cannot report its own failure: each PC agent shows a Windows notification when the monitor stops answering for 20 minutes while the PC's internet works, or answers but its 10-minute check cycle has not run for 30 minutes (once per incident, six-hour reminder, recovery notice). Maintenance alerts name what failed (certificate, backup, service) in Hebrew.
- An off-server dead-man's switch (Healthchecks.io-compatible; ping URL only in root-only `/root/.server-monitor-heartbeat-url` or `HEARTBEAT_URL`) gets a ping after every completed monitor cycle and `/fail` on a cycle error, so a whole-server outage alerts even while the PC is off. Without an account, `.github/workflows/watchdog.yml` calls the public, data-free `/serve-monitor/api/heartbeat` every 15 minutes (200 when a cycle finished within 25 minutes, else 503) and GitHub emails on a failed run; GitHub pauses schedules after 60 days without repository activity. Operations shows the watchdog when neither is present or a configured ping is silent.
- Browser-check failures name their area: a failing site or monitor screen is an error in Hebrew; a checker fault (the run never reached the sites) stays a warning until the sites go unverified for 13 hours. Test-data or low-traffic gaps never fail the check.
- Outside availability comes from the PC agents (every 10 minutes, internal-browser cookie, `ServerMonitor-` user agent): a site the server reaches but an outside check failed twice in a row alerts once per six hours; a run where most sites fail is the checker's own connection and marks nothing.
- After every successful change to a production-backed application, run the relevant verification and deploy it to production in the same task; do not leave verified application changes local unless the user explicitly asks not to deploy.
- If the user explicitly requests no tests for a task, audit real data and code without synthetic events or test runners. `deploy.ps1 -SkipTests` skips backend tests and passes `SKIP_DEPLOY_BROWSER_CHECK=1` for that deployment only; lint, local build, configuration validation and live readiness still run. The normal deployment and recurring monitoring retain their checks.

- Keep a built-in shared credential vault under `/vault`, with browser-only encryption, explicit URL links, local search and desktop list/detail navigation. Hebrew RTL and Heebo apply across the app; mobile uses separate list/detail views.
- Internal team roles are owner, editor and reader. Monitoring is readable to members; server actions and client-workspace writes are owner-only. All vault members can decrypt the shared items; editors can change entries and owners manage membership, invites and key rotation.
- Require MFA for human sessions, a separate vault passphrase, an offline recovery key, and automatic locking. Never send vault passphrases, decrypted entries or plaintext vault keys to the server. Do not send team invitations automatically.
- Prefer Google Authenticator for a simple second login step: QR setup once, clear same-phone instructions, a six-digit code on later logins, and separately saved one-use backup codes. Keep mandatory MFA and the separate vault passphrase.

- Internal browsing is never measured on any monitored site. `?monitor_internal=1` marks a browser per host (`=0` clears it); monitor links to public sites mark on an ordinary click while keeping a clean shareable href, and Settings → `ביקורים פנימיים` marks each domain. Flagged browsers are excluded from the access log and dropped by the signal endpoint, including native collectors.
- Daily-use shortcuts: keys 1–4 pick the period, R refreshes, `/` focuses search, Ctrl/Cmd+K switches. The tab title and the server destination show the count of unavailable services; service screens say since when a service is down.
- Claude Remote (continuing the PC's Claude desktop sessions from a phone) lives inside the monitor at `/remote` (`מחשב`), owner-only behind the monitor's password+MFA sign-in; the standalone `/rc` login and `claude-rc` runtime are retired. Several PCs may be connected; the screen picks which one every action targets. The PC agent (`pc-agent/`) authenticates with its own token, stored on the server only as a SHA-256; jobs and screenshots stay in memory.
- Keep navigation and operational issues actionable, preserve exact date context when opening another site, and distinguish a running messaging process from a verified connection. Missing monitoring coverage must stay visible rather than being implied healthy by existing registered-app checks.

## Child DOX Index

- `ops/AGENTS.md` - Verified backups, safe cleanup, resource health, and one maintenance scheduler.
- `PRODUCT.md` - Confirmed internal product scope and client-growth constraints.
- `DESIGN.md` - Daily-check visual system, responsive hierarchy, component and email presentation contracts.
- `.impeccable/AGENTS.md` - Design preview extensions and ignored local review evidence.

- `backend/AGENTS.md` - Express API, persistent visitor analytics, SQLite monitor database, PM2/system monitoring logic, authentication routes, and background checks.
- `frontend/AGENTS.md` - Vite React visitor, infrastructure, services, settings, authentication, responsive design, static assets, and production build.
- `pc-agent/AGENTS.md` - Windows agent that drives Claude desktop for the owner-only remote screen.
- Root-owned deployment and host files: `deploy.ps1`, `deploy_linux.sh`, `install_static_visitor_signals.sh`, `server_maintenance.sh`, `monitor.vee-app.co.il.conf`, `nginx-monitor-host-log.conf`, `nginx-tuning.conf`, `ssh-hardening.conf`, `start.bat`, `.claude/launch.json`, `.github/workflows/watchdog.yml`, `.gitignore`, and repository-level operational artifacts.
