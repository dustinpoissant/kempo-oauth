import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import { html, nothing } from '/kempo-ui/lit-all.min.js';
import { getDeletionStatus } from '/oauth/sdk.js';

/*
  Looks up what became of a data-deletion request, by the confirmation code a provider gave the person. The
  code can come in the address (?code=...) or be typed in. The three outcomes are written here, so nothing
  the address carries is ever reflected into the page.
*/
const OUTCOMES = {
  deleted: 'Your account on this site, and every sign-in link connected to it, has been deleted.',
  unlinked: 'The sign-in link with this provider was removed, and the details it gave us went with it. Your account was kept because it is an administrator’s account, which only the site’s operator can remove.',
  nothing: 'This site did not hold any data for you, so there was nothing to delete.',
};

export default class DeletionStatus extends ShadowComponent {
  static properties = {
    result: { type: Object, state: true },
    code: { type: String, state: true },
    error: { type: String, state: true },
    looking: { type: Boolean, state: true },
  };

  constructor(){
    super();
    this.result = null;
    this.code = new URLSearchParams(location.search).get('code') || '';
    this.error = '';
    this.looking = false;
  }

  async connectedCallback(){
    super.connectedCallback();
    if(this.code) await this.lookUp();
  }

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

  render(){
    return html`
      ${this.result ? html`
        <div class="card mb">
          <h2>Request received ${new Date(this.result.requestedAt).toLocaleString()}</h2>
          <p>${OUTCOMES[this.result.status] || 'This request was processed.'}</p>
        </div>
      ` : nothing}

      <form class="d-f mb" @submit=${event => { event.preventDefault(); this.lookUp(); }}>
        <input class="flex mr" type="text" autocomplete="off" aria-label="Confirmation code" placeholder="Confirmation code" .value=${this.code} @input=${event => { this.code = event.target.value; }} />
        <button class="primary" type="submit" ?disabled=${!this.code.trim() || this.looking}>Check</button>
      </form>
      ${this.error ? html`<p class="tc-danger">${this.error}</p>` : nothing}
    `;
  }
}

customElements.define('k-oauth-deletion-status', DeletionStatus);
