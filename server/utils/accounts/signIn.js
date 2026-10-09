import crypto from 'crypto';
import { eq, sql } from 'drizzle-orm';
import {
  db,
  schema,
  createSession,
  createUser,
  deleteUserSessions,
  getSetting,
  sendVerificationEmail,
  updateUser,
} from 'kempo/server/sdk.js';
import { createAccount, deleteAccountsForProviderUser, findAccount, recordLogin } from './store.js';
import { readGlobal } from '../config/settings.js';

/*
  Turns "the provider says this is person X" into "this is kempo user Y, and here is their session".

  It is the one function in this extension where a mistake is a security hole rather than a bug, so
  it is worth saying what each branch is protecting against.

  **Matching is by the provider's id, never the email.** An email can be unverified, change hands,
  or not exist (X shares none). The id cannot.

  **An existing account is only attached to by a *verified* email.** If it were enough for a
  provider to report an address, anybody could register a Facebook or Microsoft account claiming
  `ceo@yourcompany.com` and sign straight in as them. So the provider has to say, in so many words,
  that it checked the address (`profile.emailVerified`), and the site owner can switch even that off
  (`link_verified_emails`). Otherwise the visitor is told an account already exists and to sign in
  the way they signed up.

  **A password account that never verified its email is not trusted to keep its password.** The
  pre-hijacking attack: someone registers `victim@example.com` with a password they chose, never
  verifies it, and waits. The real owner later clicks "continue with Google" — which proves the
  address — and would be signed into an account whose password the attacker already knows. So when
  a provider-verified email lands on an *unverified* account, the password is invalidated and every
  existing session is ended before the link is made.

  Returns `[error, result]`. An error carries a `reason` — a short code the callback route turns
  into the message shown on the login page — alongside the usual `{ code, msg }`.
*/

const fail = (code, reason, msg) => [{ code, reason, msg }, null];

const sessionFor = async userId => {
  const [error, session] = await createSession(userId);
  return error ? [error, null] : [null, session];
};

const sameEmail = email => sql`lower(${schema.user.email}) = ${email}`;

export default async ({ provider, profile: given }) => {
  if(!provider?.name || !given?.id) return fail(400, 'failed', 'The sign-in provider did not say who signed in');

  // fetchProfile has already done this; repeated because a caller using the SDK may hand one in directly.
  const profile = { ...given, email: given.email ? String(given.email).trim().toLowerCase() : null };

  try {
    const [, requireVerification] = await getSetting('system', 'require_email_verification', false);
    const [, allowRegistration] = await getSetting('system', 'allow_registration', true);
    const { linkVerifiedEmails } = await readGlobal();

    const finish = async (user, isNew) => {
      if(requireVerification && !user.emailVerified){
        return [null, { user, sessionToken: null, expiresAt: null, requiresVerification: true, isNew }];
      }

      const [error, session] = await sessionFor(user.id);
      if(error) return [error, null];

      return [null, { user, sessionToken: session.sessionToken, expiresAt: session.expiresAt, requiresVerification: false, isNew }];
    };

    /*
      Already connected: the common case on every sign-in after the first.
    */
    const linked = await findAccount(provider.name, profile.id);
    if(linked){
      const [existing] = await db.select({
        id: schema.user.id,
        email: schema.user.email,
        name: schema.user.name,
        emailVerified: schema.user.emailVerified,
      }).from(schema.user).where(eq(schema.user.id, linked.userId)).limit(1);

      if(existing){
        await recordLogin(linked.id, profile);
        return finish(existing, false);
      }

      // The user was deleted. The stale link goes, and this becomes a first sign-in.
      await deleteAccountsForProviderUser(provider.name, profile.id);
    }

    /*
      First time through this provider. Is there already somebody with this email?
    */
    if(profile.email){
      const [existing] = await db.select({
        id: schema.user.id,
        email: schema.user.email,
        name: schema.user.name,
        emailVerified: schema.user.emailVerified,
      }).from(schema.user).where(sameEmail(profile.email)).limit(1);

      if(existing){
        if(!profile.emailVerified || !linkVerifiedEmails){
          return fail(409, 'email_in_use', 'An account with this email already exists. Sign in the way you signed up.');
        }

        let user = existing;
        if(!existing.emailVerified){
          const [updateError] = await updateUser(existing.id, {
            emailVerified: true,
            // Not a bcrypt hash, so no password matches it — the same thing `passwd -l` does.
            passwordHash: `!${crypto.randomBytes(32).toString('hex')}`,
          });
          if(updateError) return [updateError, null];
          await deleteUserSessions(existing.id);
          user = { ...existing, emailVerified: true };
        }

        await createAccount({ provider: provider.name, providerUserId: profile.id, userId: user.id, email: profile.email, name: profile.name });
        return finish(user, false);
      }
    }

    /*
      Nobody has this email: it is a registration, which the site may have closed.
    */
    if(allowRegistration === false) return fail(403, 'registration_closed', 'Registration is currently disabled');

    // X shares no email, and there is nowhere to send a verification link for an account without one.
    if(!profile.email && requireVerification){
      return fail(403, 'no_email', `${provider.label} did not share an email address, and this site requires one to be verified`);
    }

    const email = profile.email || `${provider.name}-${profile.id}@oauth.invalid`;
    const name = (profile.name || (profile.email ? profile.email.split('@')[0] : `${provider.label} user`)).slice(0, 200);

    const [createError, created] = await createUser({
      name,
      email,
      // Unknown to everyone, including this extension. The account is reached through the provider,
      // or by resetting the password to one the person chooses.
      password: crypto.randomBytes(32).toString('hex'),
      emailVerified: !!profile.email && profile.emailVerified,
    });
    if(createError) return [createError, null];

    await createAccount({ provider: provider.name, providerUserId: profile.id, userId: created.user.id, email: profile.email, name: profile.name });

    if(requireVerification && !created.user.emailVerified){
      const [mailError] = await sendVerificationEmail({ userId: created.user.id, email, name });
      if(mailError) return [mailError, null];
    }

    return finish(created.user, true);
  } catch(error) {
    console.error(`[kempo-oauth] Sign-in with ${provider.name} failed:`, error);
    return fail(500, 'failed', 'Failed to sign in');
  }
};
