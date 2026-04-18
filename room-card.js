/**
 * room-card.js
 * Universal Room Card for Home Assistant
 * GitHub: https://github.com/robman2026/room-card
 * Version: 1.3.1
 *
 * Changelog v1.3.1:
 *  - Climate tiles: exact Kids Room card layout & behavior
 *    - Side-by-side 2-column row (flex row, each tile flex:1)
 *    - SVG arc uses rotate(-90deg), full-circle stroke-dashoffset approach
 *    - Temperature: interpolated severity color (blue→green→yellow→red) with glow
 *    - Humidity: fixed #60a5fa blue glow — matches Kids Room card exactly
 *    - Value colored same as arc, large font. Label small uppercase.
 *    - No configurable color — fully automatic
 *  - Motion icon: exact Kids Room card behavior
 *    - 🚶 emoji in 32×32 rounded square, green bg when clear, red+glow+pulse when active
 *    - Row gets motion-active class, icon pulses, state text fades
 *  - Binary sensors: configurable 1–4 column layout
 *  - Editor: searchable entity dropdowns, no climate color picker
 */

const LitElement = Object.getPrototypeOf(customElements.get("ha-panel-lovelace"));
const html = LitElement.prototype.html;
const css  = LitElement.prototype.css;

// ── Motion sensor detection ───────────────────────────────────────────────────
const MOTION_DC     = ["motion", "occupancy", "presence", "moving"];
const MOTION_ACTIVE = ["on", "detected", "occupied", "home", "moving"];

function _isMotionSensor(entityId, deviceClass) {
  if (!entityId) return false;
  if (MOTION_DC.includes((deviceClass || "").toLowerCase())) return true;
  const id = entityId.toLowerCase();
  return id.includes("motion") || id.includes("presence") ||
         id.includes("occupancy") || id.includes("movement") ||
         id.includes("miscare");
}

// ── Temperature severity color — exact Kids Room card stops ──────────────────
// 0→#2391FF(blue), 19→#14FF6A(green), 27→#F8FF42(yellow), 35→#FF3502(red)
function _tempSeverityColor(value) {
  const stops = [
    { pos: 0,  r: 0x23, g: 0x91, b: 0xFF },
    { pos: 19, r: 0x14, g: 0xFF, b: 0x6A },
    { pos: 27, r: 0xF8, g: 0xFF, b: 0x42 },
    { pos: 35, r: 0xFF, g: 0x35, b: 0x02 },
    { pos: 50, r: 0xFF, g: 0x35, b: 0x02 },
  ];
  const clamped = Math.max(stops[0].pos, Math.min(stops[stops.length - 1].pos, value));
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (clamped >= stops[i].pos && clamped <= stops[i + 1].pos) {
      lo = stops[i]; hi = stops[i + 1]; break;
    }
  }
  const f = (clamped - lo.pos) / ((hi.pos - lo.pos) || 1);
  const r = Math.round(lo.r + f * (hi.r - lo.r));
  const g = Math.round(lo.g + f * (hi.g - lo.g));
  const b = Math.round(lo.b + f * (hi.b - lo.b));
  return `rgb(${r},${g},${b})`;
}

// Humidity severity color
// 0-30   = orange  (#f97316)
// 30-40  = yellow→green interpolated
// 40-60  = green   (#22c55e)
// 60-80  = green→red interpolated
// >80    = red     (#ef4444)
function _humSeverityColor(value) {
  const stops = [
    { pos: 0,  r: 0xF9, g: 0x73, b: 0x16 }, // orange
    { pos: 30, r: 0xF9, g: 0x73, b: 0x16 }, // orange
    { pos: 35, r: 0xEA, g: 0xB3, b: 0x08 }, // yellow
    { pos: 40, r: 0x22, g: 0xC5, b: 0x5E }, // green
    { pos: 60, r: 0x22, g: 0xC5, b: 0x5E }, // green
    { pos: 70, r: 0xEA, g: 0xB3, b: 0x08 }, // yellow
    { pos: 80, r: 0xEF, g: 0x44, b: 0x44 }, // red
    { pos: 100,r: 0xEF, g: 0x44, b: 0x44 }, // red
  ];
  const clamped = Math.max(stops[0].pos, Math.min(stops[stops.length - 1].pos, value));
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (clamped >= stops[i].pos && clamped <= stops[i + 1].pos) {
      lo = stops[i]; hi = stops[i + 1]; break;
    }
  }
  const f = (clamped - lo.pos) / ((hi.pos - lo.pos) || 1);
  const r = Math.round(lo.r + f * (hi.r - lo.r));
  const g = Math.round(lo.g + f * (hi.g - lo.g));
  const b = Math.round(lo.b + f * (hi.b - lo.b));
  return `rgb(${r},${g},${b})`;
}

