# Changelog

All notable changes to `kempo-oauth` are documented in this file.

## [Unreleased]

### Added

- **A privacy policy and a data-deletion callback**, so an app can be taken live with a provider without writing either. `/oauth/privacy/` is a short policy for signing in, filled in with the site's name, who runs it, how to reach them and the providers that are switched on; `/oauth/api/data-deletion/facebook` is the callback Facebook calls when someone removes the app (its `signed_request` is verified with the app secret; the person's account, sign-in links and sessions are deleted, an administrator's account is kept and only unlinked, and the answer is the confirmation code and status address Facebook expects); `/oauth/data-deletion/` gives instructions and shows what became of a request. Each provider's card on the settings screen shows the addresses it asks for, with Copy buttons, and there are new settings `privacy_operator`, `privacy_contact_email` and `privacy_policy_url` (your own policy instead of the one provided). Adds the table `kempoOauthDeletion`, which holds no personal data.

- **Dashboard widget.** A **Social sign-in** widget on the kempo admin dashboard showing how many accounts are linked and which providers are offered, with a **Provider settings** button, declared in `widgets` in `kempo-config.json`. Needs a kempo with the dashboard; ignored on older versions.
First release. OAuth 2.0 sign-in and registration for kempo: Google, GitHub, Facebook, X and Microsoft.

- Authorization-code flow with PKCE and `state`, stateless on the server (one HttpOnly cookie).
- Admin page for client ids/secrets (secrets stored as encrypted `secret` settings, never returned), a connected-accounts list, and disconnect.
- Buttons pushed into kempo's new `login-form-after` / `register-form-after` slots.
- Accounts matched by provider id; an existing account is joined only by a provider-verified email; unverified squatted accounts have their password and sessions revoked first.
- Provider seam: a new provider is one file plus its declared settings.
