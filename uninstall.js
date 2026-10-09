import { listAccounts } from './server/utils/accounts/store.js';

/*
  Nothing is deleted here, and nothing can be: kempo drops this extension's table straight after
  this runs.

  What is lost is the link between a provider identity and a user, not the users. Everyone who
  signed up through a provider still has an account, and the account still works — but nobody knows
  its password, because it was never chosen. Without this extension they have no way in except
  "forgot password", and a person who signed up with X has an address that cannot receive mail at
  all. Saying so, with a number, before the table goes is the useful thing to do.
*/
export default async () => {
  const [error, data] = await listAccounts({ limit: 1 });
  if(error || !data.total) return;

  console.warn([
    `[kempo-oauth] Removing. ${data.total} connected sign-in account${data.total === 1 ? '' : 's'} will be dropped with the table.`,
    '  Those users keep their accounts, but they never chose a password and can only get back in through "forgot password".',
    '  Accounts that signed up with X have no email address on file and will not be able to.',
  ].join('\n'));
};
