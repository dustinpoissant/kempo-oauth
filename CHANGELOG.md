# Changelog

All notable changes to `kempo-oauth` are documented in this file.

## [Unreleased]

### Changed

- **X sign-in asks for an email address first.** X shares none, so a person who signs in with X is no longer given a placeholder address. A dialog asks for their email, sends a six-digit code to it, and an account is created, or joined to an existing one with that address, only when the code is right. Nothing is stored about them before then except a row that expires after fifteen minutes. The same applies to any provider that completes a sign-in without sharing an address.
- **`signIn` refuses a profile with no email** (`no_email`) instead of creating an account with a placeholder address. Its one caller, the pending sign-in, always has an address by then.
- **Microsoft sign-in is removed.** Its sign-in needs an Azure subscription, which asks for a payment card, so it is no longer offered. Its settings, icon and endpoints are gone; any Microsoft sign-in links already stored stay in the table until the account is deleted or the link is removed.
- **The privacy policy and the data-deletion page are site pages now** (`/privacy/` and `/data-deletion/`), not pages served from the package. They are written on install and update with kempo's own rule for files an extension puts into a site: replaced while unedited, kept once the owner has changed them, and not brought back if deleted. Their facts (site name, operator, contact, providers) are filled in from settings.
- **Each provider's card shows only the addresses its console asks for.** Facebook: privacy policy and data-deletion callback. Google: privacy policy. GitHub and X: none.
- Removed the `privacy_policy_url` setting (the site's own page does that job now), the `/oauth/privacy/` and `/oauth/data-deletion/` pages, and the instructions address.
- Facebook's data-deletion callback now also adds a `user:deleted` hook for kempo: the removal of the account is announced to other extensions.

### Added

- **A privacy policy and a data-deletion callback**, so an app can be taken live with a provider without writing either. `/oauth/privacy/` is a short policy for signing in, filled in with the site's name, who runs it, how to reach them and the providers that are switched on; `/oauth/api/data-deletion/facebook` is the callback Facebook calls when someone removes the app (its `signed_request` is verified with the app secret; the person's account, sign-in links and sessions are deleted, an administrator's account is kept and only unlinked, and the answer is the confirmation code and status address Facebook expects); `/oauth/data-deletion/` gives instructions and shows what became of a request. Each provider's card on the settings screen shows the addresses it asks for, with Copy buttons, and there are new settings `privacy_operator`, `privacy_contact_email` and `privacy_policy_url` (your own policy instead of the one provided). Adds the table `kempoOauthDeletion`, which holds no personal data.

- **Dashboard widget.** A **Social sign-in** widget on the kempo admin dashboard showing how many accounts are linked and which providers are offered, with a **Provider settings** button, declared in `widgets` in `kempo-config.json`. Needs a kempo with the dashboard; ignored on older versions.
First release. OAuth 2.0 sign-in and registration for kempo: Google, GitHub, Facebook, X and Microsoft.

- Authorization-code flow with PKCE and `state`, stateless on the server (one HttpOnly cookie).
- Admin page for client ids/secrets (secrets stored as encrypted `secret` settings, never returned), a connected-accounts list, and disconnect.
- Buttons pushed into kempo's new `login-form-after` / `register-form-after` slots.
- Accounts matched by provider id; an existing account is joined only by a provider-verified email; unverified squatted accounts have their password and sessions revoked first.
- Provider seam: a new provider is one file plus its declared settings.
