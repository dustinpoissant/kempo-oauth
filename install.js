import { writeSitePages } from './server/utils/privacy/pages.js';
import { sql } from 'drizzle-orm';
import db from 'kempo/server/db/index.js';

/*
  Two things the declarative config cannot do.

  **The indexes.** kempo's installer generates `CREATE TABLE` from the Drizzle schema and reads
  columns and primary keys off it — indexes and unique constraints declared on a table are not
  carried across. Here one of them is a correctness guarantee: without a unique index on
  `(provider, providerUserId)` two rows can claim the same Google account, and a sign-in then lands
  on whichever user the database happens to return first. So it is created here, by hand, matching
  what server/db/schema.js declares.

  **The warning.** Every client secret this extension stores is a `secret` setting, and kempo can
  only encrypt those when SETTINGS_ENCRYPTION_KEY is set. Without it the settings screen refuses to
  save a secret, and the first sign of trouble is a form that fails with no obvious cause. Saying so
  at install time is the difference between a two-minute fix and an hour.
*/

const INDEXES = [
  sql`CREATE UNIQUE INDEX IF NOT EXISTS "kempoOauthAccount_provider_idx" ON "kempoOauthAccount" ("provider", "providerUserId")`,
  sql`CREATE INDEX IF NOT EXISTS "kempoOauthAccount_user_idx" ON "kempoOauthAccount" ("userId")`,
];

/*
  The privacy policy and data-deletion pages live in the site (see server/utils/privacy/pages.js). Written on
  install and on every update: a page the owner has changed is kept, and a page they have not is replaced.
*/
const writePages = () => {
  // Never in the in-memory test database: the pages belong to a site, and the tests run from this package's own folder.
  if(process.env.KEMPO_DB === 'pglite') return;
  for(const page of writeSitePages()){
    if(page.status.startsWith('error')) console.warn(`[kempo-oauth] Could not write ${page.path}: ${page.status}`);
  }
};

export default async () => {
  writePages();

  for(const statement of INDEXES){
    try {
      await db.execute(statement);
    } catch(error) {
      console.warn(`[kempo-oauth] Could not create an index: ${error.message}`);
    }
  }

  if(!process.env.SETTINGS_ENCRYPTION_KEY){
    console.warn([
      '[kempo-oauth] SETTINGS_ENCRYPTION_KEY is not set, so client secrets cannot be stored.',
      '  Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
      '  Put it in .env and restart. Back it up somewhere — losing it makes every stored secret on the site unrecoverable.',
    ].join('\n'));
    return;
  }

  console.log([
    '[kempo-oauth] Installed. Add a provider at /admin/extension/kempo-oauth/.',
    '  The buttons appear under the login and register forms. If your site\'s own login and register pages',
    '  predate the "login-form-after" / "register-form-after" slots, add them — see the README.',
  ].join('\n'));
};
