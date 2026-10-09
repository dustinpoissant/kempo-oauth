import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import '/kempo-ui/components/Icon.js';
import '/kempo-ui/components/Spinner.js';
import { html } from '/kempo-ui/lit-all.min.js';
import { getSettings, saveSettings } from '/oauth/sdk.js';

/*
  Connecting the site to sign-in providers.

  Three things on this screen are load-bearing and none of them is the form itself:

  - **The redirect URI.** Copy-pasteable, one per provider, beside the fields it goes with. A site
    whose redirect URI is wrong gets as far as the provider's own error page, which names neither
    this site nor the cause, and the person looking at it is not the person who can fix it.
  - **The status line.** "Active", "Off" and "Incomplete" are different things and the third is the
    one that surprises people: a provider with an id and no secret is simply not offered, and
    nothing on the login page says why.
  - **Blank means unchanged.** A secret cannot be read back, so its field is always empty. Saving
    the form after changing something else must not wipe the secret, and clearing one on purpose is
    a separate, explicit button.
*/
export default class ProviderSettings extends ShadowComponent {
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
    /*
      Only what was touched, shaped like the request body. An untouched field is not sent at all,
      which is what makes "blank means unchanged" true on the wire and not only in the route.
    */
    this.edits = { global: {}, providers: {} };
    this.saving = false;
    this.error = '';
    this.notice = '';
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
    const [error, data] = await getSettings();
    if(error){
      this.error = error.msg;
      return;
    }

    this.data = data;
    this.edits = { global: {}, providers: {} };
  };

  editGlobal = (name, value) => {
    this.edits = { ...this.edits, global: { ...this.edits.global, [name]: value } };
  };

  editProvider = (provider, name, value) => {
    const current = this.edits.providers[provider] || {};
    this.edits = { ...this.edits, providers: { ...this.edits.providers, [provider]: { ...current, [name]: value } } };
  };

  save = async () => {
    this.saving = true;
    this.error = '';
    this.notice = '';

    const [error] = await saveSettings(this.edits);
    this.saving = false;

    if(error){
      this.error = error.msg;
      return;
    }

    this.notice = 'Saved.';
    await this.load();
  };

  clearSecret = async name => {
    this.edits = { ...this.edits, providers: { ...this.edits.providers, [name]: { client_secret: null } } };
    await this.save();
  };

  copy = (text) => {
    navigator.clipboard?.writeText(text);
    this.notice = 'Copied.';
  };

  get dirty(){
    return Object.keys(this.edits.global).length > 0 || Object.keys(this.edits.providers).length > 0;
  }

  /*
    Rendering
  */

  #valueOf = (provider, name, stored) => this.edits.providers[provider.name]?.[name] ?? stored;

  #renderStatus(provider){
    if(provider.active) return html`<span class="tc-success">Active — shown on the login and register pages</span>`;
    if(provider.enabled && !provider.configured) return html`<span class="tc-warning">Incomplete — needs both a client id and a client secret before it is shown</span>`;
    return html`<span class="tc-muted">Off</span>`;
  }

  #renderProvider(provider){
    const secretEdit = this.edits.providers[provider.name]?.client_secret;

    return html`
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
            .checked=${this.#valueOf(provider, 'enabled', provider.enabled)}
            @change=${event => this.editProvider(provider.name, 'enabled', event.target.checked)}
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

        <label>
          <span class="d-b">Client id</span>
          <input
            type="text"
            autocomplete="off"
            .value=${this.#valueOf(provider, 'client_id', provider.clientId)}
            @input=${event => this.editProvider(provider.name, 'client_id', event.target.value)}
          />
        </label>

        <label>
          <span class="d-b">Client secret ${provider.hasSecret ? html`<span class="small tc-success">· set</span>` : ''}</span>
          <input
            type="password"
            autocomplete="off"
            placeholder=${provider.hasSecret ? '•••••••• — leave blank to keep' : ''}
            .value=${typeof secretEdit === 'string' ? secretEdit : ''}
            @input=${event => this.editProvider(provider.name, 'client_secret', event.target.value)}
          />
          ${provider.hasSecret ? html`
            <button class="link small" ?disabled=${this.saving} @click=${() => this.clearSecret(provider.name)}>Clear this secret</button>
          ` : ''}
        </label>

        ${provider.extraFields.map(field => html`
          <label>
            <span class="d-b">${field.label}</span>
            <span class="small tc-muted d-b">${field.help}</span>
            <input
              type="text"
              autocomplete="off"
              .value=${this.#valueOf(provider, field.name, field.value)}
              @input=${event => this.editProvider(provider.name, field.name, event.target.value)}
            />
          </label>
        `)}
      </div>
    `;
  }

  #renderGlobal(){
    const { global } = this.data;
    const value = (name, key) => this.edits.global[name] ?? global[key];

    return html`
      <h2>Site</h2>

      <label>
        <span class="d-b">Site address</span>
        <span class="small tc-muted d-b">
          Where this site is reached, such as https://example.com. Leave empty to work it out from each request —
          fine for a site reached directly, wrong behind a proxy that changes the scheme or the host.
          Every redirect URI below is built from it.
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
        A provider that does not confirm emails (Facebook, Microsoft) is never connected to an existing account either way.
      </p>
    `;
  }

  render(){
    if(!this.data) return this.error ? html`<p class="tc-danger">${this.error}</p>` : html`<k-spinner></k-spinner>`;

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

      <h2>Providers</h2>
      ${this.data.providers.map(provider => this.#renderProvider(provider))}

      ${this.#renderGlobal()}

      <button class="primary mt" ?disabled=${this.saving || !this.dirty} @click=${this.save}>
        ${this.saving ? 'Saving…' : 'Save settings'}
      </button>
    `;
  }
}

customElements.define('k-oauth-settings', ProviderSettings);
