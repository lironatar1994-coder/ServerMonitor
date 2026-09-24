# Frontend

## Purpose

- Provide the Vite React dashboard served under `/serve-monitor`.
- Own login, visitor analytics, infrastructure, services, settings, monitoring widgets, and static visual assets.

## Ownership

- `PageInsights.jsx` opens a page drill-down beside rankings on desktop and a focus-trapped, full-screen dialog with inert background on mobile; `analyticsLabels.js` owns plain-Hebrew measurement hints and portfolio page names. `TrackingStatus.jsx` exposes recurring check failures; `LoadBoundary.jsx` provides recovery for failed page chunks.

- `src/pages/ClientGrowth.jsx` and `client-growth.css` own the internal client workspace: prioritization, goals, leads, tasks, campaigns, activity and editable manual-share drafts, composed from AnalyticsParts.

- `src/App.jsx` owns client routing and session-level app shell behavior.
- `src/components/AppShell.jsx` owns the collapsible desktop rail, mobile header/bottom navigation, and visitor/infrastructure visual-mode boundary.
- `src/components/AnalyticsParts.jsx` owns the shared UI kit every screen composes from: `PageHead`, `Stat`/`StatRow`, `Panel`, `Tabs`, `RangePicker`, `RankedList`, `Hint`, `Empty`, `DataState`.
- `src/components/ProductAnalytics.jsx` owns reusable engagement heatmaps, named click/visibility zones, and scroll reach, plus PDF Studio usage totals and per-tool outcomes.
- `TrafficChart.jsx` owns one selected browser metric with a dashed preceding-period series; `SiteSwitcher.jsx` owns searchable date-preserving site navigation. `lib/dailyCheck.js` owns small-sample comparison language, equal-period range math and sparse bucket alignment. Reuse existing read-only APIs.
- `src/lib/useRange.js` owns the analytics time range shared across screens.
- `src/pages/` owns route-level screens.
- `src/components/` owns reusable dashboard widgets and app templates.
- `public/` and `src/assets/` own static browser assets.
- `dist/` is generated build output and should only change through frontend builds.

## Local Contracts

- Keep `מבקרים משוערים` explicit; compact labels `ביקורים` and `צפיות` mean measured visits and recorded page opens, with full meaning in accessible labels and shared hints. Mobile comparison tables retain aligned numeric columns with one dark header; omit repeated metric icons. Keep low samples visible with a named warning icon and missing measurement with `לא נמדד`.
- Shared `Change` renders neutral signed absolute changes with accessible full explanations. Zero baselines show `אין קודמים`; unavailable comparisons stay an em dash. Client objectives/coverage remain in detail views rather than repeating in overview rows. Page limitations live in a disclosure, with low samples still flagged outside it.
- The full page row is one keyboard-operable button with a friendly name, count and chevron; do not repeat continuation prompts. Store the selected exact page in `page` and the view in the URL. Back, refresh and shared links preserve context; closing returns focus to the originating row. Drill-downs show observed next pages, later contact actions and low-sample guidance; do not equate no recorded continuation with an exit or a click with a lead.
- API requests time out after 20 seconds with recovery text, validate JSON responses, and preserve cancellation. Lazy-load failures offer reload; the loader offers recovery if a chunk stalls. Never disguise a failed request as no traffic.
- Report links preserve the requested internal app route through login/session expiry. Only allow-listed local destinations are accepted. Valid `from`/`to` query dates initialize the analytics range (maximum 90 days); manual range changes replace the email range through React Router. When a page detail is selected, write its exact current dates to the URL so shared links work without local preferences. Site switching and comparison-row links carry the exact displayed dates. Default to 24 hours only when no saved or linked preference exists.

- `/clients` and `/clients/:id` are internal-only. Keep Search Console and customer portals absent. Email/WhatsApp controls open editable drafts; opening is not proof of sending. Summaries remain reviewable before the user shares.
- Show source-confirmed, manual and observed browser actions separately. Expose collection start and source-sync gaps, independent goal periods, low-sample comparisons, and the absence of confirmed session-to-lead attribution. Source PII is not copied into forms.

