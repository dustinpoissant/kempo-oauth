# kempo-oauth

Sign in and register with Google, GitHub, Facebook and X on a [kempo](https://github.com/dustinpoissant/kempo) site. The client ids and secrets are managed in the admin portal; the buttons appear under the login and register forms.

## Install

```bash
npm install kempo-oauth
```

Then install it from the admin portal (Extensions). Client secrets are stored as kempo `secret` settings, so `SETTINGS_ENCRYPTION_KEY` must be set in the site's environment first — generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and back it up.

### Sites created before the slots existed

The buttons are pushed into two slots on kempo's login and register pages: `login-form-after` and `register-form-after`. Pages copied from a kempo older than that don't have them. Add one line just after the closing `</form>` of each:

```html
<!-- public/login/index.page.html -->
<location name="login-form-after" />

<!-- public/register/index.page.html -->
<location name="register-form-after" />
```

## Connecting a provider

Open **Sign-in Providers** in the admin portal. Each provider card shows the **redirect URI** to give the provider (`https://your-site/oauth/api/callback/<provider>`), a link to the provider's developer console, and fields for the client id and secret. A provider is shown on the login page only when it is switched on **and** has both.

Behind a proxy that changes the scheme or host, set **Site address** so the redirect URI is built from the public address rather than the one this process sees.

| Provider | Gives an email? | Email trusted to join an existing account? |
|---|---|---|
| Google | yes | yes, when Google says it is verified |
| GitHub | yes (primary verified) | yes |
| Facebook | yes | **no** — Facebook never says it was confirmed |
| X | **no** — the person types an address and proves it with a code | yes, once the code is right |

## Privacy policy and data deletion

The privacy policy and the data-deletion page are ordinary pages of your site, at `/privacy/` and `/data-deletion/`. This extension writes them on install and on every update, so there is nothing to write yourself. Edit them in the admin like any page.

- **Updates never overwrite your edits.** A page is replaced only while it is exactly what this extension last wrote. A page you have changed is kept, and one you deleted stays deleted (the same rule kempo uses for its own starter pages).
- **Facts fill in themselves.** The site's name, who runs it, the contact address and the providers that are on are filled in from the settings on the Sign-in Providers screen (**Privacy**). The wording around them is yours to change.
- **The policy covers signing in**, and links to the account deletion page (`/delete-account/`), where anyone can delete their own account with a code emailed to them. If your site collects anything else, say so in your own pages.

Which addresses to give each provider is shown on its card on the Sign-in Providers screen, beside the redirect URI. Only providers whose console has a field for them get one:

| Provider | Privacy policy URL | Data deletion callback |
|---|---|---|
| Facebook | yes (required) | yes: `https://your-site/oauth/api/data-deletion/facebook` |
| Google | yes (consent screen) | no |
| GitHub | no field | no |
| X | no field | no |

**The deletion callback** is what Facebook calls when someone removes your app from their connected apps. It is public, and nothing happens until the request's signature is checked against the app secret (`signed_request`, HMAC-SHA256). The person it names then has their account, all of their sign-in links, their sessions and their group memberships deleted at once, and Facebook is answered with a confirmation code and the address of `/data-deletion/?code=…`, where the person can see what became of the request. The record of the request holds no personal data.

- **An administrator's account is kept.** Only their link with that provider is removed, and the status page says so. Deleting a site's administrator because they removed an app from their Facebook settings could lock the site out of its own admin.
- **Other extensions' data about a user is theirs to remove.** Kempo fires a `user:deleted` hook whenever an account is deleted, by an administrator or by the person; this extension answers it by removing its own sign-in links.
- **If kempo cannot tell whether the person is an administrator, nothing is deleted** and the callback answers with an error, so the provider asks again.

## How accounts are matched

- A returning person is found by the provider's **id**, never the email.
- A first-time sign-in whose email matches an existing account is connected to it **only if the provider vouches for the email** (and "Connect … with the same email" is on). Otherwise the visitor is told an account exists and to sign in the way they signed up.
- If that existing account never verified its email, its password is invalidated and its sessions ended before connecting (guards against someone pre-registering your address).
- Otherwise a new account is created, honouring `allow_registration` and `require_email_verification`. Its password is random and unknown; the person can set one with "forgot password".
- X shares no email, so the visitor is asked for one in a dialog and proves it with a six-digit code. No account exists until the code is right, and the code is sent to the address they typed, so X works on sites that require verified emails.

## Security notes

Authorization code flow with PKCE (S256) and a per-attempt `state`, held in a short-lived HttpOnly `lax` cookie scoped to `/oauth/api`. Nothing is stored server-side mid-flow, and provider access tokens are discarded after reading the profile. Redirect targets (`next`, "after sign-in") must be paths on this site. Failures return to the login page as a short code, never text from the provider.

## Settings

| Setting | What it does |
|---|---|
| `base_url` | The public address, the base of every address above |
| `after_login_path` | Where a visitor lands after signing in |
| `link_verified_emails` | Connect a provider sign-in to an existing account with the same verified email |
| `privacy_operator` | Who runs the site, as the privacy policy names them |
| `privacy_contact_email` | Where people write about their data |

## Permissions

`oauth:view` (see connected accounts), `oauth:unlink` (disconnect one), `oauth:settings` (providers and secrets). Groups: `kempo-oauth:viewer`, `kempo-oauth:administrator`.

## Adding a provider

One file in `server/providers/` (contract documented at the top of `server/providers/index.js`) plus its settings in `kempo-config.json`; a test fails until both exist. Another kempo (CMS) extension can call `registerProvider` from `kempo-oauth/sdk`.

## Out of scope

Apple (needs a signed-JWT client secret), Discord, LinkedIn and others (each is one provider file), OpenID discovery, refresh tokens / calling providers on a user's behalf, and a "connect another provider" button on the account page.

## Development

```bash
docker compose up -d                      # test database on port 5445
npm run link:local
DATABASE_URL=postgresql://kempo:kempo@localhost:5445/kempo_oauth_test npx drizzle-kit push --force
DATABASE_URL=postgresql://kempo:kempo@localhost:5445/kempo_oauth_test SETTINGS_ENCRYPTION_KEY=$(openssl rand -hex 32) npm test
```

Check for `(SKIPPED)` in the output: database suites skip themselves, and a skip reads as a pass. They also refuse any database not named `*_test`.

## Dashboard widget

Adds a **Social sign-in** widget to the kempo admin dashboard showing how many accounts are linked and which providers are offered, with a **Provider settings** button. It is declared in `widgets` in `kempo-config.json` and registered when the extension is installed or updated; people only see it if they hold its permission, and can hide, reorder or resize it from the dashboard's Customize dialog. Needs a kempo with the dashboard (see kempo's `docs/dashboard.md`); on an older kempo the entry is ignored.
