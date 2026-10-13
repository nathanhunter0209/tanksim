// Projectile, material and scenario data. ALL VALUES ARE ROUGH PUBLIC ESTIMATES / APPROXIMATIONS
// (open literature, forums, marketing). Real figures are classified. For education/visualisation only.
export const DISCLAIMER = 'Approximate model. All projectile and armor data are rough public estimates, not real (classified) values.';

// Penetrator core materials: density kg/m3, dynamic strength Yp (Pa), Lanz-Odermatt constants
export const CORES = {
  wha: { name: 'Tungsten alloy', rho: 17600, Y: 1.4e9, lo: { a: .994, c0: 134.5, c1: -.148 } },
  du: { name: 'Depleted uranium', rho: 18600, Y: 1.3e9, lo: { a: .994, c0: 134.5, c1: -.148 }, bonus: 1.06 },
  steel: { name: '4340 steel', rho: 7850, Y: .9e9, lo: { a: 1.104, c0: 9874, c1: 0, k: 1 } },
  wc: { name: 'Tungsten carbide', rho: 15000, Y: 2.2e9, lo: { a: .94, c0: 134.5, c1: -.148 }, brittle: 1 },
};
// KE: rod diameter D (mm), rod length L (mm), gun caliber (mm), muzzle velocity, velocity loss (fraction per km)
const KE = (name, country, cal, D, L, core, v0, fins = 6, kloss = .04) => ({ name, country, type: 'KE', cal, D, L, core, v0, fins, kloss });
// CE: warhead caliber (mm), nominal jet penetration at optimal standoff (mm RHA), flight speed, tandem precursor
const CE = (name, country, cal, pen, v0, kind, tandem = false) => ({ name, country, type: 'CE', cal, pen, v0, kind, tandem, core: 'cu' });
export const PROJECTILES = {
  m774: KE('M774', 'USA', 105, 27, 400, 'du', 1508),
  m833: KE('M833', 'USA', 105, 26, 460, 'du', 1494),
  m829: KE('M829', 'USA', 120, 27, 545, 'du', 1670),
  m829a1: KE('M829A1', 'USA', 120, 24, 684, 'du', 1575),
  m829a2: KE('M829A2', 'USA', 120, 24, 684, 'du', 1680),
  m829a3: KE('M829A3', 'USA', 120, 22, 800, 'du', 1555),
  dm13: KE('DM13', 'Germany', 105, 38, 380, 'wc', 1455),
  dm23: KE('DM23', 'Germany', 105, 32, 420, 'wha', 1455),
  dm33: KE('DM33', 'Germany', 120, 28, 480, 'wha', 1650),
  dm43: KE('DM43', 'Germany', 120, 26, 570, 'wha', 1740),
  dm53: KE('DM53', 'Germany', 120, 25, 745, 'wha', 1670),
  '3bm9': KE('3BM9', 'USSR/Russia', 125, 40, 380, 'steel', 1785, 5, .08),
  '3bm22': KE('3BM22', 'USSR/Russia', 125, 36, 400, 'wc', 1760, 5),
  '3bm32': KE('3BM32', 'USSR/Russia', 125, 32, 570, 'du', 1700, 5),
  '3bm42': KE('3BM42', 'USSR/Russia', 125, 30, 570, 'wha', 1700, 5),
  '3bm46': KE('3BM46', 'USSR/Russia', 125, 28, 635, 'du', 1700, 5),
  '3bm60': KE('3BM60', 'USSR/Russia', 125, 28, 740, 'du', 1660, 5),
  pg7v: CE('PG-7V (RPG-7)', 'ATGM/RPG', 85, 300, 120, 'rpg'),
  pg7vr: CE('PG-7VR (RPG-7)', 'ATGM/RPG', 105, 650, 120, 'rpg', true),
  tow2a: CE('TOW-2A (BGM-71E)', 'ATGM/RPG', 152, 900, 280, 'atgm', true),
  pars3: CE('PARS 3 LR', 'ATGM/RPG', 150, 1000, 230, 'atgm', true),
  javelin: CE('Javelin (FGM-148)', 'ATGM/RPG', 127, 750, 150, 'atgm', true),
  kornet: CE('9M133 Kornet', 'ATGM/RPG', 152, 1150, 250, 'atgm', true),
  m830a1: CE('M830A1 HEAT-MP', 'Shaped charge', 120, 480, 1400, 'heat'),
  sc: CE('Generic shaped charge', 'Shaped charge', 100, 500, 300, 'heat'),
  tandem: CE('Generic tandem', 'Shaped charge', 130, 800, 250, 'atgm', true),
};

