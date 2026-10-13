# Armor Plate Sandbox

Engineering-style armor plate sandbox in the browser (Three.js r170, vendored, no build step). Live: https://nathanhunter0209.github.io/tanksim/
The previous tank showroom is preserved at git tag `v1-showroom`.

**All projectile and armor data are rough public estimates. The physics is a fast approximation, not a hydrocode. Use it for education and visualisation only.**

## Features
- Light-grey engineering viewport, orbit camera, move/rotate gizmos on plates, section plane (hatched cut faces) with offset.
- Projectile presets grouped by country (USA M774–M829A3, Germany DM13–DM53, USSR/Russia 3BM9–3BM60, RPG/ATGMs, shaped charge, tandem). Core materials: tungsten alloy, DU, 4340 steel and tungsten carbide. Sliders for rod diameter, rod length, velocity, range and playback length. Mass is computed from the generated geometry × density.
- Procedural models: rods with ogive tip, buttress threads/sabot grooves, fins and tracer. RPG, ATGM and HEAT round shapes.
- Material library: barrier, ERA (Kontakt-1/5, Relikt, Kaktus, Blazer, ERAWA-1/2), bulging NERA, spall liner, crew, engine bay, RHA/HHA/cast steel, aluminium, titanium, SiC, B4C, TiB2, alumina AD995, textolite, tungsten, DU. Each plate has sliders for thickness, angle X/Y, position, width, height and ribs.
- Timeline playback with scrubber, pause and slow-mo. The rod visibly erodes, craters and holes form, debris flies, ERA flyer plates separate and NERA bulges. A velocity or temperature colour map with legend is applied to the rod, jet and debris.
- Reference-style overlay (projectile, velocity, range, target) plus a scale bar. Results panel per plate (LOS, obliquity, residual length and velocity, perforated or not, notes) and a velocity / rod-length vs time chart.
- Scenarios: Strv 103 40mm @78° + ribs, Abrams hull front (public estimate), T-72B + Kontakt-5, Leopard 2A6 wedge, Simple 300mm RHA. Save/Load to localStorage, share via URL hash.
- PWA (offline cache `tanksim-v4`), touch drawers on phones, Low quality on mobile.

## Physics (physics.js, pure JS)
- Ray/plate intersection gives the LOS thickness and obliquity for each plate (including ribs).
- **KE:** Tate–Alekseevskii erosion integrated in time. The target resistance is calibrated each shot so that the semi-infinite RHA result matches **Lanz–Odermatt** (L/D, density, hardness). Materials are scaled by thickness-efficiency factors, and a cos^0.224 obliquity term is applied.
  - Ricochet uses a Tate-style critical angle; ribs lower it. Yaw is induced near the critical angle.
  - Ceramics: interface dwell.
  - ERA: rod length loss plus yaw.
  - NERA: disruption.
  - Thin plates: back-face break-out.
- **CE:** jet capacity with a standoff efficiency curve. ERA cuts the jet unless a tandem precursor initiates it first, and NERA disrupts it.
- Spall/debris cone after each perforation (narrower behind a spall liner). Behind-armor residual is given in mm RHA.

Files: `index.html`, `app.js` (scene/UI/playback), `physics.js`, `projectile.js`, `data.js`, `sw.js`, `manifest.json`.
