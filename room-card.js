/**
 * room-card.js
 * Universal Room Card for Home Assistant
 * GitHub: https://github.com/robman2026/Adaptive-Room-Card
 * Version: 1.0.0
 */

const LitElement = Object.getPrototypeOf(customElements.get("ha-panel-lovelace"));
const html = LitElement.prototype.html;
const css = LitElement.prototype.css;

// ─────────────────────────────────────────────
// CARD ELEMENT
// ─────────────────────────────────────────────
class RoomCard extends LitElement {
  static get properties() {
    return {
      _hass: {},
      _config: {},
      _ticks: { state: true },
    };
  }

  static getConfigElement() {
    return document.createElement("room-card-editor");
  }

  static getStubConfig() {
    return {
      room_name: "Living Room",
      room_icon: "mdi:sofa",
      show_datetime: true,
      show_status_dot: true,
      status_entity: "",
      climate_sensors: [],
      binary_sensors: [],
      switches: [],
      camera_entity: "",
      show_camera: false,
    };
  }

  set hass(hass) {
    this._hass = hass;
  }

  setConfig(config) {
    this._config = {
      room_name: "Room",
      room_icon: "mdi:home",
      show_datetime: true,
      show_status_dot: false,
      status_entity: "",
      climate_sensors: [],
      binary_sensors: [],
      switches: [],
      camera_entity: "",
      show_camera: false,
      ...config,
    };
  }

  connectedCallback() {
    super.connectedCallback();
    this._tickInterval = setInterval(() => {
      this._ticks = Date.now();
    }, 1000);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearInterval(this._tickInterval);
  }

  // ── helpers ──────────────────────────────────

  _stateOf(entityId) {
    if (!entityId || !this._hass) return null;
    return this._hass.states[entityId] || null;
  }

  _val(entityId) {
    const s = this._stateOf(entityId);
    return s ? s.state : "—";
  }

  _attr(entityId, attr) {
    const s = this._stateOf(entityId);
    return s ? s.attributes[attr] : undefined;
  }

  _friendlyName(entityId) {
    return this._attr(entityId, "friendly_name") || entityId;
  }

  _unit(entityId) {
    return this._attr(entityId, "unit_of_measurement") || "";
  }

  _isOnline(entityId) {
    if (!entityId) return true;
    const s = this._stateOf(entityId);
    return s ? !["unavailable", "unknown"].includes(s.state) : false;
  }

  _now() {
    const d = new Date();
    const date = d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
    const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    return { date, time };
  }

  // ── gauge arc ────────────────────────────────

  _gaugeArc(value, min, max, color) {
    const pct = Math.min(1, Math.max(0, (parseFloat(value) - min) / (max - min)));
    const r = 28;
    const cx = 36;
    const cy = 36;
    const circumference = 2 * Math.PI * r;
    const dash = pct * circumference * 0.75;
    const gap = circumference - dash;
    const rotation = 135;
    return html`
      <svg viewBox="0 0 72 72" class="gauge-svg">
        <circle cx="${cx}" cy="${cy}" r="${r}"
          fill="none" stroke="rgba(255,255,255,0.07)"
          stroke-width="5"
          stroke-dasharray="${circumference * 0.75} ${circumference * 0.25}"
          stroke-dashoffset="0"
          stroke-linecap="round"
          transform="rotate(${rotation} ${cx} ${cy})"
        />
        <circle cx="${cx}" cy="${cy}" r="${r}"
          fill="none" stroke="${color}"
          stroke-width="5"
          stroke-dasharray="${dash} ${gap + circumference * 0.25}"
          stroke-dashoffset="0"
          stroke-linecap="round"
          transform="rotate(${rotation} ${cx} ${cy})"
        />
      </svg>
    `;
  }

  // ── climate sensor tile ──────────────────────

  _renderClimateSensor(sensor) {
    const entityId = sensor.entity;
    const stateObj = this._stateOf(entityId);
    const rawVal = stateObj ? stateObj.state : "—";
    const numVal = parseFloat(rawVal);
    const unit = sensor.unit || this._unit(entityId);
    const label = sensor.label || (stateObj ? this._friendlyName(entityId) : entityId);
    const min = sensor.min !== undefined ? sensor.min : 0;
    const max = sensor.max !== undefined ? sensor.max : 100;
    const color = sensor.color || "#22c55e";
    const icon = sensor.icon || "mdi:thermometer";

    return html`
      <div class="climate-tile">
        ${this._gaugeArc(numVal, min, max, color)}
        <div class="climate-inner">
          <ha-icon icon="${icon}" style="color:${color};--mdc-icon-size:14px"></ha-icon>
          <span class="climate-value">${isNaN(numVal) ? rawVal : numVal.toFixed(1)}<span class="climate-unit">${unit}</span></span>
        </div>
        <div class="climate-label">${label.toUpperCase()}</div>
      </div>
    `;
  }

