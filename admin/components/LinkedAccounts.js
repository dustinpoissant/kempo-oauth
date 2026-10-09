import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import '/kempo-ui/components/Icon.js';
import '/kempo-ui/components/Spinner.js';
import { html } from '/kempo-ui/lit-all.min.js';
import { deleteAccount, getAccounts } from '/oauth/sdk.js';

/*
  Who has signed in with which provider.

  A row whose user no longer exists is shown as such rather than hidden: it is harmless (the next
  sign-in with that provider replaces it), but an admin looking at "Unknown user" wants to be told
  it is a deleted account and not a bug.
*/

const PAGE_SIZE = 25;

export default class LinkedAccounts extends ShadowComponent {
  static properties = {
    result: { type: Object, state: true },
    providers: { type: Array, state: true },
    provider: { type: String, state: true },
    offset: { type: Number, state: true },
    error: { type: String, state: true },
  };

  constructor(){
    super();
    this.result = null;
    this.providers = [];
    this.provider = '';
    this.offset = 0;
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
    const [error, result] = await getAccounts({ limit: PAGE_SIZE, offset: this.offset, provider: this.provider });
    if(error){
      this.error = error.msg;
      return;
    }

    this.error = '';
    this.result = result;
    this.providers = result.providers;
  };

  filter = event => {
    this.provider = event.target.value;
    this.offset = 0;
    this.load();
  };

  page = step => {
    this.offset = Math.max(this.offset + step * PAGE_SIZE, 0);
    this.load();
  };

  disconnect = async account => {
    if(!confirm(`Disconnect ${account.provider} from ${account.userName || 'this user'}? They keep their account.`)) return;

    const [error] = await deleteAccount(account.id);
    if(error){
      this.error = error.msg;
      return;
    }

    this.load();
  };

  /*
    Rendering
  */

  render(){
    if(!this.result) return this.error ? html`<p class="tc-danger">${this.error}</p>` : html`<k-spinner></k-spinner>`;

    const { accounts, total, offset } = this.result;

    return html`
      ${this.error ? html`<p class="tc-danger">${this.error}</p>` : ''}

      ${this.providers.length ? html`
        <label>
          <span class="d-b">Provider</span>
          <select @change=${this.filter}>
            <option value="" ?selected=${!this.provider}>All</option>
            ${this.providers.map(provider => html`<option value=${provider.name} ?selected=${provider.name === this.provider}>${provider.label}</option>`)}
          </select>
        </label>
      ` : ''}

      ${accounts.length ? html`
        <div class="table-wrapper">
          <table>
            <thead>
              <tr><th>Provider</th><th>User</th><th>Email from provider</th><th>Last sign-in</th><th></th></tr>
            </thead>
            <tbody>
              ${accounts.map(account => html`
                <tr>
                  <td>${account.provider}</td>
                  <td>${account.userExists ? html`${account.userName}<br /><span class="small tc-muted">${account.userEmail}</span>` : html`<span class="tc-muted">Deleted user</span>`}</td>
                  <td>${account.email || html`<span class="tc-muted">none shared</span>`}</td>
                  <td>${new Date(account.lastLoginAt).toLocaleString()}</td>
                  <td><button class="link tc-danger" title="Disconnect" @click=${() => this.disconnect(account)}><k-icon name="delete"></k-icon></button></td>
                </tr>
              `)}
            </tbody>
          </table>
        </div>
        <p class="small tc-muted">
          ${offset + 1}–${offset + accounts.length} of ${total}
          <button class="link" ?disabled=${offset === 0} @click=${() => this.page(-1)}>Previous</button>
          <button class="link" ?disabled=${offset + accounts.length >= total} @click=${() => this.page(1)}>Next</button>
        </p>
      ` : html`<p class="tc-muted">Nobody has signed in with a provider yet.</p>`}
    `;
  }
}

customElements.define('k-oauth-accounts', LinkedAccounts);
