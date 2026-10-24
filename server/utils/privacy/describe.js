import { getSetting } from 'kempo/server/sdk.js';
import { activeProviders, readGlobal } from '../config/settings.js';

/*
  What the privacy policy this extension publishes is filled in with. The wording itself lives in
  public/components/PrivacyPolicy.js; this is only the facts about *this* site that it cannot know:
  its name, who runs it, how to reach them, and which providers it offers (a policy that names
  Facebook on a site that only offers Google would be wrong in the way that matters).

  Public, because the policy is — and all of it is already on the page for anybody to read.

  `updated` is the date the policy's wording last changed. Bump it whenever PrivacyPolicy.js changes
  what it says, so a person reading it can tell.
*/
const UPDATED = '2026-10-24';

export default async () => {
  const global = await readGlobal();
  const [, siteName] = await getSetting('system', 'site_name', 'this site');

  return {
    siteName: String(siteName || 'this site'),
    operator: global.privacyOperator,
    contactEmail: global.privacyContactEmail,
    customUrl: global.privacyPolicyUrl,
    providers: (await activeProviders()).map(({ provider }) => ({ name: provider.name, label: provider.label, deletesAutomatically: !!provider.deletion })),
    updated: UPDATED,
  };
};
