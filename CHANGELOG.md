# Changelog

## 1.0.0 — 2026-11-05

- Windows Desktop caption pill: rounded box with one indicator light and a
  status label, placed immediately after the Desktop-owned 应用 / 编辑 menus.
- Green light for `resolved` newest Atom entry, yellow light for an open
  incident, a failed feed read, or an unreachable Host route.
- Hover or keyboard focus opens a detail panel: overall state, newest incident
  (title, status, affected components, detail, update time), the Host read
  error with its last successful time, and the data source.
- Host half polls `https://status.deepseek.com/feed.atom` (10 s timeout, 512 KiB
  body cap, 45 s snapshot cache, single-flight) and republishes it on
  `GET /deepseek-status/feed` behind a same-origin gate.
- Theme-token styling only (`--dsw-alias-*`), light/dark follow the host,
  `prefers-reduced-motion` disables the warning pulse.
