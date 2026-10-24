import { getProvider } from '../../../../server/providers/index.js';
import { readGlobal, readProvider } from '../../../../server/utils/config/settings.js';
import erase from '../../../../server/utils/deletion/erase.js';
import originOf from '../../../../server/http/origin.js';

/*
  POST /oauth/api/data-deletion/<provider>

  The data-deletion callback a provider calls when one of its people removes the app (Facebook
  calls it that: "Data Deletion Request Callback URL"). It is public, because the caller is the
  provider and not a signed-in visitor, and what makes it safe to be public is that nothing happens
  until the request's signature checks out against the provider's client secret.

  It answers what Facebook documents: `{ url, confirmation_code }`, where the url is a page the
  person can open to see what became of the request.
*/
export default async (request, response) => {
  const provider = getProvider(request.params?.provider);
  if(!provider?.deletion) return response.status(404).json({ error: 'This provider does not send data-deletion requests' });

  const config = await readProvider(provider);
  if(!config.clientSecret) return response.status(404).json({ error: 'This provider is not configured on this site' });

  const [verifyError, who] = provider.deletion.verify({ signedRequest: request.body?.signed_request, secret: config.clientSecret });
  if(verifyError) return response.status(verifyError.code).json({ error: verifyError.msg });

  const [eraseError, result] = await erase({ provider: provider.name, providerUserId: who.userId });
  if(eraseError) return response.status(eraseError.code).json({ error: eraseError.msg });

  const { baseUrl } = await readGlobal();
  response.json({
    url: `${originOf(request, baseUrl)}/oauth/data-deletion/?code=${result.code}`,
    confirmation_code: result.code,
  });
};
