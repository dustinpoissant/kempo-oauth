import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import '/kempo-ui/components/Icon.js';
import { html } from '/kempo-ui/lit-all.min.js';
import { getProviders, startUrl } from '/oauth/sdk.js';

/*
  "Continue with …" buttons for the login and register pages.

  Each one is a plain link to /oauth/api/start/<provider>, so a sign-in does not depend on this
  component's script running to the end: the buttons are the only part that needs it, and what they
  do is navigate.

  Renders nothing at all when no provider is switched on, including the "or" divider. A login page
  on a site that installed this extension and has not configured it yet looks exactly as it did
  before.

  **Failed sign-ins arrive as a short code in the URL**, never as text (server/http/redirects.js).
  The wording lives here so nothing a provider or an attacker puts in a query string is ever
  reflected into the page.
*/

const MESSAGES = {
  denied: 'The sign-in was cancelled.',
  state: 'That sign-in could not be verified, or took too long. Please try again.',
  exchange: 'The provider would not complete the sign-in. Please try again.',
  profile: 'We could not read your details from the provider. Please try again.',
  unavailable: 'That way of signing in is not available right now.',
  email_in_use: 'An account with this email already exists. Sign in the way you signed up, then you can use this option.',
  registration_closed: 'New accounts are not being accepted right now.',
  no_email: 'That provider did not share an email address, and this site needs one to be verified.',
  failed: 'Something went wrong signing you in. Please try again.',
};

export default class OauthButtons extends ShadowComponent {
  static properties = {
    mode: { type: String },
    providers: { type: Array, state: true },
    error: { type: String, state: true },
  };

  constructor(){
    super();
    this.mode = 'login';
    this.providers = [];
    this.error = '';
  }

  /*
    Lifecycle
  */

  connectedCallback(){
    super.connectedCallback();
    this.load();
  }

  /*
    Data
  */

  load = async () => {
    const params = new URLSearchParams(window.location.search);

    const code = params.get('oauth_error');
    if(code){
      this.error = MESSAGES[code] || MESSAGES.failed;
      // So a refresh, or a link copied from the address bar, does not carry the error along.
      params.delete('oauth_error');
      const search = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`);
    }

    const [error, data] = await getProviders();
    if(!error) this.providers = data.providers;
  };

  get next(){
    return new URLSearchParams(window.location.search).get('next') || undefined;
  }

  /*
    Rendering
  */

  #renderIcon(provider){
    // A single-colour mark follows the theme through k-icon; a brand-coloured one must not be
    // recoloured (k-icon forces currentColor), so it is an image.
    const src = `/oauth/icons/${provider.icon}`;
    return provider.mono
      ? html`<k-icon class="mrh" src=${src}></k-icon>`
      : html`<img class="icon mrh" src=${src} alt="" />`;
  }

  render(){
    if(!this.providers.length) return this.error ? html`<p class="tc-danger">${this.error}</p>` : '';

    const verb = this.mode === 'register' ? 'Sign up' : 'Continue';

    return html`
      ${this.error ? html`<p class="tc-danger">${this.error}</p>` : ''}
      <p class="ta-center tc-muted mt">or</p>
      ${this.providers.map(provider => html`
        <a class="btn full ta-center mbh" href=${startUrl({ provider: provider.name, mode: this.mode, next: this.next })}>
          ${this.#renderIcon(provider)}${verb} with ${provider.label}
        </a>
      `)}
    `;
  }
}

customElements.define('k-oauth-buttons', OauthButtons);
