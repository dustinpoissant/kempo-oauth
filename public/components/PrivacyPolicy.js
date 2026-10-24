import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import { html, nothing } from '/kempo-ui/lit-all.min.js';
import { getPrivacy } from '/oauth/sdk.js';

/*
  The privacy policy for signing in with a provider, served at /oauth/privacy/.

  It is written for the one thing this extension does and says so: it covers what is collected when
  somebody signs in or registers with a provider, and nothing else a site may do. A site that
  collects more (orders, uploads, a newsletter) needs a policy of its own, and puts its address in
  the `privacy_policy_url` setting — in which case this page just sends the visitor there.

  The wording is filled in from /oauth/api/privacy (the site's name, who runs it, how to reach them,
  which providers are switched on) so it never names a provider the site does not offer. Change what
  it says and bump `UPDATED` in server/utils/privacy/describe.js.
*/
export default class PrivacyPolicy extends ShadowComponent {
  static properties = {
    info: { type: Object, state: true },
    error: { type: String, state: true },
  };

  constructor(){
    super();
    this.info = null;
    this.error = '';
  }

  /*
    Lifecycle
  */

  async connectedCallback(){
    super.connectedCallback();

    const [error, info] = await getPrivacy();
    if(error){
      this.error = 'The privacy policy could not be loaded. Please try again in a moment.';
      return;
    }

    if(info.customUrl){
      location.replace(info.customUrl);
      return;
    }

    this.info = info;
  }

  /*
    Rendering
  */

  #list = labels => labels.length < 2 ? labels.join('') : `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;

  render(){
    if(this.error) return html`<p class="tc-danger">${this.error}</p>`;
    if(!this.info) return nothing;

    const { siteName, operator, contactEmail, providers, updated } = this.info;
    const who = operator || 'the operator of this site';
    const labels = providers.map(provider => provider.label);
    const withProviders = labels.length ? this.#list(labels) : 'a sign-in provider such as Google, GitHub or Facebook';
    const automatic = providers.filter(provider => provider.deletesAutomatically).map(provider => provider.label);
    const contact = contactEmail ? html`<a href="mailto:${contactEmail}">${contactEmail}</a>` : html`${who}, using the contact details given on this site`;

    return html`
      <h1>Privacy Policy</h1>
      <p class="tc-muted">Last updated ${new Date(`${updated}T12:00:00Z`).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</p>

      <p>
        This policy explains what ${siteName} collects when you sign in or create an account with ${withProviders},
        why, who else sees it, and how to have it deleted. ${siteName} is run by ${who}.
      </p>
      <p>It covers signing in. If this site collects anything else about you, that is described where it is collected.</p>

      <h2>What we receive</h2>
      <p>
        When you choose to continue with a provider, it asks you to agree and then tells us your <strong>name</strong>,
        your <strong>email address</strong> (if you share one) and the <strong>identifier it uses for you</strong>.
        We do not ask for, and we do not read, your posts, contacts, photos or anything else in your account,
        and we never post on your behalf. The temporary access the provider gives us is used once, to read those details,
        and is then discarded.
      </p>

      <h2>What we keep</h2>
      <ul>
        <li>An account on this site with your name and email address.</li>
        <li>A record that your account is linked to your account with the provider: the provider's name, its identifier for you, the name and email it gave us at your last sign-in, and when you signed up and last signed in.</li>
      </ul>
      <p>If you also set a password on this site, it is stored only as a salted hash that we cannot read.</p>

      <h2>Cookies</h2>
      <p>
        We use a cookie that keeps you signed in, and a short-lived one that lasts only while a sign-in is in progress, to make sure the
        provider's reply is the one we asked for. We do not use advertising or tracking cookies for signing in.
      </p>

      <h2>What we use it for</h2>
      <p>To sign you in, to recognise you when you come back, and to contact you about your account. We do not sell your information and we do not use it for advertising.</p>

      <h2>Who else sees it</h2>
      <p>
        The provider you sign in with knows that you signed in to ${siteName}, as it would with any app you connect.
        The services that host and run this site handle the information above on our behalf. We do not share it with anyone else, unless the law requires us to.
      </p>

      <h2>How long we keep it</h2>
      <p>For as long as your account exists. When you ask us to delete it, we delete it.</p>

      <h2 id="delete">Deleting your data</h2>
      <p>You can ask for your account, and everything this policy describes, to be deleted at any time.</p>
      <ul>
        ${automatic.length ? html`<li><strong>${this.#list(automatic)}:</strong> remove ${siteName} from the apps connected to your ${this.#list(automatic)} account, and ${automatic.length > 1 ? 'they tell' : 'it tells'} us. We delete your account and its sign-in links at once and give you a confirmation code. You can look up what happened on the <a href="/oauth/data-deletion/">data deletion page</a>.</li>` : nothing}
        <li><strong>By email:</strong> write to ${contact} from the address on your account and we will delete it.</li>
      </ul>
      <p>You can also ask us for a copy of what we hold about you, or to correct it, the same way.</p>

      <h2>Children</h2>
      <p>This site is not meant for children under 13, and we do not knowingly collect information from them. If you think a child has signed up, tell us and we will delete the account.</p>

      <h2>Changes</h2>
      <p>If we change this policy, we will change the date at the top.</p>

      <h2>Contact</h2>
      <p>Questions about this policy or your information: ${contact}.</p>
    `;
  }
}

customElements.define('k-oauth-privacy-policy', PrivacyPolicy);
