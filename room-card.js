/**
 * room-card.js
 * Universal Room Card for Home Assistant
 * GitHub: https://github.com/robman2026/Adaptive-Room-Card
 * Version: 1.1.0
 *
 * Changelog v1.1.0:
 *  - Climate tiles: horizontal layout (gauge left, value+label right) with colored glow on arc
 *  - Motion/presence sensors: dynamic pulsating SVG icon when active (non-configurable)
 *  - Binary sensors: configurable column layout (1-4 cols) like switches
 *  - Editor: searchable entity dropdowns with live filter input
 */

const LitElement = Object.getPrototypeOf(customElements.get("ha-panel-lovelace"));
const html = LitElement.prototype.html;
const css = LitElement.prototype.css;

// Motion sensor detection
const MOTION_DEVICE_CLASSES = ["motion", "occupancy", "presence", "moving"];
const MOTION_ACTIVE_STATES  = ["on", "detected", "occupied", "home", "moving"];

function _isMotionSensor(entityId, deviceClass) {
  if (!entityId) return false;
  if (MOTION_DEVICE_CLASSES.includes(deviceClass)) return true;
  const id = entityId.toLowerCase();
  return id.includes("motion") || id.includes("presence") ||
         id.includes("occupancy") || id.includes("movement") ||
         id.includes("miscare");
}

// ─────────────────────────────────────────────
// CARD ELEMENT
// ─────────────────────────────────────────────
class RoomCard extends LitElement {
  static get properties() {
    return {
      _hass:   {},
      _config: {},
      _ticks:  { state: true },
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
      sensor_columns: 1,
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
      sensor_columns: 1,
      switches: [],
      camera_entity: "",
      show_camera: false,
      ...config,
    };
  }

  connectedCallback() {
    super.connectedCallback();
    this._tickInterval = setInterval(() => { this._ticks = Date.now(); }, 1000);
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

  _agoStr(lastChanged) {
    if (!lastChanged) return "";
    const diffMs   = Date.now() - new Date(lastChanged).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1)    return "just now";
    if (diffMins < 60)   return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
  }

  // ── gauge arc (glow via CSS filter on wrapper) ──

  _gaugeArc(value, min, max, color, sz) {
    const size  = sz || 68;
    const cx    = size / 2;
    const cy    = size / 2;
    const r     = size / 2 - 6;
    const pct   = Math.min(1, Math.max(0, (parseFloat(value) - min) / (max - min)));
    const circ  = 2 * Math.PI * r;
    const dash  = pct * circ * 0.75;
    const gap   = circ - dash;
    const rot   = 135;
    return html`
      <svg viewBox="0 0 ${size} ${size}" class="gauge-svg" style="width:${size}px;height:${size}px;overflow:visible">
        <circle cx="${cx}" cy="${cy}" r="${r}"
          fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="4.5"
          stroke-dasharray="${circ * 0.75} ${circ * 0.25}"
          stroke-linecap="round"
          transform="rotate(${rot} ${cx} ${cy})" />
        <circle cx="${cx}" cy="${cy}" r="${r}"
          fill="none" stroke="${color}" stroke-width="4.5"
          stroke-dasharray="${dash} ${gap + circ * 0.25}"
          stroke-linecap="round"
          transform="rotate(${rot} ${cx} ${cy})" />
      </svg>
    `;
  }

  // ── climate tile — horizontal layout ─────────

  _renderClimateSensor(sensor) {
    const entityId = sensor.entity;
    const stateObj = this._stateOf(entityId);
    const rawVal   = stateObj ? stateObj.state : "—";
    const numVal   = parseFloat(rawVal);
    const unit     = sensor.unit  || this._unit(entityId);
    const label    = sensor.label || (stateObj ? this._friendlyName(entityId) : entityId);
    const min      = sensor.min  !== undefined ? sensor.min  : 0;
    const max      = sensor.max  !== undefined ? sensor.max  : 100;
    const color    = sensor.color || "#22c55e";
    const icon     = sensor.icon  || "mdi:thermometer";
    const gaugeSize = 68;
    const displayVal = isNaN(numVal) ? (rawVal || "—") : numVal.toFixed(1);

    return html`
      <div class="climate-tile">
        <div class="climate-gauge-wrap" style="--gc:${color}">
          ${this._gaugeArc(numVal, min, max, color, gaugeSize)}
          <div class="climate-gauge-inner">
            <ha-icon icon="${icon}" style="color:${color};--mdc-icon-size:12px"></ha-icon>
            <span class="climate-gauge-val">${displayVal}</span>
          </div>
        </div>
        <div class="climate-text">
          <span class="climate-big-val">${displayVal}<span class="climate-big-unit">${unit}</span></span>
          <span class="climate-lbl">${label.toUpperCase()}</span>
        </div>
      </div>
    `;
  }

