import { getPrivacy } from '/oauth/sdk.js';

/*
  Fills in the facts a site's privacy policy and data-deletion page show about the site: its name, who runs
  it, how to contact them, and the sign-in providers that are switched on. The text around them is the
  owner's to edit; each fact is a <span data-fact="..."> that this script replaces with the current value.

    siteName, operator, contact (a link to the contact address), providers
*/
const fill = (name, text) => {
  document.querySelectorAll(`[data-fact="${name}"]`).forEach(element => { element.textContent = text; });
};

const [error, info] = await getPrivacy();

if(!error){
  fill('siteName', info.siteName);
  fill('operator', info.operator || 'the operator of this site');

  if(info.contactEmail){
    document.querySelectorAll('[data-fact="contact"]').forEach(link => {
      link.textContent = info.contactEmail;
      link.setAttribute('href', `mailto:${info.contactEmail}`);
    });
  }

  const labels = info.providers.map(provider => provider.label);
  if(labels.length){
    const list = labels.length < 2 ? labels.join('') : `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
    fill('providers', list);
  }
}
