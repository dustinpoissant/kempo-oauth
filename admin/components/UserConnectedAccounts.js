import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import '/kempo-ui/components/Table.js';
import Dialog from '/kempo-ui/components/Dialog.js';
import Toast from '/kempo-ui/components/Toast.js';
import { html } from '/kempo-ui/lit-all.min.js';
import { getAllCurrentUserPermissions } from '/kempo/sdk.js';
import { deleteAccount, getAccounts } from '/oauth/sdk.js';

/*
  The Connected accounts tab on a user's admin page: the sign-in identities linked to that user.

  Removing one only disconnects it. The user keeps their account and can sign in again with the same
  provider, which links it afresh.
*/

export default class UserConnectedAccounts extends ShadowComponent {
  static properties = {
    error: { type: String, state: true },
  };

  constructor(){
    super();
    this.error = '';
  }

  /*
    Lifecycle
  */

  connectedCallback(){
    super.connectedCallback();
    const pane = this.closest('k-tab-content');
    // Loads when its tab is first opened, so a visit that never gets there costs no queries.
    if(!pane || pane.active) this.load();
    else this.closest('k-tabs')?.addEventListener('tabfirstshown', ({ detail }) => {
      if(detail.tab === pane.name) this.load();
    });
  }

  /*
    Data
  */

  get userId(){
    return window.location.pathname.split('/admin/accounts/users/')[1]?.replace(/\/$/, '');
  }

  load = async () => {
    const [permError, permissions] = await getAllCurrentUserPermissions();
    const canUnlink = !permError && (permissions?.permissions || []).includes('oauth:unlink');

    const [error, result] = await getAccounts({ userId: this.userId, limit: 200 });
    if(error){
      this.error = error.msg;
      return;
    }

    const labels = Object.fromEntries(result.providers.map(provider => [provider.name, provider.label]));
    const records = result.accounts.map(account => ({
      id: account.id,
      provider: labels[account.provider] || account.provider,
      email: account.email || '',
      lastLoginAt: account.lastLoginAt,
    }));

    await this.updateComplete;
    const $table = this.shadowRoot.querySelector('k-table');
    $table.toggleAttribute('request-delete', canUnlink);
    $table.setData({
      records,
      fields: [
        { name: 'provider', label: 'Provider' },
        { name: 'email', label: 'Email from provider' },
        { name: 'lastLoginAt', label: 'Last sign-in', formatter: value => new Date(value).toLocaleString() },
      ],
    });
    $table.addEventListener('requestDelete', this.disconnect);
  };

  /*
    Event handlers
  */

  disconnect = ({ detail: { records, approve, reject } }) => {
    const [record] = records;
    Dialog.confirm(`Disconnect ${record.provider} from this user? They keep their account.`, async confirmed => {
      if(!confirmed){
        reject();
        return;
      }
      const [error] = await deleteAccount(record.id);
      if(error){
        reject();
        Toast.error(error.msg || 'Failed to disconnect');
        return;
      }
      approve();
      Toast.success(`${record.provider} disconnected`);
      this.load();
    });
  };

  /*
    Rendering
  */

  render(){
    return html`
      ${this.error ? html`<p class="tc-danger">${this.error}</p>` : ''}
      <k-table placeholder="No sign-in providers are connected to this user."></k-table>
    `;
  }
}

customElements.define('k-oauth-user-accounts', UserConnectedAccounts);
