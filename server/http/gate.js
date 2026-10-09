import { getSession, currentUserHasPermission } from 'kempo/server/sdk.js';

/*
  The same shape kempo-payments and kempo-thumbs use: a permission check written out longhand in
  every route is one that eventually has a clause wrong somewhere.

  Every route in this extension is gated except three, and all three are deliberate — they are what
  a visitor who is not signed in has to be able to reach in order to sign in: the list of enabled
  providers, the start of a flow, and the callback the provider sends them back to.
*/

export const requireSession = async request => {
  const token = request.cookies?.session_token;
  if(!token) return [{ code: 401, msg: 'Authentication required' }, null];

  const [error, session] = await getSession({ token });
  if(error || !session?.user) return [{ code: 401, msg: 'Authentication required' }, null];

  return [null, { token, user: session.user }];
};

export const gate = async (request, permission) => {
  const [sessionError, session] = await requireSession(request);
  if(sessionError) return [sessionError, null];

  const [error, allowed] = await currentUserHasPermission(session.token, permission);
  if(error) return [{ code: error.code, msg: error.msg }, null];
  if(!allowed) return [{ code: 403, msg: 'Insufficient permissions' }, null];

  return [null, session];
};
