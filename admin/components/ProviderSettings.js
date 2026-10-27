import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import '/kempo-ui/components/Icon.js';
import '/kempo-ui/components/Spinner.js';
import { html } from '/kempo-ui/lit-all.min.js';
import { getSettings, saveSettings } from '/oauth/sdk.js';

/*
  One sign-in provider's settings, served at /admin/extension/kempo-oauth/components/ProviderSettings.js. The page puts one of these
  in each provider's tab (`provider="google"`), so the tabs are the page's own, and each tab saves its own provider with its own button.

  Three things on this screen are load-bearing and none of them is the form itself:

  - **The redirect URI.** Copy-pasteable, beside the fields it goes with. A site whose redirect URI is wrong gets as far as the
    provider's own error page, which names neither this site nor the cause, and the person looking at it is not the person who can fix it.
  - **The status line.** "Active", "Off" and "Incomplete" are different things and the third is the one that surprises people: a
    provider with an id and no secret is simply not offered, and nothing on the login page says why.
  - **Blank means unchanged.** A secret cannot be read back, so its field is always empty. Saving the tab after changing something
    else must not wipe the secret, and clearing one on purpose is a separate, explicit button.
*/
export default class ProviderSettings extends ShadowComponent {
  static properties = {
    provider: { type: String, reflect: true },
    data: { type: Object, state: true },
    edits: { type: Object, state: true },
    saving: { type: Boolean, state: true },
    error: { type: String, state: true },
    notice: { type: String, state: true },
  };

  constructor(){
    super();
    this.provider = '';
    this.data = null;
    /* Only what was touched, for this provider. An untouched field is not sent at all. */
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

  get info(){
    return this.data?.providers.find(provider => provider.name === this.provider);
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

  editProvider = (name, value) => {
    this.edits = { ...this.edits, [name]: value };
  };

  /* Saves this provider's changes only. */
  save = async () => {
    this.saving = true;
    this.error = '';
    this.notice = '';
    const [error] = await saveSettings({ global: {}, providers: { [this.provider]: this.edits } });
    this.saving = false;
    if(error){
      this.error = error.msg;
      return;
    }
    this.notice = 'Saved.';
    await this.load();
  };

  clearSecret = async () => {
    this.edits = { client_secret: null };
    await this.save();
  };

  copy = text => {
    navigator.clipboard?.writeText(text);
    this.notice = 'Copied.';
  };

  get dirty(){
    return Object.keys(this.edits).length > 0;
  }

  #valueOf = (name, stored) => this.edits[name] ?? stored;

  #renderStatus(provider){
    if(provider.active) return html`<span class="tc-success">Active — shown on the login and register pages</span>`;
    if(provider.enabled && !provider.configured) return html`<span class="tc-warning">Incomplete — needs both a client id and a client secret before it is shown</span>`;
    return html`<span class="tc-muted">Off</span>`;
  }

  /* A read-only address to paste into the provider's console, with a Copy button. */
  #renderUrl({ label, help, url }){
    return html`
      <label class="d-b">
        <span class="d-b">${label}</span>
        <span class="small tc-muted d-b">${help}</span>
      </label>
      <div class="d-f mbh">
        <input class="ff-mono flex" type="text" readonly .value=${url} />
        <button class="secondary" @click=${() => this.copy(url)}><k-icon name="content_copy"></k-icon> Copy</button>
      </div>
    `;
  }

  render(){
    if(this.error && !this.data) return html`<p class="tc-danger">${this.error}</p>`;
    if(!this.data) return html`<k-spinner></k-spinner>`;
    const provider = this.info;
    if(!provider) return html`<p class="tc-danger">There is no sign-in provider called “${this.provider}”.</p>`;
    const secretEdit = this.edits.client_secret;

    return html`
      ${!this.data.encryptionConfigured ? html`
        <div class="card tc-danger mb">
          <strong>SETTINGS_ENCRYPTION_KEY is not set on this server.</strong>
          <p class="small">
            Client secrets are encrypted with it, so none can be stored until it exists. Generate one with
            <code class="ff-mono">node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"</code>,
            put it in the site’s environment, and restart. Back it up — losing it makes every stored secret unrecoverable.
          </p>
        </div>
      ` : ''}
      ${this.error ? html`<p class="tc-danger">${this.error}</p>` : ''}
      ${this.notice ? html`<p class="tc-success small">${this.notice}</p>` : ''}

      <div class="card mb">
        <h3>
          ${provider.mono
            ? html`<k-icon class="mrh" src="/oauth/icons/${provider.icon}"></k-icon>`
            : html`<img class="icon mrh" src="/oauth/icons/${provider.icon}" alt="" />`}${provider.label}
        </h3>
        <p class="small">${this.#renderStatus(provider)}</p>

        <label class="checkbox">
          <input
            type="checkbox"
            .checked=${this.#valueOf('enabled', provider.enabled)}
            @change=${event => this.editProvider('enabled', event.target.checked)}
          />
          Offer “Continue with ${provider.label}”
        </label>

        <p class="small tc-muted mt">
          Create an OAuth app in the <a href=${provider.consoleUrl} target="_blank" rel="noopener">${provider.label} developer console</a>
          and give it this redirect URI:
        </p>
        <div class="d-f mbh">
          <input class="ff-mono flex" type="text" readonly .value=${provider.redirectUri} />
          <button class="secondary" @click=${() => this.copy(provider.redirectUri)}><k-icon name="content_copy"></k-icon> Copy</button>
        </div>

        ${provider.links.map(link => this.#renderUrl(link))}

        <label>
          <span class="d-b">Client id</span>
          <input
            type="text"
            autocomplete="off"
            .value=${this.#valueOf('client_id', provider.clientId)}
            @input=${event => this.editProvider('client_id', event.target.value)}
          />
        </label>

        <label>
          <span class="d-b">Client secret ${provider.hasSecret ? html`<span class="small tc-success">· set</span>` : ''}</span>
          <input
            type="password"
            autocomplete="off"
            placeholder=${provider.hasSecret ? '•••••••• — leave blank to keep' : ''}
            .value=${typeof secretEdit === 'string' ? secretEdit : ''}
            @input=${event => this.editProvider('client_secret', event.target.value)}
          />
          ${provider.hasSecret ? html`
            <button class="link small" ?disabled=${this.saving} @click=${this.clearSecret}>Clear this secret</button>
          ` : ''}
        </label>

        ${provider.extraFields.map(field => html`
          <label>
            <span class="d-b">${field.label}</span>
            <span class="small tc-muted d-b">${field.help}</span>
            <input
              type="text"
              autocomplete="off"
              .value=${this.#valueOf(field.name, field.value)}
              @input=${event => this.editProvider(field.name, event.target.value)}
            />
          </label>
        `)}
      </div>

      <button class="primary" ?disabled=${this.saving || !this.dirty} @click=${this.save}>
        ${this.saving ? 'Saving…' : 'Save settings'}
      </button>
    `;
  }
}

customElements.define('k-oauth-provider', ProviderSettings);
