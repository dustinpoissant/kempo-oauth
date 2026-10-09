import describe from '../../../server/utils/config/describe.js';
import { readGlobal } from '../../../server/utils/config/settings.js';
import originOf from '../../../server/http/origin.js';
import { gate } from '../../../server/http/gate.js';

export default async (request, response) => {
  const [gateError] = await gate(request, 'oauth:settings');
  if(gateError) return response.status(gateError.code).json({ error: gateError.msg });

  const { baseUrl } = await readGlobal();
  response.json(await describe(originOf(request, baseUrl)));
};
