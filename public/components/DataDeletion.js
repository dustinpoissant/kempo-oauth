import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import { html, nothing } from '/kempo-ui/lit-all.min.js';
import { getDeletionStatus, getPrivacy } from '/oauth/sdk.js';

/*
  The data-deletion page, served at /oauth/data-deletion/. It does two jobs for a provider's app review:

  - **Instructions.** How a person has their data deleted, for providers that accept a page of
    instructions in place of (or as well as) a callback.
  - **Status.** The page a provider sends a person to after it calls the callback, with the
    confirmation code in the address. It says what became of the request, in plain words.

  The status comes back as one of three short codes and the sentences are written here, so nothing
  the address carries is ever reflected into the page.
*/
const OUTCOMES = {
  deleted: 'Your account on this site, and every sign-in link connected to it, has been deleted.',
  unlinked: 'The sign-in link with this provider was removed, and the details it gave us went with it. Your account was kept because it is an administrator’s account, which only the site’s operator can remove.',
  nothing: 'This site did not hold any data for you, so there was nothing to delete.',
};

export default class DataDeletion extends ShadowComponent {
  static properties = {
    info: { type: Object, state: true },
    result: { type: Object, state: true },
    code: { type: String, state: true },
    error: { type: String, state: true },
    looking: { type: Boolean, state: true },
  };

  constructor(){
    super();
    this.info = null;
    this.result = null;
    this.code = new URLSearchParams(location.search).get('code') || '';
    this.error = '';
    this.looking = false;
  }

  /*
    Lifecycle
  */

  async connectedCallback(){
    super.connectedCallback();

    const [, info] = await getPrivacy();
    this.info = info || {};

    if(this.code) await this.lookUp();
  }

  /*
    Actions
  */

  lookUp = async () => {
    this.looking = true;
    this.error = '';
    this.result = null;

    const [error, result] = await getDeletionStatus(this.code.trim());
    this.looking = false;

    if(error){
      this.error = error.code === 404 ? 'There is no request with that confirmation code. Check that you copied all of it.' : 'That does not look like a confirmation code.';
      return;
    }

    this.result = result;
  };

  /*
    Rendering
  */

  #renderResult(){
    const when = new Date(this.result.requestedAt).toLocaleString();
    return html`
      <div class="card mb">
        <h2>Request received ${when}</h2>
        <p>${OUTCOMES[this.result.status] || 'This request was processed.'}</p>
      </div>
    `;
  }

  render(){
    if(!this.info) return nothing;

    const { siteName = 'this site', contactEmail, providers = [] } = this.info;
    const automatic = providers.filter(provider => provider.deletesAutomatically).map(provider => provider.label);
    const contact = contactEmail ? html`<a href="mailto:${contactEmail}">${contactEmail}</a>` : html`the site’s operator`;

    return html`
      <h1>Deleting your data</h1>

      ${this.result ? this.#renderResult() : nothing}

      <h2>Check a request</h2>
      <p>If a provider gave you a confirmation code after you removed ${siteName} from your connected apps, enter it here to see what happened.</p>
      <form class="d-f mb" @submit=${event => { event.preventDefault(); this.lookUp(); }}>
        <input class="flex mr" type="text" autocomplete="off" aria-label="Confirmation code" placeholder="Confirmation code" .value=${this.code} @input=${event => { this.code = event.target.value; }} />
        <button class="primary" type="submit" ?disabled=${!this.code.trim() || this.looking}>Check</button>
      </form>
      ${this.error ? html`<p class="tc-danger">${this.error}</p>` : nothing}

      <h2>How to have your data deleted</h2>
      <ul>
        ${automatic.length ? html`<li>Remove ${siteName} from the apps connected to your ${automatic.join(' or ')} account. ${siteName} is told, deletes your account and its sign-in links straight away, and the provider gives you a confirmation code to check here.</li>` : nothing}
        <li>Or email ${contact} from the address on your account, and ask for it to be deleted.</li>
      </ul>
      <p>What is deleted, and what is kept for how long, is described in the <a href="/oauth/privacy/#delete">privacy policy</a>.</p>
    `;
  }
}

customElements.define('k-oauth-data-deletion', DataDeletion);
