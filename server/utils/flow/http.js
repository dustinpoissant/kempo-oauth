/*
  The only place this extension makes an outbound request. Everything above it hands a provider a
  `{ getJson }` rather than letting it reach for `fetch`, which is what lets the tests stand in a
  fake provider without touching the network.

  Errors here are phrased for a log, not for a visitor: they carry the provider's HTTP status and a
  snippet of what it said in `detail`, and the callback route logs that and shows the visitor a
  fixed message. A provider's error body can echo anything back at us, and it is not text to put in
  front of the person who clicked the button.
*/

const TIMEOUT_MS = 10000;

const send = async (url, options) => {
  try {
    const reply = await fetch(url, { ...options, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const text = await reply.text();

    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // handled below; a body that is not JSON is only an error if the call needed it to be
    }

    if(!reply.ok){
      return [{ code: 502, msg: 'The sign-in provider rejected the request', detail: `HTTP ${reply.status} ${text.slice(0, 300)}` }, null];
    }
    if(json === null){
      return [{ code: 502, msg: 'The sign-in provider sent a reply that could not be read', detail: text.slice(0, 300) }, null];
    }

    return [null, json];
  } catch(error) {
    return [{ code: 504, msg: 'The sign-in provider could not be reached', detail: error.message }, null];
  }
};

export default {
  getJson: (url, { headers = {} } = {}) => send(url, { method: 'GET', headers: { Accept: 'application/json', ...headers } }),

  postForm: (url, form, { headers = {} } = {}) => send(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body: form.toString(),
  }),
};
