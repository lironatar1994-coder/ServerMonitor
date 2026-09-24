---
name: Server Monitor
description: A compact Hebrew daily check of website activity and operational attention.
colors:
  accent: "#006775"
  accent-hover: "#004E59"
  selected: "#E6F1F3"
  row-hover: "#EDF5F6"
  background: "#F5F7F8"
  surface: "#FFFFFF"
  recessed: "#E7EEF0"
  text: "#172126"
  muted: "#43565F"
  line: "#BAC8CE"
  healthy: "#19704B"
  healthy-surface: "#E6F4EC"
  attention: "#8A5800"
  attention-surface: "#FFF5DE"
  danger: "#B42332"
  danger-surface: "#FCECEF"
  infrastructure-background: "#172126"
  infrastructure-rail: "#111A1F"
  infrastructure-surface: "#202D34"
  infrastructure-recessed: "#2C3B43"
  infrastructure-text: "#F0F5F7"
  infrastructure-muted: "#ADBDC5"
  infrastructure-line: "#3D515B"
  infrastructure-accent: "#81D4DF"
  infrastructure-healthy: "#90D6B0"
  infrastructure-danger: "#e0765f"
typography:
  body:
    fontFamily: "Noto Sans Hebrew, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  headline:
    fontFamily: "Noto Sans Hebrew, sans-serif"
    fontSize: "1.35rem"
    lineHeight: 1.4
  title:
    fontFamily: "Noto Sans Hebrew, sans-serif"
    fontSize: "1rem"
    lineHeight: 1.5
  metric:
    fontFamily: "Noto Sans Hebrew, sans-serif"
    fontSize: "1.85rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0"
  label:
    fontFamily: "Noto Sans Hebrew, sans-serif"
    fontSize: "0.8rem"
    lineHeight: 1.4
rounded:
  control: "3px"
  chip: "3px"
  panel: "0"
spacing:
  compact: "0.5rem"
  regular: "1rem"
  section: "1.25rem"
  page: "clamp(0.9rem, 2vw, 1.75rem)"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "0.5rem 0.8rem"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "0.5rem 0.8rem"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "0.5rem 0.8rem"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "0.5rem 0.65rem"
  nav-selected:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
  chip-healthy:
    backgroundColor: "{colors.healthy-surface}"
    textColor: "{colors.healthy}"
    rounded: "{rounded.chip}"
    padding: "0.2rem 0.5rem"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.panel}"
    padding: "1rem"
---

# Design System: Server Monitor

## Overview

**Creative North Star: "חדר בקרה חד וברור"**

The interface should answer what changed, what needs attention, and which site to open. It is a precise, high-contrast Hebrew workspace: dark navigation and a solid deep-teal summary band anchor aligned comparison tables. Numbers and actions precede explanations. This direction comes from the user's precise brief and the built interface; no separate approved visual comp exists.

Use one light theme for websites, client follow-up, services, settings and authentication. Infrastructure uses a charcoal workspace with the same components and hierarchy. The cool palette and single sans family replace the former beige paper and serif direction.

**Key Characteristics:**

- Hebrew RTL with readable mixed-direction names, dates and paths.
- Aligned comparison tables, a single solid summary band and strong section rules; no repeated decorative icons.
- Teal actions and selection; explicit, restrained status colors.
- Explanations available on demand, with uncertainty retained in visible labels.

The implementation authority is [the global stylesheet](frontend/src/index.css), [shared analytics components](frontend/src/components/AnalyticsParts.jsx), and [the report template](backend/emailReportTemplate.js). The extension sidecar [.impeccable/design.json](.impeccable/design.json) supplies previews, breakpoints, shadows and narrative; token primitives remain here.

## Colors

The primary deep teal sits against a cool off-white canvas, white content surfaces and charcoal text.

- **Primary:** `accent` identifies links, primary actions, selected controls and the current chart series. Solid teal and white identify active navigation; `selected` is reserved for row/menu hover; `row-hover` marks an actionable row under the pointer.
- **Neutral:** `background`, `surface` and `recessed` establish three quiet levels. `text` carries numbers and headings; `muted` carries secondary labels; `line` separates aligned content.
- **Status:** `healthy` means operational health; `attention` marks something to inspect; `danger` marks failures or destructive actions. Pair color with a label, never color alone. Changes in traffic remain neutral: an increase is not automatically success and a decrease is not automatically failure.
- **Infrastructure:** use the infrastructure token set inside the charcoal workspace; keep the same control shapes, density and interaction states.

**The Meaningful Color Rule.** Reserve strong color for actions, selection and states. Do not decorate ordinary metrics with status colors.

## Typography

Use locally hosted Noto Sans Hebrew throughout, including headings, numbers, labels and code-like paths. Existing CSS aliases named `serif` and `mono` resolve to this same family; they do not authorize a second font. Available font files cover the existing regular and bold hierarchy. Use tabular numbers globally and isolate Latin URLs/paths with LTR direction where needed.

Page titles use `headline`, section headings use `title`, and primary metrics use `metric`. Small labels are generally between 0.75 and 0.85rem. The primary summary band uses 2.25rem bold values on desktop and 1.85rem on mobile; its subdued labels use 0.84rem/0.75rem with light text on deep teal. Long names wrap without enlarging the screen's headline.