  // ── motion SVG icon — pulsates when active ────

  _motionIcon(isActive, color) {
    const c = isActive ? (color || "#f59e0b") : "rgba(255,255,255,0.38)";
    return html`
      <svg class="motion-svg ${isActive ? "motion-active" : ""}"
           viewBox="0 0 24 24" width="20" height="20" fill="none"
           style="flex-shrink:0;overflow:visible">
        <circle cx="13" cy="3.5" r="1.8" fill="${c}"/>
        <path d="M10 7.5 C9 8.5 8.5 10 9 11.5 L10.5 15 L8 20.5"
              stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M10.5 10 L13.5 12.5 L16 10.5"
              stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M10.5 15 L8.5 20.5 M10.5 15 L13.5 19.5"
              stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>
      </svg>
    `;
  }

  // ── binary sensor ─────────────────────────────

  _renderBinarySensor(sensor) {
    const entityId    = sensor.entity;
    const stateObj    = this._stateOf(entityId);
    const state       = stateObj ? stateObj.state : "unknown";
    const label       = sensor.label || (stateObj ? this._friendlyName(entityId) : entityId);
    const deviceClass = this._attr(entityId, "device_class") || "";
    const ago         = this._agoStr(stateObj ? stateObj.last_changed : null);

    const defaultMap = {
      on:       { label: "On",       color: "#f59e0b" },
      off:      { label: "Off",      color: "#6b7280" },
      open:     { label: "Open",     color: "#f59e0b" },
      closed:   { label: "Closed",   color: "#6b7280" },
      detected: { label: "Detected", color: "#ef4444" },
      clear:    { label: "Clear",    color: "#22c55e" },
      home:     { label: "Home",     color: "#22c55e" },
      away:     { label: "Away",     color: "#f59e0b" },
    };
    const merged   = { ...defaultMap, ...(sensor.state_map || {}) };
    const display  = merged[state.toLowerCase()] || { label: state, color: "#6b7280" };
    const isMotion = _isMotionSensor(entityId, deviceClass);
    const isActive = MOTION_ACTIVE_STATES.includes(state.toLowerCase());
    const snCols   = Math.max(1, Math.min(4, parseInt(this._config.sensor_columns) || 1));

    // ── Grid / tile mode (cols > 1) ──────────────
    if (snCols > 1) {
      return html`
        <div class="sensor-tile ${isMotion && isActive ? "sensor-tile-active" : ""}">
          <div class="sensor-tile-icon">
            ${isMotion
              ? this._motionIcon(isActive, display.color)
              : html`<ha-icon icon="${sensor.icon || "mdi:toggle-switch"}"
                              style="color:${display.color};--mdc-icon-size:20px"></ha-icon>`}
          </div>
          <span class="sensor-tile-name">${label}</span>
          <span class="sensor-tile-state" style="color:${display.color}">${display.label}</span>
          ${ago ? html`<span class="sensor-tile-ago">${ago}</span>` : ""}
        </div>
      `;
    }

    // ── Full-width row mode ──────────────────────
    return html`
      <div class="sensor-row ${isMotion && isActive ? "sensor-row-active" : ""}">
        <div class="sensor-icon-wrap">
          ${isMotion
            ? this._motionIcon(isActive, display.color)
            : html`<ha-icon icon="${sensor.icon || "mdi:toggle-switch"}"
                            class="sensor-icon"
                            style="color:rgba(255,255,255,0.45)"></ha-icon>`}
        </div>
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
    const entityId  = sw.entity;
    const stateObj  = this._stateOf(entityId);
    const state     = stateObj ? stateObj.state : "off";
    const isOn      = state === "on";
    const label     = sw.label || (stateObj ? this._friendlyName(entityId) : entityId);
    const icon      = sw.icon  || (isOn ? "mdi:lightbulb" : "mdi:lightbulb-off");
    const color     = sw.color || (isOn ? "#f59e0b" : "#6b7280");
    const ago       = this._agoStr(stateObj ? stateObj.last_changed : null);

    return html`
      <div class="switch-tile ${isOn ? "switch-on" : ""}"
           @click="${() => this._toggleSwitch(entityId, state)}"
           style="${isOn ? `--sw-accent:${color}` : ""}">
        <ha-icon icon="${icon}"
                 style="color:${isOn ? color : "rgba(255,255,255,0.35)"};--mdc-icon-size:22px"></ha-icon>
        <span class="switch-label">${label}</span>
        <span class="switch-state">${state.toUpperCase()}</span>
        ${ago ? html`<span class="switch-ago">${ago}</span>` : ""}
      </div>
    `;
  }

  _toggleSwitch(entityId, currentState) {
    if (!this._hass || !entityId) return;
    const domain  = entityId.split(".")[0];
    const service = currentState === "on" ? "turn_off" : "turn_on";
    if (!["switch", "light", "input_boolean", "fan", "automation", "script"].includes(domain)) return;
    this._hass.callService(domain, service, { entity_id: entityId });
  }

  // ── camera ───────────────────────────────────

  _renderCamera() {
    const entityId   = this._config.camera_entity;
    if (!entityId || !this._config.show_camera) return "";
    const stateObj   = this._stateOf(entityId);
    const pictureUrl = stateObj ? stateObj.attributes.entity_picture : null;
    const label      = stateObj ? this._friendlyName(entityId) : entityId;

    if (!pictureUrl) {
      return html`
        <div class="camera-placeholder">
          <ha-icon icon="mdi:camera-off"></ha-icon>
          <span>No feed</span>
        </div>`;
    }
    return html`
      <div class="camera-container">
        <img class="camera-img"
             src="${this._hass.hassUrl(pictureUrl)}&t=${Date.now()}"
             alt="${label}" />
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

    const cfg     = this._config;
    const { date, time } = this._now();
    const online  = this._isOnline(cfg.status_entity);
    const switches = cfg.switches || [];
    const binary   = cfg.binary_sensors || [];
    const swCols   = switches.length === 1 ? 1
                   : switches.length === 2 ? 2
                   : switches.length === 3 ? 3
                   : switches.length <= 4 ? 2 : 3;
    const snCols   = Math.max(1, Math.min(4, parseInt(cfg.sensor_columns) || 1));

    return html`
      <ha-card>
        <div class="card-root">

          <div class="header">
            <div class="header-left">
              ${cfg.room_icon
                ? html`<ha-icon icon="${cfg.room_icon}" class="room-icon"></ha-icon>`
                : ""}
              <span class="room-name">${(cfg.room_name || "Room").toUpperCase()}</span>
            </div>
            <div class="header-right">
              ${cfg.show_datetime ? html`
                <div class="datetime">
                  <span class="hdr-date">${date}</span>
                  <span class="hdr-time">${time}</span>
                </div>` : ""}
              ${cfg.show_status_dot ? html`
                <div class="status-dot ${online ? "dot-online" : "dot-offline"}"
                     title="${online ? "Online" : "Offline"}"></div>` : ""}
            </div>
          </div>

          ${(cfg.climate_sensors || []).length > 0 ? html`
            <div class="climate-row">
              ${cfg.climate_sensors.map((s) => this._renderClimateSensor(s))}
            </div>` : ""}

          ${cfg.show_camera && cfg.camera_entity ? this._renderCamera() : ""}

          ${binary.length > 0 ? html`
            <div class="${snCols > 1 ? "sensors-grid" : "sensors-section"}"
                 style="${snCols > 1 ? `--sn-cols:${snCols}` : ""}">
              ${binary.map((s) => this._renderBinarySensor(s))}
            </div>` : ""}

          ${switches.length > 0 ? html`
            <div class="switches-grid" style="--sw-cols:${swCols}">
              ${switches.map((s) => this._renderSwitch(s))}
            </div>` : ""}

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
        border-radius: 16px; overflow: hidden;
        font-family: 'Roboto', 'Noto Sans', sans-serif;
        color: #e2e8f0;
      }
      .card-root { padding: 16px; display: flex; flex-direction: column; gap: 12px; }

      /* HEADER */
      .header { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
      .header-left { display: flex; align-items: center; gap: 8px; }
      .room-icon { --mdc-icon-size: 20px; color: rgba(255,255,255,0.5); }
      .room-name { font-size: 1rem; font-weight: 700; letter-spacing: 0.12em; color: #e2e8f0; }
      .header-right { display: flex; align-items: center; gap: 10px; }
      .datetime { display: flex; flex-direction: column; align-items: flex-end; }
      .hdr-date { font-size: 0.72rem; color: rgba(255,255,255,0.5); font-weight: 500; }
      .hdr-time { font-size: 0.8rem; color: rgba(255,255,255,0.75); font-weight: 600; font-variant-numeric: tabular-nums; }
      .status-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; margin-top: 2px; }
      .dot-online  { background: #22c55e; box-shadow: 0 0 6px #22c55e; }
      .dot-offline { background: #6b7280; }

      /* CLIMATE — horizontal layout with glow */
      .climate-row { display: flex; flex-direction: column; gap: 8px; }
      .climate-tile {
        display: flex; flex-direction: row; align-items: center; gap: 16px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.07);
        border-radius: 12px; padding: 10px 16px;
      }
      .climate-gauge-wrap {
        position: relative; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
        /* colored glow behind entire gauge */
        filter: drop-shadow(0 0 7px var(--gc, #22c55e));
      }
      .gauge-svg { display: block; overflow: visible; }
      .climate-gauge-inner {
        position: absolute; inset: 0;
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;
      }
      .climate-gauge-val { font-size: 0.72rem; font-weight: 700; color: #e2e8f0; line-height: 1; }
      .climate-text { display: flex; flex-direction: column; justify-content: center; gap: 3px; }
      .climate-big-val { font-size: 1.4rem; font-weight: 700; color: #e2e8f0; line-height: 1; }
      .climate-big-unit { font-size: 0.75rem; font-weight: 500; color: rgba(255,255,255,0.5); margin-left: 2px; }
      .climate-lbl { font-size: 0.63rem; letter-spacing: 0.1em; color: rgba(255,255,255,0.36); font-weight: 600; }

      /* CAMERA */
      .camera-container { position: relative; border-radius: 10px; overflow: hidden; background: #0a0f1e; }
      .camera-img { width: 100%; display: block; border-radius: 10px; }
      .camera-overlay {
        position: absolute; bottom: 0; left: 0; right: 0; padding: 6px 10px;
        background: linear-gradient(transparent, rgba(0,0,0,0.7));
        display: flex; justify-content: space-between; align-items: flex-end;
      }
      .camera-ts    { font-size: 0.65rem; color: rgba(255,255,255,0.7); }
      .camera-label { font-size: 0.65rem; color: rgba(255,255,255,0.5); letter-spacing: 0.08em; }
      .camera-placeholder {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 6px; padding: 24px;
        background: rgba(255,255,255,0.03); border: 1px dashed rgba(255,255,255,0.1);
        border-radius: 10px; color: rgba(255,255,255,0.3); font-size: 0.75rem;
      }

      /* BINARY SENSORS — row mode */
      .sensors-section { display: flex; flex-direction: column; gap: 4px; }
      .sensor-row {
        display: flex; align-items: center; gap: 10px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 10px; padding: 9px 12px;
        transition: background 0.2s;
      }
      .sensor-row-active { background: rgba(255,255,255,0.07); }
      .sensor-icon-wrap { flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: 22px; }
      .sensor-icon { --mdc-icon-size: 18px; color: rgba(255,255,255,0.45); }
      .sensor-info { flex: 1; display: flex; flex-direction: column; }
      .sensor-name { font-size: 0.82rem; font-weight: 500; color: rgba(255,255,255,0.85); }
      .sensor-ago  { font-size: 0.67rem; color: rgba(255,255,255,0.32); }
      .sensor-state { font-size: 0.82rem; font-weight: 600; flex-shrink: 0; }

      /* BINARY SENSORS — grid/tile mode */
      .sensors-grid {
        display: grid;
        grid-template-columns: repeat(var(--sn-cols, 2), 1fr);
        gap: 6px;
      }
      .sensor-tile {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 4px; padding: 10px 6px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 10px; text-align: center;
        transition: background 0.2s;
      }
      .sensor-tile-active { background: rgba(255,255,255,0.07); border-color: rgba(255,255,255,0.1); }
      .sensor-tile-icon { display: flex; align-items: center; justify-content: center; }
      .sensor-tile-name  { font-size: 0.72rem; font-weight: 500; color: rgba(255,255,255,0.8); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; }
      .sensor-tile-state { font-size: 0.72rem; font-weight: 700; }
      .sensor-tile-ago   { font-size: 0.6rem; color: rgba(255,255,255,0.28); }

      /* MOTION ICON — pulse animation */
      .motion-svg { transition: opacity 0.3s; }
      .motion-active { animation: motion-pulse 1.4s ease-in-out infinite; }
      @keyframes motion-pulse {
        0%   { opacity: 1;    transform: scale(1);    }
        50%  { opacity: 0.5;  transform: scale(1.15); }
        100% { opacity: 1;    transform: scale(1);    }
      }

      /* SWITCHES */
      .switches-grid { display: grid; grid-template-columns: repeat(var(--sw-cols, 2), 1fr); gap: 8px; }
      .switch-tile {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 4px; padding: 12px 8px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 12px; cursor: pointer;
        transition: background 0.2s, border-color 0.2s, transform 0.1s;
        user-select: none; -webkit-tap-highlight-color: transparent;
      }
      .switch-tile:active { transform: scale(0.96); }
      .switch-tile.switch-on {
        background: rgba(255,255,255,0.08);
        border-color: rgba(255,255,255,0.12);
        box-shadow: 0 0 12px rgba(245,158,11,0.08);
      }
      .switch-label { font-size: 0.78rem; font-weight: 500; color: rgba(255,255,255,0.8); text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; }
      .switch-state { font-size: 0.62rem; letter-spacing: 0.08em; color: rgba(255,255,255,0.35); font-weight: 600; }
      .switch-ago   { font-size: 0.6rem; color: rgba(255,255,255,0.25); }
    `;
  }
}