// Armor materials. te = thickness efficiency vs RHA (per mm) for KE / CE. era/nera = special behaviour.
// era: { ke: rod length fraction removed, ce: jet fraction removed, yaw }  dwell: ceramic interface defeat
const M = (name, group, rho, te, tc, color, extra = {}) => ({ name, group, rho, te, tc, color, ...extra });
export const MATERIALS = {
  barrier: M('Barrier', 'Barriers', 7850, 1, 1, '#9aa3ab', { desc: 'An ordinary barrier: RHA-like, material and thickness set separately.' }),
  k1: M('Kontakt-1 (4S20)', 'Reactive armour', 2500, .2, .3, '#c9a14a', { era: { ke: .03, ce: .55, yaw: .05 }, desc: 'Light ERA vs shaped charges. Little effect on APFSDS.' }),
  k5: M('Kontakt-5 (4S22)', 'Reactive armour', 3500, .35, .4, '#b5803a', { era: { ke: .28, ce: .6, yaw: .25 }, desc: 'Heavy ERA, 15mm flyer plate: erodes/yaws long rods.' }),
  relikt: M('Relikt (4S23)', 'Reactive armour', 3500, .35, .4, '#a8743a', { era: { ke: .42, ce: .7, yaw: .3 }, desc: 'Two-flyer heavy ERA (estimate).' }),
  kaktus: M('Kaktus (4S24)', 'Reactive armour', 3800, .4, .5, '#9b6a36', { era: { ke: .38, ce: .72, yaw: .28 }, desc: 'Heavy ERA, prototype (estimate).' }),
  blazer: M('Blazer', 'Reactive armour', 2300, .15, .25, '#d0b060', { era: { ke: .02, ce: .5, yaw: .03 }, desc: 'Israeli light ERA (estimate).' }),
  erawa1: M('ERAWA-1', 'Reactive armour', 2500, .2, .3, '#c49a5a', { era: { ke: .05, ce: .55, yaw: .06 }, desc: 'Polish light ERA (estimate).' }),
  erawa2: M('ERAWA-2', 'Reactive armour', 2700, .22, .32, '#b88f50', { era: { ke: .1, ce: .62, yaw: .1 }, desc: 'Polish ERA, double layer (estimate).' }),
  nera: M('Bulging NERA package', 'Bulging armour', 4200, .55, 1.3, '#7f9cb0', { nera: { ke: .1, ce: .18 }, desc: 'Steel/rubber/steel sandwich that bulges into the path (generic estimate).' }),
  nera2: M('Thin NERA package 3/9/5', 'Bulging armour', 3800, .5, 1.2, '#8fb0c4', { nera: { ke: .07, ce: .16 }, desc: '3mm steel / 9mm rubber / 5mm steel sandwich (generic).' }),
  liner: M('Spall liner', 'Behind armour', 1400, .12, .2, '#e5d36b', { liner: true, desc: 'Aramid liner, narrows the behind-armor debris cone.' }),
  crew: M('Crew compartment', 'Behind armour', 50, 0, 0, '#f2c0c0', { crew: true, desc: 'Marker volume: residual reaching here is counted as a crew hit.' }),
  engine: M('Engine bay', 'Modules', 1500, .12, .2, '#7a7a6a', { desc: 'Bulk machinery, low density (rough estimate).' }),
  rha: M('RHA steel', 'Steels', 7850, 1, 1, '#8f989f', { bhn: 270 }),
  hha: M('HHA steel', 'Steels', 7850, 1.15, 1.0, '#a3a9b0', { bhn: 500 }),
  cast: M('Cast steel', 'Steels', 7800, .9, .9, '#7e858a', { bhn: 240 }),
  alu: M('Aluminium 5083', 'Light alloys', 2660, .32, .4, '#c6ccd2'),
  ti: M('Titanium Ti-6Al-4V', 'Light alloys', 4430, .62, .6, '#b0b6c8'),
  sic: M('SiC ceramic', 'Ceramics', 3200, .95, 1.25, '#5c6066', { dwell: 1 }),
  b4c: M('Boron carbide B4C', 'Ceramics', 2520, .8, 1.1, '#3f4247', { dwell: 1.1 }),
  tib2: M('Titanium diboride TiB2', 'Ceramics', 4500, 1.3, 1.4, '#6e6a7c', { dwell: 1.2 }),
  al2o3: M('Alumina AD995', 'Ceramics', 3900, .85, 1.3, '#e8e4da', { dwell: .8 }),
  textolite: M('Textolite (GRP)', 'Composites', 1800, .25, .45, '#cdb48a'),
  tungsten: M('Tungsten', 'Heavy metals', 17600, 1.6, 1.9, '#565b60'),
  du: M('Depleted uranium', 'Heavy metals', 19000, 1.8, 2.0, '#4c5047'),
};

