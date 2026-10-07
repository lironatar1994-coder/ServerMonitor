# Design mockups

## Purpose
- Own the approved team-vault and application redesign visual references.

## Ownership
- Generated PNGs, their exact prompt sidecars, and the local `index.html` review gallery.
- `build-gallery.mjs` prepares gallery metadata and a prompt-embedded reference copy; `screenshots/` holds confirmed final synthetic UI captures copied from `../review/vault/`.
- `fonts/` contains gallery Heebo files and their license; `assets-manifest.json` records the semantic handoff and empty production-raster manifest.
- `review-gallery.cjs` validates the local gallery; `gallery-review*.png` and `gallery-review.json` are its synthetic review evidence.

## Local Contracts
- Use synthetic account values and metrics only; never real passwords, authentication tokens, or personal data.
- The approved layout is a Hebrew RTL list and adjacent detail pane, Heebo, porcelain surfaces, slate navigation, and petrol actions.
- Mockups illustrate product intent; semantic text, permissions, encryption, and responsive behavior are implemented in application code.
- Preserve `vault-desktop.png` unchanged; embed the exact prompt from `vault-desktop.json` into `vault-desktop.prompted.png` and verify unchanged PNG image data.
- Label generated concepts separately from implemented UI screenshots. Screenshots do not establish security or functional correctness.
- Label the preserved generated image as the initial approved concept; current synthetic screenshots own evidence of the refined palette and controls. The concept is not a pixel-identical reference for later palette refinements.

## Work Guidance
- Preserve each exact generation prompt and inspect Hebrew and visual hierarchy.
- Run `node .impeccable/mocks/build-gallery.mjs` to prepare reference/gallery files. Use `--final-synthetic` only after the screenshot owner confirms the final set contains synthetic data; it copies the allowlisted files into `screenshots/`.

## Verification
- Inspect generated images and final browser screenshots at desktop and mobile sizes.
- The builder checks exact embedded-prompt roundtrip, unchanged PNG image data, screenshot dimensions and SHA-256 hashes. Inspect gallery filters and full-image viewing at desktop and narrow sizes.
- Run `node .impeccable/mocks/review-gallery.cjs` to verify image loading/dimensions, filtering, dialog behavior and horizontal bounds at 1440, 390 and 320 pixels.

## Child DOX Index
- No child contracts.
