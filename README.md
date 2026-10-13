# Armor Plate Sandbox

A browser armor-plate sandbox built on Three.js r170 (vendored, no build step). Live: https://nathanhunter0209.github.io/tanksim/
Earlier versions: tag `v1-showroom` (tank showroom) and tag `v2-sandbox-complex` (the previous dense two-panel UI).

**All projectile and armor data are rough public estimates. The physics is a fast 1-D approximation, not a hydrocode. Use it for education and visualisation only.**

## Using it: three steps
1. **Round:** pick one from the dropdown (grouped by country). A spec line shows muzzle and impact velocity, rod length × diameter and mass.
2. **Target:** Simple 300 mm RHA, Strv 103, T-72B + Kontakt-5, Leopard 2A6 wedge, Abrams hull front, **T-90M + Relikt, Leopard 2A7, Challenger 3, Merkava Mk4 and M1A2 turret fronts**, or **Custom…**.
   - The turret layouts are *public-estimate guesses*: layer types, thicknesses and angles were tuned so that their RHA-equivalent protection lands in the ranges quoted publicly (KE ~850–1000 mm, CE ~1000–1500+ mm).
   - They are not real drawings. Each one shows a short description.
   - `equiv.mjs` computes the KE and CE RHA-equivalent of any layout by bisection.
3. **FIRE.** The camera auto-frames the rod and plates, the shot plays, and you get one big verdict, **PERFORATED / STOPPED / RICOCHET**, plus three numbers: impact velocity, armor LOS hit, and residual (or obliquity, for a ricochet).

**Custom target:** tap a plate (in 3D or on its chip) to open a small popover with material, thickness and angle, plus a large delete button. Use **+ Add plate** to add more.

**Advanced** (one toggle) holds everything else:
- Core material, rod diameter/length, velocity and range sliders.
- Extra plate fields (position, yaw, size, ribs) and the move/rotate gizmo.
- Section plane, velocity/temperature map, quality, auto-frame, playback scrubber and speed.
- Per-plate results table and v/L-vs-time chart.
- Save/Load (localStorage) and share links.

On phones the controls are a bottom sheet, and Advanced opens as a second sheet. The app is a PWA (offline cache `tanksim-v7`).

## Physics (physics.js): time-stepped along the shot line, runs in a few ms
- **Geometry:** a ray/plate intersection gives the LOS and obliquity of every plate and rib.
- **KE: Alekseevskii–Tate.** `½ρp(v−u)² + Yp = ½ρt u² + Rt`, integrated in time with deceleration of the rod (`ρp L dv/dt = −Yp`).
  - Rod strength Yp: W 1.2 GPa, DU 1.0 GPa, steel 1.4 GPa, WC 2.0 GPa.
  - Target resistance Rt per material, calibrated to the Anderson/Walker/Hohler-type tungsten and DU semi-infinite RHA data (RHA ≈ 4.6 GPa). An early-time/secondary crater term (~2 D) gives the observed fall in P/L as L/D rises.
  - Yaw penalty; obliquity erosion correction on top of LOS.
  - Rear-face effect: resistance drops near the exit, with plugging/break-out when the remaining thickness is below ~0.35 D·cosθ.
  - Critical-angle ricochet depending on velocity, L/D and t/D (ribs lower it). Yaw grows after asymmetric exits and in air gaps. Residual length and velocity are carried from plate to plate.
- **Ceramics:** the dwell time falls with impact velocity (material v1/v2/τ) and is longer with hard backing. After dwell, comminuted-zone resistance applies.
- **ERA:** a flyer-plate model, η = n·ρf·hf·vf·sinθ / (ρp·D·v).
  - Against rods over a time window: length loss plus induced yaw. M829A3 has a sacrificial-nose flag (public description) that reduces the K-5 effect.
  - Against jets: element-by-element cut.
  - Kontakt-1 is light; Kontakt-5 and Relikt are heavy and also act against KE.
- **NERA:** bulging-plate disturbance over the bulge duration (rod yaw and length loss; jet cut).
- **Shaped charge:** 160 jet elements with a velocity gradient (tip 7.4–8.5 km/s, tail 2 km/s) from a virtual origin.
  - Elements stretch until breakup (about 1.2 µs per mm of cone diameter), then particulate and lose efficiency, so standoff peaks and then falls.
  - Penetration is cumulative per element (DiPersio–Simon–Merendino style).
  - The element scale is calibrated so that semi-infinite RHA equals the round's published nominal value.
  - ERA/NERA disrupt the jet. A tandem precursor clears the first ERA.
- **Behind-armor debris:** cone angle and fragment count from residual velocity and mass (narrower behind a spall liner).

## Calibration notes (stage A refinements)
- **RHA resistance:** Rt = 4.4 GPa (HHA 5.35, cast 3.85), fitted so that a tungsten L/D 20 rod gives P/L ≈ 1.0 at 1.6 km/s.
- **DU self-sharpening:** DU's adiabatic shear gives a narrower crater, modelled as a 6% lower effective Rt (`CORES.du.rf = 0.94`).
- **Downrange velocity:** the loss rate scales ∝ 1/L (drag ∝ frontal area / mass), `kloss = 0.035·(600/L)^0.8` per km. 3BM9 keeps its explicit, higher value.
- **DM53:** uses its published L55 muzzle velocity (1750 m/s).
- **Result:** M829A3 / 3BM60 / DM53 come out at about 705–716 mm at 2 km.
- **Heavy ERA against rods:** the flyer only acts while it sweeps across the shot line, so it damages a roughly fixed rod *length*, `ΔL = v·T_int·clamp(2.5·η)` with T_int = 160 µs. Longer modern rods therefore lose a smaller fraction. This general rule replaces the old M829A3-only flag.
  - Kontakt-5 reductions: 25–29% on M829, 3BM32 and M829A1, and 22–25% on M829A3, 3BM60 and DM53.
- **Shaped-charge jets:** jets stretch until breakup at ≈ 2.1 µs per mm of cone diameter, then particulate with efficiency falling over 1.5 × the breakup time. Penetration therefore peaks near 7 CD of standoff.
- **Tandem warheads:** they still lose about 7% to debris from ERA that the precursor has already set off.
- **Fitted constants:** T_int, the 2.5 severity factor, the breakup factor and the 7% tandem loss are fitted parameters, not first-principles values.

## Validation
Run `node validate.mjs`. It compares the model against public reference values and exits non-zero on any failure. Checks:
- W L/D 20 at 1.5–1.7 km/s: P/L ≈ 0.9–1.1.
- L/D trend.
- M829A3 / 3BM60 / DM53: 650–800 mm at 2 km.
- 3BM9: 250–300 mm.
- Strv 103: ricochet.
- Kontakt-5: 20–40% reduction against older APFSDS.
- PG-7V ≈ 300 mm; Kontakt-1 against PG-7V.
- Kornet behind K-5: 1000–1200 mm.
- Standoff curve; timing.

Some of these are calibration points rather than independent predictions: the nominal CE penetration and the RHA resistance.

Files: `equiv.mjs` (RHA-equivalent helper), `index.html`, `app.js` (scene, UI, playback), `physics.js`, `projectile.js`, `data.js`, `validate.mjs`, `sw.js`, `manifest.json`.