  // ── binary sensor row ────────────────────────

  _renderBinarySensor(sensor) {
    const entityId = sensor.entity;
    const stateObj = this._stateOf(entityId);
    const state = stateObj ? stateObj.state : "unknown";
    const label = sensor.label || (stateObj ? this._friendlyName(entityId) : entityId);
    const icon = sensor.icon || "mdi:checkbox-blank-circle";
    const lastChanged = stateObj ? stateObj.last_changed : null;

    // state → display mapping
    const stateMap = sensor.state_map || {};
    const defaultMap = { on: { label: "On", color: "#f59e0b" }, off: { label: "Off", color: "#6b7280" }, open: { label: "Open", color: "#f59e0b" }, closed: { label: "Closed", color: "#6b7280" }, detected: { label: "Detected", color: "#ef4444" }, clear: { label: "Clear", color: "#22c55e" }, home: { label: "Home", color: "#22c55e" }, away: { label: "Away", color: "#f59e0b" } };
    const merged = { ...defaultMap, ...stateMap };
    const display = merged[state.toLowerCase()] || { label: state, color: "#6b7280" };

    let ago = "";
    if (lastChanged) {
      const diffMs = Date.now() - new Date(lastChanged).getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 60) ago = `${diffMins}m ago`;
      else if (diffMins < 1440) ago = `${Math.floor(diffMins / 60)}h ago`;
      else ago = `${Math.floor(diffMins / 1440)}d ago`;
    }

