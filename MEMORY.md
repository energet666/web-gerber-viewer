# Memory

Use this file for durable project notes that future agents should preserve.

## Notes

- The app is intentionally backend-free and should keep all Gerber files local to the browser.
- The first committed implementation is `3dc98d3 Initial Gerber viewer`.
- Layer alignment depends on using one shared transform for all rendered layer geometry.
  Reintroducing per-layer SVG transforms will likely shift layers relative to each other.
- When composing layers, preserve renderer-provided SVG attributes such as `stroke-linecap`,
  `stroke-linejoin`, `stroke-width`, and `fill-rule`; dropping them makes silk/outline strokes
  render with browser defaults and can create incorrect sharp joins.