// ─────────────────────────────────────────────
// EDITOR ELEMENT
// ─────────────────────────────────────────────
class RoomCardEditor extends LitElement {
  static get properties() {
    return {
      hass:       {},
      _config:    { state: true },
      _activeTab: { state: true },
      _search:    { state: true },
    };
  }

  constructor() {
    super();
    this._activeTab = "general";
    this._search    = {};
  }

  setConfig(config) {
    this._config = JSON.parse(JSON.stringify(config));
    this._search = {};
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

  _entitiesByDomain(...domains) {
    if (!this.hass) return [];
    return Object.keys(this.hass.states)
      .filter((id) => !domains.length || domains.some((d) => id.startsWith(d + ".")))
      .sort();
  }

  _allEntities() {
    if (!this.hass) return [];
    return Object.keys(this.hass.states).sort();
  }

  _addItem(listKey, defaults) {
    this._set(listKey, [...(this._config[listKey] || []), defaults]);
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

  // ── Searchable entity selector ────────────────

  _renderEntitySearch(searchKey, currentValue, onChange, domains, placeholder) {
    const base     = domains && domains.length ? this._entitiesByDomain(...domains) : this._allEntities();
    const query    = (this._search[searchKey] || "").toLowerCase().trim();
    const filtered = query ? base.filter((e) => e.toLowerCase().includes(query)) : base;

    const label = (eid) => {
      if (!this.hass) return eid;
      const s = this.hass.states[eid];
      const fn = s && s.attributes.friendly_name;
      return fn ? `${fn}  (${eid})` : eid;
    };

    return html`
      <div class="search-select-wrap">
        <input class="ed-input search-input" type="text"
          placeholder="Search entities..."
          .value="${this._search[searchKey] || ""}"
          @input="${(e) => { this._search = { ...this._search, [searchKey]: e.target.value }; }}"
        />
        <select class="ed-select"
          .value="${currentValue || ""}"
          @change="${(e) => {
            onChange(e.target.value);
            this._search = { ...this._search, [searchKey]: "" };
          }}">
          <option value="">${placeholder || "— select entity —"}</option>
          ${filtered.slice(0, 200).map((eid) => html`
            <option value="${eid}" ?selected="${eid === currentValue}">${label(eid)}</option>
          `)}
          ${filtered.length > 200 ? html`<option disabled>…${filtered.length - 200} more — refine search</option>` : ""}
        </select>
        ${currentValue ? html`<div class="selected-badge">${currentValue}</div>` : ""}
      </div>
    `;
  }

  // ── Basic controls ────────────────────────────

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
          <input type="checkbox" ?checked="${value}"
            @change="${(e) => onChange(e.target.checked)}" />
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

  _renderNumberSelect(label, value, options, onChange) {
    return html`
      <div class="toggle-row">
        <span class="ed-label">${label}</span>
        <select class="ed-select inline-select"
          .value="${String(value || 1)}"
          @change="${(e) => onChange(parseInt(e.target.value))}">
          ${options.map((o) => html`<option value="${o}" ?selected="${o === (value || 1)}">${o}</option>`)}
        </select>
      </div>
    `;
  }

  // ── TAB: General ─────────────────────────────

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
          ${this._renderEntitySearch("status_entity", cfg.status_entity,
              (v) => this._set("status_entity", v), [], "— auto online if empty —")}
        ` : ""}
      </div>
      <div class="section">
        <div class="section-title">Camera</div>
        ${this._renderToggle("Show Camera Feed", cfg.show_camera, (v) => this._set("show_camera", v))}
        ${cfg.show_camera ? html`
          <label class="ed-label">Camera Entity</label>
          ${this._renderEntitySearch("camera_entity", cfg.camera_entity,
              (v) => this._set("camera_entity", v), ["camera"], "— select camera —")}
        ` : ""}
      </div>
    `;
  }

  // ── TAB: Climate ─────────────────────────────

  _renderTabClimate() {
    const items = this._config.climate_sensors || [];
    return html`
      <div class="section">
        <div class="section-title">Climate / Environment Sensors</div>
        <p class="hint">Temperature, humidity, CO2, etc. Each shown as a horizontal tile: glowing arc gauge on the left, large value on the right.</p>
        ${items.map((s, i) => html`
          <div class="list-item">
            <div class="list-item-header">
              <span class="list-item-num">Sensor ${i + 1}</span>
              <button class="btn-remove" @click="${() => this._removeItem("climate_sensors", i)}">Remove</button>
            </div>
            <label class="ed-label">Entity</label>
            ${this._renderEntitySearch(`climate_${i}_entity`, s.entity,
                (v) => this._updateItem("climate_sensors", i, "entity", v),
                ["sensor"], "— select sensor —")}
            ${this._renderTextInput("Display Label", s.label,
                (v) => this._updateItem("climate_sensors", i, "label", v), "e.g. Temperature")}
            ${this._renderTextInput("Unit Override", s.unit,
                (v) => this._updateItem("climate_sensors", i, "unit", v), "e.g. C")}
            ${this._renderTextInput("Icon (mdi:...)", s.icon,
                (v) => this._updateItem("climate_sensors", i, "icon", v), "e.g. mdi:thermometer")}
            <div class="two-col">
              ${this._renderTextInput("Min Value", s.min !== undefined ? String(s.min) : "",
                  (v) => this._updateItem("climate_sensors", i, "min", parseFloat(v) || 0), "0")}
              ${this._renderTextInput("Max Value", s.max !== undefined ? String(s.max) : "",
                  (v) => this._updateItem("climate_sensors", i, "max", parseFloat(v) || 100), "100")}
            </div>
            ${this._renderColorInput("Gauge Color + Glow", s.color,
                (v) => this._updateItem("climate_sensors", i, "color", v))}
          </div>
        `)}
        <button class="btn-add"
          @click="${() => this._addItem("climate_sensors", {
            entity: "", label: "", unit: "", icon: "mdi:thermometer", min: 0, max: 50, color: "#22c55e"
          })}">+ Add Climate Sensor</button>
      </div>
    `;
  }

  // ── TAB: Sensors ─────────────────────────────

  _renderTabSensors() {
    const items  = this._config.binary_sensors || [];
    const snCols = this._config.sensor_columns || 1;
    return html`
      <div class="section">
        <div class="section-title">Layout</div>
        ${this._renderNumberSelect("Sensor Columns", snCols, [1, 2, 3, 4],
            (v) => this._set("sensor_columns", v))}
        <p class="hint">${snCols === 1
          ? "Row mode: full-width rows with name, timestamp, and state."
          : `Grid mode: compact ${snCols}-column tiles.`}</p>
      </div>
      <div class="section">
        <div class="section-title">Binary / State Sensors</div>
        <p class="hint">Motion and presence entities are auto-detected and show a pulsating walk icon when active. All other sensors use the configured icon.</p>
        ${items.map((s, i) => {
          const stateMap     = s.state_map || {};
          const stateEntries = Object.entries(stateMap);
          return html`
            <div class="list-item">
              <div class="list-item-header">
                <span class="list-item-num">Sensor ${i + 1}</span>
                <button class="btn-remove" @click="${() => this._removeItem("binary_sensors", i)}">Remove</button>
              </div>
              <label class="ed-label">Entity</label>
              ${this._renderEntitySearch(`sensor_${i}_entity`, s.entity,
                  (v) => this._updateItem("binary_sensors", i, "entity", v),
                  ["binary_sensor", "sensor", "input_boolean", "device_tracker"],
                  "— select sensor —")}
              ${this._renderTextInput("Display Label", s.label,
                  (v) => this._updateItem("binary_sensors", i, "label", v), "e.g. Window Left")}
              ${this._renderTextInput("Icon (mdi:...) — not used for motion sensors", s.icon,
                  (v) => this._updateItem("binary_sensors", i, "icon", v), "e.g. mdi:window-open")}
              <div class="state-map-title">State Display Map</div>
              ${stateEntries.map(([state, disp]) => html`
                <div class="state-map-row">
                  <input class="ed-input sm" type="text" placeholder="state" .value="${state}"
                    @input="${(e) => {
                      const nm = { ...stateMap };
                      delete nm[state];
                      nm[e.target.value] = disp;
                      this._updateItem("binary_sensors", i, "state_map", nm);
                    }}" />
                  <span class="sm-arrow">to</span>
                  <input class="ed-input sm" type="text" placeholder="label" .value="${disp.label || ""}"
                    @input="${(e) => {
                      this._updateItem("binary_sensors", i, "state_map",
                        { ...stateMap, [state]: { ...disp, label: e.target.value } });
                    }}" />
                  <input type="color" class="color-picker sm" .value="${disp.color || "#6b7280"}"
                    @input="${(e) => {
                      this._updateItem("binary_sensors", i, "state_map",
                        { ...stateMap, [state]: { ...disp, color: e.target.value } });
                    }}" />
                  <button class="btn-remove-sm"
                    @click="${() => {
                      const nm = { ...stateMap }; delete nm[state];
                      this._updateItem("binary_sensors", i, "state_map", nm);
                    }}">x</button>
                </div>
              `)}
              <button class="btn-add sm" @click="${() => {
                this._updateItem("binary_sensors", i, "state_map",
                  { ...stateMap, new_state: { label: "Label", color: "#6b7280" } });
              }}">+ Add State</button>
            </div>
          `;
        })}
        <button class="btn-add"
          @click="${() => this._addItem("binary_sensors", {
            entity: "", label: "", icon: "mdi:toggle-switch",
            state_map: {
              on:  { label: "On",  color: "#f59e0b" },
              off: { label: "Off", color: "#6b7280" }
            }
          })}">+ Add Sensor</button>
      </div>
    `;
  }

  // ── TAB: Switches ─────────────────────────────

  _renderTabSwitches() {
    const items = this._config.switches || [];
    return html`
      <div class="section">
        <div class="section-title">Switches / Lights / Controls</div>
        <p class="hint">Tappable tiles — auto-fits 1 to 3 columns based on count. Tap the card to toggle.</p>
        ${items.map((s, i) => html`
          <div class="list-item">
            <div class="list-item-header">
              <span class="list-item-num">Switch ${i + 1}</span>
              <button class="btn-remove" @click="${() => this._removeItem("switches", i)}">Remove</button>
            </div>
            <label class="ed-label">Entity</label>
            ${this._renderEntitySearch(`switch_${i}_entity`, s.entity,
                (v) => this._updateItem("switches", i, "entity", v),
                ["switch", "light", "input_boolean", "fan", "automation"],
                "— select entity —")}
            ${this._renderTextInput("Display Label", s.label,
                (v) => this._updateItem("switches", i, "label", v), "e.g. Ceiling Light")}
            ${this._renderTextInput("Icon (mdi:...)", s.icon,
                (v) => this._updateItem("switches", i, "icon", v), "e.g. mdi:lightbulb")}
            ${this._renderColorInput("Active Color", s.color,
                (v) => this._updateItem("switches", i, "color", v))}
          </div>
        `)}
        <button class="btn-add"
          @click="${() => this._addItem("switches", {
            entity: "", label: "", icon: "mdi:lightbulb", color: "#f59e0b"
          })}">+ Add Switch / Light</button>
      </div>
    `;
  }

  // ── Render ────────────────────────────────────

  render() {
    if (!this._config) return html``;
    const tabs = [
      { id: "general",  label: "General"  },
      { id: "climate",  label: "Climate"  },
      { id: "sensors",  label: "Sensors"  },
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
      .editor-root { display: flex; flex-direction: column; }

      .tab-bar {
        display: flex; border-bottom: 1px solid rgba(0,0,0,0.15);
        background: var(--card-background-color, #1e293b);
        border-radius: 8px 8px 0 0; overflow: hidden;
      }
      .tab-btn {
        flex: 1; padding: 10px 4px; font-size: 0.78rem; font-weight: 600;
        letter-spacing: 0.04em; border: none; background: transparent;
        color: var(--secondary-text-color, #94a3b8);
        cursor: pointer; transition: background 0.15s, color 0.15s; text-transform: uppercase;
      }
      .tab-btn.active {
        color: var(--primary-color, #3b82f6);
        border-bottom: 2px solid var(--primary-color, #3b82f6);
        background: rgba(59,130,246,0.06);
      }

      .tab-content { padding: 12px 4px; display: flex; flex-direction: column; gap: 4px; }

      .section { margin-bottom: 10px; }
      .section-title {
        font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
        color: var(--primary-color, #3b82f6); margin-bottom: 8px; padding-bottom: 4px;
        border-bottom: 1px solid rgba(59,130,246,0.2);
      }
      .hint { font-size: 0.73rem; color: var(--secondary-text-color, #94a3b8); margin: 0 0 8px; }

      .ed-label {
        display: block; font-size: 0.72rem; font-weight: 600;
        color: var(--secondary-text-color, #64748b);
        margin-bottom: 3px; margin-top: 6px;
        text-transform: uppercase; letter-spacing: 0.05em;
      }
      .ed-input {
        width: 100%; padding: 7px 10px; font-size: 0.82rem;
        border: 1px solid var(--divider-color, #334155); border-radius: 6px;
        background: var(--secondary-background-color, #0f172a);
        color: var(--primary-text-color, #e2e8f0);
        box-sizing: border-box; transition: border-color 0.15s;
      }
      .ed-input:focus { outline: none; border-color: var(--primary-color, #3b82f6); }
      .ed-input.sm { width: auto; flex: 1; min-width: 56px; }

      .ed-select {
        width: 100%; padding: 7px 10px; font-size: 0.82rem;
        border: 1px solid var(--divider-color, #334155); border-radius: 6px;
        background: var(--secondary-background-color, #0f172a);
        color: var(--primary-text-color, #e2e8f0);
        box-sizing: border-box; cursor: pointer; margin-top: 4px;
      }
      .inline-select { width: auto; min-width: 64px; padding: 4px 8px; margin-top: 0; }

      /* Searchable entity field */
      .search-select-wrap { display: flex; flex-direction: column; gap: 4px; margin-bottom: 4px; }
      .search-input { margin-bottom: 0; font-size: 0.8rem; }
      .selected-badge {
        font-size: 0.67rem; color: var(--primary-color, #3b82f6);
        background: rgba(59,130,246,0.1); border-radius: 4px; padding: 2px 6px;
        word-break: break-all;
      }

      .toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; gap: 8px; }
      .toggle-wrap { position: relative; display: inline-block; width: 40px; height: 22px; flex-shrink: 0; }
      .toggle-wrap input { display: none; }
      .toggle-slider {
        position: absolute; inset: 0; background: #334155; border-radius: 11px;
        cursor: pointer; transition: background 0.2s;
      }
      .toggle-slider::before {
        content: ""; position: absolute; left: 3px; top: 3px;
        width: 16px; height: 16px; background: white; border-radius: 50%;
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
        border-radius: 8px; padding: 10px; margin-bottom: 8px;
      }
      .list-item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
      .list-item-num { font-size: 0.75rem; font-weight: 700; color: var(--primary-color, #3b82f6); text-transform: uppercase; letter-spacing: 0.06em; }

      .state-map-title { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--secondary-text-color, #64748b); margin: 8px 0 4px; }
      .state-map-row { display: flex; align-items: center; gap: 4px; margin-bottom: 4px; }
      .sm-arrow { color: var(--secondary-text-color, #64748b); font-size: 0.78rem; flex-shrink: 0; }

      .btn-add {
        width: 100%; padding: 8px; font-size: 0.78rem; font-weight: 600;
        border: 1px dashed var(--primary-color, #3b82f6); border-radius: 6px;
        background: transparent; color: var(--primary-color, #3b82f6);
        cursor: pointer; transition: background 0.15s;
      }
      .btn-add:hover { background: rgba(59,130,246,0.08); }
      .btn-add.sm { width: auto; padding: 4px 8px; font-size: 0.7rem; margin-top: 4px; }

      .btn-remove {
        padding: 3px 8px; font-size: 0.7rem;
        border: 1px solid #ef4444; border-radius: 4px;
        background: transparent; color: #ef4444; cursor: pointer;
      }
      .btn-remove:hover { background: rgba(239,68,68,0.1); }
      .btn-remove-sm {
        padding: 2px 5px; font-size: 0.68rem;
        border: 1px solid #ef4444; border-radius: 4px;
        background: transparent; color: #ef4444; cursor: pointer; flex-shrink: 0;
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
  description: "Universal configurable room card — climate gauges, binary sensors, switches, optional camera.",
  preview: true,
  documentationURL: "https://github.com/robman2026/Adaptive-Room-Card",
});