    return html`
      <div class="sensor-row">
        <ha-icon icon="${icon}" class="sensor-icon"></ha-icon>
        <div class="sensor-info">
          <span class="sensor-name">${label}</span>
          ${ago ? html`<span class="sensor-ago">${ago}</span>` : ""}
        </div>
        <span class="sensor-state" style="color:${display.color}">${display.label}</span>
      </div>
    `;
  }

  // ── switch tile ──────────────────────────────

  _renderSwitch(sw) {
    const entityId = sw.entity;
    const stateObj = this._stateOf(entityId);
    const state = stateObj ? stateObj.state : "off";
    const isOn = state === "on";
    const label = sw.label || (stateObj ? this._friendlyName(entityId) : entityId);
    const icon = sw.icon || (isOn ? "mdi:lightbulb" : "mdi:lightbulb-off");
    const lastChanged = stateObj ? stateObj.last_changed : null;
    const color = sw.color || (isOn ? "#f59e0b" : "#6b7280");

    let ago = "";
    if (lastChanged) {
      const diffMs = Date.now() - new Date(lastChanged).getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 60) ago = `${diffMins}m ago`;
      else if (diffMins < 1440) ago = `${Math.floor(diffMins / 60)}h ago`;
      else ago = `${Math.floor(diffMins / 1440)}d ago`;
    }

    return html`
      <div class="switch-tile ${isOn ? "switch-on" : ""}"
           @click="${() => this._toggleSwitch(entityId, state)}"
           style="${isOn ? `--sw-accent:${color}` : ""}">
        <ha-icon icon="${icon}" style="color:${isOn ? color : "rgba(255,255,255,0.35)"};--mdc-icon-size:22px"></ha-icon>
        <span class="switch-label">${label}</span>
        <span class="switch-state">${state.toUpperCase()}</span>
        ${ago ? html`<span class="switch-ago">${ago}</span>` : ""}
      </div>
    `;
  }

  _toggleSwitch(entityId, currentState) {
    if (!this._hass || !entityId) return;
    const domain = entityId.split(".")[0];
    const service = currentState === "on" ? "turn_off" : "turn_on";
    const validDomains = ["switch", "light", "input_boolean", "fan", "automation", "script"];
    if (!validDomains.includes(domain)) return;
    this._hass.callService(domain, service, { entity_id: entityId });
  }

  // ── camera ───────────────────────────────────

  _renderCamera() {
    const entityId = this._config.camera_entity;
    if (!entityId || !this._config.show_camera) return "";
    const stateObj = this._stateOf(entityId);
    const pictureUrl = stateObj ? stateObj.attributes.entity_picture : null;
    const label = stateObj ? this._friendlyName(entityId) : entityId;

    if (!pictureUrl) {
      return html`<div class="camera-placeholder"><ha-icon icon="mdi:camera-off"></ha-icon><span>No feed</span></div>`;
    }

    return html`
      <div class="camera-container">
        <img class="camera-img" src="${this._hass.hassUrl(pictureUrl)}&t=${Date.now()}" alt="${label}" />
        <div class="camera-overlay">
          <span class="camera-ts">${new Date().toLocaleString()}</span>
          <span class="camera-label">${label.toUpperCase()}</span>
        </div>
      </div>
    `;
  }

  // ── MAIN RENDER ──────────────────────────────

  render() {
    if (!this._config || !this._hass) return html``;

    const cfg = this._config;
    const { date, time } = this._now();
    const online = this._isOnline(cfg.status_entity);
    const switches = cfg.switches || [];
    const switchCols = switches.length === 1 ? 1 : switches.length === 2 ? 2 : switches.length === 3 ? 3 : switches.length <= 4 ? 2 : 3;

    return html`
      <ha-card>
        <div class="card-root">

          <!-- HEADER -->
          <div class="header">
            <div class="header-left">
              ${cfg.room_icon ? html`<ha-icon icon="${cfg.room_icon}" class="room-icon"></ha-icon>` : ""}
              <span class="room-name">${(cfg.room_name || "Room").toUpperCase()}</span>
            </div>
            <div class="header-right">
              ${cfg.show_datetime ? html`
                <div class="datetime">
                  <span class="hdr-date">${date}</span>
                  <span class="hdr-time">${time}</span>
                </div>
              ` : ""}
              ${cfg.show_status_dot ? html`
                <div class="status-dot ${online ? "dot-online" : "dot-offline"}" title="${online ? "Online" : "Offline"}"></div>
              ` : ""}
            </div>
          </div>

          <!-- CLIMATE SENSORS -->
          ${(cfg.climate_sensors || []).length > 0 ? html`
            <div class="climate-row">
              ${cfg.climate_sensors.map((s) => this._renderClimateSensor(s))}
            </div>
          ` : ""}

          <!-- CAMERA -->
          ${cfg.show_camera && cfg.camera_entity ? this._renderCamera() : ""}

          <!-- BINARY SENSORS -->
          ${(cfg.binary_sensors || []).length > 0 ? html`
            <div class="sensors-section">
              ${cfg.binary_sensors.map((s) => this._renderBinarySensor(s))}
            </div>
          ` : ""}

          <!-- SWITCHES -->
          ${switches.length > 0 ? html`
            <div class="switches-grid" style="--sw-cols:${switchCols}">
              ${switches.map((s) => this._renderSwitch(s))}
            </div>
          ` : ""}

        </div>
      </ha-card>
    `;
  }

  // ── STYLES ───────────────────────────────────

  static get styles() {
    return css`
      :host { display: block; }

      ha-card {
        background: linear-gradient(145deg, #0f1729 0%, #111827 60%, #0d1b2a 100%);
        border: 1px solid rgba(99,179,237,0.10);
        border-radius: 16px;
        overflow: hidden;
        font-family: 'Roboto', 'Noto Sans', sans-serif;
        color: #e2e8f0;
      }

      .card-root {
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      /* ── HEADER ── */
      .header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px;
      }
      .header-left {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .room-icon {
        --mdc-icon-size: 20px;
        color: rgba(255,255,255,0.5);
      }
      .room-name {
        font-size: 1rem;
        font-weight: 700;
        letter-spacing: 0.12em;
        color: #e2e8f0;
      }
      .header-right {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .datetime {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
      }
      .hdr-date {
        font-size: 0.72rem;
        color: rgba(255,255,255,0.5);
        font-weight: 500;
      }
      .hdr-time {
        font-size: 0.8rem;
        color: rgba(255,255,255,0.75);
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
      .status-dot {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        flex-shrink: 0;
        margin-top: 2px;
      }
      .dot-online  { background: #22c55e; box-shadow: 0 0 6px #22c55e; }
      .dot-offline { background: #6b7280; }

      /* ── CLIMATE ── */
      .climate-row {
        display: flex;
        gap: 10px;
        justify-content: center;
      }
      .climate-tile {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        flex: 1;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.07);
        border-radius: 12px;
        padding: 10px 8px 8px;
      }
      .gauge-svg {
        width: 72px;
        height: 72px;
      }
      .climate-inner {
        position: absolute;
        top: 22px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
      }
      .climate-value {
        font-size: 1rem;
        font-weight: 700;
        color: #e2e8f0;
        line-height: 1;
        margin-top: 2px;
      }
      .climate-unit {
        font-size: 0.65rem;
        font-weight: 500;
        color: rgba(255,255,255,0.55);
      }
      .climate-label {
        font-size: 0.62rem;
        letter-spacing: 0.1em;
        color: rgba(255,255,255,0.4);
        margin-top: 2px;
        font-weight: 600;
      }

      /* ── CAMERA ── */
      .camera-container {
        position: relative;
        border-radius: 10px;
        overflow: hidden;
        background: #0a0f1e;
      }
      .camera-img {
        width: 100%;
        display: block;
        border-radius: 10px;
      }
      .camera-overlay {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        padding: 6px 10px;
        background: linear-gradient(transparent, rgba(0,0,0,0.7));
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
      }
      .camera-ts { font-size: 0.65rem; color: rgba(255,255,255,0.7); }
      .camera-label { font-size: 0.65rem; color: rgba(255,255,255,0.5); letter-spacing: 0.08em; }
      .camera-placeholder {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 24px;
        background: rgba(255,255,255,0.03);
        border: 1px dashed rgba(255,255,255,0.1);
        border-radius: 10px;
        color: rgba(255,255,255,0.3);
        font-size: 0.75rem;
      }

      /* ── BINARY SENSORS ── */
      .sensors-section {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .sensor-row {
        display: flex;
        align-items: center;
        gap: 10px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 10px;
        padding: 9px 12px;
      }
      .sensor-icon {
        --mdc-icon-size: 18px;
        color: rgba(255,255,255,0.45);
        flex-shrink: 0;
      }
      .sensor-info {
        flex: 1;
        display: flex;
        flex-direction: column;
      }
      .sensor-name {
        font-size: 0.82rem;
        font-weight: 500;
        color: rgba(255,255,255,0.85);
      }
      .sensor-ago {
        font-size: 0.67rem;
        color: rgba(255,255,255,0.35);
      }
      .sensor-state {
        font-size: 0.82rem;
        font-weight: 600;
        flex-shrink: 0;
      }

      /* ── SWITCHES ── */
      .switches-grid {
        display: grid;
        grid-template-columns: repeat(var(--sw-cols, 2), 1fr);
        gap: 8px;
      }
      .switch-tile {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
        padding: 12px 8px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 12px;
        cursor: pointer;
        transition: background 0.2s, border-color 0.2s, transform 0.1s;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
      }
      .switch-tile:active { transform: scale(0.96); }
      .switch-tile.switch-on {
        background: rgba(255,255,255,0.08);
        border-color: rgba(255,255,255,0.12);
        box-shadow: 0 0 12px rgba(245,158,11,0.08);
      }
      .switch-label {
        font-size: 0.78rem;
        font-weight: 500;
        color: rgba(255,255,255,0.8);
        text-align: center;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        width: 100%;
        text-align: center;
      }
      .switch-state {
        font-size: 0.62rem;
        letter-spacing: 0.08em;
        color: rgba(255,255,255,0.35);
        font-weight: 600;
      }
      .switch-ago {
        font-size: 0.6rem;
        color: rgba(255,255,255,0.25);
      }
    `;
  }
}

