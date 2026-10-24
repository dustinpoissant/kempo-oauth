/*
  Browser client, served at /oauth/sdk.js.

  Mirrors the server SDK's names where there is a counterpart and returns the same [error, data]
  tuples the rest of kempo uses.

  Note what is *not* here: nothing that starts a sign-in by fetch. A sign-in is a full-page
  navigation to the provider and back, so `startUrl` returns a link to follow rather than a promise
  to await.
*/

const BASE = '/oauth/api';

const request = async (path, options = {}) => {
  try {
    const response = await fetch(`${BASE}${path}`, { credentials: 'same-origin', ...options });
    const data = await response.json().catch(() => ({}));
    if(!response.ok) return [{ code: response.status, msg: data.error || response.statusText }, null];
    return [null, data];
  } catch(error) {
    return [{ code: 0, msg: error.message }, null];
  }
};

const json = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body ?? {}),
});

const query = params => {
  const search = new URLSearchParams();
  for(const [key, value] of Object.entries(params || {})){
    if(value !== undefined && value !== null && value !== '') search.set(key, value);
  }
  const string = search.toString();
  return string ? `?${string}` : '';
};

/*
  Visitors
*/

export const getProviders = () => request('/providers');

export const getPrivacy = () => request('/privacy');

export const getDeletionStatus = code => request(`/data-deletion-status${query({ code })}`);

export const startUrl = ({ provider, mode = 'login', next } = {}) =>
  `${BASE}/start/${encodeURIComponent(provider)}${query({ mode, next })}`;

/*
  Admin
*/

export const getSettings = () => request('/settings');

export const saveSettings = body => request('/settings', json('PUT', body));

export const getAccounts = ({ limit, offset, provider } = {}) => request(`/accounts${query({ limit, offset, provider })}`);

export const deleteAccount = id => request(`/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' });