// Arc dashoffset — same formula as Kids Room card (circumference = 2π×r)
function _arcOffset(value, min, max, circumference) {
  const pct = Math.min(1, Math.max(0, (value - min) / ((max - min) || 1)));
  return circumference - pct * circumference;
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

  // ── helpers ──────────────────────────────────────────────────────────────────

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
    return {
      date: d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }),
      time: d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    };
  }

  _agoStr(lastChanged) {
    if (!lastChanged) return "";
    const diff = Math.floor((Date.now() - new Date(lastChanged).getTime()) / 1000);
    if (diff < 60)    return `${diff}s ago`;
    if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  // ── Detect sensor type for auto-color ────────────────────────────────────────

  _sensorType(entityId, deviceClass) {
    const dc  = (deviceClass || "").toLowerCase();
    const eid = (entityId    || "").toLowerCase();
    // Check device_class first — most reliable. Then entity name.
    // Humidity checked before temperature so "temp_hum_..." entities
    // with device_class=humidity are not misidentified as temperature.
    if (dc === "humidity")                                return "humidity";
    if (dc === "temperature")                             return "temperature";
    if (dc === "carbon_dioxide" || dc === "volatile_organic_compounds") return "co2";
    if (dc === "pressure")                                return "pressure";
    if (dc === "illuminance")                             return "illuminance";
    // Fallback: entity name — humidity checked first for the same reason
    if (eid.includes("humid"))                            return "humidity";
    if (eid.includes("temp"))                             return "temperature";
    if (eid.includes("co2") || eid.includes("voc"))      return "co2";
    if (eid.includes("press"))                            return "pressure";
    if (eid.includes("lux"))                              return "illuminance";
    return "default";
  }

  // ── Climate sensor tile — exact Kids Room layout ──────────────────────────────
  // SVG: 52×52, r=20, circumference=125.6, rotate(-90deg) on the SVG element
  // Temperature: severity color interpolation + drop-shadow glow
  // Humidity: fixed #60a5fa + drop-shadow glow
  // Other sensors: use a sensible fixed color

  _renderClimateSensor(sensor) {
    const entityId    = sensor.entity;
    const stateObj    = this._stateOf(entityId);
    const rawVal      = stateObj ? stateObj.state : null;
    const numVal      = parseFloat(rawVal);
    const deviceClass = this._attr(entityId, "device_class") || "";
    const unit        = sensor.unit  || this._unit(entityId);
    const label       = sensor.label || (stateObj ? this._friendlyName(entityId) : entityId);
    const min         = sensor.min   !== undefined ? parseFloat(sensor.min) : 0;
    const max         = sensor.max   !== undefined ? parseFloat(sensor.max) : 100;

    const type = this._sensorType(entityId, deviceClass);

    // ── color & display value per type ──────────────────────────────────────
    let color, displayVal, gaugeUnit;
    const isNum = !isNaN(numVal) && rawVal !== null;

    if (type === "temperature") {
      color      = isNum ? _tempSeverityColor(numVal) : "#2391FF";
      displayVal = isNum ? numVal.toFixed(1) : "--";
      gaugeUnit  = unit || "°C";
    } else if (type === "humidity") {
      color      = isNum ? _humSeverityColor(numVal) : "#22c55e";
      displayVal = isNum ? numVal.toFixed(0) : "--";
      gaugeUnit  = unit || "%";
    } else if (type === "co2") {
      color      = "#f59e0b";
      displayVal = isNum ? Math.round(numVal).toString() : "--";
      gaugeUnit  = unit || "ppm";
    } else if (type === "pressure") {
      color      = "#a855f7";
      displayVal = isNum ? numVal.toFixed(0) : "--";
      gaugeUnit  = unit || "hPa";
    } else if (type === "illuminance") {
      color      = "#eab308";
      displayVal = isNum ? Math.round(numVal).toString() : "--";
      gaugeUnit  = unit || "lx";
    } else {
      color      = "#06b6d4";
      displayVal = isNum ? numVal.toFixed(1) : (rawVal || "--");
      gaugeUnit  = unit;
    }

    // ── arc geometry — same as Kids Room card ──────────────────────────────
    const R           = 20;
    const circumference = 2 * Math.PI * R; // ≈ 125.66
    const dashOffset  = isNum ? _arcOffset(numVal, min, max, circumference) : circumference;

    return html`
      <div class="sensor-tile" style="cursor:default">
        <!-- gauge left: SVG rotated -90deg so arc starts at top -->
        <div class="gauge-wrap">
          <svg width="52" height="52" viewBox="0 0 52 52" style="transform:rotate(-90deg)">
            <circle cx="26" cy="26" r="${R}"
              fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="3.5"/>
            <circle cx="26" cy="26" r="${R}"
              fill="none" stroke="${color}" stroke-width="3.5" stroke-linecap="round"
              stroke-dasharray="${circumference.toFixed(1)}"
              stroke-dashoffset="${dashOffset.toFixed(2)}"
              style="filter:drop-shadow(0 0 4px ${color})"/>
          </svg>
          <div class="gauge-center">
            <div class="gauge-val-sm">${displayVal}</div>
            <div class="gauge-unit-sm">${gaugeUnit}</div>
          </div>
        </div>
        <!-- value + label right -->
        <div class="sensor-info">
          <div class="sensor-value" style="color:${color}">
            <span>${displayVal}</span><span class="sensor-unit">${gaugeUnit}</span>
          </div>
          <div class="sensor-label">${label.toUpperCase()}</div>
        </div>
      </div>
    `;
  }

  // ── Binary / state sensor row ─────────────────────────────────────────────────
  // Motion: 🚶 emoji in rounded square, green bg=clear, red+glow+pulse=active
  // Others: ha-icon in rounded square

  _renderBinarySensor(sensor) {
    const entityId    = sensor.entity;
    const stateObj    = this._stateOf(entityId);
    const state       = stateObj ? stateObj.state : "unknown";
    const label       = sensor.label || (stateObj ? this._friendlyName(entityId) : entityId);
    const deviceClass = this._attr(entityId, "device_class") || "";
    const ago         = this._agoStr(stateObj ? stateObj.last_changed : null);

    // State → display mapping
    const defaultMap = {
      on:       { label: "On",       color: "#fbbf24" },
      off:      { label: "Off",      color: "rgba(255,255,255,0.4)" },
      open:     { label: "Open",     color: "#fbbf24" },
      closed:   { label: "Closed",   color: "rgba(255,255,255,0.4)" },
      detected: { label: "Detected", color: "#f87171" },
      clear:    { label: "Clear",    color: "#34d399" },
      home:     { label: "Home",     color: "#34d399" },
      away:     { label: "Away",     color: "#fbbf24" },
    };
    const merged   = { ...defaultMap, ...(sensor.state_map || {}) };
    const display  = merged[state.toLowerCase()] || { label: state, color: "rgba(255,255,255,0.4)" };

    const isMotion = _isMotionSensor(entityId, deviceClass);
    const isActive = MOTION_ACTIVE.includes(state.toLowerCase());

    // ── icon block ──────────────────────────────────────────────────────────
    // Motion: 🚶 in colored rounded square (green=clear, red=active+pulse)
    // Others: ha-icon in neutral rounded square
    const motionIconHtml = isMotion ? html`
      <div class="sensor-icon ${isActive ? "motion-icon-active" : "motion-icon-clear"}">
        🚶
      </div>
    ` : html`
      <div class="sensor-icon sensor-icon-neutral">
        <ha-icon icon="${sensor.icon || "mdi:toggle-switch"}"
                 style="color:rgba(255,255,255,0.6);--mdc-icon-size:17px"></ha-icon>
      </div>
    `;

    const snCols = Math.max(1, Math.min(4, parseInt(this._config.sensor_columns) || 1));

    // ── Compact tile (grid mode, cols > 1) ──────────────────────────────────
    if (snCols > 1) {
      return html`
        <div class="sensor-tile-compact ${isMotion && isActive ? "motion-row-active" : ""}">
          ${motionIconHtml}
          <div class="sensor-tile-compact-name">${label}</div>
          <div class="sensor-tile-compact-state ${isMotion && isActive ? "state-detected" : ""}"
               style="color:${display.color}">${display.label}</div>
          ${ago ? html`<div class="sensor-tile-compact-ago">${ago}</div>` : ""}
        </div>
      `;
    }

    // ── Full-width row ───────────────────────────────────────────────────────
    return html`
      <div class="sensor-row ${isMotion && isActive ? "motion-row-active" : ""}">
        ${motionIconHtml}
        <div class="sensor-text">
          <div class="sensor-name">${label}</div>
          ${ago ? html`<div class="sensor-time">${ago}</div>` : ""}
        </div>
        <div class="sensor-state ${isMotion ? (isActive ? "state-detected" : "state-clear") : ""}"
             style="${!isMotion ? `color:${display.color}` : ""}">${display.label}</div>
      </div>
    `;
  }

  // ── Switch tile ───────────────────────────────────────────────────────────────

  _renderSwitch(sw) {
    const entityId = sw.entity;
    const stateObj = this._stateOf(entityId);
    const state    = stateObj ? stateObj.state : "off";
    const isOn     = state === "on";
    const label    = sw.label || (stateObj ? this._friendlyName(entityId) : entityId);
    const icon     = sw.icon  || (isOn ? "mdi:lightbulb" : "mdi:lightbulb-off");
    const color    = sw.color || "#fbbf24";
    const ago      = this._agoStr(stateObj ? stateObj.last_changed : null);

    return html`
      <div class="light-btn ${isOn ? "on" : ""}"
           style="${isOn ? `--sw-color:${color}` : ""}"
           @click="${() => this._toggleSwitch(entityId, state)}">
        <ha-icon icon="${icon}"
                 style="color:${isOn ? color : "rgba(255,255,255,0.35)"};--mdc-icon-size:24px;${isOn ? `filter:drop-shadow(0 0 5px ${color})` : ""}"></ha-icon>
        <div class="light-text">
          <div class="light-name">${label}</div>
          <div class="light-status">${state.toUpperCase()}</div>
        </div>
      </div>
    `;
  }

  _toggleSwitch(entityId, currentState) {
    if (!this._hass || !entityId) return;
    const domain = entityId.split(".")[0];
    if (!["switch", "light", "input_boolean", "fan", "automation", "script"].includes(domain)) return;
    this._hass.callService(domain, currentState === "on" ? "turn_off" : "turn_on", { entity_id: entityId });
  }

  // ── Camera ────────────────────────────────────────────────────────────────────
  // Delegates to <room-card-stream> which guards against re-initialising
  // ha-camera-stream on every clock tick or hass state update. This fixes
  // the show/disappear loop on cameras that are slow to respond (IPC_566SD54MP).

  _renderCamera() {
    const entityId = this._config.camera_entity;
    if (!entityId || !this._config.show_camera) return '';
    const stateObj = this._stateOf(entityId);
    const label    = stateObj ? this._friendlyName(entityId) : entityId;

    if (!stateObj) {
      return html`
        <div class="camera-placeholder">
          <ha-icon icon="mdi:camera-off"></ha-icon>
          <span>Camera unavailable</span>
        </div>`;
    }

    return html`
      <div class="camera-container">
        <room-card-stream
          .hass=${this._hass}
          .stateObj=${stateObj}
          .label=${label}
        ></room-card-stream>
      </div>
    `;
  }

  // ── MAIN RENDER ───────────────────────────────────────────────────────────────

  render() {
    if (!this._config || !this._hass) return html``;

    const cfg     = this._config;
    const { date, time } = this._now();
    const online  = this._isOnline(cfg.status_entity);
    const climate = cfg.climate_sensors || [];
    const binary  = cfg.binary_sensors  || [];
    const switches = cfg.switches        || [];
    const snCols  = Math.max(1, Math.min(4, parseInt(cfg.sensor_columns) || 1));
    const swCols  = switches.length === 1 ? 1
                  : switches.length === 2 ? 2
                  : switches.length === 3 ? 3
                  : switches.length <= 4 ? 2 : 3;

    return html`
      <ha-card>
        <div class="card">

          <!-- HEADER -->
          <div class="header">
            <div class="header-left">
              ${cfg.room_icon ? html`<ha-icon icon="${cfg.room_icon}" class="room-icon"></ha-icon>` : ""}
              <div class="title">${(cfg.room_name || "Room").toUpperCase()}</div>
            </div>
            ${cfg.show_datetime ? html`
              <div class="header-datetime">
                <div class="header-date">${date}</div>
                <div class="header-time">${time}</div>
              </div>` : ""}
            ${cfg.show_status_dot ? html`
              <div class="status-dot ${online ? "dot-online" : "dot-offline"}"></div>` : ""}
          </div>

          <!-- CLIMATE — side-by-side row, exactly like Kids Room card -->
          ${climate.length > 0 ? html`
            <div class="sensors-row">
              ${climate.map((s) => this._renderClimateSensor(s))}
            </div>` : ""}

          <!-- CAMERA -->
          ${cfg.show_camera && cfg.camera_entity ? html`
            <div class="camera-section">${this._renderCamera()}</div>` : ""}

          <!-- GLOW DIVIDER -->
          ${(binary.length > 0 || switches.length > 0) ? html`<div class="glow-line"></div>` : ""}

          <!-- BINARY SENSORS -->
          ${binary.length > 0 ? html`
            <div class="${snCols > 1 ? "sensors-grid" : "sensors-list"}"
                 style="${snCols > 1 ? `--sn-cols:${snCols}` : ""}">
              ${binary.map((s) => this._renderBinarySensor(s))}
            </div>` : ""}

          <!-- SWITCHES -->
          ${switches.length > 0 ? html`
            <div class="lights-row" style="--sw-cols:${swCols}">
              ${switches.map((s) => this._renderSwitch(s))}
            </div>` : ""}

        </div>
      </ha-card>
    `;
  }

  // ── STYLES ────────────────────────────────────────────────────────────────────

  static get styles() {
    return css`
      :host { display: block; font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; }

      /* ── Card shell — exact Kids Room card ── */
      ha-card { background: transparent; box-shadow: none; border: none; }
      .card {
        background: linear-gradient(145deg, #1a1f35 0%, #0f1628 50%, #141929 100%);
        border-radius: 13px;
        border: 1px solid rgba(99,179,237,0.15);
        box-shadow: 0 0 0 1px rgba(255,255,255,0.04), 0 8px 32px rgba(0,0,0,0.6), 0 0 60px rgba(99,179,237,0.05);
        overflow: hidden; padding: 0; position: relative;
      }
      .card::before {
        content: ""; position: absolute; top: -60px; left: -60px;
        width: 200px; height: 200px;
        background: radial-gradient(circle, rgba(99,179,237,0.08) 0%, transparent 70%);
        pointer-events: none; z-index: 0;
      }

      /* ── Header ── */
      .header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 16px 20px 10px; position: relative; z-index: 1; gap: 8px;
      }
      .header-left { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
      .room-icon { --mdc-icon-size: 18px; color: rgba(255,255,255,0.45); flex-shrink: 0; }
      .title { font-size: 18px; font-weight: 700; color: #fff; letter-spacing: 1.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .header-datetime { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; flex-shrink: 0; }
      .header-date { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.75); letter-spacing: 0.5px; }
      .header-time { font-size: 11px; font-weight: 400; color: rgba(255,255,255,0.4); letter-spacing: 1px; }
      .status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
      .dot-online  { background: #34d399; box-shadow: 0 0 8px rgba(52,211,153,0.8); animation: pulse-dot 2s ease-in-out infinite; }
      .dot-offline { background: #6b7280; }
      @keyframes pulse-dot {
        0%,100% { opacity:1; box-shadow:0 0 8px rgba(52,211,153,0.8); }
        50% { opacity:0.6; box-shadow:0 0 14px rgba(52,211,153,0.4); }
      }

      /* ── Climate tiles — exact Kids Room card ── */
      .sensors-row {
        display: flex; gap: 12px;
        padding: 0 16px 12px; position: relative; z-index: 1;
      }
      /* each tile — Kids Room card: flex:1, bg rgba, border, 14px radius, 12px pad */
      .sensor-tile {
        flex: 1; background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 14px; padding: 12px;
        display: flex; align-items: center; gap: 10px;
        min-width: 0;
      }
      /* gauge — Kids Room card: 52×52 wrap, SVG rotated -90deg */
      .gauge-wrap { position: relative; width: 52px; height: 52px; flex-shrink: 0; }
      .gauge-wrap svg { transform: rotate(-90deg); }
      .gauge-center {
        position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
        display: flex; flex-direction: column; align-items: center; pointer-events: none;
      }
      .gauge-val-sm  { font-size: 10px; font-weight: 700; color: #fff; line-height: 1; }
      .gauge-unit-sm { font-size: 6px; color: rgba(255,255,255,0.5); }
      /* value text — Kids Room card: 20px bold, same color as arc */
      .sensor-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
      .sensor-value { font-size: 20px; font-weight: 700; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .sensor-unit  { font-size: 12px; font-weight: 400; }
      .sensor-label { font-size: 9px; letter-spacing: 1.5px; color: rgba(255,255,255,0.35); text-transform: uppercase; margin-top: 2px; }

      /* ── Camera ── */
      .camera-section { margin: 0 16px 12px; position: relative; z-index: 1; }
      .camera-container { border-radius: 14px; overflow: hidden; position: relative; border: 1px solid rgba(255,255,255,0.08); background: #0a0e1a; }
      /* room-card-stream renders ha-camera-stream which fills the container */
      room-card-stream { display: block; width: 100%; }
      .camera-placeholder {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 6px; padding: 24px; border-radius: 14px;
        background: rgba(255,255,255,0.03); border: 1px dashed rgba(255,255,255,0.1);
        color: rgba(255,255,255,0.3); font-size: 0.75rem;
      }

      /* ── Glow divider ── */
      .glow-line {
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(99,179,237,0.3), rgba(168,85,247,0.3), transparent);
        margin: 0 16px;
      }

      /* ── Binary sensors — row mode — exact Kids Room card ── */
      .sensors-list {
        margin: 12px 16px 12px;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.07);
        border-radius: 14px; overflow: hidden; position: relative; z-index: 1;
      }
      .sensor-row {
        display: flex; align-items: center;
        padding: 11px 14px; gap: 10px;
      }
      .sensor-row:not(:last-child) { border-bottom: 1px solid rgba(255,255,255,0.05); }

      /* icon square — matches Kids Room card exactly */
      .sensor-icon {
        width: 32px; height: 32px; border-radius: 8px;
        display: flex; align-items: center; justify-content: center;
        font-size: 15px; flex-shrink: 0;
      }
      .motion-icon-clear  { background: rgba(52,211,153,0.12); box-shadow: 0 0 10px rgba(52,211,153,0.1); }
      .motion-icon-active { background: rgba(248,113,113,0.12); box-shadow: 0 0 10px rgba(248,113,113,0.1); animation: icon-pulse 1.5s ease-in-out infinite; }
      .sensor-icon-neutral { background: rgba(99,179,237,0.08); }
      @keyframes icon-pulse {
        0%,100% { box-shadow: 0 0 10px rgba(248,113,113,0.1); }
        50%      { box-shadow: 0 0 18px rgba(248,113,113,0.4); }
      }

      .sensor-text { flex: 1; display: flex; flex-direction: column; gap: 1px; }
      .sensor-name { font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.85); }
      .sensor-time { font-size: 10px; color: rgba(255,255,255,0.3); }
      .sensor-state { font-size: 13px; font-weight: 600; }
      /* motion-specific state colors — exact Kids Room card */
      .state-clear    { color: #34d399; }
      .state-detected { color: #f87171; animation: motion-pulse 1.5s ease-in-out infinite; }
      @keyframes motion-pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
      .motion-row-active .sensor-icon { animation: icon-pulse 1.5s ease-in-out infinite; }

      /* ── Binary sensors — compact tile grid (2-4 cols) ── */
      .sensors-grid {
        display: grid;
        grid-template-columns: repeat(var(--sn-cols, 2), 1fr);
        gap: 6px; margin: 12px 16px;
        position: relative; z-index: 1;
      }
      .sensor-tile-compact {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 4px; padding: 10px 6px;
        background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07);
        border-radius: 12px; text-align: center;
      }
      .motion-row-active.sensor-tile-compact { background: rgba(248,113,113,0.06); border-color: rgba(248,113,113,0.15); }
      .sensor-tile-compact-name  { font-size: 11px; font-weight: 500; color: rgba(255,255,255,0.8); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; }
      .sensor-tile-compact-state { font-size: 11px; font-weight: 700; }
      .sensor-tile-compact-ago   { font-size: 9px; color: rgba(255,255,255,0.28); }

      /* ── Switches / lights ── */
      .lights-row {
        display: grid;
        grid-template-columns: repeat(var(--sw-cols, 2), 1fr);
        gap: 10px; padding: 12px 16px 16px; position: relative; z-index: 1;
      }
      .light-btn {
        background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
        border-radius: 14px; padding: 10px 12px; cursor: pointer;
        display: flex; flex-direction: row; align-items: center; gap: 10px;
        transition: all 0.25s ease; user-select: none; min-width: 0;
        -webkit-tap-highlight-color: transparent;
      }
      .light-btn.on { background: rgba(251,191,36,0.1); border-color: rgba(251,191,36,0.35); box-shadow: 0 0 16px rgba(251,191,36,0.1); }
      .light-btn:active { transform: scale(0.97); }
      .light-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .light-name   { font-size: 11px; letter-spacing: 1px; color: rgba(255,255,255,0.5); text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .light-btn.on .light-name { color: rgba(251,191,36,0.9); }
      .light-status { font-size: 10px; color: rgba(255,255,255,0.25); text-transform: uppercase; letter-spacing: 0.5px; }
      .light-btn.on .light-status { color: rgba(251,191,36,0.5); }
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

  _entities(...domains) {
    if (!this.hass) return [];
    return Object.keys(this.hass.states)
      .filter((id) => !domains.length || domains.some((d) => id.startsWith(d + ".")))
      .sort();
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

  // ── Searchable entity selector ────────────────────────────────────────────────

  _renderEntitySearch(searchKey, currentValue, onChange, domains, placeholder) {
    const base     = domains && domains.length ? this._entities(...domains) : this._entities();
    const query    = (this._search[searchKey] || "").toLowerCase().trim();
    const filtered = query ? base.filter((e) => e.toLowerCase().includes(query)) : base;

    const friendlyLabel = (eid) => {
      if (!this.hass) return eid;
      const fn = this.hass.states[eid]?.attributes?.friendly_name;
      return fn ? `${fn}  (${eid})` : eid;
    };

    return html`
      <div class="search-select-wrap">
        <input class="ed-input search-input" type="text"
          placeholder="🔍 Search entities..."
          .value="${this._search[searchKey] || ""}"
          @input="${(e) => { this._search = { ...this._search, [searchKey]: e.target.value }; }}" />
        <select class="ed-select"
          .value="${currentValue || ""}"
          @change="${(e) => {
            onChange(e.target.value);
            this._search = { ...this._search, [searchKey]: "" };
          }}">
          <option value="">${placeholder || "— select entity —"}</option>
          ${filtered.slice(0, 200).map((eid) => html`
            <option value="${eid}" ?selected="${eid === currentValue}">${friendlyLabel(eid)}</option>
          `)}
          ${filtered.length > 200 ? html`<option disabled>…${filtered.length - 200} more — refine search</option>` : ""}
        </select>
        ${currentValue ? html`<div class="selected-badge">${currentValue}</div>` : ""}
      </div>
    `;
  }

  // ── Shared controls ───────────────────────────────────────────────────────────

  _txt(label, value, onChange, placeholder) {
    return html`
      <label class="ed-label">${label}</label>
      <input class="ed-input" type="text" .value="${value || ""}" placeholder="${placeholder || ""}"
        @input="${(e) => onChange(e.target.value)}" />
    `;
  }

  _toggle(label, value, onChange) {
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

  _numSelect(label, value, options, onChange) {
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

  _colorPick(label, value, onChange) {
    return html`
      <div class="color-row">
        <span class="ed-label">${label}</span>
        <input type="color" class="color-picker" .value="${value || "#fbbf24"}"
          @input="${(e) => onChange(e.target.value)}" />
      </div>
    `;
  }

  // ── TAB: General ─────────────────────────────────────────────────────────────

  _tabGeneral() {
    const cfg = this._config;
    return html`
      <div class="section">
        <div class="section-title">Room Identity</div>
        ${this._txt("Room Name", cfg.room_name, (v) => this._set("room_name", v), "e.g. Living Room")}
        ${this._txt("Room Icon (mdi:...)", cfg.room_icon, (v) => this._set("room_icon", v), "e.g. mdi:sofa")}
      </div>
      <div class="section">
        <div class="section-title">Header Options</div>
        ${this._toggle("Show Date & Time", cfg.show_datetime, (v) => this._set("show_datetime", v))}
        ${this._toggle("Show Status Dot", cfg.show_status_dot, (v) => this._set("show_status_dot", v))}
        ${cfg.show_status_dot ? html`
          <label class="ed-label">Status Entity (optional)</label>
          ${this._renderEntitySearch("status_entity", cfg.status_entity,
              (v) => this._set("status_entity", v), [], "— auto online if empty —")}
        ` : ""}
      </div>
      <div class="section">
        <div class="section-title">Camera</div>
        ${this._toggle("Show Camera Feed", cfg.show_camera, (v) => this._set("show_camera", v))}
        ${cfg.show_camera ? html`
          <label class="ed-label">Camera Entity</label>
          ${this._renderEntitySearch("camera_entity", cfg.camera_entity,
              (v) => this._set("camera_entity", v), ["camera"], "— select camera —")}
        ` : ""}
      </div>
    `;
  }

  // ── TAB: Climate ─────────────────────────────────────────────────────────────

  _tabClimate() {
    const items = this._config.climate_sensors || [];
    return html`
      <div class="section">
        <div class="section-title">Climate / Environment Sensors</div>
        <p class="hint">
          Displayed side-by-side. Gauge color is <strong>automatic</strong> based on sensor type —
          temperature uses a severity gradient (blue→green→yellow→red),
          humidity is fixed blue. No color configuration needed.
        </p>
        ${items.map((s, i) => html`
          <div class="list-item">
            <div class="list-item-header">
              <span class="list-item-num">Sensor ${i + 1}</span>
              <button class="btn-remove" @click="${() => this._removeItem("climate_sensors", i)}">Remove</button>
            </div>
            <label class="ed-label">Entity</label>
            ${this._renderEntitySearch(`climate_${i}`, s.entity,
                (v) => this._updateItem("climate_sensors", i, "entity", v),
                ["sensor"], "— select sensor —")}
            ${this._txt("Display Label", s.label,
                (v) => this._updateItem("climate_sensors", i, "label", v), "e.g. Temperature")}
            ${this._txt("Unit Override", s.unit,
                (v) => this._updateItem("climate_sensors", i, "unit", v), "e.g. °C  (leave blank = auto)")}
            <div class="two-col">
              ${this._txt("Min Value", s.min !== undefined ? String(s.min) : "",
                  (v) => this._updateItem("climate_sensors", i, "min", parseFloat(v) || 0), "0")}
              ${this._txt("Max Value", s.max !== undefined ? String(s.max) : "",
                  (v) => this._updateItem("climate_sensors", i, "max", parseFloat(v) || 100), "100")}
            </div>
          </div>
        `)}
        <button class="btn-add"
          @click="${() => this._addItem("climate_sensors", {
            entity: "", label: "", unit: "", min: 0, max: 50
          })}">+ Add Climate Sensor</button>
      </div>
    `;
  }

  // ── TAB: Sensors ─────────────────────────────────────────────────────────────

  _tabSensors() {
    const items  = this._config.binary_sensors || [];
    const snCols = this._config.sensor_columns || 1;
    return html`
      <div class="section">
        <div class="section-title">Layout</div>
        ${this._numSelect("Sensor Columns", snCols, [1, 2, 3, 4],
            (v) => this._set("sensor_columns", v))}
        <p class="hint">${snCols === 1
          ? "Row mode: full-width rows with name, timestamp and state."
          : `Grid mode: ${snCols}-column compact tiles.`}</p>
      </div>
      <div class="section">
        <div class="section-title">Binary / State Sensors</div>
        <p class="hint">
          Motion and presence entities are auto-detected and show the 🚶 icon with a pulsating
          glow when active. All other sensors use the configured MDI icon.
        </p>
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
              ${this._renderEntitySearch(`sensor_${i}`, s.entity,
                  (v) => this._updateItem("binary_sensors", i, "entity", v),
                  ["binary_sensor", "sensor", "input_boolean", "device_tracker"],
                  "— select sensor —")}
              ${this._txt("Display Label", s.label,
                  (v) => this._updateItem("binary_sensors", i, "label", v), "e.g. Window Left")}
              ${this._txt("Icon (mdi:...) — not used for motion sensors", s.icon,
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
                  <span class="sm-arrow">→</span>
                  <input class="ed-input sm" type="text" placeholder="label" .value="${disp.label || ""}"
                    @input="${(e) => {
                      this._updateItem("binary_sensors", i, "state_map",
                        { ...stateMap, [state]: { ...disp, label: e.target.value } });
                    }}" />
                  <input type="color" class="color-picker sm" .value="${disp.color || "#fbbf24"}"
                    @input="${(e) => {
                      this._updateItem("binary_sensors", i, "state_map",
                        { ...stateMap, [state]: { ...disp, color: e.target.value } });
                    }}" />
                  <button class="btn-remove-sm" @click="${() => {
                    const nm = { ...stateMap }; delete nm[state];
                    this._updateItem("binary_sensors", i, "state_map", nm);
                  }}">✕</button>
                </div>
              `)}
              <button class="btn-add sm" @click="${() => {
                this._updateItem("binary_sensors", i, "state_map",
                  { ...stateMap, new_state: { label: "Label", color: "#fbbf24" } });
              }}">+ Add State</button>
            </div>
          `;
        })}
        <button class="btn-add"
          @click="${() => this._addItem("binary_sensors", {
            entity: "", label: "", icon: "mdi:toggle-switch",
            state_map: {
              on:  { label: "On",  color: "#fbbf24" },
              off: { label: "Off", color: "rgba(255,255,255,0.4)" },
            }
          })}">+ Add Sensor</button>
      </div>
    `;
  }

  // ── TAB: Switches ─────────────────────────────────────────────────────────────

  _tabSwitches() {
    const items = this._config.switches || [];
    return html`
      <div class="section">
        <div class="section-title">Switches / Lights / Controls</div>
        <p class="hint">Tappable tiles — tap to toggle. Columns auto-fit based on count.</p>
        ${items.map((s, i) => html`
          <div class="list-item">
            <div class="list-item-header">
              <span class="list-item-num">Switch ${i + 1}</span>
              <button class="btn-remove" @click="${() => this._removeItem("switches", i)}">Remove</button>
            </div>
            <label class="ed-label">Entity</label>
            ${this._renderEntitySearch(`switch_${i}`, s.entity,
                (v) => this._updateItem("switches", i, "entity", v),
                ["switch", "light", "input_boolean", "fan", "automation"],
                "— select entity —")}
            ${this._txt("Display Label", s.label,
                (v) => this._updateItem("switches", i, "label", v), "e.g. Ceiling Light")}
            ${this._txt("Icon (mdi:...)", s.icon,
                (v) => this._updateItem("switches", i, "icon", v), "e.g. mdi:lightbulb")}
            ${this._colorPick("Active Color", s.color,
                (v) => this._updateItem("switches", i, "color", v))}
          </div>
        `)}
        <button class="btn-add"
          @click="${() => this._addItem("switches", {
            entity: "", label: "", icon: "mdi:lightbulb", color: "#fbbf24"
          })}">+ Add Switch / Light</button>
      </div>
    `;
  }

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
          ${this._activeTab === "general"  ? this._tabGeneral()  : ""}
          ${this._activeTab === "climate"  ? this._tabClimate()  : ""}
          ${this._activeTab === "sensors"  ? this._tabSensors()  : ""}
          ${this._activeTab === "switches" ? this._tabSwitches() : ""}
        </div>
      </div>
    `;
  }

  static get styles() {
    return css`
      :host { display: block; font-family: 'Segoe UI', sans-serif; }
      .editor-root { display: flex; flex-direction: column; }

      .tab-bar { display: flex; border-bottom: 1px solid rgba(0,0,0,0.15); background: var(--card-background-color, #1e293b); border-radius: 8px 8px 0 0; overflow: hidden; }
      .tab-btn { flex: 1; padding: 10px 4px; font-size: 0.78rem; font-weight: 600; letter-spacing: 0.04em; border: none; background: transparent; color: var(--secondary-text-color, #94a3b8); cursor: pointer; transition: background 0.15s, color 0.15s; text-transform: uppercase; }
      .tab-btn.active { color: var(--primary-color, #3b82f6); border-bottom: 2px solid var(--primary-color, #3b82f6); background: rgba(59,130,246,0.06); }

      .tab-content { padding: 12px 4px; display: flex; flex-direction: column; gap: 4px; }

      .section { margin-bottom: 10px; }
      .section-title { font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--primary-color, #3b82f6); margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid rgba(59,130,246,0.2); }
      .hint { font-size: 0.73rem; color: var(--secondary-text-color, #94a3b8); margin: 0 0 8px; line-height: 1.5; }

      .ed-label { display: block; font-size: 0.72rem; font-weight: 600; color: var(--secondary-text-color, #64748b); margin-bottom: 3px; margin-top: 6px; text-transform: uppercase; letter-spacing: 0.05em; }
      .ed-input { width: 100%; padding: 7px 10px; font-size: 0.82rem; border: 1px solid var(--divider-color, #334155); border-radius: 6px; background: var(--secondary-background-color, #0f172a); color: var(--primary-text-color, #e2e8f0); box-sizing: border-box; transition: border-color 0.15s; }
      .ed-input:focus { outline: none; border-color: var(--primary-color, #3b82f6); }
      .ed-input.sm { width: auto; flex: 1; min-width: 56px; }

      .ed-select { width: 100%; padding: 7px 10px; font-size: 0.82rem; border: 1px solid var(--divider-color, #334155); border-radius: 6px; background: var(--secondary-background-color, #0f172a); color: var(--primary-text-color, #e2e8f0); box-sizing: border-box; cursor: pointer; margin-top: 4px; }
      .inline-select { width: auto; min-width: 64px; padding: 4px 8px; margin-top: 0; }

      .search-select-wrap { display: flex; flex-direction: column; gap: 4px; margin-bottom: 4px; }
      .search-input { margin-bottom: 0; font-size: 0.8rem; }
      .selected-badge { font-size: 0.67rem; color: var(--primary-color, #3b82f6); background: rgba(59,130,246,0.1); border-radius: 4px; padding: 2px 6px; word-break: break-all; }

      .toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; gap: 8px; }
      .toggle-wrap { position: relative; display: inline-block; width: 40px; height: 22px; flex-shrink: 0; }
      .toggle-wrap input { display: none; }
      .toggle-slider { position: absolute; inset: 0; background: #334155; border-radius: 11px; cursor: pointer; transition: background 0.2s; }
      .toggle-slider::before { content: ""; position: absolute; left: 3px; top: 3px; width: 16px; height: 16px; background: white; border-radius: 50%; transition: transform 0.2s; }
      .toggle-wrap input:checked + .toggle-slider { background: var(--primary-color, #3b82f6); }
      .toggle-wrap input:checked + .toggle-slider::before { transform: translateX(18px); }

      .color-row { display: flex; align-items: center; justify-content: space-between; padding: 4px 0; }
      .color-picker { width: 40px; height: 28px; border: none; padding: 0; cursor: pointer; background: none; border-radius: 4px; }
      .color-picker.sm { width: 28px; height: 24px; }

      .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }

      .list-item { background: var(--secondary-background-color, rgba(0,0,0,0.2)); border: 1px solid var(--divider-color, #334155); border-radius: 8px; padding: 10px; margin-bottom: 8px; }
      .list-item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
      .list-item-num { font-size: 0.75rem; font-weight: 700; color: var(--primary-color, #3b82f6); text-transform: uppercase; letter-spacing: 0.06em; }

      .state-map-title { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--secondary-text-color, #64748b); margin: 8px 0 4px; }
      .state-map-row { display: flex; align-items: center; gap: 4px; margin-bottom: 4px; }
      .sm-arrow { color: var(--secondary-text-color, #64748b); font-size: 0.8rem; flex-shrink: 0; }

      .btn-add { width: 100%; padding: 8px; font-size: 0.78rem; font-weight: 600; border: 1px dashed var(--primary-color, #3b82f6); border-radius: 6px; background: transparent; color: var(--primary-color, #3b82f6); cursor: pointer; transition: background 0.15s; }
      .btn-add:hover { background: rgba(59,130,246,0.08); }
      .btn-add.sm { width: auto; padding: 4px 8px; font-size: 0.7rem; margin-top: 4px; }

      .btn-remove { padding: 3px 8px; font-size: 0.7rem; border: 1px solid #ef4444; border-radius: 4px; background: transparent; color: #ef4444; cursor: pointer; }
      .btn-remove:hover { background: rgba(239,68,68,0.1); }
      .btn-remove-sm { padding: 2px 5px; font-size: 0.68rem; border: 1px solid #ef4444; border-radius: 4px; background: transparent; color: #ef4444; cursor: pointer; flex-shrink: 0; }
    `;
  }
}

// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// CAMERA STREAM SUB-ELEMENT
// Isolates ha-camera-stream from the parent card's render cycle.
// Only reconfigures the stream when stateObj reference actually changes —
// not on every clock tick or unrelated hass state update.
// This fixes the show/disappear loop seen with IPC_566SD54MP cameras
// when multiple cards with camera feeds are on the same dashboard.
// ─────────────────────────────────────────────
class RoomCardStream extends LitElement {
  static get properties() {
    return {
      hass:     {},
      stateObj: {},
      label:    {},
    };
  }

  updated(changedProps) {
    // Only touch ha-camera-stream when stateObj has actually changed
    if (!changedProps.has("stateObj") && !changedProps.has("hass")) return;
    const stream = this.shadowRoot.querySelector("ha-camera-stream");
    if (!stream) return;
    // Guard: only reconfigure when stateObj reference changes
    if (stream._rcLastStateObj === this.stateObj && stream._rcLastHass === this.hass) return;
    stream._rcLastStateObj = this.stateObj;
    stream._rcLastHass     = this.hass;
    stream.hass     = this.hass;
    stream.stateObj = this.stateObj;
    if (typeof stream.requestUpdate === "function") stream.requestUpdate();
  }

  render() {
    if (!this.stateObj) return html``;
    return html`
      <div class="stream-wrap">
        <ha-camera-stream
          allow-exoplayer
          muted
          playsinline
        ></ha-camera-stream>
        <div class="stream-overlay">
          <span class="stream-label">${(this.label || "").toUpperCase()}</span>
          <span class="stream-live">● LIVE</span>
        </div>
      </div>
    `;
  }