// ─────────────────────────────────────────────
// EDITOR ELEMENT
// ─────────────────────────────────────────────
class RoomCardEditor extends LitElement {
  static get properties() {
    return {
      hass: {},
      _config: { state: true },
      _activeTab: { state: true },
    };
  }

  constructor() {
    super();
    this._activeTab = "general";
  }

  setConfig(config) {
    this._config = JSON.parse(JSON.stringify(config));
  }

  _fire(config) {
    const ev = new Event("config-changed", { bubbles: true, composed: true });
    ev.detail = { config };
    this.dispatchEvent(ev);
  }

  _set(key, value) {
    this._config = { ...this._config, [key]: value };
    this._fire(this._config);
  }

  // ── entity helpers ────────────────────────────

  _entitiesByDomain(...domains) {
    if (!this.hass) return [];
    return Object.keys(this.hass.states)
      .filter((id) => domains.some((d) => id.startsWith(d + ".")))
      .sort();
  }

  _allEntities() {
    if (!this.hass) return [];
    return Object.keys(this.hass.states).sort();
  }

  // ── list item helpers ─────────────────────────

  _addItem(listKey, defaults) {
    const list = [...(this._config[listKey] || []), defaults];
    this._set(listKey, list);
  }

  _removeItem(listKey, idx) {
    const list = [...(this._config[listKey] || [])];
    list.splice(idx, 1);
    this._set(listKey, list);
  }

