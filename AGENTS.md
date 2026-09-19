# Notes for coding agents

Single-file web app: everything is in `index.html` (HTML, CSS and JS inline, no build step, no
dependencies). Served by GitHub Pages from `main` at https://milky28.github.io/rpm-led-builder/, so
**pushing to `main` publishes** - don't push without the owner's (Milky28) go-ahead.

- Test locally: `python -m http.server 8765 --bind 127.0.0.1` in this folder, open http://127.0.0.1:8765/.
- It edits Lovely Car Data v2.0.0 car files and previews them the way **ATSR** reads them (an LED lights
  above its value, black `#FF000000` colours are gaps, the layout comes from the last gear). Keep that
  behaviour in step with `src/Profile/AtsrCompatibility.cs` in the companion plugin,
  `C:\Users\jerky\Documents\simhub-capture-plugin` (see its `AGENTS.md`).
- It only reads the public lovely-car-data repo; it must not send data anywhere else.
- State at handoff (2026-09-18): no open work; only this file is unpushed.
