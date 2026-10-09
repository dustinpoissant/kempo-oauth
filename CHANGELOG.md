# Changelog

All notable changes to `kempo-oauth` are documented in this file.

## [Unreleased]

### Added

First release. OAuth 2.0 sign-in and registration for kempo: Google, GitHub, Facebook, X and Microsoft.

- Authorization-code flow with PKCE and `state`, stateless on the server (one HttpOnly cookie).
- Admin page for client ids/secrets (secrets stored as encrypted `secret` settings, never returned), a connected-accounts list, and disconnect.
- Buttons pushed into kempo's new `login-form-after` / `register-form-after` slots.
- Accounts matched by provider id; an existing account is joined only by a provider-verified email; unverified squatted accounts have their password and sessions revoked first.
- Provider seam: a new provider is one file plus its declared settings.
