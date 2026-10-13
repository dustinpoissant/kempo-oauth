import { sql } from 'drizzle-orm';
import db from 'kempo/server/db/index.js';

/*
  Whether a suite may use the database it can see.

  data-layer and flow empty this extension's table before they run and create and delete users and
  settings. That is only acceptable on a throwaway database, so a database whose name does not end
  in `_test` is treated as not there at all — the suites skip themselves — rather than being trusted
  because it happens to be reachable. Every kempo repo's test database follows the same naming
  (`kempo_oauth_test`, see docker-compose.yml).

  The routes suite also needs SETTINGS_ENCRYPTION_KEY, because a client secret is a `secret`
  setting and cannot be stored without it.
*/

const name = (() => {
  try {
    return new URL(process.env.DATABASE_URL).pathname.slice(1);
  } catch {
    return '';
  }
})();

/*
  The unit tier (KEMPO_DB=pglite) is an in-memory database and always a throwaway.
*/
export const isTestDatabase = process.env.KEMPO_DB === 'pglite' || name.endsWith('_test');

export const databaseReachable = isTestDatabase && await db.execute(sql`select 1`).then(() => true).catch(() => false);

if(!databaseReachable && process.env.KEMPO_TEST_TIER === 'integration'){
  throw new Error('The integration tier needs DATABASE_URL pointing at a throwaway Postgres named *_test with the schema applied (npx drizzle-kit push --force).');
}

export const skipReason = isTestDatabase
  ? 'no database reachable'
  : `the database ${name ? `"${name}"` : 'in DATABASE_URL'} is not named *_test, so these suites will not touch its tables`;

export const encryptionAvailable = !!process.env.SETTINGS_ENCRYPTION_KEY;
