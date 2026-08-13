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

- Keep website visitor monitoring and server/resource monitoring as separate product workspaces. The default dashboard must prioritize a clear cross-site visitor picture with both quick and deep views; infrastructure data belongs under `שרת ומשאבים`.
- Use a distinctive Hebrew/RTL editorial interface for visitor analytics and a separate industrial operational treatment for infrastructure. Do not fall back to generic SaaS cards, glass effects, or decorative dashboards.
- Optimise every screen for scanning and doing, not for reading. Keep copy minimal, put numbers and controls above the fold on desktop and mobile alike, and move explanations into on-demand hints. Do not reintroduce oversized display headlines or marketing paragraphs.
- Production city/region enrichment reads `GEOIP_DB_PATH`, defaulting to `/usr/share/GeoIP/GeoLite2-City.mmdb`; deployment must warn but continue when the local database is unavailable.
- Send one client-website comparison email daily and one weekly, using completed Israel calendar periods and the production recipient configured in `REPORT_EMAIL_TO`.
- Install `server_maintenance.sh` as the daily 03:00 host-maintenance job. Keep seven days of compressed PM2 logs, SQLite backups, and Manager Site data/upload backups; retain only the newest three deployment backups; remove expired deployment/build caches and Libi rollback directories; report disk thresholds; and never force Linux kernel cache drops.
- Never present traffic that merely escaped bot heuristics as confirmed human. Use candidate/estimated language, keep classification uncertainty visible, and require exact host-aware log attribution for every monitored website.
- Keep Libi Diamonds in visitor monitoring, infrastructure monitoring, and daily/weekly comparison emails as its own website, attributed only to `libidiamonds.co.il` and `www.libidiamonds.co.il`.
- Use successful page-level navigations—not images, scripts, fonts, API calls, or failed requests—for visitor activity, page rankings, and email comparisons; retain raw requests only as diagnostic data.
- Keep the small production server bounded by clearing disposable Libi build caches, clearing the NPM download cache when disk usage reaches 70%, and capping deployment backups by age and count.
- Keep production SSH key-only: root administration may use authorized keys, while password and keyboard-interactive login remain disabled and deployment must validate `sshd` before reload.
- Let Manager Site expose analytics for a client only through the shared server-to-server key and an exact stored website-URL match. Never let a Manager Site browser choose a ServerMonitor app ID or access the cross-site overview.
- Prefetch and reset the production checkout before invoking `deploy_linux.sh` so deploy-script changes apply in the same run; restart an existing PM2 monitor process without emitting a false launch error.
- In the Libi Diamonds deep visitor view, rank exact product and collection paths by candidate page views and distinct candidate IPs, compare them with the preceding equal period, and link directly to the viewed storefront page.
- Attribute runtime memory and CPU to complete PM2 process trees, not only their wrapper processes. In `שרת ומשאבים`, expose ranked application, process, and bounded storage ownership, including dependency, rollback, backup, log, and cache totals.
- Keep the production app catalog synchronized from `backend/database.js`, including canonical and preview sites, PM2 services, health URLs, visitor-log ownership, and the intentionally visible failed Toren Hazak route until it is explicitly retired; show that known failure without sending hourly alerts.
- Pixel Dungeon is fully retired from production. Keep its website, analytics records, static visitor bridge, storage ownership, and deployment artifacts absent unless the user explicitly requests a new deployment.
- PDF Studio at `https://vee-app.co.il/pdf-studio/` replaces the retired `PDF Generator`/`text-to-pdf` runtime. Monitor PDF Studio as a static canonical application with exact `/pdf-studio` log ownership and a signed first-party browser signal; keep the legacy PM2 service and source checkout absent.
- Monitor Seder at `https://lawebs.co.il/seder` as a canonical application through PM2 process `seder-live`, exact host-and-path access-log ownership, full process-tree and storage attribution, daily/weekly comparison reporting, and a signed first-party browser signal.
- Measure PDF Studio product use through its first-party bridge: anonymous tool opens/completions, file opens, downloads, editor saves, failures, viewport heat cells, named click zones, visible-area dwell, scroll reach, and bot-filtered counts. Never transmit file names or document contents.
- Measure Miryam Zelig engagement through its first-party bridge: coarse viewport heat cells, named click zones, visible-section dwell, and scroll reach. Keep the canonical domain and legacy preview route attributed to their exact monitored records, and never capture screenshots, page text, form values, or personal content.
- Measure every canonical client website with two separate signals where a trusted server bridge is installed: conservative host-aware log candidates and signed first-party browser signals. Hash anonymous browser/session identifiers per site at ingestion, exclude automation hints, and never present either signal as proof of a person or customer.
- Share the browser-signal secret only through `/root/.visitor-signal-key` (or matching server-only environment variables); never expose it through browser code or public build-time values such as `NEXT_PUBLIC_*` or `VITE_*`.
- Keep static visitor-signal bridges POST-only and cap request bodies at 16 KB so bounded engagement batches fit without opening a general upload surface.
- After every successful change to a production-backed application, run the relevant verification and deploy it to production in the same task; do not leave verified application changes local unless the user explicitly asks not to deploy.

## Child DOX Index

- `backend/AGENTS.md` - Express API, persistent visitor analytics, SQLite monitor database, PM2/system monitoring logic, authentication routes, and background checks.
- `frontend/AGENTS.md` - Vite React visitor, infrastructure, services, settings, authentication, responsive design, static assets, and production build.
- Root-owned deployment and host files: `deploy.ps1`, `deploy_linux.sh`, `install_static_visitor_signals.sh`, `server_maintenance.sh`, `monitor.vee-app.co.il.conf`, `nginx-monitor-host-log.conf`, `ssh-hardening.conf`, `start.bat`, `.claude/launch.json`, `.gitignore`, and repository-level operational artifacts.