  static get styles() {
    return css`
      :host { display: block; }
      .stream-wrap {
        position: relative; border-radius: 14px; overflow: hidden;
        background: #0a0e1a; border: 1px solid rgba(255,255,255,0.08);
      }
      ha-camera-stream {
        width: 100%; display: block;
        max-height: 350px; object-fit: cover;
        --video-border-radius: 0;
      }
      .stream-overlay {
        position: absolute; bottom: 0; left: 0; right: 0;
        padding: 8px 12px;
        background: linear-gradient(transparent, rgba(0,0,0,0.6));
        display: flex; justify-content: space-between; align-items: flex-end;
      }
      .stream-label { font-size: 10px; letter-spacing: 1px; color: rgba(255,255,255,0.5); text-transform: uppercase; }
      .stream-live  { font-size: 9px;  letter-spacing: 1px; color: #f87171; font-weight: 600; border: 1px solid rgba(248,113,113,0.4); padding: 2px 6px; border-radius: 4px; }
    `;
  }
}

// REGISTER
// ─────────────────────────────────────────────
customElements.define("room-card-stream", RoomCardStream);
customElements.define("room-card", RoomCard);
customElements.define("room-card-editor", RoomCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "room-card",
  name: "Room Card",
  description: "Universal configurable room card — climate gauges, binary sensors, switches, optional camera.",
  preview: true,
  documentationURL: "https://github.com/robman2026/room-card",
});

console.info(
  "%c ROOM-CARD %c v1.3.1 ",
  "color:white;background:#3b82f6;font-weight:bold;padding:2px 4px;border-radius:3px 0 0 3px;",
  "color:#3b82f6;background:#0f172a;font-weight:bold;padding:2px 4px;border-radius:0 3px 3px 0;"
);