// Plate: x (m, along shot), y, z, t (mm), ax (deg, tilt back about Z), ay (deg, yaw about Y), w, h (m), mat, ribs
const P = (mat, x, t, ax = 0, ay = 0, w = 1.2, h = 1, extra = {}) => ({ mat, x, y: 0, z: 0, t, ax, ay, w, h, ...extra });
export const SCENARIOS = {
  strv103: { name: 'Strv 103 40mm @78° + ribs', target: 'Strv 103A/B (40mm RHA @78° +ribs)', proj: '3bm9', range: 1000, plates: [P('rha', 0, 40, 78, 0, 1.2, 1.6, { ribs: 6 })] },
  abrams: { name: 'Abrams hull front special armor (public estimate)', target: 'M1 hull front special armor (public estimate)', proj: '3bm60', range: 1000,
    plates: [P('hha', 0, 50, 70, 0, 1.2, 1.2), P('nera', .25, 120, 45), P('nera', .45, 120, 45), P('nera', .65, 120, 45), P('rha', .9, 40, 30), P('rha', 1.05, 60, 10), P('liner', 1.18, 20, 10), P('crew', 1.6, 300, 0, 0, 1.2, 1.2)] },
  t72b: { name: 'T-72B turret with Kontakt-5', target: 'T-72B turret cheek + Kontakt-5 (public estimate)', proj: 'm829a1', range: 1500,
    plates: [P('k5', 0, 60, 55), P('cast', .3, 80, 30), P('textolite', .42, 30, 30), P('nera2', .5, 90, 30), P('nera2', .6, 90, 30), P('cast', .78, 180, 30), P('crew', 1.4, 300)] },
  leo2a6: { name: 'Leopard 2A6 wedge', target: 'Leopard 2A6 turret front with add-on wedge (public estimate)', proj: '3bm42', range: 1500,
    plates: [P('hha', 0, 20, 60), P('hha', .35, 20, 60), P('rha', .9, 40), P('nera', 1.0, 110, 10), P('nera', 1.15, 110, 10), P('nera', 1.3, 110, 10), P('sic', 1.45, 60), P('rha', 1.55, 80), P('crew', 2.1, 300)] },
  rha300: { name: 'Simple 300mm RHA', target: '300mm RHA plate @0°', proj: 'm829a3', range: 1000, plates: [P('rha', 0, 300, 0, 0, 1, 1)] },
};
