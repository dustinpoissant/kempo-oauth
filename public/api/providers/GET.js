import { activeProviders } from '../../../server/utils/config/settings.js';
import { publicInfo } from '../../../server/providers/index.js';

/*
  The providers a visitor can sign in with, for the buttons on the login and register pages. No
  session needed — it has to work before anyone is signed in — so it answers with the least it can:
  names, labels and icons, and nothing about how any of them is configured.
*/
export default async (request, response) => {
  const entries = await activeProviders();
  response.json({ providers: entries.map(entry => publicInfo(entry.provider)) });
};