**The One Family Rule.** Use weight, alignment and size for hierarchy; do not add serif display type, oversized headlines or another visual dependency.

## Layout

- The desktop shell has a right navigation rail (13.5rem expanded, 4.25rem collapsed). Content is centered within a maximum width of 92rem and uses the fluid page spacing token.
- At 900px and below, navigation becomes a fixed mobile header and five-item bottom bar, with safe-area and content clearance. At 760px and below, comparison tables retain three aligned numeric columns on mobile and the three visitor metrics remain side by side. Infrastructure and four-metric client summaries use two columns.
- The page header, period controls and headline numbers come first. Use section dividers and compact rows instead of repeating framed cards. Controls may wrap; content must remain usable at 320px without page-level horizontal overflow.
- Desktop site comparison rows align a named health icon, site, three metrics, signed change and drill-down. Mobile rows align site identity and three numeric columns beneath a dark header; change sits under the name. Repeated metric icons are omitted from rows; concise column names provide meaning.
- Page detail opens alongside its ranking on desktop. On mobile it fills the viewport, retains a close control and manages keyboard focus. Shared page-detail URLs carry the actual `from`/`to` dates plus page and view, including when the original selection was a saved preset. Site changes remount the detail view so old-site data cannot flash beneath a new site name.
- Website activity, client follow-up and server operations remain separate workspaces. `/visitors` is labeled `אתרים`; dates and the selected range remain legible and persist through navigation and authentication.

## Elevation & Depth

Most content is flat. White surfaces, pale backgrounds and thin dividers separate information; panels and metric strips have no enclosing radius or shadow. Elevation is structural: the site menu, custom-date popover and confirmation dialog float above their context. The login form sits on charcoal with a teal top rule and no decorative shadow. Exact shadow values and their roles live in the sidecar.

No glass or decorative animation. Existing short state transitions and loading indicators provide feedback; respect reduced motion by removing meaningful transition and animation duration and smooth scrolling.

## Shapes

Controls use the `control` corner radius; status chips use a small 3px radius. Content sections stay square and are separated by a single thin rule. Buttons and primary input controls have a minimum 44px height, and icon controls have a 44px square target. Do not shrink touch targets to make a dense screen fit.

## Components

- **Buttons:** primary teal with white text; secondary white with a thin neutral border; destructive red. Primary hover deepens teal; secondary hover strengthens the border. Disabled buttons lower opacity and retain the disabled cursor. Keyboard focus uses a 2px accent outline with a 3px offset.
- **Inputs:** white background, neutral border and control radius. Labels remain visible. Focus reinforces the field boundary and uses the shared keyboard focus treatment. Search, sorting and period controls belong next to the data they affect.
- **Navigation:** charcoal on desktop and mobile, light labels and solid teal active destinations. Use the plain Server Monitor wordmark, without a decorative badge. Maintain bright focus rings on dark chrome.
- **Panels and metrics:** white flat sections with dark top rules and bold title rows. The primary summary is one deep-teal band with white values and light neutral comparisons; infrastructure uses charcoal. Secondary metrics remain on white. Missing values render as an em dash; zero and missing measurement remain distinct.
- **Status chips and attention:** short written states with green, amber or red treatments. Health updates include their check time. Empty traffic alone is not a service failure.
- **Comparison rows and charts:** make site rows clickable; keep icons for navigation and actions, not repeated decoration beside every value. A named warning icon marks low samples. A missing browser measurement reads `לא נמדד`; zero baselines read `אין קודמים`. Chart legends draw solid/dashed samples with short period labels.
- **Hints and diagnostics:** methodology lives behind one shared information control or disclosure. Keep `מבקרים משוערים` explicit; compact `ביקורים` and `צפיות` labels retain the full measured meaning in accessible names and hints. Preserve contact-click language. Browser signals and server candidates are separate measurements, not additive audiences.
- **Page drill-down:** use friendly page names, recorded subsequent pages and later contact/outbound actions. Present the sequence as an observation, with low samples explicit; do not claim causation or a confirmed inquiry.
- **Email:** use the same cool background, white sections, charcoal numbers and teal links in an RTL table layout with inline styles. Request Noto Sans Hebrew with Arial/sans-serif fallbacks for email clients. Place the period and concise summary first, then comparable site metrics and previous-period changes. Each site links directly to its own monitor view with exact dates. Keep current operational checks distinct from historical period data and server diagnostics distinct from browser measurements.

## Do's and Don'ts

### Do:

- **Do** keep numbers, dates and controls visible before explanatory copy.
- **Do** reuse shared components and existing CSS tokens across workspaces.
- **Do** verify desktop and mobile layouts, keyboard focus, 44px controls and readable contrast after visual changes.
- **Do** retain small-sample and measurement uncertainty in concise, natural Hebrew.

### Don't:

- **Don't** restore the beige paper, serif, oversized headline or marketing-paragraph direction.
- **Don't** add glass, decorative motion, new visual dependencies or redundant card borders.
- **Don't** imply that an estimated visitor is a confirmed person, a click is an inquiry or a traffic change is a business outcome.
- **Don't** introduce tracking or database behavior merely to support a visual redesign.
