import status from '../../../server/utils/deletion/status.js';

/*
  GET /oauth/api/data-deletion-status?code=<confirmation code>

  What became of a data-deletion request, for the page a provider sends the person to. Public: the
  person arrives with nothing but the code, and the answer names no one.
*/
export default async (request, response) => {
  const [error, result] = await status(request.query?.code);
  if(error) return response.status(error.code).json({ error: error.msg });

  response.json(result);
};
