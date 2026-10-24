import { writeSiteFile } from 'kempo/server/sdk.js';

/*
  The two pages this extension puts on a site: the privacy policy (/privacy/) and the data-deletion page
  (/data-deletion/). They are ordinary site pages, so the owner can edit them in the admin and they use the
  site's own template.

  They are written with kempo's writeSiteFile, the same rule kempo's starter pages follow: an install or an
  update replaces a page only while the owner has not changed it since this extension last wrote it. An edited
  page is kept, and a page the owner deleted stays deleted.

  The text is the same on every site. What differs (the site's name, who runs it, how to contact them, the
  providers that are switched on) is filled in by components/PolicyFacts.js from /oauth/api/privacy, so the
  owner can change the wording around those facts without losing them.

  `UPDATED` is the date the wording last changed. Bump it when the text changes.
*/

const UPDATED = '24 October 2026';

const FACT = (name, text) => `<span data-fact="${name}">${text}</span>`;

const PRIVACY_BODY = `
<h1>Privacy Policy</h1>
<p class="tc-muted">Last updated ${UPDATED}</p>

<p>This policy explains what ${FACT('siteName', 'this site')} collects when you sign in or create an account with ${FACT('providers', 'a sign-in provider such as Google, GitHub or Facebook')}, why, who else sees it, and how to have it deleted. The site is run by ${FACT('operator', 'the operator of this site')}.</p>
<p>It covers your account and signing in. If this site collects anything else about you, that is described where it is collected.</p>

<h2>What we receive</h2>
<p>When you choose to continue with a provider, it asks you to agree and then tells us your <strong>name</strong>, your <strong>email address</strong> (if you share one) and the <strong>identifier it uses for you</strong>. We do not ask for, and we do not read, your posts, contacts, photos or anything else in your account, and we never post on your behalf. The temporary access the provider gives us is used once, to read those details, and is then discarded.</p>

<h2>What we keep</h2>
<ul>
  <li>An account on this site with your name and email address.</li>
  <li>A record that your account is linked to your account with the provider: the provider's name, its identifier for you, the name and email it gave us at your last sign-in, and when you signed up and last signed in.</li>
</ul>
<p>If you also set a password on this site, it is stored only as a salted hash that we cannot read.</p>

<h2>Cookies</h2>
<p>We use a cookie that keeps you signed in, and a short-lived one that lasts only while a sign-in is in progress, to make sure the provider's reply is the one we asked for. We do not use advertising or tracking cookies for signing in.</p>

<h2>What we use it for</h2>
<p>To sign you in, to recognise you when you come back, and to contact you about your account. We do not sell your information and we do not use it for advertising.</p>

<h2>Who else sees it</h2>
<p>The provider you sign in with knows that you signed in to ${FACT('siteName', 'this site')}, as it would with any app you connect. The services that host and run this site handle the information above on our behalf. We do not share it with anyone else, unless the law requires us to.</p>

<h2>How long we keep it</h2>
<p>For as long as your account exists. When you delete it, we delete it.</p>

<h2 id="delete">Deleting your data</h2>
<p>You can delete your account, and everything this policy describes, at any time.</p>
<ul>
  <li><strong>Yourself:</strong> go to <a href="/delete-account/">Delete your account</a>. We email a six-digit code to the address on your account, and when you enter it your account is deleted.</li>
  <li><strong>By removing the app from a provider:</strong> where a provider tells us when you remove the app (currently Facebook), we delete your account straight away. You can check what happened on the <a href="/data-deletion/">data deletion page</a>.</li>
  <li><strong>By email:</strong> write to ${FACT('contact', 'the site’s operator')} from the address on your account, and we will delete it.</li>
</ul>
<p>You can also ask us for a copy of what we hold about you, or to correct it, the same way.</p>

<h2>Children</h2>
<p>This site is not meant for children under 13, and we do not knowingly collect information from them. If you think a child has signed up, tell us and we will delete the account.</p>

<h2>Changes</h2>
<p>If we change this policy, we will change the date at the top.</p>

<h2>Contact</h2>
<p>Questions about this policy or your information: ${FACT('contact', 'the site’s operator')}.</p>
`;

const DATA_DELETION_BODY = `
<h1>Deleting your data</h1>
<p>If a provider gave you a confirmation code after you removed ${FACT('siteName', 'this site')} from your connected apps, enter it below to see what happened.</p>

<k-oauth-deletion-status></k-oauth-deletion-status>

<h2>How to have your data deleted</h2>
<ul>
  <li><strong>Yourself:</strong> go to <a href="/delete-account/">Delete your account</a>. We email a six-digit code to the address on your account, and when you enter it your account is deleted.</li>
  <li><strong>Through Facebook:</strong> remove ${FACT('siteName', 'this site')} from the apps connected to your Facebook account. The site is told, deletes your account and its sign-in links straight away, and Facebook gives you a confirmation code to check here.</li>
  <li><strong>By email:</strong> write to ${FACT('contact', 'the site’s operator')} from the address on your account, and ask for it to be deleted.</li>
</ul>
<p>What is deleted, and what is kept, is described in the <a href="/privacy/#delete">privacy policy</a>.</p>
`;

const page = (title, body, scripts) => `<!--
  owner: kempo-oauth
-->
<page template="default" title="${title}">
<content>
${body.trim()}
</content>
<content location="scripts">
<script type="module" src="/oauth/components/PolicyFacts.js"></script>
${scripts}
</content>
</page>
`;

export const PAGES = [
  {
    path: 'public/privacy/index.page.html',
    content: page('Privacy Policy', PRIVACY_BODY, ''),
  },
  {
    path: 'public/data-deletion/index.page.html',
    content: page('Deleting your data', DATA_DELETION_BODY, '<script type="module" src="/oauth/components/DeletionStatus.js"></script>'),
  },
];

/*
  Writes both pages into the site (`cwd` is the site's root, where public/ lives). Resolves to one entry per
  page: { path, status } with status "written", "current", "kept" or "deleted", as writeSiteFile reports it.
*/
export const writeSitePages = ({ cwd = process.cwd() } = {}) => PAGES.map(({ path, content }) => {
  const [error, result] = writeSiteFile({ owner: 'kempo-oauth', path, content, cwd });
  return { path, status: error ? `error: ${error.msg}` : result.status };
});
