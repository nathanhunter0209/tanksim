// All armor/penetration figures are rough PUBLIC ESTIMATES (open-source literature, forums,
// manufacturer marketing). Real values are classified. Values are RHA-equivalent (mm) at
// normal incidence per layer, given separately vs KE (APFSDS) and CE (HEAT/shaped charge).
// Layer types: RHA, composite, ceramic, NERA, ERA, spaced, steel(structure/engine)
export const DISCLAIMER = 'All values are approximate public estimates (RHAe mm). Real figures are classified.';

const L = (name, type, ke, ce, mm) => ({ name, type, ke, ce, mm });

function stdZones(o) { return o; }

export const TANKS = {
  m1a2: {
    name: 'M1A2 SEPv3 Abrams', color: 0xa08d62, speculative: false,
    style: 'abrams', len: 7.9, width: 3.66, wheels: 7, barrel: 5.3, sprocket: 'rear',
    zones: stdZones({
      turretFront: [L('Outer steel face', 'RHA', 60, 60, 50), L('NERA / DU composite array', 'NERA', 640, 1080, 600), L('Inner RHA backing', 'RHA', 220, 220, 120)],
      turretSide:  [L('Side plate', 'RHA', 60, 60, 60), L('Composite cheek', 'composite', 260, 460, 300), L('Inner wall', 'RHA', 80, 80, 50)],
      turretRear:  [L('Bustle rack (ammo box, blow-out panels)', 'spaced', 20, 60, 400), L('Rear plate', 'RHA', 50, 50, 50)],
      turretRoof:  [L('Roof plate', 'RHA', 50, 50, 50)],
      ufp:         [L('Glacis plate (steep, thin)', 'RHA', 60, 60, 50), L('Fuel cells / spacing', 'spaced', 10, 40, 300), L('Inner bulkhead', 'RHA', 30, 30, 25)],
      lfp:         [L('Outer steel', 'RHA', 50, 50, 40), L('Composite array', 'composite', 480, 700, 450), L('Inner RHA', 'RHA', 120, 120, 80)],
      hullSide:    [L('Hull side plate', 'RHA', 40, 40, 30), L('Fuel tank / spacing', 'spaced', 0, 50, 300), L('Inner wall', 'RHA', 30, 30, 25)],
      skirt:       [L('Composite skirt (front 1/3)', 'composite', 70, 260, 90), L('Air gap', 'spaced', 0, 120, 400), L('Hull side', 'RHA', 40, 40, 30)],
      hullRoof:    [L('Engine deck', 'RHA', 30, 30, 30)],
      hullRear:    [L('Engine / grille (AGT1500 bulk)', 'steel', 60, 100, 800), L('Rear plate', 'RHA', 30, 30, 30)],
    }),
  },
  m1a3: {
    name: 'M1A3 / M1E3 Abrams (SPECULATIVE)', color: 0x9c9a74, speculative: true,
    style: 'abrams3', len: 7.6, width: 3.6, wheels: 7, barrel: 5.3, sprocket: 'rear',
    zones: {
      turretFront: [L('Outer face + APS sensors', 'RHA', 50, 50, 40), L('Next-gen NERA/ceramic (speculated)', 'NERA', 700, 1150, 550), L('Inner backing', 'RHA', 200, 200, 100)],
      turretSide:  [L('Side plate', 'RHA', 50, 50, 50), L('Composite cheek (guess)', 'composite', 280, 500, 280), L('Inner wall', 'RHA', 70, 70, 45)],
      turretRear:  [L('Bustle / unmanned-turret magazine (guess)', 'spaced', 20, 60, 380), L('Rear plate', 'RHA', 50, 50, 50)],
      turretRoof:  [L('Roof w/ top-attack add-on (guess)', 'composite', 90, 200, 90)],
      ufp:         [L('Glacis', 'RHA', 60, 60, 50), L('Spacing', 'spaced', 10, 40, 300), L('Bulkhead', 'RHA', 30, 30, 25)],
      lfp:         [L('Outer steel', 'RHA', 50, 50, 40), L('Composite array (guess)', 'composite', 520, 760, 450), L('Inner RHA', 'RHA', 120, 120, 80)],
      hullSide:    [L('Hull side', 'RHA', 40, 40, 30), L('Spacing', 'spaced', 0, 50, 300), L('Inner wall', 'RHA', 30, 30, 25)],
      skirt:       [L('Reactive / composite skirt (guess)', 'ERA', 60, 450, 100), L('Air gap', 'spaced', 0, 120, 400), L('Hull side', 'RHA', 40, 40, 30)],
      hullRoof:    [L('Deck', 'RHA', 35, 35, 35)],
      hullRear:    [L('Hybrid powerpack (guess)', 'steel', 50, 90, 700), L('Rear plate', 'RHA', 30, 30, 30)],
    },
  },
  ch3: {
    name: 'Challenger 3', color: 0x4f5a3a, speculative: false,
    style: 'chally', len: 8.3, width: 3.5, wheels: 6, barrel: 6.6, sprocket: 'rear',
    zones: {
      turretFront: [L('Outer steel', 'RHA', 60, 60, 50), L('Dorchester-derived modular array (Farnborough)', 'composite', 620, 1050, 600), L('Inner RHA', 'RHA', 200, 200, 120)],
      turretSide:  [L('Add-on module', 'composite', 120, 300, 120), L('Side plate', 'RHA', 80, 80, 70), L('Inner wall', 'RHA', 60, 60, 40)],
      turretRear:  [L('Stowage basket', 'spaced', 5, 60, 400), L('Rear plate', 'RHA', 50, 50, 50)],
      turretRoof:  [L('Roof + top-attack kit', 'composite', 70, 160, 80)],
      ufp:         [L('Glacis', 'RHA', 70, 70, 60), L('Composite insert', 'composite', 300, 450, 250), L('Inner', 'RHA', 40, 40, 30)],
      lfp:         [L('Dorchester LFP array', 'composite', 500, 750, 450), L('Inner RHA', 'RHA', 100, 100, 70)],
      hullSide:    [L('Hull side', 'RHA', 50, 50, 40), L('Spacing', 'spaced', 0, 50, 250), L('Inner wall', 'RHA', 30, 30, 25)],
      skirt:       [L('Composite / bar skirt', 'composite', 80, 300, 100), L('Air gap', 'spaced', 0, 120, 400), L('Hull side', 'RHA', 50, 50, 40)],
      hullRoof:    [L('Deck', 'RHA', 35, 35, 35)],
      hullRear:    [L('CV12 engine pack', 'steel', 60, 100, 800), L('Rear plate', 'RHA', 30, 30, 30)],
    },
  },
  merk4: {
    name: 'Merkava Mk4 (Barak/M)', color: 0x8d8a6e, speculative: false,
    style: 'merkava', len: 9.0, width: 3.72, wheels: 6, barrel: 5.3, sprocket: 'front',
    zones: {
      turretFront: [L('Modular wedge cover', 'RHA', 80, 80, 60), L('Modular composite (very long LOS)', 'composite', 600, 1050, 800), L('Inner RHA', 'RHA', 240, 240, 140)],
      turretSide:  [L('Modular side armor', 'composite', 200, 450, 250), L('Side plate', 'RHA', 80, 80, 60)],
      turretRear:  [L('Ball-and-chain curtain', 'spaced', 10, 120, 200), L('Rear bustle', 'RHA', 60, 60, 50)],
      turretRoof:  [L('Roof plate', 'RHA', 60, 60, 60)],
      ufp:         [L('Glacis', 'RHA', 60, 60, 50), L('Spaced/composite insert', 'composite', 250, 420, 300), L('Front-mounted engine (MT883)', 'steel', 150, 300, 1000), L('Bulkhead', 'RHA', 40, 40, 30)],
      lfp:         [L('Composite LFP', 'composite', 350, 600, 350), L('Engine/transmission bulk', 'steel', 150, 300, 900), L('Bulkhead', 'RHA', 40, 40, 30)],
      hullSide:    [L('Hull side', 'RHA', 60, 60, 50), L('Spacing', 'spaced', 0, 60, 250), L('Inner wall', 'RHA', 30, 30, 25)],
      skirt:       [L('Heavy composite skirt', 'composite', 100, 350, 120), L('Air gap', 'spaced', 0, 120, 400), L('Hull side', 'RHA', 60, 60, 50)],
      hullRoof:    [L('Deck', 'RHA', 40, 40, 40)],
      hullRear:    [L('Rear door / ammo racks', 'RHA', 50, 50, 50), L('Crew compartment (no engine)', 'spaced', 0, 0, 500)],
    },
  },
  leo2a7: {
    name: 'Leopard 2A7', color: 0x4a5636, speculative: false,
    style: 'leo', len: 7.7, width: 3.75, wheels: 7, barrel: 6.6, sprocket: 'rear',
    zones: {
      turretFront: [L('Spaced wedge add-on', 'NERA', 150, 300, 300), L('Main composite (B-tech)', 'composite', 600, 950, 600), L('Inner RHA', 'RHA', 180, 180, 100)],
      turretSide:  [L('Side add-on', 'composite', 150, 300, 150), L('Side plate', 'RHA', 60, 60, 50)],
      turretRear:  [L('Bustle stowage', 'spaced', 10, 60, 400), L('Ammo bustle wall', 'RHA', 50, 50, 50)],
      turretRoof:  [L('Roof + top kit', 'composite', 60, 140, 70)],
      ufp:         [L('Glacis', 'RHA', 60, 60, 50), L('Spacing', 'spaced', 10, 40, 250), L('Inner', 'RHA', 30, 30, 25)],
      lfp:         [L('LFP composite', 'composite', 500, 750, 450), L('Inner RHA', 'RHA', 100, 100, 70)],
      hullSide:    [L('Hull side', 'RHA', 40, 40, 30), L('Spacing', 'spaced', 0, 40, 250), L('Inner', 'RHA', 30, 30, 25)],
      skirt:       [L('Heavy skirt (front)', 'composite', 80, 280, 100), L('Air gap', 'spaced', 0, 120, 400), L('Hull side', 'RHA', 40, 40, 30)],
      hullRoof:    [L('Deck', 'RHA', 30, 30, 30)],
      hullRear:    [L('MTU MB873 engine', 'steel', 60, 100, 800), L('Rear plate', 'RHA', 30, 30, 30)],
    },
  },
  t90m: {
    name: 'T-90M Proryv', color: 0x55603a, speculative: false,
    style: 't90', len: 6.9, width: 3.78, wheels: 6, barrel: 6.0, sprocket: 'rear',
    zones: {
      turretFront: [L('Relikt heavy ERA', 'ERA', 250, 650, 250), L('Steel / NERA welded turret', 'NERA', 500, 750, 500), L('Inner RHA', 'RHA', 100, 100, 60)],
      turretSide:  [L('Relikt side ERA', 'ERA', 120, 450, 150), L('Turret side', 'RHA', 120, 120, 100)],
      turretRear:  [L('Bustle (new ammo box)', 'spaced', 10, 80, 400), L('Rear plate', 'RHA', 60, 60, 60)],
      turretRoof:  [L('Roof with partial ERA', 'ERA', 0, 300, 60), L('Roof plate', 'RHA', 50, 50, 50)],
      ufp:         [L('Relikt ERA', 'ERA', 250, 650, 250), L('Steel-composite-steel glacis', 'composite', 450, 600, 220), L('Inner', 'RHA', 50, 50, 40)],
      lfp:         [L('Lower plate (no ERA)', 'RHA', 120, 120, 80), L('Rubber/fuel tanks', 'spaced', 0, 40, 300)],
      hullSide:    [L('Hull side', 'RHA', 70, 70, 70), L('Autoloader carousel / fuel', 'spaced', 0, 30, 300)],
      skirt:       [L('Relikt side skirt ERA', 'ERA', 80, 400, 80), L('Air gap', 'spaced', 0, 60, 300), L('Hull side', 'RHA', 70, 70, 70)],
      hullRoof:    [L('Deck', 'RHA', 25, 25, 25)],
      hullRear:    [L('Slat armor', 'spaced', 0, 100, 300), L('V-92S2F engine', 'steel', 50, 80, 700), L('Rear plate', 'RHA', 40, 40, 40)],
    },
  },
};

