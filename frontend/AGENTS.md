# Frontend

## Purpose

- Provide the Vite React dashboard served under `/serve-monitor`.
- Own login, dashboard, app details, system stats, app cards, monitoring widgets, and static visual assets.

## Ownership

- `src/App.jsx` owns client routing and session-level app shell behavior.
- `src/pages/` owns route-level screens.
- `src/components/` owns reusable dashboard widgets and app templates.
- `public/` and `src/assets/` own static browser assets.
- `dist/` is generated build output and should only change through frontend builds.

## Local Contracts

- Keep API calls aligned with the deployed `/serve-monitor/api` backend prefix.
- Preserve React 19 and Vite module patterns already in use.
- Keep dashboard UI practical for live operations: empty states should distinguish no configured apps from failed loading.

## Work Guidance

- Use existing component structure and CSS files before introducing new UI libraries.
- Prefer lucide-react icons already installed when adding icon controls.
- Avoid editing `dist/` manually; rebuild it from source when production assets need updating.

## Verification

- Run `npm run build` from `frontend/` after frontend source changes.
- Run `npm run lint` when changes affect React logic or component structure, unless existing lint failures are unrelated and reported.

## Child DOX Index

- `src/pages/` - Route-level dashboard screens; no separate child contract yet.
- `src/components/` - Reusable dashboard components and app templates; no separate child contract yet.
- `public/` - Static frontend assets; no separate child contract yet.
