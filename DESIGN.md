---
name: Server Monitor
description: A compact Hebrew RTL fleet console for daily website and server operations.
colors:
  accent: "#126B78"
  accent-hover: "#0C5360"
  on-accent: "#FFFFFF"
  selected: "#E8F4F5"
  row-hover: "#F0F8F9"
  background: "#F2F5F9"
  surface: "#FFFFFF"
  recessed: "#EAF0F6"
  text: "#1D2B3D"
  muted: "#536479"
  line: "#D7E0EA"
  line-strong: "#93A4B8"
  navigation: "#192638"
  navigation-muted: "#B9C6D6"
  navigation-active: "#263D4D"
  navigation-accent: "#8AD8DF"
  healthy: "#24734F"
  healthy-surface: "#EDF7F1"
  attention: "#875A13"
  attention-surface: "#FFF7E6"
  danger: "#B13443"
  danger-surface: "#FBEFF1"
  infrastructure-background: "#111B29"
  infrastructure-surface: "#1A2939"
  infrastructure-recessed: "#243748"
  infrastructure-text: "#EDF3FA"
  infrastructure-muted: "#B2C0D0"
  infrastructure-line: "#354B60"
  infrastructure-line-strong: "#637E99"
  infrastructure-accent: "#78D6E0"
  infrastructure-accent-hover: "#A3E6EC"
  infrastructure-on-accent: "#142536"
  infrastructure-selected: "#294857"
  infrastructure-row-hover: "#223749"
  infrastructure-healthy: "#96D7B4"
  infrastructure-healthy-surface: "#213F36"
  infrastructure-attention: "#F1CD8D"
  infrastructure-attention-surface: "#3D3427"
  infrastructure-danger: "#F4A4AE"
  infrastructure-danger-surface: "#452E39"
typography:
  body:
    fontFamily: "Noto Sans Hebrew, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  headline:
    fontFamily: "Noto Sans Hebrew, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.45
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Noto Sans Hebrew, sans-serif"
    fontSize: "0.98rem"
    fontWeight: 700
    lineHeight: 1.5
  metric:
    fontFamily: "Noto Sans Hebrew, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  metric-secondary:
    fontFamily: "Noto Sans Hebrew, sans-serif"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  label:
    fontFamily: "Noto Sans Hebrew, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  control: "8px"
  chip: "6px"
  panel: "12px"
spacing:
  compact: "0.5rem"
  regular: "1rem"
  panel: "1.1rem"
  section: "1.25rem"
  page: "clamp(1rem, 2.1vw, 2rem)"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.control}"
    padding: "0.5rem 0.95rem"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.on-accent}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "0.5rem 0.95rem"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "0.5rem 0.95rem"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "0.5rem 0.65rem"
  nav-selected:
    backgroundColor: "{colors.navigation-active}"
    textColor: "#EDF9FA"
    rounded: "{rounded.control}"
    padding: "0.65rem 0.8rem"
  chip-healthy:
    backgroundColor: "{colors.healthy-surface}"
    textColor: "{colors.healthy}"
    rounded: "{rounded.chip}"
    padding: "0.2rem 0.5rem"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.panel}"
    padding: "{spacing.panel}"
  summary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.panel}"
    typography: "{typography.metric}"
  period-selected:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
---

# Design System: Server Monitor

## Overview

**Creative North Star: "חדר בקרה חד וברור"**

A compact fleet console makes website activity and server attention easy to scan. Porcelain canvas, white data surfaces, slate navigation and petrol actions put aligned numbers and useful controls first. Short Hebrew nouns, contextual icons and explanations on demand keep the interface practical for a daily check.

Website activity, client follow-up, services, settings and authentication share the light system. Infrastructure uses graphite surfaces with the same components, density and interaction grammar. The code-led concept is recorded in [the HTML brief](frontend/index.html) with seed `303d0dc4`; there is no separate approved image composition or generated visual asset.

**Key Characteristics:**

- Hebrew RTL, Noto Sans Hebrew and aligned tabular numbers.
- White summaries, tables and plots with subtle boundaries and gently rounded panels.
- Stable slate navigation, petrol actions and functional green, amber and red states.
- Compact comparison rows, measured activity bars and explanations on demand.

Implementation authority is [the theme](frontend/src/theme.css), loaded after [the base geometry](frontend/src/index.css) in [main.jsx](frontend/src/main.jsx). [AppShell](frontend/src/components/AppShell.jsx) and [AnalyticsParts](frontend/src/components/AnalyticsParts.jsx) define the shared structures; route styles use their tokens. [.impeccable/design.json](.impeccable/design.json) extends this record with previews, breakpoints, shadows and narrative. Email remains a separate presentation contract owned by [its template](backend/emailReportTemplate.js).

## Colors

Petrol provides a single action accent against cool porcelain and white; slate anchors navigation.

### Primary

- **Petrol:** `accent` marks primary actions, selected periods, links and the current plot series; `accent-hover` deepens it on hover. `on-accent` supplies readable button text.
- **Selection washes:** `selected` marks selected or hovered site-menu entries; `row-hover` marks actionable rows without competing with their values.

