# Product

<!-- impeccable:product-schema 1 -->

## Platform
web

## Users
The internal website operations team, working in Hebrew on desktop and mobile.

## Product Purpose
Connect website activity, recorded business outcomes and the team's client work. Keep server operations separate from visitor and client workflows. Provide one browser-encrypted team vault for app usernames, passwords and exact login URLs.

## Capabilities and Constraints
The user authorized internal goals, lead tracking, improvements, campaigns, activity history and editable summaries opened manually in email or WhatsApp. No client-facing access to this workspace and no Search Console integration. Existing Manager Site analytics contracts remain unchanged.
Clicks, browser observations, source-confirmed leads and manually reported outcomes must remain distinct. Do not copy lead contact details or message bodies from client stores. Preserve existing native visitor collection and production CMS content.

## Brand Commitments
A quick daily check answers what changed, what needs attention, and which site to open. Use Hebrew RTL, self-hosted Heebo, porcelain canvas, white data surfaces, slate navigation and petrol controls as specified in DESIGN.md. Infrastructure uses a graphite workspace within the same system. Compact controls, aligned comparison rows, visible numbers and explanations on demand carry the whole interface.

## Team and credential vault
- Internal access only. Owners manage accounts and operations; editors and readers can read monitoring. Shared vault readers may copy/reveal credentials, editors may change entries, and owners manage membership, invitations, trash deletion and key rotation.
- Password login followed by TOTP or a one-use recovery code; separate vault unlock. The owner saves a recovery key offline. No plaintext credential storage, automatic browser autofill, shared-link publication, attachments or automatic invitation messages.
- Search and filters operate on decrypted metadata in the current unlocked tab. Secrets load on demand, reveal for 15 seconds, lock after five idle minutes or one minute hidden, and clear on logout/navigation away.
- Revocation blocks server access immediately and freezes writes until re-encryption under a new shared key. Previously copied credentials cannot be revoked; rotate those external passwords separately.
