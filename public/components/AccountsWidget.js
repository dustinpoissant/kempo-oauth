import DashboardWidget from '/kempo/components/DashboardWidget.js';
import { html } from '/kempo-ui/lit-all.min.js';
import { getAccounts } from '/oauth/sdk.js';

/*
  How many accounts are linked to a provider, and the providers available.
*/
export default class AccountsWidget extends DashboardWidget {
  static properties = {
    ...DashboardWidget.properties,
    total: { state: true },
    providers: { state: true }
  };

  constructor(){
    super();
    this.total = 0;
    this.providers = [];
    this.cta = { label: 'Provider settings', icon: 'settings', href: '/admin/extension/kempo-oauth/', permission: 'oauth:settings' };
  }

  /*
    Public Methods
  */

  load = async () => {
    const { total, providers } = await this.unwrap(getAccounts({ limit: 1 }));
    this.total = total;
    this.providers = providers;
  };

  /*
    Rendering
  */

  renderContent(){
    if(!this.total){
      return html`<p class="tc-muted mbh">No accounts linked yet.</p><div class="small tc-muted">Providers: ${this.providers.map(provider => provider.label).join(', ')}</div>`;
    }
    return html`
      <div class="h2 m0">${this.total}</div>
      <div class="small tc-muted mb">Linked ${this.total === 1 ? 'account' : 'accounts'}</div>
      <div class="small tc-muted">${this.providers.map(provider => provider.label).join(', ')}</div>
    `;
  }
}

customElements.define('k-oauth-widget', AccountsWidget);