### Neutral

- **Porcelain and white:** `background` is the canvas, `surface` contains summaries/data/plots, and `recessed` distinguishes table headers and compact resource summaries.
- **Ink and slate:** `text` carries headings and values; `muted` carries secondary labels. `line` separates content; `line-strong` defines fields and controls.
- **Navigation slate:** the `navigation` family supplies the stable rail and mobile chrome, muted destinations, selected surface and pale petrol icon accent.

### Functional states

- **Green, amber and red:** `healthy`, `attention` and `danger` describe health, attention and failure/destruction; their surface tokens provide quiet readable backgrounds. Pair each state with a written label or accessible icon name.
- **Graphite infrastructure:** the `infrastructure-*` set re-declares the same roles on the resource workspace. Navigation stays slate. Use the shared controls against these local tokens rather than separate dark component variants.

**The Meaningful Color Rule.** Reserve strong color for actions, selection and operational states. Traffic changes stay neutral; ordinary visitor values use ink.

## Typography

**Body and heading font:** locally hosted Noto Sans Hebrew with sans-serif fallback. The base `serif` and `mono` aliases resolve to this family. Font files cover regular, bold and extra-bold; tabular numbers apply throughout.

### Hierarchy

- **Headline:** a compact bold page title; reduce it to 1.25rem on mobile.
- **Title:** bold panel headings with a quiet supporting action or hint.
- **Metric:** bold primary summary values; secondary values use the smaller metric role. Summary values reduce to 1.75rem on mobile; page detail retains its compact inline values.
- **Body and label:** normal-weight readable Hebrew. Secondary timestamps and comparison labels generally use 0.7–0.8rem; panel titles remain visually stronger.
- **Mixed direction:** isolate complete dates, paths, byte values and RAM/Swap/PID/CPU fragments with `bdi` or explicit LTR direction. Keep names wrapping within their column.

**The One Family Rule.** Build hierarchy with size, weight and alignment. Keep titles compact and omit display type and page eyebrows.

## Layout

- The right desktop rail is 14.5rem expanded and 4.25rem collapsed. Its destinations are grouped under `מעקב` and `תפעול`; collapsed destinations retain accessible names. The content width remains `min(100%, 92rem)`, centered with the page spacing token.
- At 900px and below, a fixed slate header and five-item bottom bar replace the rail. Respect safe areas and leave content clearance. Destinations are `אתרים`, `לקוחות`, `שרת`, `שירותים` and `הגדרות`.
- The compact page header and period controls lead into a summary and the data. Shared panels use a 1.25rem section rhythm, with a compact title row and 1.1rem body padding. Related breakdowns use in-panel underline toggles.
- At 760px and below, page padding becomes 0.85rem, panel body padding 0.85rem and panel headings 0.91rem. Visitor summaries retain three aligned columns; infrastructure and four-metric client summaries use two. At 380px and below, page padding becomes 0.65rem.
- Site rows share one column header for identity, three metrics and change. On mobile, three numeric columns remain aligned, change moves below identity and the chevron remains visible. Do not repeat metric icons in headers or rows. Client tables use the same alignment grammar, with concise inquiry/task headings.
- Page rankings open a useful adjacent drill-down on desktop. On mobile the detail is a full-screen, focus-trapped dialog with inert background, a visible close control and no enclosing panel radius.
- Controls wrap, names break within their column and grids collapse before the content becomes cramped. Verify desktop, 390px and 320px screens without page-level horizontal overflow.

## Elevation & Depth

Summaries, panels, tables, plots and login are flat at rest. Tonal surfaces and one subtle boundary establish hierarchy. Nested panels lose their enclosing border; they do not become another stack of cards.

Structural elevation belongs to the date/site popovers, chart tooltip, dialogs and drawer. Exact shadow values live in the sidecar. Dark backdrop tint separates a blocking dialog from its context. Hints use solid contrasting surfaces and remain `display: none` while hidden so they cannot widen an RTL page.

**The Flat Data Rule.** Keep data surfaces free of decorative shadows. Use elevation only for overlays that need to sit above another surface.

Short existing background/border transitions and loading indicators provide state feedback. Respect reduced motion; plots do not animate. Do not introduce decorative animation, gradients, glass or glow.

## Shapes

Panels and summary strips use the panel radius; buttons and fields use the control radius. Status chips are compact rounded rectangles, not decorative badges. Period selectors have a 10px outer group and 7px inner selection. The login card uses a 16px corner within the same light palette.

Controls have at least a 44px target. Icon actions use a 44px square; rail destinations are at least 48px high. Density comes from alignment and concise labels, not smaller touch targets.

## Components

### Buttons and icon actions

Primary buttons use petrol and the on-accent text token; secondary buttons use the surface and a strong field boundary; destructive buttons use red. Hover deepens the primary or applies a recessed secondary surface. Disabled controls lower opacity. Keyboard focus uses a 2px accent outline with a 3px offset; navigation uses its pale accent on slate.

Repeated edit, copy, refresh and site-switch actions use contextual accessible names and titles. Keep primary creation, destructive and sharing actions visibly named. Use the installed lucide-react icons.

