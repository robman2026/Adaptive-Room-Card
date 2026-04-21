/**
 * room-card.js
 * Universal Room Card for Home Assistant
 * GitHub: https://github.com/robman2026/room-card
 * Version: 1.5.0
 *
 * Changelog v1.5.0:
 *  - Configurable color stops for temperature and humidity sensors
 *    - Visual editor: per-stop value + color picker + live gradient bar preview
 *    - Stored as JSON array in config: temp_color_stops / hum_color_stops
 *    - Falls back to built-in defaults when not configured
 *    - Applied to both SVG arc stroke AND value text color
 *  - Color stop logic extracted to shared _interpolateStops() helper
 *  - Editor: new "Colors" tab with Add/Remove stop controls for both sensors
 *  - getStubConfig updated to include default stops
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

// ── Default color stops (used when not configured) ────────────────────────────
const DEFAULT_TEMP_STOPS = [
  { pos: 0,  color: "#2391FF" },
  { pos: 19, color: "#14FF6A" },
  { pos: 27, color: "#F8FF42" },
  { pos: 35, color: "#FF3502" },
  { pos: 50, color: "#FF3502" },
];

const DEFAULT_HUM_STOPS = [
  { pos: 0,  color: "#f97316" },
  { pos: 30, color: "#f97316" },
  { pos: 35, color: "#eab308" },
  { pos: 40, color: "#22c55e" },
  { pos: 60, color: "#22c55e" },
  { pos: 70, color: "#eab308" },
  { pos: 80, color: "#ef4444" },
  { pos: 100,color: "#ef4444" },
];

// ── Shared interpolation engine ───────────────────────────────────────────────
// Accepts an array of { pos, color } where color is a hex string "#rrggbb"
function _interpolateStops(stops, value) {
  if (!stops || stops.length === 0) return "#94a3b8";

  // Parse hex → { r, g, b }
  const parse = (hex) => {
    const c = hex.replace("#", "");
    const full = c.length === 3
      ? c.split("").map((x) => x + x).join("")
      : c;
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
    };
  };

  // Sort stops by position
  const sorted = [...stops].sort((a, b) => a.pos - b.pos);
  const first  = sorted[0];
  const last   = sorted[sorted.length - 1];
  const clamped = Math.max(first.pos, Math.min(last.pos, value));

  let lo = first, hi = last;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (clamped >= sorted[i].pos && clamped <= sorted[i + 1].pos) {
      lo = sorted[i]; hi = sorted[i + 1]; break;
    }
  }

  const range = hi.pos - lo.pos || 1;
  const f = (clamped - lo.pos) / range;
  const lc = parse(lo.color);
  const hc = parse(hi.color);
  const r = Math.round(lc.r + f * (hc.r - lc.r));
  const g = Math.round(lc.g + f * (hc.g - lc.g));
  const b = Math.round(lc.b + f * (hc.b - lc.b));
  return `rgb(${r},${g},${b})`;
}

// ── Backward-compatible wrappers ──────────────────────────────────────────────
function _tempSeverityColor(value, stops) {
  return _interpolateStops(stops && stops.length ? stops : DEFAULT_TEMP_STOPS, value);
}

function _humSeverityColor(value, stops) {
  return _interpolateStops(stops && stops.length ? stops : DEFAULT_HUM_STOPS, value);
}

// Arc dashoffset — same formula as before
function _arcOffset(value, min, max, circumference) {
  const pct = Math.min(1, Math.max(0, (value - min) / ((max - min) || 1)));
  return circumference - pct * circumference;
}

// Power severity color — unchanged
function _powerSeverityColor(value, max) {
  const pct   = Math.min(1, Math.max(0, value / (max || 3000)));
  const stops = [
    { pos: 0,    r: 0x22, g: 0xC5, b: 0x5E },
    { pos: 0.40, r: 0x22, g: 0xC5, b: 0x5E },
    { pos: 0.65, r: 0xEA, g: 0xB3, b: 0x08 },
    { pos: 0.85, r: 0xF9, g: 0x73, b: 0x16 },
    { pos: 1,    r: 0xEF, g: 0x44, b: 0x44 },
  ];
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (pct >= stops[i].pos && pct <= stops[i + 1].pos) {
      lo = stops[i]; hi = stops[i + 1]; break;
    }
  }
  const f = (pct - lo.pos) / ((hi.pos - lo.pos) || 1);
  return `rgb(${Math.round(lo.r+f*(hi.r-lo.r))},${Math.round(lo.g+f*(hi.g-lo.g))},${Math.round(lo.b+f*(hi.b-lo.b))})`;
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
      temp_color_stops: JSON.parse(JSON.stringify(DEFAULT_TEMP_STOPS)),
      hum_color_stops:  JSON.parse(JSON.stringify(DEFAULT_HUM_STOPS)),
      binary_sensors: [],
      sensor_columns: 1,
      switches: [],
      camera_entity: "",
      show_camera: false,
      mower_entity: "",
      mower_battery_entity: "",
      mower_name: "",
      show_mower: false,
      power_entity: "",
      power_energy_entity: "",
      power_current_entity: "",
      power_max_w: 3000,
      show_power: false,
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
      temp_color_stops: JSON.parse(JSON.stringify(DEFAULT_TEMP_STOPS)),
      hum_color_stops:  JSON.parse(JSON.stringify(DEFAULT_HUM_STOPS)),
      binary_sensors: [],
      sensor_columns: 1,
      switches: [],
      camera_entity: "",
      show_camera: false,
      mower_entity: "",
      mower_battery_entity: "",
      mower_name: "",
      show_mower: false,
      power_entity: "",
      power_energy_entity: "",
      power_current_entity: "",
      power_max_w: 3000,
      show_power: false,
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

  _moreInfo(entityId) {
    if (!entityId) return;
    this.dispatchEvent(new CustomEvent("hass-more-info", {
      bubbles: true, composed: true,
      detail: { entityId },
    }));
  }

  // ── Detect sensor type for auto-color ────────────────────────────────────────

  _sensorType(entityId, deviceClass) {
    const dc  = (deviceClass || "").toLowerCase();
    const eid = (entityId    || "").toLowerCase();
    if (dc === "humidity")                                return "humidity";
    if (dc === "temperature")                             return "temperature";
    if (dc === "carbon_dioxide" || dc === "volatile_organic_compounds") return "co2";
    if (dc === "pressure")                                return "pressure";
    if (dc === "illuminance")                             return "illuminance";
    if (eid.includes("humid"))                            return "humidity";
    if (eid.includes("temp"))                             return "temperature";
    if (eid.includes("co2") || eid.includes("voc"))      return "co2";
    if (eid.includes("press"))                            return "pressure";
    if (eid.includes("lux"))                              return "illuminance";
    return "default";
  }

  // ── Climate sensor tile ───────────────────────────────────────────────────────
  // Uses configurable color stops from _config.temp_color_stops / hum_color_stops

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

    const tempStops = this._config.temp_color_stops || DEFAULT_TEMP_STOPS;
    const humStops  = this._config.hum_color_stops  || DEFAULT_HUM_STOPS;

    let color, displayVal, gaugeUnit;
    const isNum = !isNaN(numVal) && rawVal !== null;

    if (type === "temperature") {
      color      = isNum ? _tempSeverityColor(numVal, tempStops) : "#2391FF";
      displayVal = isNum ? numVal.toFixed(1) : "--";
      gaugeUnit  = unit || "°C";
    } else if (type === "humidity") {
      color      = isNum ? _humSeverityColor(numVal, humStops) : "#22c55e";
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

    const R           = 20;
    const circumference = 2 * Math.PI * R;
    const dashOffset  = isNum ? _arcOffset(numVal, min, max, circumference) : circumference;

    return html`
      <div class="sensor-tile" style="cursor:pointer" @click="${() => this._moreInfo(entityId)}">
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

  _renderBinarySensor(sensor) {
    const entityId    = sensor.entity;
    const stateObj    = this._stateOf(entityId);
    const state       = stateObj ? stateObj.state : "unknown";
    const label       = sensor.label || (stateObj ? this._friendlyName(entityId) : entityId);
    const deviceClass = this._attr(entityId, "device_class") || "";
    const ago         = this._agoStr(stateObj ? stateObj.last_changed : null);

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

    if (snCols > 1) {
      return html`
        <div class="sensor-tile-compact ${isMotion && isActive ? "motion-row-active" : ""}" style="cursor:pointer" @click="${() => this._moreInfo(entityId)}">
          ${motionIconHtml}
          <div class="sensor-tile-compact-name">${label}</div>
          <div class="sensor-tile-compact-state ${isMotion && isActive ? "state-detected" : ""}"
               style="color:${display.color}">${display.label}</div>
          ${ago ? html`<div class="sensor-tile-compact-ago">${ago}</div>` : ""}
        </div>
      `;
    }

    return html`
      <div class="sensor-row ${isMotion && isActive ? "motion-row-active" : ""}" style="cursor:pointer" @click="${() => this._moreInfo(entityId)}">
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

  // ── Power arc gauge ───────────────────────────────────────────────────────────

  _renderPower() {
    const cfg = this._config;
    if (!cfg.show_power || !cfg.power_entity) return "";
    const stateObj = this._stateOf(cfg.power_entity);
    const rawW     = stateObj ? parseFloat(stateObj.state) : 0;
    const watts    = isNaN(rawW) ? 0 : rawW;
    const maxW     = parseFloat(cfg.power_max_w) || 3000;
    const color    = _powerSeverityColor(watts, maxW);

    const enState  = cfg.power_energy_entity ? this._stateOf(cfg.power_energy_entity) : null;
    const kwh      = enState ? parseFloat(enState.state).toFixed(2) + " kWh" : "";

    const ampState = cfg.power_current_entity ? this._stateOf(cfg.power_current_entity) : null;
    const amps     = ampState ? parseFloat(ampState.state).toFixed(2) + " A" : "";

    const R    = 30;
    const C    = 2 * Math.PI * R;
    const arc  = C * 0.75;
    const pct  = Math.min(1, Math.max(0, watts / maxW));
    const fill = pct * arc;

    return html`
      <div class="power-section">
        <div class="power-tile" style="cursor:pointer" @click="${() => this._moreInfo(cfg.power_entity)}">
          <div class="power-arc-wrap">
            <svg width="76" height="76" viewBox="0 0 76 76" style="transform:rotate(-135deg);overflow:visible">
              <circle cx="38" cy="38" r="${R}"
                fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="5"
                stroke-dasharray="${arc.toFixed(2)} ${(C - arc).toFixed(2)}"
                stroke-linecap="round"/>
              <circle cx="38" cy="38" r="${R}"
                fill="none" stroke="${color}" stroke-width="5"
                stroke-dasharray="${fill.toFixed(2)} ${(C - fill).toFixed(2)}"
                stroke-linecap="round"
                style="filter:drop-shadow(0 0 5px ${color})"/>
            </svg>
            <div class="power-arc-center">
              <div class="power-arc-val">${Math.round(watts)}</div>
              <div class="power-arc-unit">W</div>
            </div>
          </div>
          <div class="power-text">
            <div class="power-main" style="color:${color}">${Math.round(watts)}<span class="power-main-unit"> W</span></div>
            <div class="power-consuming" style="color:${color}">Consuming</div>
            <div class="power-sub">
              ${kwh  ? html`<div class="power-sub-item"><div class="power-sub-val">${kwh}</div><div class="power-sub-lbl">Energy</div></div>` : ""}
              ${amps ? html`<div class="power-sub-item"><div class="power-sub-val">${amps}</div><div class="power-sub-lbl">Current</div></div>` : ""}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ── Mower SVG ─────────────────────────────────────────────────────────────────

  _mowerSVG(state) {
    const isMowing    = state === "mowing";
    const isReturning = state === "returning";
    const isActive    = isMowing || isReturning;
    const isError     = state === "error";
    const isDocked    = state === "docked";
    const opacity     = isDocked ? "0.5" : "1";
    const spinCls     = isMowing ? "mow-spin" : "";
    const bodyFill    = isError ? "#7f1d1d" : "#3d4a52";
    const domeFill    = isError ? "#991b1b" : "#4a5760";
    const stopFill    = isError ? "#fca5a5" : "#dc2626";
    const grassOp     = isActive ? "1" : "0";
    const bladeOp     = isMowing ? "1" : "0";
    const motionOp    = isActive ? "0.18" : "0";

    return html`
      <svg viewBox="0 0 64 48" width="64" height="48" fill="none"
           xmlns="http://www.w3.org/2000/svg"
           style="opacity:${opacity};overflow:visible;flex-shrink:0">
        <g opacity="${grassOp}">
          <path d="M3 36 C3 29 1 25 1 20" stroke="#22c55e" stroke-width="2" stroke-linecap="round"/>
          <path d="M3 36 C4 27 7 24 8 19" stroke="#4ade80" stroke-width="2" stroke-linecap="round"/>
          <path d="M9 36 C9 28 7 24 6 19" stroke="#22c55e" stroke-width="2" stroke-linecap="round"/>
          <line x1="9" y1="36" x2="64" y2="36" stroke="#fbbf24" stroke-width="0.9" stroke-dasharray="2.5 2" opacity="0.65"/>
          <path d="M55 36 C55 32 54 30 54 28" stroke="#4ade80" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M59 36 C59 32 60 30 61 28" stroke="#22c55e" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M62 36 C62 32 61 30 60 28" stroke="#4ade80" stroke-width="1.4" stroke-linecap="round"/>
        </g>
        <g opacity="${motionOp}">
          <line x1="14" y1="27" x2="10" y2="27" stroke="white" stroke-width="1" stroke-linecap="round"/>
          <line x1="14" y1="31" x2="9"  y2="31" stroke="white" stroke-width="1" stroke-linecap="round"/>
        </g>
        <path d="M14 36 Q14 24 20 22 L52 22 Q58 22 58 30 L58 36 Z" fill="${bodyFill}" opacity="0.98"/>
        <path d="M18 22 Q18 15 26 14 L48 14 Q56 14 56 20 L56 22 L18 22 Z" fill="${domeFill}" opacity="0.95"/>
        <path d="M20 18 L52 18" stroke="rgba(255,255,255,0.08)" stroke-width="0.8"/>
        <rect x="22" y="14" width="7" height="3.5" rx="1.5" fill="${stopFill}" opacity="0.95"/>
        <rect x="22.5" y="14.5" width="6" height="1.5" rx="0.8" fill="#ef4444" opacity="0.6"/>
        <circle cx="50" cy="29" r="5" fill="#1a1f35" stroke="rgba(255,255,255,0.2)" stroke-width="0.8"/>
        <line x1="47.5" y1="26.5" x2="47.5" y2="31.5" stroke="white" stroke-width="1.4" stroke-linecap="round" opacity="0.9"/>
        <line x1="52.5" y1="26.5" x2="52.5" y2="31.5" stroke="white" stroke-width="1.4" stroke-linecap="round" opacity="0.9"/>
        <line x1="47.5" y1="29"   x2="52.5" y2="29"   stroke="white" stroke-width="1.2" stroke-linecap="round" opacity="0.9"/>
        <circle cx="22" cy="36" r="9" fill="#2d3748"/>
        <circle cx="22" cy="36" r="7.5" fill="#1a202c"/>
        <g class="${spinCls}" style="transform-origin:22px 36px">
          <line x1="22" y1="28.5" x2="22" y2="43.5" stroke="rgba(255,255,255,0.25)" stroke-width="1.2"/>
          <line x1="14.5" y1="36" x2="29.5" y2="36" stroke="rgba(255,255,255,0.25)" stroke-width="1.2"/>
          <line x1="16.7" y1="30.7" x2="27.3" y2="41.3" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
          <line x1="27.3" y1="30.7" x2="16.7" y2="41.3" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
        </g>
        <circle cx="22" cy="36" r="3" fill="#4a5568"/>
        <circle cx="22" cy="36" r="1.5" fill="rgba(255,255,255,0.3)"/>
        <circle cx="50" cy="36" r="9" fill="#2d3748"/>
        <circle cx="50" cy="36" r="7.5" fill="#1a202c"/>
        <g class="${spinCls}" style="transform-origin:50px 36px">
          <line x1="50" y1="28.5" x2="50" y2="43.5" stroke="rgba(255,255,255,0.28)" stroke-width="1.2"/>
          <line x1="42.5" y1="36" x2="57.5" y2="36" stroke="rgba(255,255,255,0.28)" stroke-width="1.2"/>
          <line x1="44.7" y1="30.7" x2="55.3" y2="41.3" stroke="rgba(255,255,255,0.18)" stroke-width="1"/>
          <line x1="55.3" y1="30.7" x2="44.7" y2="41.3" stroke="rgba(255,255,255,0.18)" stroke-width="1"/>
        </g>
        <circle cx="50" cy="36" r="3" fill="#4a5568"/>
        <circle cx="50" cy="36" r="1.5" fill="rgba(255,255,255,0.3)"/>
        <ellipse cx="35" cy="37.5" rx="3" ry="2" fill="#2d3748"/>
        <g opacity="${bladeOp}">
          <circle cx="36" cy="37" r="3.5" fill="rgba(34,197,94,0.08)" stroke="rgba(34,197,94,0.3)" stroke-width="0.8"/>
          <g class="mow-spin-fast" style="transform-origin:36px 37px">
            <line x1="32.5" y1="37" x2="39.5" y2="37" stroke="#22c55e" stroke-width="1" stroke-linecap="round"/>
            <line x1="36" y1="33.5" x2="36" y2="40.5" stroke="#22c55e" stroke-width="1" stroke-linecap="round"/>
          </g>
        </g>
      </svg>
    `;
  }

  // ── Mower tile ────────────────────────────────────────────────────────────────

  _renderMower() {
    const cfg = this._config;
    if (!cfg.show_mower || !cfg.mower_entity) return "";

    const stateObj    = this._stateOf(cfg.mower_entity);
    const state       = stateObj ? stateObj.state : "unknown";
    const name        = cfg.mower_name || (stateObj ? this._friendlyName(cfg.mower_entity) : "Mower");
    const ago         = this._agoStr(stateObj ? stateObj.last_changed : null);

    const battState   = cfg.mower_battery_entity ? this._stateOf(cfg.mower_battery_entity) : null;
    const battPct     = battState ? Math.round(parseFloat(battState.state)) : null;
    const battColor   = battPct === null ? "#6b7280"
                      : battPct > 50 ? "#22c55e"
                      : battPct > 20 ? "#fbbf24" : "#ef4444";

    const BADGES = {
      mowing:    { label: "Mowing",    color: "#22c55e", bg: "rgba(34,197,94,0.15)"   },
      docked:    { label: "Docked",    color: "#60a5fa", bg: "rgba(99,179,237,0.15)"  },
      paused:    { label: "Paused",    color: "#a855f7", bg: "rgba(168,85,247,0.15)"  },
      returning: { label: "Returning", color: "#fbbf24", bg: "rgba(251,191,36,0.15)"  },
      error:     { label: "Error",     color: "#ef4444", bg: "rgba(239,68,68,0.18)"   },
    };
    const badge = BADGES[state] || { label: state, color: "#6b7280", bg: "rgba(107,114,128,0.15)" };
    const iconBg  = state === "mowing" ? "rgba(34,197,94,0.15)" : "rgba(99,179,237,0.1)";
    const iconBdr = state === "mowing" ? "rgba(34,197,94,0.3)"  : "rgba(99,179,237,0.2)";

    const isMowing    = state === "mowing";
    const isReturning = state === "returning";

    const _callMower = (action) => {
      if (!this._hass || !cfg.mower_entity) return;
      this._hass.callService("lawn_mower", action, { entity_id: cfg.mower_entity });
    };

    return html`
      <div class="mower-section">
        <div class="mower-tile">
          <div class="mower-header" style="cursor:pointer" @click="${() => this._moreInfo(cfg.mower_entity)}">
            <div class="mower-icon-box" style="background:${iconBg};border-color:${iconBdr}">🤖</div>
            <div class="mower-info">
              <div class="mower-name">${name}</div>
              <div class="mower-status-row">
                ${ago ? html`<span class="mower-ago">${ago}</span>` : ""}
                <span class="mower-badge" style="color:${badge.color};background:${badge.bg}">${badge.label}</span>
              </div>
            </div>
            ${this._mowerSVG(state)}
          </div>
          ${battPct !== null ? html`
            <div class="mower-batt">
              <span class="mower-batt-ico">🔋</span>
              <div class="mower-batt-track">
                <div class="mower-batt-fill" style="width:${battPct}%;background:${battColor}"></div>
              </div>
              <div class="mower-batt-pct">${battPct}%</div>
            </div>
          ` : ""}
          <div class="mower-btns">
            ${(isMowing || isReturning) ? html`
              <button class="mow-btn mow-pause" @click="${() => _callMower("pause")}">⏸ Pause</button>
            ` : html`
              <button class="mow-btn mow-start" @click="${() => _callMower("start_mowing")}">▶ Start Mowing</button>
            `}
            <button class="mow-btn mow-dock" @click="${() => _callMower("dock")}">⬆ Return to Dock</button>
          </div>
        </div>
      </div>
    `;
  }

  // ── Camera ────────────────────────────────────────────────────────────────────

  _renderCamera() {
    const entityId = this._config.camera_entity;
    if (!entityId || !this._config.show_camera) return "";
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
          .entityId=${entityId}
          @camera-more-info="${(e) => this._moreInfo(e.detail.entityId)}"
        ></room-card-stream>
      </div>
    `;
  }

  // ── MAIN RENDER ───────────────────────────────────────────────────────────────

  render() {
    if (!this._config || !this._hass) return html``;

    const cfg      = this._config;
    const { date, time } = this._now();
    const online   = this._isOnline(cfg.status_entity);
    const climate  = cfg.climate_sensors || [];
    const binary   = cfg.binary_sensors  || [];
    const switches = cfg.switches        || [];
    const snCols   = Math.max(1, Math.min(4, parseInt(cfg.sensor_columns) || 1));
    const swCols   = switches.length === 1 ? 1
                   : switches.length === 2 ? 2
                   : switches.length === 3 ? 3
                   : switches.length <= 4 ? 2 : 3;

    return html`
      <ha-card>
        <div class="card">
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

          ${climate.length > 0 ? html`
            <div class="sensors-row">
              ${climate.map((s) => this._renderClimateSensor(s))}
            </div>` : ""}

          ${cfg.show_camera && cfg.camera_entity ? html`
            <div class="camera-section">${this._renderCamera()}</div>` : ""}

          ${cfg.show_power && cfg.power_entity ? this._renderPower() : ""}

          ${cfg.show_mower && cfg.mower_entity ? this._renderMower() : ""}

          ${(binary.length > 0 || switches.length > 0) ? html`<div class="glow-line"></div>` : ""}

          ${binary.length > 0 ? html`
            <div class="${snCols > 1 ? "sensors-grid" : "sensors-list"}"
                 style="${snCols > 1 ? `--sn-cols:${snCols}` : ""}">
              ${binary.map((s) => this._renderBinarySensor(s))}
            </div>` : ""}

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

      .sensors-row {
        display: flex; gap: 12px;
        padding: 0 16px 12px; position: relative; z-index: 1;
      }
      .sensor-tile {
        flex: 1; background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 14px; padding: 12px;
        display: flex; align-items: center; gap: 10px;
        min-width: 0;
      }
      .gauge-wrap { position: relative; width: 52px; height: 52px; flex-shrink: 0; }
      .gauge-wrap svg { transform: rotate(-90deg); }
      .gauge-center {
        position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
        display: flex; flex-direction: column; align-items: center; pointer-events: none;
      }
      .gauge-val-sm  { font-size: 10px; font-weight: 700; color: #fff; line-height: 1; }
      .gauge-unit-sm { font-size: 6px; color: rgba(255,255,255,0.5); }
      .sensor-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
      .sensor-value { font-size: 20px; font-weight: 700; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .sensor-unit  { font-size: 12px; font-weight: 400; }
      .sensor-label { font-size: 9px; letter-spacing: 1.5px; color: rgba(255,255,255,0.35); text-transform: uppercase; margin-top: 2px; }

      .camera-section { margin: 0 16px 12px; position: relative; z-index: 1; }
      .camera-container { border-radius: 14px; overflow: hidden; position: relative; border: 1px solid rgba(255,255,255,0.08); background: #0a0e1a; }
      room-card-stream { display: block; width: 100%; }
      .camera-placeholder {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 6px; padding: 24px; border-radius: 14px;
        background: rgba(255,255,255,0.03); border: 1px dashed rgba(255,255,255,0.1);
        color: rgba(255,255,255,0.3); font-size: 0.75rem;
      }

      .glow-line {
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(99,179,237,0.3), rgba(168,85,247,0.3), transparent);
        margin: 0 16px;
      }

      .sensors-list {
        margin: 12px 16px 12px;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.07);
        border-radius: 14px; overflow: hidden; position: relative; z-index: 1;
      }
      .sensor-row {
        display: flex; align-items: center;
        padding: 11px 14px; gap: 10px; cursor: pointer;
        transition: background 0.15s;
      }
      .sensor-row:hover { background: rgba(255,255,255,0.05); }
      .sensor-row:not(:last-child) { border-bottom: 1px solid rgba(255,255,255,0.05); }

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
      .state-clear    { color: #34d399; }
      .state-detected { color: #f87171; animation: motion-pulse 1.5s ease-in-out infinite; }
      @keyframes motion-pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
      .motion-row-active .sensor-icon { animation: icon-pulse 1.5s ease-in-out infinite; }

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

      .power-section { margin: 0 16px 12px; position: relative; z-index: 1; }
      .power-tile {
        background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
        border-radius: 14px; padding: 12px 14px;
        display: flex; align-items: center; gap: 14px;
      }
      .power-arc-wrap { position: relative; width: 76px; height: 76px; flex-shrink: 0; }
      .power-arc-center {
        position: absolute; inset: 0;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
      }
      .power-arc-val  { font-size: 15px; font-weight: 700; color: #fff; line-height: 1; }
      .power-arc-unit { font-size: 8px; color: rgba(255,255,255,0.4); letter-spacing: 0.5px; margin-top: 1px; }
      .power-text { flex: 1; display: flex; flex-direction: column; gap: 5px; min-width: 0; }
      .power-main { font-size: 24px; font-weight: 700; line-height: 1; }
      .power-main-unit { font-size: 12px; color: rgba(255,255,255,0.45); }
      .power-sub { display: flex; gap: 14px; }
      .power-sub-item { display: flex; flex-direction: column; gap: 1px; }
      .power-sub-val { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.7); }
      .power-sub-lbl { font-size: 8px; letter-spacing: 0.9px; color: rgba(255,255,255,0.28); text-transform: uppercase; }
      .power-consuming { font-size: 8px; letter-spacing: 1.1px; text-transform: uppercase; font-weight: 700; }

      .mower-section { margin: 0 16px 12px; position: relative; z-index: 1; }
      .mower-tile {
        background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
        border-radius: 14px; padding: 12px 14px;
        display: flex; flex-direction: column; gap: 10px;
      }
      .mower-header { display: flex; align-items: center; gap: 10px; }
      .mower-icon-box {
        width: 36px; height: 36px; border-radius: 9px;
        border: 1px solid; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center; font-size: 18px;
      }
      .mower-info { flex: 1; min-width: 0; }
      .mower-name { font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.9); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .mower-status-row { display: flex; align-items: center; gap: 6px; margin-top: 2px; }
      .mower-ago { font-size: 10px; color: rgba(255,255,255,0.3); }
      .mower-badge { font-size: 9px; font-weight: 700; letter-spacing: 0.5px; padding: 2px 8px; border-radius: 9px; text-transform: uppercase; }
      .mower-batt { display: flex; align-items: center; gap: 7px; }
      .mower-batt-ico { font-size: 11px; opacity: 0.5; }
      .mower-batt-track { flex: 1; height: 3px; background: rgba(255,255,255,0.08); border-radius: 2px; overflow: hidden; }
      .mower-batt-fill  { height: 100%; border-radius: 2px; transition: width 0.4s, background 0.4s; }
      .mower-batt-pct   { font-size: 10px; color: rgba(255,255,255,0.4); width: 30px; text-align: right; flex-shrink: 0; }
      .mower-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
      .mow-btn {
        padding: 8px 0; border-radius: 9px; border: 1px solid;
        background: transparent; font-size: 11px; font-weight: 600;
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        gap: 5px; font-family: inherit; transition: all 0.18s;
        -webkit-tap-highlight-color: transparent;
      }
      .mow-btn:active { transform: scale(0.97); }
      .mow-start { border-color: rgba(34,197,94,0.28);  color: #22c55e; background: rgba(34,197,94,0.08); }
      .mow-pause { border-color: rgba(168,85,247,0.28); color: #a855f7; background: rgba(168,85,247,0.08); }
      .mow-dock  { border-color: rgba(251,191,36,0.25); color: #fbbf24; background: rgba(251,191,36,0.08); }

      @keyframes mow-spin      { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      @keyframes mow-spin-fast { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      .mow-spin      { animation: mow-spin      1.8s linear infinite; }
      .mow-spin-fast { animation: mow-spin-fast 0.7s linear infinite; }
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

  // ── Color stop editor ─────────────────────────────────────────────────────────
  // Renders the gradient bar + per-stop rows (value field + color picker + remove)
  // Used for both temp_color_stops and hum_color_stops

  _renderColorStops(stopsKey, unit, defaults) {
    const stops = this._config[stopsKey] && this._config[stopsKey].length
      ? this._config[stopsKey]
      : JSON.parse(JSON.stringify(defaults));

    // Build CSS gradient string for preview bar
    const sorted = [...stops].sort((a, b) => a.pos - b.pos);
    const gradientColors = sorted.map((s) => s.color).join(",");
    const gradientBar = sorted.length > 1
      ? `linear-gradient(to right,${gradientColors})`
      : sorted.length === 1 ? sorted[0].color : "#334155";

    const _updateStop = (idx, field, value) => {
      const newStops = stops.map((s, i) =>
        i === idx ? { ...s, [field]: field === "pos" ? parseFloat(value) || 0 : value } : s
      );
      this._set(stopsKey, newStops);
    };

    const _removeStop = (idx) => {
      if (stops.length <= 2) return; // keep at least 2 stops
      const newStops = stops.filter((_, i) => i !== idx);
      this._set(stopsKey, newStops);
    };

    const _addStop = () => {
      const sorted2 = [...stops].sort((a, b) => a.pos - b.pos);
      const lastPos = sorted2[sorted2.length - 1]?.pos || 0;
      const newPos  = Math.min(lastPos + 10, unit === "°C" ? 60 : 100);
      this._set(stopsKey, [...stops, { pos: newPos, color: "#94a3b8" }]);
    };

    const _resetDefaults = () => {
      this._set(stopsKey, JSON.parse(JSON.stringify(defaults)));
    };

    return html`
      <div class="gradient-bar" style="background:${gradientBar}"></div>
      ${stops.map((stop, idx) => html`
        <div class="stop-row">
          <div class="stop-dot" style="background:${stop.color}"></div>
          <input class="ed-input stop-val-input" type="number"
            .value="${stop.pos}"
            @input="${(e) => _updateStop(idx, "pos", e.target.value)}" />
          <span class="stop-unit-lbl">${unit}</span>
          <span class="stop-arrow">→</span>
          <div class="color-swatch-wrap">
            <input type="color" class="color-swatch-input"
              .value="${stop.color}"
              @input="${(e) => _updateStop(idx, "color", e.target.value)}" />
          </div>
          <button class="btn-remove-sm"
            ?disabled="${stops.length <= 2}"
            @click="${() => _removeStop(idx)}">✕</button>
        </div>
      `)}
      <div class="stop-actions">
        <button class="btn-add sm" @click="${_addStop}">+ Add stop</button>
        <button class="btn-reset" @click="${_resetDefaults}">↺ Reset defaults</button>
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
          Displayed side-by-side. Arc and value colors are interpolated from your configured
          color stops below. Sensor type (temperature / humidity / etc.) is auto-detected.
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

  // ── TAB: Colors ───────────────────────────────────────────────────────────────

  _tabColors() {
    return html`
      <div class="section">
        <div class="section-title">Temperature Color Stops</div>
        <p class="hint">
          Enter a °C value and pick a color for each stop. The arc and value text
          interpolate smoothly between stops. Minimum 2 stops required.
        </p>
        ${this._renderColorStops("temp_color_stops", "°C", DEFAULT_TEMP_STOPS)}
      </div>
      <div class="section">
        <div class="section-title">Humidity Color Stops</div>
        <p class="hint">
          Enter a % value and pick a color for each stop. Default: orange (dry) →
          green (normal 40–60%) → red (humid).
        </p>
        ${this._renderColorStops("hum_color_stops", "%", DEFAULT_HUM_STOPS)}
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

  // ── TAB: Power ───────────────────────────────────────────────────────────────

  _tabPower() {
    const cfg = this._config;
    return html`
      <div class="section">
        <div class="section-title">Power Display</div>
        <p class="hint">Arc gauge showing current wattage. Color shifts green→yellow→orange→red as load increases.</p>
        ${this._toggle("Show Power Gauge", cfg.show_power, (v) => this._set("show_power", v))}
        ${cfg.show_power ? html`
          <label class="ed-label">Power Sensor (W) — required</label>
          ${this._renderEntitySearch("power_entity", cfg.power_entity,
              (v) => this._set("power_entity", v), ["sensor"], "— select power sensor —")}
          <label class="ed-label">Energy Sensor (kWh) — optional</label>
          ${this._renderEntitySearch("power_energy_entity", cfg.power_energy_entity,
              (v) => this._set("power_energy_entity", v), ["sensor"], "— select energy sensor —")}
          <label class="ed-label">Current Sensor (A) — optional</label>
          ${this._renderEntitySearch("power_current_entity", cfg.power_current_entity,
              (v) => this._set("power_current_entity", v), ["sensor"], "— select current sensor —")}
          ${this._txt("Max Wattage (W)", cfg.power_max_w !== undefined ? String(cfg.power_max_w) : "3000",
              (v) => this._set("power_max_w", parseFloat(v) || 3000), "e.g. 3000")}
        ` : ""}
      </div>
    `;
  }

  // ── TAB: Mower ───────────────────────────────────────────────────────────────

  _tabMower() {
    const cfg = this._config;
    return html`
      <div class="section">
        <div class="section-title">Husqvarna Automower</div>
        <p class="hint">
          Displays state badge, battery bar and Start / Pause / Return to Dock controls.
        </p>
        ${this._toggle("Show Mower Widget", cfg.show_mower, (v) => this._set("show_mower", v))}
        ${cfg.show_mower ? html`
          <label class="ed-label">Mower Entity (lawn_mower.*) — required</label>
          ${this._renderEntitySearch("mower_entity", cfg.mower_entity,
              (v) => this._set("mower_entity", v), ["lawn_mower"], "— select mower —")}
          <label class="ed-label">Battery Sensor (sensor.*) — optional</label>
          ${this._renderEntitySearch("mower_battery_entity", cfg.mower_battery_entity,
              (v) => this._set("mower_battery_entity", v), ["sensor"], "— select battery sensor —")}
          ${this._txt("Display Name", cfg.mower_name,
              (v) => this._set("mower_name", v), "e.g. Husqvarna Automower")}
        ` : ""}
      </div>
    `;
  }

  render() {
    if (!this._config) return html``;
    const tabs = [
      { id: "general",  label: "General"  },
      { id: "climate",  label: "Climate"  },
      { id: "colors",   label: "Colors"   },
      { id: "sensors",  label: "Sensors"  },
      { id: "switches", label: "Switches" },
      { id: "power",    label: "Power"    },
      { id: "mower",    label: "Mower"    },
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
          ${this._activeTab === "colors"   ? this._tabColors()   : ""}
          ${this._activeTab === "sensors"  ? this._tabSensors()  : ""}
          ${this._activeTab === "switches" ? this._tabSwitches() : ""}
          ${this._activeTab === "power"    ? this._tabPower()    : ""}
          ${this._activeTab === "mower"    ? this._tabMower()    : ""}
        </div>
      </div>
    `;
  }

  static get styles() {
    return css`
      :host { display: block; font-family: 'Segoe UI', sans-serif; }
      .editor-root { display: flex; flex-direction: column; }

      .tab-bar { display: flex; flex-wrap: wrap; border-bottom: 1px solid rgba(0,0,0,0.15); background: var(--card-background-color, #1e293b); border-radius: 8px 8px 0 0; }
      .tab-btn { flex: 1; min-width: 60px; padding: 8px 4px; font-size: 0.68rem; font-weight: 600; letter-spacing: 0.04em; border: none; background: transparent; color: var(--secondary-text-color, #94a3b8); cursor: pointer; transition: background 0.15s, color 0.15s; text-transform: uppercase; }
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
      .btn-remove-sm:disabled { opacity: 0.3; cursor: not-allowed; }

      /* ── Color stop editor ── */
      .gradient-bar { height: 10px; border-radius: 5px; margin-bottom: 10px; border: 1px solid var(--divider-color, #334155); }
      .stop-row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
      .stop-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; border: 1px solid rgba(255,255,255,0.15); }
      .stop-val-input { width: 62px !important; flex: none !important; padding: 5px 7px !important; font-size: 0.78rem !important; }
      .stop-unit-lbl { font-size: 0.72rem; color: var(--secondary-text-color, #64748b); flex-shrink: 0; width: 18px; }
      .stop-arrow { font-size: 0.75rem; color: var(--secondary-text-color, #64748b); flex-shrink: 0; }
      .color-swatch-wrap { width: 32px; height: 28px; border-radius: 5px; border: 1px solid var(--divider-color, #334155); overflow: hidden; flex-shrink: 0; }
      .color-swatch-input { width: 200%; height: 200%; margin: -25%; border: none; cursor: pointer; padding: 0; }
      .stop-actions { display: flex; gap: 8px; margin-top: 4px; }
      .btn-reset { padding: 7px 10px; font-size: 0.72rem; font-weight: 600; border: 1px solid var(--divider-color, #334155); border-radius: 6px; background: transparent; color: var(--secondary-text-color, #94a3b8); cursor: pointer; }
      .btn-reset:hover { background: rgba(255,255,255,0.05); }
    `;
  }
}

// ─────────────────────────────────────────────
// CAMERA STREAM SUB-ELEMENT
// ─────────────────────────────────────────────
class RoomCardStream extends LitElement {
  static get properties() {
    return {
      hass:     {},
      stateObj: {},
      label:    {},
      entityId: {},
    };
  }

  _fireMoreInfo() {
    if (!this.entityId) return;
    this.dispatchEvent(new CustomEvent("camera-more-info", {
      bubbles: true, composed: true,
      detail: { entityId: this.entityId },
    }));
  }

  updated(changedProps) {
    if (!changedProps.has("stateObj") && !changedProps.has("hass")) return;
    const stream = this.shadowRoot.querySelector("ha-camera-stream");
    if (!stream) return;
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
      <div class="stream-wrap" @click="${() => this._fireMoreInfo()}">
        <ha-camera-stream allow-exoplayer muted playsinline></ha-camera-stream>
        <div class="stream-overlay">
          <span class="stream-label">${(this.label || "").toUpperCase()}</span>
          <div class="stream-right">
            <span class="stream-live">● LIVE</span>
            <button class="stream-fs-btn"
              title="Open fullscreen"
              @click="${(e) => { e.stopPropagation(); this._fireMoreInfo(); }}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2.2"
                   stroke-linecap="round" stroke-linejoin="round">
                <polyline points="15 3 21 3 21 9"/>
                <polyline points="9 21 3 21 3 15"/>
                <line x1="21" y1="3" x2="14" y2="10"/>
                <line x1="3" y1="21" x2="10" y2="14"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  static get styles() {
    return css`
      :host { display: block; }
      .stream-wrap { position: relative; border-radius: 14px; overflow: hidden; background: #0a0e1a; border: 1px solid rgba(255,255,255,0.08); }
      ha-camera-stream { width: 100%; display: block; max-height: 350px; object-fit: cover; --video-border-radius: 0; }
      .stream-overlay { position: absolute; bottom: 0; left: 0; right: 0; padding: 8px 12px; background: linear-gradient(transparent, rgba(0,0,0,0.6)); display: flex; justify-content: space-between; align-items: flex-end; }
      .stream-label { font-size: 10px; letter-spacing: 1px; color: rgba(255,255,255,0.5); text-transform: uppercase; }
      .stream-live  { font-size: 9px; letter-spacing: 1px; color: #f87171; font-weight: 600; border: 1px solid rgba(248,113,113,0.4); padding: 2px 6px; border-radius: 4px; }
      .stream-right { display: flex; align-items: center; gap: 6px; }
      .stream-wrap  { cursor: pointer; }
      .stream-fs-btn { width: 26px; height: 26px; border-radius: 6px; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.18); display: flex; align-items: center; justify-content: center; cursor: pointer; color: rgba(255,255,255,0.75); transition: background 0.2s; padding: 0; }
      .stream-fs-btn:hover  { background: rgba(99,179,237,0.25); color: #fff; }
      .stream-fs-btn:active { transform: scale(0.92); }
    `;
  }
}

// ── REGISTER ──────────────────────────────────────────────────────────────────
customElements.define("room-card-stream", RoomCardStream);
customElements.define("room-card", RoomCard);
customElements.define("room-card-editor", RoomCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "room-card",
  name: "Room Card",
  description: "Universal configurable room card — climate gauges with configurable color stops, binary sensors, switches, optional camera.",
  preview: true,
  documentationURL: "https://github.com/robman2026/room-card",
});

console.info(
  "%c ROOM-CARD %c v1.5.0 ",
  "color:white;background:#3b82f6;font-weight:bold;padding:2px 4px;border-radius:3px 0 0 3px;",
  "color:#3b82f6;background:#0f172a;font-weight:bold;padding:2px 4px;border-radius:0 3px 3px 0;"
);