// Penetration (RHA mm @ normal) – public estimates. KE values are referenced at 2 km.
export const SHELLS = {
  m829a4: { name: 'M829A4 APFSDS (120mm, US)', type: 'APFSDS', pen2km: 800, v0: 1650, drop: 60, color: 0xffaa33, norm: 2 },
  dm73:   { name: 'DM73-like APFSDS (120mm L55A1)', type: 'APFSDS', pen2km: 760, v0: 1750, drop: 62, color: 0xffcc44, norm: 2 },
  svinets:{ name: '3BM60 Svinets-2 APFSDS (125mm)', type: 'APFSDS', pen2km: 640, v0: 1660, drop: 70, color: 0xff7733, norm: 3 },
  m830a1: { name: 'M830A1 MPAT HEAT (120mm)', type: 'HEAT', pen: 600, v0: 1410, drop: 110, color: 0xff5522 },
  hesh:   { name: 'L31-type HESH (120mm)', type: 'HESH', pen: 0, plate: 130, v0: 670, drop: 90, color: 0xff3311 },
  kornet: { name: '9M133 Kornet ATGM (tandem HEAT)', type: 'TANDEM', pen: 1200, v0: 300, drop: 0, color: 0xff2200 },
  tow2a:  { name: 'TOW-2A ATGM (tandem HEAT)', type: 'TANDEM', pen: 950, v0: 280, drop: 0, color: 0xff2200 },
  javelin:{ name: 'FGM-148 Javelin (tandem, top-attack)', type: 'TANDEM', pen: 800, v0: 200, drop: 0, color: 0xff2200, topAttack: true },
};

export const ZONE_NAMES = {
  turretFront: 'Turret front', turretSide: 'Turret side', turretRear: 'Turret rear / bustle', turretRoof: 'Turret roof',
  ufp: 'Hull UFP', lfp: 'Hull LFP', hullSide: 'Hull side', skirt: 'Side skirt', hullRoof: 'Hull roof / deck', hullRear: 'Hull rear',
};
export const LAYER_COLORS = { RHA: '#8a9099', composite: '#c9a227', ceramic: '#e8e2d0', NERA: '#4fa3d1', ERA: '#d9534f', spaced: '#3a4a3a', steel: '#6b5a4a' };