  _updateItem(listKey, idx, field, value) {
    const list = [...(this._config[listKey] || [])];
    list[idx] = { ...list[idx], [field]: value };
    this._set(listKey, list);
  }

  // ── renderers ─────────────────────────────────

  _renderEntitySelect(value, onChange, domains, placeholder) {
    const entities = domains && domains.length ? this._entitiesByDomain(...domains) : this._allEntities();
    return html`
      <div class="field-row">
        <select class="ed-select" .value="${value || ""}" @change="${(e) => onChange(e.target.value)}">
          <option value="">${placeholder || "— select entity —"}</option>
          ${entities.map((eid) => html`<option value="${eid}" ?selected="${eid === value}">${eid}</option>`)}
        </select>
      </div>
    `;
  }

  _renderTextInput(label, value, onChange, placeholder) {
    return html`
      <label class="ed-label">${label}</label>
      <input class="ed-input" type="text" .value="${value || ""}" placeholder="${placeholder || ""}"
        @input="${(e) => onChange(e.target.value)}" />
    `;
  }

  _renderToggle(label, value, onChange) {
    return html`
      <div class="toggle-row">
        <span class="ed-label">${label}</span>
        <label class="toggle-wrap">
          <input type="checkbox" ?checked="${value}" @change="${(e) => onChange(e.target.checked)}" />
          <span class="toggle-slider"></span>
        </label>
      </div>
    `;
  }

  _renderColorInput(label, value, onChange) {
    return html`
      <div class="color-row">
        <span class="ed-label">${label}</span>
        <input type="color" class="color-picker" .value="${value || "#22c55e"}"
          @input="${(e) => onChange(e.target.value)}" />
      </div>
    `;
  }

  // ── tabs ──────────────────────────────────────

  _renderTabGeneral() {
    const cfg = this._config;
    return html`
      <div class="section">
        <div class="section-title">Room Identity</div>
        ${this._renderTextInput("Room Name", cfg.room_name, (v) => this._set("room_name", v), "e.g. Living Room")}
        ${this._renderTextInput("Room Icon (mdi:...)", cfg.room_icon, (v) => this._set("room_icon", v), "e.g. mdi:sofa")}
      </div>
      <div class="section">
        <div class="section-title">Header Options</div>
        ${this._renderToggle("Show Date & Time", cfg.show_datetime, (v) => this._set("show_datetime", v))}
        ${this._renderToggle("Show Status Dot", cfg.show_status_dot, (v) => this._set("show_status_dot", v))}
        ${cfg.show_status_dot ? html`
          <label class="ed-label">Status Entity (optional)</label>
          ${this._renderEntitySelect(cfg.status_entity, (v) => this._set("status_entity", v), [], "— auto online if empty —")}
        ` : ""}
      </div>
      <div class="section">
        <div class="section-title">Camera</div>
        ${this._renderToggle("Show Camera Feed", cfg.show_camera, (v) => this._set("show_camera", v))}
        ${cfg.show_camera ? html`
          <label class="ed-label">Camera Entity</label>
          ${this._renderEntitySelect(cfg.camera_entity, (v) => this._set("camera_entity", v), ["camera"], "— select camera —")}
        ` : ""}
      </div>
    `;
  }

