/*
  Server-side entry point — what another kempo (CMS) extension imports to work with sign-in
  providers.

  ```js
  import { registerProvider, listAccounts } from 'kempo-oauth/sdk';
  ```

  `registerProvider` is how a provider this package does not ship (Discord, LinkedIn, an internal
  single sign-on server) is added without forking it: hand it an object in the shape documented at
  the top of server/providers/index.js. Its settings still have to be declared by whoever registers
  it, since a provider's client id and secret are ordinary kempo settings owned by `kempo-oauth`.

  As in kempo's other extensions these are the *data* operations, with no permission checks of
  their own. The routes under public/api enforce who may do what.
*/

export { registerProvider, unregisterProvider, getProvider, listProviders, publicInfo } from './server/providers/index.js';
export { findAccount, listAccounts, deleteAccountById } from './server/utils/accounts/store.js';
export { default as signIn } from './server/utils/accounts/signIn.js';
export { OWNER, DEFAULTS, readGlobal, readProvider, activeProviders } from './server/utils/config/settings.js';
