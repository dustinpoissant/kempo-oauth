import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import '/kempo-ui/components/Spinner.js';
import { html } from '/kempo-ui/lit-all.min.js';
import { getSettings, saveSettings } from '/oauth/sdk.js';

/*
  The site-wide sign-in settings, served at /admin/extension/kempo-oauth/components/SiteSettings.js: the General tab. It saves its own
  fields with its own button, and only what was touched is sent.
*/
export default class SiteSettings extends ShadowComponent {
  static properties = {
    data: { type: Object, state: true },
    edits: { type: Object, state: true },
    saving: { type: Boolean, state: true },
    error: { type: String, state: true },
    notice: { type: String, state: true },
  };

  constructor(){
    super();
    this.data = null;
    this.edits = {};
    this.saving = false;
    this.error = '';
    this.notice = '';
  }

  connectedCallback(){
    super.connectedCallback();
    const pane = this.closest('k-tab-content');
    // Loads when its tab is first opened, so a tab nobody opens makes no requests.
    if(!pane || pane.active) this.load();
    else this.closest('k-tabs')?.addEventListener('tabfirstshown', ({ detail }) => {
      if(detail.tab === pane.name) this.load();
    });
  }

  load = async () => {
    const [error, data] = await getSettings();
    if(error){
      this.error = error.msg;
      return;
    }
    this.data = data;
    this.edits = {};
  };

  editGlobal = (name, value) => {
    this.edits = { ...this.edits, [name]: value };
  };

  save = async () => {
    this.saving = true;
    this.error = '';
    this.notice = '';
    const [error] = await saveSettings({ global: this.edits, providers: {} });
    this.saving = false;
    if(error){
      this.error = error.msg;
      return;
    }
    this.notice = 'Saved.';
    await this.load();
  };

  get dirty(){
    return Object.keys(this.edits).length > 0;
  }

  render(){
    if(this.error && !this.data) return html`<p class="tc-danger">${this.error}</p>`;
    if(!this.data) return html`<k-spinner></k-spinner>`;
    const { global } = this.data;
    const value = (name, key) => this.edits[name] ?? global[key];

    return html`
      ${this.error ? html`<p class="tc-danger">${this.error}</p>` : ''}
      ${this.notice ? html`<p class="tc-success small">${this.notice}</p>` : ''}

      <h2>Site</h2>

      <label>
        <span class="d-b">Site address</span>
        <span class="small tc-muted d-b">
          Where this site is reached, such as https://example.com. Leave empty to work it out from each request —
          fine for a site reached directly, wrong behind a proxy that changes the scheme or the host.
          Every redirect URI is built from it.
        </span>
        <input type="text" placeholder="https://example.com" .value=${value('base_url', 'baseUrl')} @input=${event => this.editGlobal('base_url', event.target.value)} />
      </label>

      <label>
        <span class="d-b">After signing in</span>
        <span class="small tc-muted d-b">The page a visitor lands on, unless the page they came from asked for somewhere else.</span>
        <input type="text" .value=${value('after_login_path', 'afterLoginPath')} @input=${event => this.editGlobal('after_login_path', event.target.value)} />
      </label>

      <label class="checkbox">
        <input
          type="checkbox"
          .checked=${value('link_verified_emails', 'linkVerifiedEmails')}
          @change=${event => this.editGlobal('link_verified_emails', event.target.checked)}
        />
        Connect a provider sign-in to an existing account with the same email, when the provider has confirmed that email
      </label>
      <p class="small tc-muted">
        Turned off, someone who signed up with a password and later uses Google with the same address gets a second account.
        A provider that does not confirm emails (Facebook) is never connected to an existing account either way.
      </p>

      <h2>Privacy</h2>
      <p class="small tc-muted">
        The privacy policy and the data-deletion page are ordinary pages of this site, at <a href=${this.data.privacyUrl} target="_blank" rel="noopener">${this.data.privacyUrl}</a>
        and <a href=${this.data.privacyUrl.replace(/privacy\/$/, 'data-deletion/')} target="_blank" rel="noopener">${this.data.privacyUrl.replace(/privacy\/$/, 'data-deletion/')}</a>.
        Edit them in the admin like any page: this extension writes them on install and update, and never overwrites a page you have changed.
        The addresses to give each provider are on its tab.
      </p>

      <label>
        <span class="d-b">Who runs this site</span>
        <span class="small tc-muted d-b">A person or a company, as the privacy policy should name them. Leave empty to say “the operator of this site”.</span>
        <input type="text" .value=${value('privacy_operator', 'privacyOperator')} @input=${event => this.editGlobal('privacy_operator', event.target.value)} />
      </label>

      <label>
        <span class="d-b">Privacy contact email</span>
        <span class="small tc-muted d-b">Where people write about their data. Shown on the policy and the data-deletion page.</span>
        <input type="email" placeholder="privacy@example.com" .value=${value('privacy_contact_email', 'privacyContactEmail')} @input=${event => this.editGlobal('privacy_contact_email', event.target.value)} />
      </label>

      <button class="primary mt" ?disabled=${this.saving || !this.dirty} @click=${this.save}>
        ${this.saving ? 'Saving…' : 'Save settings'}
      </button>
    `;
  }
}

customElements.define('k-oauth-site', SiteSettings);
