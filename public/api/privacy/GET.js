import describe from '../../../server/utils/privacy/describe.js';

/*
  GET /oauth/api/privacy

  The facts the privacy policy page fills itself in with: the site's name, who runs it, how to reach
  them and which sign-in providers it offers. Public, like the policy.
*/
export default async (request, response) => {
  response.json(await describe());
};