- Keep API calls aligned with the deployed `/serve-monitor/api` backend prefix.
- The dev server proxies `/serve-monitor/api` to `VITE_API_TARGET`, defaulting to `http://localhost:4010`. `npm run dev:live` loads `.env.remote` and targets the production API instead; keep credentials out of both files.
- Preserve React 19 and Vite module patterns already in use.
- Keep dashboard UI practical for live operations: empty states should distinguish no configured apps from failed loading.
- `/visitors` is the default cross-site visitor overview and `/visitors/:id` is the deep per-site view. Visitor pages must not mix in CPU, RAM, disk, PM2, or host-process metrics.
- `/infrastructure` owns server resources and app runtime health. `/services` owns configuration and operational actions.
- `/infrastructure` must default to complete memory ownership by service, with in-panel toggles for project storage and raw process rankings. Show resident RAM and per-service Swap separately, and keep dependency, rollback, backup, and cache visibility concise.
- Keep visible visitor terminology honest: unique candidates are distinct IPs not identified as bots in the selected range, active candidates are from the last five minutes, and IP-derived locations are approximate. Never label candidates as confirmed people or human traffic.
- Present first-party browser signals separately from IP candidates. Label them as anonymous JavaScript execution signals and keep the caveat that they do not prove a person or customer.
- Present PDF Studio product events as anonymous usage estimates: disclose bot filtering, keep file names/content absent, and label heatmaps as coarse viewport positions rather than recordings or proof of people.
- Keep Miryam Zelig and Seder engagement panels visible before their first measurements, omit PDF-specific tool metrics there, and label sessions, heatmaps, zones, dwell, and scroll reach as anonymous browser signals rather than people.
- Present successful page views as the primary activity metric. Do not label asset, script, font, API, or failed requests as visitor engagement.
- The Libi Diamonds deep view must expose a dedicated storefront-interest section with product and category rankings (toggled within one panel), direct storefront links, candidate counts, page views, and the same classification caveat used elsewhere.
- Service configuration supports full health-check URLs plus separate visitor-analytics and client-report toggles; operational services must not link into visitor analytics.
- Preserve RTL Hebrew presentation, `he-IL` formatting, and `Asia/Jerusalem` timestamps.

- PM2 and systemd applications share managed-service labels and start/stop/restart controls. Show the actual runtime identifier in infrastructure; static sites have no runtime actions.

- The website comparison list precedes the chart; support search and local sort retention by activity, absolute change or name. Lead with browser visitor estimates, measured sessions and recorded page opens. Diagnostics stay expandable. Zero or absent measurements are never proof of no visitors.
- Small samples use absolute change; zero baselines say no previous activity. A failed comparison stays unavailable, never a fabricated zero. Show real data-generation/check timestamps, never unconditional connected badges.
- Client overview prioritizes overdue follow-up, open inquiries and upcoming tasks; goals/campaigns/history/sharing are secondary. Browser clicks, source records and manual outcomes remain separate.
- Service actions live in a separate administration disclosure, retaining confirmation. Navigation labels are `אתרים`, `לקוחות`, `שרת`, `שירותים`, `הגדרות`, with safe-area spacing and 44px targets.

## Work Guidance

- Compose screens from `AnalyticsParts` primitives instead of adding per-page layout classes; extend the kit when a genuinely new pattern appears.
- Use existing component structure and CSS files before introducing new UI libraries.
- Prefer lucide-react icons already installed when adding icon controls.
- Follow `../DESIGN.md`: cool off-white and white application surfaces, charcoal infrastructure, Noto Sans Hebrew throughout, teal selection/links, green health, amber attention and red failure/destruction. The paper/ink and serif direction is superseded.
- Anchor every workspace with charcoal navigation, a plain Server Monitor wordmark and a strong primary summary band. Prefer bold numbers and column alignment over decorative icons, pale cards or oversized titles. Selected content tabs use underlines; main navigation and period controls retain solid selection.
- Favour density over prose: one short screen title, no marketing copy, and explanatory caveats behind a `Hint` icon rather than repeated paragraphs.
- Group related breakdowns behind `Tabs` in a single `Panel` instead of stacking one panel per dimension.
- Keep desktop tables paired with purpose-built mobile cards and maintain 44px touch targets (see the `pointer: coarse` block in `index.css`), visible focus states, and reduced-motion support.
- Infrastructure dark mode works by re-declaring the colour tokens on `.page--infrastructure`; style shared components once against the tokens rather than adding dark-mode variants.
- Absolutely positioned overlays such as `Hint` bubbles must be `display: none` when hidden — `visibility: hidden` still widens the document scroll area and breaks RTL mobile layout.
- Avoid editing `dist/` manually; rebuild it from source when production assets need updating.

## Verification

- Run `npm run build` from `frontend/` after frontend source changes.
- Run `npm run lint` when changes affect React logic or component structure, unless existing lint failures are unrelated and reported.
- `node ops/ui-review.cjs` from the root checks live read-only UI flows and locally mocked loading/empty/failed/stale/long-name states; it requires local Vite remote mode and key-only SSH, keeps its five-minute token in process memory, and writes ignored `.impeccable/review` artifacts.
- Browser-check visitor overview, visitor depth, infrastructure, services, settings, and login at desktop plus 390px and 320px mobile widths after meaningful UI changes; confirm `document.documentElement.scrollWidth` never exceeds `clientWidth` on any of them.
- Disable CSS transitions before measuring layout in a non-compositing browser pane; transitioned properties otherwise report stale values.
- `.claude/launch.json` runs the Vite dev server for these checks.

## Child DOX Index

- `src/pages/` - Route-level dashboard screens; no separate child contract yet.
- `src/components/` - Reusable dashboard components and app templates; no separate child contract yet.
- `public/` - Static frontend assets; no separate child contract yet.