  _renderTabClimate() {
    const items = this._config.climate_sensors || [];
    return html`
      <div class="section">
        <div class="section-title">Climate / Environment Sensors</div>
        <p class="hint">Temperature, humidity, CO₂, etc. Displayed as circular gauges.</p>
        ${items.map((s, i) => html`
          <div class="list-item">
            <div class="list-item-header">
              <span class="list-item-num">Sensor ${i + 1}</span>
              <button class="btn-remove" @click="${() => this._removeItem("climate_sensors", i)}">✕ Remove</button>
            </div>
            <label class="ed-label">Entity</label>
            ${this._renderEntitySelect(s.entity, (v) => this._updateItem("climate_sensors", i, "entity", v), ["sensor"], "— select sensor —")}
            ${this._renderTextInput("Display Label", s.label, (v) => this._updateItem("climate_sensors", i, "label", v), "e.g. Temperature")}
            ${this._renderTextInput("Unit Override", s.unit, (v) => this._updateItem("climate_sensors", i, "unit", v), "e.g. °C")}
            ${this._renderTextInput("Icon (mdi:...)", s.icon, (v) => this._updateItem("climate_sensors", i, "icon", v), "e.g. mdi:thermometer")}
            <div class="two-col">
              ${this._renderTextInput("Min Value", s.min !== undefined ? String(s.min) : "", (v) => this._updateItem("climate_sensors", i, "min", parseFloat(v) || 0), "0")}
              ${this._renderTextInput("Max Value", s.max !== undefined ? String(s.max) : "", (v) => this._updateItem("climate_sensors", i, "max", parseFloat(v) || 100), "100")}
            </div>
            ${this._renderColorInput("Gauge Color", s.color, (v) => this._updateItem("climate_sensors", i, "color", v))}
          </div>
        `)}
        <button class="btn-add" @click="${() => this._addItem("climate_sensors", { entity: "", label: "", unit: "", icon: "mdi:thermometer", min: 0, max: 50, color: "#22c55e" })}">+ Add Climate Sensor</button>
      </div>
    `;
  }

