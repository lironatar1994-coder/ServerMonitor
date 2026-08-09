# Frontend

## Purpose

- Provide the Vite React dashboard served under `/serve-monitor`.
- Own login, visitor analytics, infrastructure, services, settings, monitoring widgets, and static visual assets.

## Ownership

- `src/App.jsx` owns client routing and session-level app shell behavior.
- `src/components/AppShell.jsx` owns the collapsible desktop rail, mobile header/bottom navigation, and visitor/infrastructure visual-mode boundary.
- `src/components/AnalyticsParts.jsx` owns the shared UI kit every screen composes from: `PageHead`, `Stat`/`StatRow`, `Panel`, `Tabs`, `RangePicker`, `RankedList`, `Hint`, `Empty`, `DataState`.
- `src/lib/useRange.js` owns the analytics time range shared across screens.
- `src/pages/` owns route-level screens.
- `src/components/` owns reusable dashboard widgets and app templates.
- `public/` and `src/assets/` own static browser assets.
- `dist/` is generated build output and should only change through frontend builds.

## Local Contracts

- Keep API calls aligned with the deployed `/serve-monitor/api` backend prefix.
- The dev server proxies `/serve-monitor/api` to `VITE_API_TARGET`, defaulting to `http://localhost:4010`. `npm run dev:live` loads `.env.remote` and targets the production API instead; keep credentials out of both files.
- Preserve React 19 and Vite module patterns already in use.
- Keep dashboard UI practical for live operations: empty states should distinguish no configured apps from failed loading.
- `/visitors` is the default cross-site visitor overview and `/visitors/:id` is the deep per-site view. Visitor pages must not mix in CPU, RAM, disk, PM2, or host-process metrics.
- `/infrastructure` owns server resources and app runtime health. `/services` owns configuration and operational actions.
- `/infrastructure` must default to complete memory ownership by service, with in-panel toggles for project storage and raw process rankings. Show resident RAM and per-service Swap separately, and keep dependency, rollback, backup, and cache visibility concise.
- Keep visible visitor terminology honest: unique candidates are distinct IPs not identified as bots in the selected range, active candidates are from the last five minutes, and IP-derived locations are approximate. Never label candidates as confirmed people or human traffic.
- Present successful page views as the primary activity metric. Do not label asset, script, font, API, or failed requests as visitor engagement.
- The Libi Diamonds deep view must expose a dedicated storefront-interest section with product and category rankings (toggled within one panel), direct storefront links, candidate counts, page views, and the same classification caveat used elsewhere.
- Service configuration supports full health-check URLs plus separate visitor-analytics and client-report toggles; operational services must not link into visitor analytics.
- Preserve RTL Hebrew presentation, `he-IL` formatting, and `Asia/Jerusalem` timestamps.

## Work Guidance

- Compose screens from `AnalyticsParts` primitives instead of adding per-page layout classes; extend the kit when a genuinely new pattern appears.
- Use existing component structure and CSS files before introducing new UI libraries.
- Prefer lucide-react icons already installed when adding icon controls.
- Preserve the editorial paper/ink visitor system and dark industrial infrastructure system; do not introduce generic blue/purple SaaS styling or glassmorphism.
- Favour density over prose: one short screen title, no marketing copy, and explanatory caveats behind a `Hint` icon rather than repeated paragraphs.
- Group related breakdowns behind `Tabs` in a single `Panel` instead of stacking one panel per dimension.
- Keep desktop tables paired with purpose-built mobile cards and maintain 44px touch targets (see the `pointer: coarse` block in `index.css`), visible focus states, and reduced-motion support.
- Infrastructure dark mode works by re-declaring the colour tokens on `.page--infrastructure`; style shared components once against the tokens rather than adding dark-mode variants.
- Absolutely positioned overlays such as `Hint` bubbles must be `display: none` when hidden — `visibility: hidden` still widens the document scroll area and breaks RTL mobile layout.
- Avoid editing `dist/` manually; rebuild it from source when production assets need updating.

## Verification

- Run `npm run build` from `frontend/` after frontend source changes.
- Run `npm run lint` when changes affect React logic or component structure, unless existing lint failures are unrelated and reported.
- Browser-check visitor overview, visitor depth, infrastructure, services, settings, and login at desktop plus 390px mobile width after meaningful UI changes; confirm `document.documentElement.scrollWidth` never exceeds `clientWidth` on any of them.
- Disable CSS transitions before measuring layout in a non-compositing browser pane; transitioned properties otherwise report stale values.
- `.claude/launch.json` runs the Vite dev server for these checks.

## Child DOX Index

- `src/pages/` - Route-level dashboard screens; no separate child contract yet.
- `src/components/` - Reusable dashboard components and app templates; no separate child contract yet.
- `public/` - Static frontend assets; no separate child contract yet.
