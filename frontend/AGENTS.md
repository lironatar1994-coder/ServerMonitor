# Frontend

## Purpose

- Provide the Vite React dashboard served under `/serve-monitor`.
- Own login, visitor analytics, infrastructure, services, settings, monitoring widgets, and static visual assets.

## Ownership

- `src/App.jsx` owns client routing and session-level app shell behavior.
- `src/components/AppShell.jsx` owns the desktop rail, mobile navigation, and visitor/infrastructure visual-mode boundary.
- `src/pages/` owns route-level screens.
- `src/components/` owns reusable dashboard widgets and app templates.
- `public/` and `src/assets/` own static browser assets.
- `dist/` is generated build output and should only change through frontend builds.

## Local Contracts

- Keep API calls aligned with the deployed `/serve-monitor/api` backend prefix.
- Preserve React 19 and Vite module patterns already in use.
- Keep dashboard UI practical for live operations: empty states should distinguish no configured apps from failed loading.
- `/visitors` is the default cross-site visitor overview and `/visitors/:id` is the deep per-site view. Visitor pages must not mix in CPU, RAM, disk, PM2, or host-process metrics.
- `/infrastructure` owns server resources and app runtime health. `/services` owns configuration and operational actions.
- Keep visible visitor terminology honest: unique visitors are distinct human-classified IPs in the selected range, active visitors are from the last five minutes, and IP-derived locations are approximate.
- Preserve RTL Hebrew presentation, `he-IL` formatting, and `Asia/Jerusalem` timestamps.

## Work Guidance

- Use existing component structure and CSS files before introducing new UI libraries.
- Prefer lucide-react icons already installed when adding icon controls.
- Preserve the editorial paper/ink visitor system and dark industrial infrastructure system; do not introduce generic blue/purple SaaS styling or glassmorphism.
- Keep desktop tables paired with purpose-built mobile cards and maintain 44px touch targets, visible focus states, and reduced-motion support.
- Avoid editing `dist/` manually; rebuild it from source when production assets need updating.

## Verification

- Run `npm run build` from `frontend/` after frontend source changes.
- Run `npm run lint` when changes affect React logic or component structure, unless existing lint failures are unrelated and reported.
- Browser-check visitor overview, visitor depth, infrastructure, and navigation at desktop plus 390px mobile width after meaningful UI changes.

## Child DOX Index

- `src/pages/` - Route-level dashboard screens; no separate child contract yet.
- `src/components/` - Reusable dashboard components and app templates; no separate child contract yet.
- `public/` - Static frontend assets; no separate child contract yet.