### Fields and authentication

Fields have visible labels, a white/local surface, a strong neutral border and control corners. Focus reinforces the border and shared outline. Search, sort and period controls stay beside the data they affect.

Login is a centered white form on porcelain, at most 26rem wide, with a compact brand separator, 48px fields and a 48px petrol submit action. Password reveal remains a named icon control. Errors use the same failure treatment as the application.

### Navigation and selection

Slate navigation stays stable across workspaces. Selected destinations have a darker petrol-slate surface, light text and a pale petrol icon. A plain Server Monitor wordmark anchors it. Tracking and operations group labels serve wayfinding rather than page decoration.

Period controls use a white bounded segment group with an explicit petrol fill on selection. Content toggles use an underline and `aria-pressed`, grouping related data in one panel rather than creating separate screens or cards.

### Panels and summaries

White, gently rounded panels enclose one coherent dataset. Their compact heading row uses a subtle bottom boundary; bleed bodies let table/list rows meet that boundary. The primary summary is a white strip with aligned ink values and vertical separators. Graphite infrastructure reuses the same composition with local tokens.

Empty, loading, failed and missing measurement states remain distinct. Missing values use an em dash or `לא נמדד`; real zero values remain numeric. Attention and failure stay visible rather than being recast as empty data.

### Comparison rows, bars and plots

Website comparison comes before the chart and supplies local search/sort. The visits bar encodes measured sessions relative to the maximum across all sites in the selected period; filtering and sorting do not change that scale. Zero has no fill, and numbers remain primary and accessible.

Charts use a white surface, petrol current series and muted dashed preceding-period series with short labels. No line animation. Shared signed changes stay neutral, show `אין קודמים` for zero baselines and retain unavailable comparisons. Low samples use a named warning icon.

### Resource and service views

Graphite resource summaries and ranked rows expose memory, storage and process ownership through in-panel toggles. Separate RAM and Swap labels and isolate each complete technical value. Resource bars encode the selected measurement rather than serving as decoration.

Service lists keep the name, runtime/URL and concise status aligned. Operational actions stay in an administration disclosure with confirmation. Specialized WhatsApp and SSH views retain graphite terminal/log surfaces while fields and actions use shared primitives; terminal colors indicate output state.

### Hints and page detail

Keep `מבקרים משוערים` explicit; `ביקורים` and `צפיות` retain their full measured meaning in accessible names and shared hints. Measurement diagnostics, source gaps and longer evidence open on demand. Browser signals and server candidates remain visually distinct measurements.

A page drill-down shows friendly names, recorded next pages and later contact/outbound actions, with low samples visible. The row is one keyboard-operable control and closing restores focus. Exact dates and page context survive navigation and authentication.

### Email

Email has an independent, unchanged palette in `backend/emailReportTemplate.js`: light canvas `#F5F7F8`, white sheet, recessed summary `#E7EEF0`, text `#172126`, muted `#43565F`, rules `#BAC8CE` and links `#006775`. Explicit dark mode uses canvas `#111A1F`, sheet `#202D34`, summary `#2C3B43`, text `#F0F5F7`, muted `#ADBDC5`, rules `#3D515B`, links `#81D4DF` and pale-red attention `#F0A8B1`. Do not infer an email migration from application token changes.

- Use a flat RTL sheet at most 640px wide, a compact 21px title, exact Israel calendar dates and a quiet three-column summary. Request Noto Sans Hebrew with Arial/sans-serif fallback and tabular numbers.
- Name site, estimated visitors, measured visits and opened pages once in an aligned table header. Emphasize visits, show only visit deltas and use percentages only with at least 30 preceding visits. Show positive contact counts as contact clicks.
- Keep measurement notes concise. When server page activity exists without browser measurement, show three browser dashes and omit the visit delta. Keep detailed server diagnostics in the linked view.
- Separate the latest operational inventory from period comparisons; align name, written status and check time. Each site/service links directly to its appropriate view, with exact comparison dates where relevant.
- Retain inline light styles, `bgcolor` fallbacks, explicit dark mode, compact padding at 600px, wrapping names and the plain-text counterpart. Keep natural professional Hebrew with minimal repeated instructions.

## Do's and Don'ts

### Do:

- **Do** keep numbers, dates and controls visible before explanatory copy.
- **Do** compose screens from shared components and local surface/status tokens.
- **Do** verify desktop and mobile layouts, keyboard focus, 44px targets and readable contrast.
- **Do** retain source distinctions, failures and measurement uncertainty in concise Hebrew.
- **Do** keep infrastructure graphite and email presentation separately grounded in their source.

### Don't:

- **Don't** restore charcoal summaries or plots to the light workspace, square panel rules or a dark login treatment.
- **Don't** add decorative animation, gradients, glass, glow, page eyebrows, decorative badges or new visual libraries.
- **Don't** repeat metric icons or explanatory paragraphs in each row.
- **Don't** imply that an estimate is a confirmed person, a click is an inquiry or a traffic change is a business outcome.
- **Don't** introduce tracking or database behavior merely to support a visual redesign.
