# 🏠 Room Card — Universal Home Assistant Custom Card

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/custom-components/hacs)
[![GitHub Release](https://img.shields.io/github/release/robman2026/room-card.svg)](https://github.com/robman2026/room-card/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A fully configurable, visually polished room card for [Home Assistant](https://www.home-assistant.io/) dashboards.  
Inspired by the Samsung SmartThings aesthetic — dark glassmorphism with circular gauges, sensor rows, switch tiles, and optional camera feed.

---

## 📸 Preview

> Matches the bedroom card style from your dashboard — dark theme, circular gauges for temp/humidity, sensor rows with configurable state colours, auto-fit switch tiles, and camera feed.

---

## ✨ Features

| Feature | Details |
|---|---|
| **Room Identity** | Custom name, MDI icon |
| **Date & Time** | Optional header clock (toggleable) |
| **Status Dot** | Green/grey online indicator, optionally bound to an entity |
| **Climate Gauges** | Circular arc gauges — temperature, humidity, CO₂, any sensor |
| **Binary Sensors** | Door/window/motion rows with fully configurable state → label → colour mapping |
| **Switch Tiles** | Tappable tiles for lights/switches/fans, auto-fits 1–3 columns |
| **Camera Feed** | Optional live stream with timestamp overlay |
| **Visual Editor** | Full tab-based GUI editor — no YAML required |
| **Entity Search** | Filtered dropdowns by domain in the editor |

---

## 📦 Installation

### Via HACS (recommended)

1. Open **HACS → Frontend**
2. Click **⋮ → Custom repositories**
3. Add URL: `https://github.com/robman2026/room-card`  — Category: **Lovelace**
4. Search for **Room Card** and install
5. Add the resource and reload

### Manual

1. Copy `room-card.js` to `<config>/www/room-card/room-card.js`
2. Add a resource in your dashboard:
   - **URL:** `/local/room-card/room-card.js`
   - **Type:** `JavaScript Module`
3. Reload the browser

---

## ⚙️ Configuration

### Minimal (YAML)

```yaml
type: custom:room-card
room_name: Living Room
room_icon: mdi:sofa
```

### Full Example

```yaml
type: custom:room-card
room_name: Bedroom
room_icon: mdi:bed
show_datetime: true
show_status_dot: true
status_entity: binary_sensor.bedroom_presence

climate_sensors:
  - entity: sensor.bedroom_temperature
    label: Temperature
    unit: "°C"
    icon: mdi:thermometer
    min: 10
    max: 35
    color: "#22c55e"
  - entity: sensor.bedroom_humidity
    label: Humidity
    unit: "%"
    icon: mdi:water-percent
    min: 0
    max: 100
    color: "#3b82f6"

binary_sensors:
  - entity: binary_sensor.window_left
    label: Window Left
    icon: mdi:window-open
    state_map:
      "on":
        label: Open
        color: "#f59e0b"
      "off":
        label: Closed
        color: "#6b7280"
  - entity: binary_sensor.motion_bedroom
    label: Movement
    icon: mdi:run
    state_map:
      "on":
        label: Detected
        color: "#ef4444"
      "off":
        label: Clear
        color: "#22c55e"

switches:
  - entity: light.bedroom_kid2
    label: KID 2
    icon: mdi:lightbulb
    color: "#f59e0b"
  - entity: light.bedroom_kid1
    label: KID 1
    icon: mdi:lightbulb
    color: "#f59e0b"

show_camera: true
camera_entity: camera.bedroom
```

---

## 🎛️ Configuration Reference

### Card Root Options

| Key | Type | Default | Description |
|---|---|---|---|
| `room_name` | string | `"Room"` | Display name of the room |
| `room_icon` | string | `"mdi:home"` | MDI icon for the room |
| `show_datetime` | boolean | `true` | Show live date & time in header |
| `show_status_dot` | boolean | `false` | Show online/offline dot |
| `status_entity` | string | `""` | Entity to derive online status from (any non-unavailable state = online) |
| `show_camera` | boolean | `false` | Show camera feed section |
| `camera_entity` | string | `""` | Camera entity ID |

### `climate_sensors[]`

| Key | Type | Default | Description |
|---|---|---|---|
| `entity` | string | required | Sensor entity ID |
| `label` | string | friendly name | Display label below gauge |
| `unit` | string | from entity | Override unit of measurement |
| `icon` | string | `mdi:thermometer` | MDI icon inside gauge |
| `min` | number | `0` | Minimum value for arc |
| `max` | number | `100` | Maximum value for arc |
| `color` | string | `#22c55e` | Arc and icon colour (hex) |

### `binary_sensors[]`

| Key | Type | Default | Description |
|---|---|---|---|
| `entity` | string | required | Entity ID (binary_sensor, sensor, etc.) |
| `label` | string | friendly name | Display label |
| `icon` | string | `mdi:toggle-switch` | MDI icon |
| `state_map` | object | see defaults | Map state strings → `{ label, color }` |

**Default `state_map` values** (applied if you don't override):

| State | Label | Colour |
|---|---|---|
| `on` | On | `#f59e0b` |
| `off` | Off | `#6b7280` |
| `open` | Open | `#f59e0b` |
| `closed` | Closed | `#6b7280` |
| `detected` | Detected | `#ef4444` |
| `clear` | Clear | `#22c55e` |
| `home` | Home | `#22c55e` |
| `away` | Away | `#f59e0b` |

### `switches[]`

| Key | Type | Default | Description |
|---|---|---|---|
| `entity` | string | required | Entity ID (light, switch, input_boolean, fan, automation) |
| `label` | string | friendly name | Display label |
| `icon` | string | `mdi:lightbulb` | MDI icon |
| `color` | string | `#f59e0b` | Active state colour |

> Tile columns auto-fit: 1 tile → 1 col, 2 → 2 col, 3 → 3 col, 4 → 2×2, 5–6 → 3-col grid, etc.

---

## 🖥️ Visual Editor

The card includes a full **4-tab GUI editor**:

- **General** — Room name, icon, header options, camera toggle
- **Climate** — Add/remove/configure gauge sensors
- **Sensors** — Add/remove binary sensor rows, build state maps with colour pickers
- **Switches** — Add/remove tappable switch tiles

All entity fields are **searchable filtered dropdowns** by domain.

---

## 🗂️ Repository Structure

```
room-card/
├── room-card.js          # Single-file card (card + editor)
├── README.md
├── hacs.json
└── LICENSE
```

---

## 📋 `hacs.json`

Already included — see the file in this repo.

---

## 🛣️ Roadmap

- [ ] Light colour / brightness slider on long-press
- [ ] Configurable card background colour/gradient
- [ ] History sparkline for climate sensors
- [ ] Alarm/alert badge overlay

---

## 📄 License

MIT © [robman2026](https://github.com/robman2026)
