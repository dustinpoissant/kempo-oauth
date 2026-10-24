# kempo-oauth

Sign in and register with Google, GitHub, Facebook, X and Microsoft on a [kempo](https://github.com/dustinpoissant/kempo) site. The client ids and secrets are managed in the admin portal; the buttons appear under the login and register forms.

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
| Microsoft | yes | **no** — a directory can hold any address |
| X | **no** | — |

## Privacy policy and data deletion

Providers will not let an app go live without a **privacy policy**, and Facebook also wants a way to **delete a person's data**. This extension provides both, so there is nothing to write:

| What | Address | Give it to |
|---|---|---|
| Privacy policy | `https://your-site/oauth/privacy/` | every provider that asks for one |
| Data deletion request callback | `https://your-site/oauth/api/data-deletion/facebook` | Facebook: *Settings > Basic > Data deletion request URL > Data deletion callback URL* |
| Data deletion instructions | `https://your-site/oauth/data-deletion/` | Facebook, if you prefer instructions to a callback |

Each provider's card on the **Sign-in Providers** screen shows the addresses that provider asks for, with a Copy button, beside its redirect URI. Under **Privacy** on the same screen, set **who runs the site** and a **privacy contact email**, which the policy and the deletion page show.

**The policy** is short, and says so: it covers what is collected when somebody signs in or registers with a provider (their name, email and the provider's id for them; the provider's access token is discarded after one use), the cookies involved, who else sees it, and how to have it deleted. It names only the providers that are switched on. **If your site collects anything else, write your own** and put its address in **Your own privacy policy**: that address is then what the screen shows for the providers, and `/oauth/privacy/` sends visitors to it.

**The deletion callback** is what Facebook calls when somebody removes your app from their connected apps. It is public, and nothing happens until the request's signature is checked against the app secret (`signed_request`, HMAC-SHA256). The person it names then has their account, all of their sign-in links, their sessions and their group memberships deleted at once, and Facebook is answered with a confirmation code and the address of `/oauth/data-deletion/?code=…`, where the person can see what became of the request. The record of the request holds no personal data.
- **An administrator's account is kept.** Only their link with that provider is removed, and the status page says so. Deleting a site's administrator because they removed an app from their Facebook settings could lock the site out of its own admin.
- **Other extensions' data about a user is theirs to remove.** Kempo has no "user deleted" notice to tell them; if an extension keeps data about users, it needs its own way to clear it.
- **If kempo cannot tell whether the person is an administrator, nothing is deleted** and the callback answers with an error, so the provider asks again.

## How accounts are matched

- A returning person is found by the provider's **id**, never the email.
- A first-time sign-in whose email matches an existing account is connected to it **only if the provider vouches for the email** (and "Connect … with the same email" is on). Otherwise the visitor is told an account exists and to sign in the way they signed up.
- If that existing account never verified its email, its password is invalidated and its sessions ended before connecting (guards against someone pre-registering your address).
- Otherwise a new account is created, honouring `allow_registration` and `require_email_verification`. Its password is random and unknown; the person can set one with "forgot password".
- X shares no email, so its accounts get an `…@oauth.invalid` placeholder. A site requiring verified emails cannot offer X.

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
| `privacy_policy_url` | Your own privacy policy, instead of the one provided |

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
