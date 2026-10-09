import google from './google.js';
import github from './github.js';
import facebook from './facebook.js';
import x from './x.js';
import microsoft from './microsoft.js';

/*
  The provider seam: everything outside this directory speaks one vocabulary, and a provider is the
  only place that knows what Google or GitHub call things.

  A provider is a plain object:

  ```js
  {
    name: 'google',                 // stable id: URLs, setting names and table rows all use it
    label: 'Google',                // what the button and the admin screen say
    icon: 'google.svg',             // file in public/icons/, served at /oauth/icons/<icon>
    mono: false,                    // true when the icon is a single-colour mark that should follow the theme
    consoleUrl: 'https://…',        // where the site owner creates the credentials
    scopes: ['openid', 'email'],
    scopeSeparator: ' ',            // ' ' unless the provider insists otherwise
    pkce: true,                     // send a PKCE challenge (S256)
    clientAuth: 'body',             // 'body' puts client_secret in the form, 'basic' uses an Authorization header
    authorizeParams: {},            // extra query parameters on the authorize URL
    extraFields: [],                // [{ name, label, help, default }] — provider-specific settings
    endpoints: config => ({ authorize, token }),
    profile: async ({ accessToken, tokenResponse, http }) => [error, profile],
  }
  ```

  `profile` must resolve to the same shape for every provider, or an error tuple:

  ```js
  { id, email, emailVerified, name, avatarUrl }
  ```

  `id` is a string and the only thing an account is matched on. `email` may be null — X does not
  share one — and `emailVerified` is true **only when the provider says in so many words that it
  verified the address**. That flag is a security boundary, not a nicety: it is what decides whether
  signing in may attach to an existing account with the same email, and an address a provider merely
  *reports* is one anybody can claim by typing it into a provider that does not check. When in doubt
  it is false.

  `http` is `{ getJson(url, { headers }) }` returning `[error, json]`, passed in so a provider file
  never touches `fetch` itself and a test can hand it a fake.

  Adding a provider is one new file here and one line below; nothing else in the extension changes.
  Its settings (`<name>_enabled`, `<name>_client_id`, `<name>_client_secret`, and any `extraFields`)
  also need declaring in kempo-config.json — a test fails until they are.
*/

const registry = new Map();

export const registerProvider = provider => {
  registry.set(provider.name, provider);
};

[google, github, facebook, x, microsoft].forEach(registerProvider);

export const unregisterProvider = name => registry.delete(name);

export const getProvider = name => registry.get(name) ?? null;

export const listProviders = () => [...registry.values()];

/*
  What a visitor's browser is allowed to know about a provider. Deliberately a short list that is
  written out rather than "the provider minus its secrets": a field added to a provider later should
  have to be chosen for the public API, not leak into it by default.
*/
export const publicInfo = provider => ({
  name: provider.name,
  label: provider.label,
  icon: provider.icon,
  mono: !!provider.mono,
});
