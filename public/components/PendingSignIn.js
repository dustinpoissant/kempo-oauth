import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import '/kempo-ui/components/Dialog.js';
import Toast from '/kempo-ui/components/Toast.js';
import { html } from '/kempo-ui/lit-all.min.js';
import { getPending, sendPendingCode, confirmPendingCode, cancelPending } from '/oauth/sdk.js';

/*
  The dialog that finishes a sign-in with a provider that shared no email address (X).

  The server sends the visitor back to the login or register page with `oauth_pending=1` and keeps the
  sign-in in an HttpOnly cookie. Nothing exists as an account until the six-digit code is typed back, so
  cancelling, closing or never finishing leaves no trace beyond a row that expires.

  Two steps: the address, then the code sent to it. Both steps are one dialog so the person never leaves the page.
*/

export default class PendingSignIn extends ShadowComponent {
  static properties = {
    label: { type: String, state: true },
    email: { type: String, state: true },
    step: { type: String, state: true },
    error: { type: String, state: true },
    busy: { type: Boolean, state: true },
  };

  constructor(){
    super();
    this.label = '';
    this.email = '';
    this.step = 'email';
    this.error = '';
    this.busy = false;
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
    if(!params.has('oauth_pending')) return;

    // The marker stays in the address, so a reload reopens the dialog while the sign-in is still waiting.
    const [error, data] = await getPending();
    if(error){
      // Expired: the marker goes, so a later reload does not say so again.
      params.delete('oauth_pending');
      const search = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`);
      Toast.error(error.msg);
      return;
    }

    this.label = data.label;
    this.email = data.email || '';
    this.step = data.email ? 'code' : 'email';
    await this.updateComplete;
    this.shadowRoot.querySelector('k-dialog').open();
  };

  /*
    Event handlers
  */

  confirm = async event => {
    // Set before the first await: the dialog reads this flag as soon as the handler returns.
    event.keepDialogOpen = true;
    if(this.busy) return;

    const input = this.shadowRoot.querySelector('input');
    const value = input.value.trim();
    this.busy = true;
    this.error = '';

    if(this.step === 'email'){
      const [error] = await sendPendingCode(value);
      this.busy = false;
      if(error){
        this.error = error.msg;
        return;
      }
      this.email = value;
      this.step = 'code';
      await this.updateComplete;
      this.shadowRoot.querySelector('input').focus();
      return;
    }

    const [error, data] = await confirmPendingCode(value);
    if(error){
      this.busy = false;
      this.error = error.msg;
      return;
    }
    window.location.href = data.redirect;
  };

  /*
    Closing the dialog without finishing drops the sign-in, so the person can start again straight away.
    Finishing never closes it (see confirm), so this only runs when they give up.
  */
  dismiss = () => {
    const params = new URLSearchParams(window.location.search);
    params.delete('oauth_pending');
    const search = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`);
    cancelPending();
  };

  changeEmail = () => {
    this.step = 'email';
    this.error = '';
  };

  /*
    Rendering
  */

  render(){
    const codeStep = this.step === 'code';
    const confirmText = codeStep ? 'Continue' : 'Send code';

    return html`
      <k-dialog
        confirm-text=${this.busy ? 'Working…' : confirmText}
        confirm-classes="primary ml"
        cancel-text="Cancel"
        .confirmAction=${this.confirm}
        .closeCallback=${this.dismiss}
      >
        <h5 slot="title" class="pyh px m0">Finish signing in with ${this.label}</h5>
        <div class="p">
          ${codeStep ? html`
            <p class="tc-muted">We sent a six-digit code to <strong>${this.email}</strong>. It expires in 15 minutes.</p>
            <label class="d-b mbq" for="code">Code<small class="d-b tc-muted">Type the code from the email.</small></label>
            <input id="code" class="full mb" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456" autofocus />
            <button class="mt" @click=${this.changeEmail}>Use a different email</button>
          ` : html`
            <p class="tc-muted">${this.label} did not share an email address. Enter yours, and we will send a code to it to check that you can read it.</p>
            <label class="d-b mbq" for="email">Email address<small class="d-b tc-muted">The code is sent to this address.</small></label>
            <input id="email" class="full mb" type="email" autocomplete="email" .value=${this.email} autofocus />
          `}
          ${this.error ? html`<p class="tc-danger">${this.error}</p>` : ''}
        </div>
      </k-dialog>
    `;
  }
}

customElements.define('k-oauth-pending', PendingSignIn);