  _renderTabSensors() {
    const items = this._config.binary_sensors || [];
    const defaultStates = [
      { state: "on", label: "On", color: "#f59e0b" },
      { state: "off", label: "Off", color: "#6b7280" },
    ];
    return html`
      <div class="section">
        <div class="section-title">Binary / State Sensors</div>
        <p class="hint">Windows, doors, motion, presence, etc. Shown as rows with state labels.</p>
        ${items.map((s, i) => {
          const stateMap = s.state_map || {};
          const stateEntries = Object.entries(stateMap);
          return html`
            <div class="list-item">
              <div class="list-item-header">
                <span class="list-item-num">Sensor ${i + 1}</span>
                <button class="btn-remove" @click="${() => this._removeItem("binary_sensors", i)}">✕ Remove</button>
              </div>
              <label class="ed-label">Entity</label>
              ${this._renderEntitySelect(s.entity, (v) => this._updateItem("binary_sensors", i, "entity", v), ["binary_sensor", "sensor", "input_boolean", "device_tracker"], "— select sensor —")}
              ${this._renderTextInput("Display Label", s.label, (v) => this._updateItem("binary_sensors", i, "label", v), "e.g. Window Left")}
              ${this._renderTextInput("Icon (mdi:...)", s.icon, (v) => this._updateItem("binary_sensors", i, "icon", v), "e.g. mdi:window-open")}
              <div class="state-map-title">State Display Map</div>
              ${stateEntries.map(([state, disp], si) => html`
                <div class="state-map-row">
                  <input class="ed-input sm" type="text" placeholder="state" .value="${state}"
                    @input="${(e) => {
                      const newMap = { ...stateMap };
                      delete newMap[state];
                      newMap[e.target.value] = disp;
                      this._updateItem("binary_sensors", i, "state_map", newMap);
                    }}" />
                  <span class="sm-arrow">→</span>
                  <input class="ed-input sm" type="text" placeholder="label" .value="${disp.label || ""}"
                    @input="${(e) => {
                      const newMap = { ...stateMap, [state]: { ...disp, label: e.target.value } };
                      this._updateItem("binary_sensors", i, "state_map", newMap);
                    }}" />
                  <input type="color" class="color-picker sm" .value="${disp.color || "#6b7280"}"
                    @input="${(e) => {
                      const newMap = { ...stateMap, [state]: { ...disp, color: e.target.value } };
                      this._updateItem("binary_sensors", i, "state_map", newMap);
                    }}" />
                  <button class="btn-remove-sm" @click="${() => {
                    const newMap = { ...stateMap };
                    delete newMap[state];
                    this._updateItem("binary_sensors", i, "state_map", newMap);
                  }}">✕</button>
                </div>
              `)}
              <button class="btn-add sm" @click="${() => {
                const newMap = { ...stateMap, "new_state": { label: "Label", color: "#6b7280" } };
                this._updateItem("binary_sensors", i, "state_map", newMap);
              }}">+ Add State</button>
            </div>
          `;
        })}
        <button class="btn-add" @click="${() => this._addItem("binary_sensors", { entity: "", label: "", icon: "mdi:toggle-switch", state_map: { on: { label: "On", color: "#f59e0b" }, off: { label: "Off", color: "#6b7280" } } })}">+ Add Binary Sensor</button>
      </div>
    `;
  }

  _renderTabSwitches() {
    const items = this._config.switches || [];
    return html`
      <div class="section">
        <div class="section-title">Switches / Lights / Controls</div>
        <p class="hint">Tappable tiles. Auto-fits columns based on count. Tap in the card to toggle.</p>
        ${items.map((s, i) => html`
          <div class="list-item">
            <div class="list-item-header">
              <span class="list-item-num">Switch ${i + 1}</span>
              <button class="btn-remove" @click="${() => this._removeItem("switches", i)}">✕ Remove</button>
            </div>
            <label class="ed-label">Entity</label>
            ${this._renderEntitySelect(s.entity, (v) => this._updateItem("switches", i, "entity", v), ["switch", "light", "input_boolean", "fan", "automation"], "— select entity —")}
            ${this._renderTextInput("Display Label", s.label, (v) => this._updateItem("switches", i, "label", v), "e.g. Ceiling Light")}
            ${this._renderTextInput("Icon (mdi:...)", s.icon, (v) => this._updateItem("switches", i, "icon", v), "e.g. mdi:lightbulb")}
            ${this._renderColorInput("Active Color", s.color, (v) => this._updateItem("switches", i, "color", v))}
          </div>
        `)}
        <button class="btn-add" @click="${() => this._addItem("switches", { entity: "", label: "", icon: "mdi:lightbulb", color: "#f59e0b" })}">+ Add Switch / Light</button>
      </div>
    `;
  }

  render() {
    if (!this._config) return html``;
    const tabs = [
      { id: "general",  label: "General" },
      { id: "climate",  label: "Climate" },
      { id: "sensors",  label: "Sensors" },
      { id: "switches", label: "Switches" },
    ];
    return html`
      <div class="editor-root">
        <div class="tab-bar">
          ${tabs.map((t) => html`
            <button class="tab-btn ${this._activeTab === t.id ? "active" : ""}"
              @click="${() => (this._activeTab = t.id)}">${t.label}</button>
          `)}
        </div>
        <div class="tab-content">
          ${this._activeTab === "general"  ? this._renderTabGeneral()  : ""}
          ${this._activeTab === "climate"  ? this._renderTabClimate()  : ""}
          ${this._activeTab === "sensors"  ? this._renderTabSensors()  : ""}
          ${this._activeTab === "switches" ? this._renderTabSwitches() : ""}
        </div>
      </div>
    `;
  }

  static get styles() {
    return css`
      :host { display: block; font-family: 'Roboto', sans-serif; }

      .editor-root { display: flex; flex-direction: column; gap: 0; }

      .tab-bar {
        display: flex;
        border-bottom: 1px solid rgba(0,0,0,0.15);
        background: var(--card-background-color, #1e293b);
        border-radius: 8px 8px 0 0;
        overflow: hidden;
      }
      .tab-btn {
        flex: 1;
        padding: 10px 4px;
        font-size: 0.78rem;
        font-weight: 600;
        letter-spacing: 0.04em;
        border: none;
        background: transparent;
        color: var(--secondary-text-color, #94a3b8);
        cursor: pointer;
        transition: background 0.15s, color 0.15s;
        text-transform: uppercase;
      }
      .tab-btn.active {
        color: var(--primary-color, #3b82f6);
        border-bottom: 2px solid var(--primary-color, #3b82f6);
        background: rgba(59,130,246,0.06);
      }

      .tab-content { padding: 12px 4px; display: flex; flex-direction: column; gap: 4px; }

      .section { margin-bottom: 8px; }
      .section-title {
        font-size: 0.8rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--primary-color, #3b82f6);
        margin-bottom: 8px;
        padding-bottom: 4px;
        border-bottom: 1px solid rgba(59,130,246,0.2);
      }
      .hint { font-size: 0.73rem; color: var(--secondary-text-color, #94a3b8); margin: 0 0 8px; }

      .ed-label {
        display: block;
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--secondary-text-color, #64748b);
        margin-bottom: 3px;
        margin-top: 6px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .ed-input {
        width: 100%;
        padding: 7px 10px;
        font-size: 0.82rem;
        border: 1px solid var(--divider-color, #334155);
        border-radius: 6px;
        background: var(--secondary-background-color, #0f172a);
        color: var(--primary-text-color, #e2e8f0);
        box-sizing: border-box;
        transition: border-color 0.15s;
      }
      .ed-input:focus { outline: none; border-color: var(--primary-color, #3b82f6); }
      .ed-input.sm { width: auto; flex: 1; min-width: 60px; }

      .ed-select {
        width: 100%;
        padding: 7px 10px;
        font-size: 0.82rem;
        border: 1px solid var(--divider-color, #334155);
        border-radius: 6px;
        background: var(--secondary-background-color, #0f172a);
        color: var(--primary-text-color, #e2e8f0);
        box-sizing: border-box;
        cursor: pointer;
      }

      .toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; }
      .toggle-wrap { position: relative; display: inline-block; width: 40px; height: 22px; }
      .toggle-wrap input { display: none; }
      .toggle-slider {
        position: absolute; inset: 0;
        background: #334155; border-radius: 11px;
        cursor: pointer; transition: background 0.2s;
      }
      .toggle-slider::before {
        content: ""; position: absolute;
        left: 3px; top: 3px;
        width: 16px; height: 16px;
        background: white; border-radius: 50%;
        transition: transform 0.2s;
      }
      .toggle-wrap input:checked + .toggle-slider { background: var(--primary-color, #3b82f6); }
      .toggle-wrap input:checked + .toggle-slider::before { transform: translateX(18px); }

      .color-row { display: flex; align-items: center; justify-content: space-between; padding: 4px 0; }
      .color-picker { width: 40px; height: 28px; border: none; padding: 0; cursor: pointer; background: none; border-radius: 4px; }
      .color-picker.sm { width: 28px; height: 24px; }

      .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }

      .list-item {
        background: var(--secondary-background-color, rgba(0,0,0,0.2));
        border: 1px solid var(--divider-color, #334155);
        border-radius: 8px;
        padding: 10px;
        margin-bottom: 8px;
      }
      .list-item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
      .list-item-num { font-size: 0.75rem; font-weight: 700; color: var(--primary-color, #3b82f6); text-transform: uppercase; letter-spacing: 0.06em; }

      .state-map-title { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--secondary-text-color, #64748b); margin: 8px 0 4px; }
      .state-map-row { display: flex; align-items: center; gap: 4px; margin-bottom: 4px; }
      .sm-arrow { color: var(--secondary-text-color, #64748b); font-size: 0.8rem; flex-shrink: 0; }

      .field-row { margin-bottom: 4px; }

      .btn-add {
        width: 100%;
        padding: 8px;
        font-size: 0.78rem;
        font-weight: 600;
        border: 1px dashed var(--primary-color, #3b82f6);
        border-radius: 6px;
        background: transparent;
        color: var(--primary-color, #3b82f6);
        cursor: pointer;
        transition: background 0.15s;
      }
      .btn-add:hover { background: rgba(59,130,246,0.08); }
      .btn-add.sm { width: auto; padding: 4px 8px; font-size: 0.7rem; margin-top: 4px; }

      .btn-remove {
        padding: 3px 8px;
        font-size: 0.7rem;
        border: 1px solid #ef4444;
        border-radius: 4px;
        background: transparent;
        color: #ef4444;
        cursor: pointer;
      }
      .btn-remove:hover { background: rgba(239,68,68,0.1); }
      .btn-remove-sm {
        padding: 2px 5px;
        font-size: 0.68rem;
        border: 1px solid #ef4444;
        border-radius: 4px;
        background: transparent;
        color: #ef4444;
        cursor: pointer;
        flex-shrink: 0;
      }
    `;
  }
}

// ─────────────────────────────────────────────
// REGISTER
// ─────────────────────────────────────────────
customElements.define("room-card", RoomCard);
customElements.define("room-card-editor", RoomCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "room-card",
  name: "Room Card",
  description: "Universal configurable room card with climate gauges, binary sensors, switches, and optional camera.",
  preview: true,
  documentationURL: "https://github.com/robman2026/Adaptive-Room-Card",
});
