import { getSetting } from 'kempo/server/sdk.js';
import { activeProviders, readGlobal } from '../config/settings.js';

/*
  The facts the privacy and data-deletion pages fill themselves in with (see components/PolicyFacts.js): the
  site's name, who runs it, how to reach them, and which sign-in providers are switched on. Public, like the
  pages themselves.
*/
export default async () => {
  const global = await readGlobal();
  const [, siteName] = await getSetting('system', 'site_name', 'this site');

  return {
    siteName: String(siteName || 'this site'),
    operator: global.privacyOperator,
    contactEmail: global.privacyContactEmail,
    providers: (await activeProviders()).map(({ provider }) => ({ name: provider.name, label: provider.label, deletesAutomatically: !!provider.deletion })),
  };
};
