import install from './install.js';

/*
  Updating is the same job as installing: make sure the indexes exist and say something useful if
  the encryption key is missing. Both are `IF NOT EXISTS`, so this is safe from any version to any
  other.

  New settings, permissions and groups are added by kempo's own declarative diff before this runs,
  and existing values are never overwritten — so a site's client ids and secrets survive an update.
*/
export default async () => {
  await install();
};
