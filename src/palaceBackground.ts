/**
 * Buckingham Palace background graphic.
 *
 * Creates and injects an SVG element (1200×800 viewBox) behind the game
 * reels and controls. The overlay zone coordinates below can be used to
 * attach animated sprites over individual windows or the central balcony.
 *
 * Overlay zones (all in viewBox units, 1200×800):
 *   centralBalcony:  x=487 y=383 w=226 h=120
 *   balconyDoors:    [CC[1,2,3]] x=[498,572,646] y=383 w=56 h=78
 *   leftWingPN:      x=[28,90,152,214] y=383 w=48 h=78  (4 windows)
 *   rightWingPN:     x=[938,1000,1062,1124] y=383 w=48 h=78  (4 windows)
 *   leftPavPN:       x=[267,336] y=383 w=52 h=78  (2 windows)
 *   rightPavPN:      x=[812,881] y=383 w=52 h=78  (2 windows)
 *   centralPNOuter:  x=[422,718] y=383 w=60 h=78  (flanking balcony)
 */

const NS = 'http://www.w3.org/2000/svg';

function el(
  tag: string,
  attrs: Record<string, string | number>,
): SVGElement {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

function r(
  x: number, y: number, w: number, h: number,
  fill: string,
  extra: Record<string, string | number> = {},
): SVGElement {
  return el('rect', { x, y, width: w, height: h, fill, ...extra });
}

function circ(cx: number, cy: number, rad: number, fill: string): SVGElement {
  return el('circle', { cx, cy, r: rad, fill });
}

function seg(
  x1: number, y1: number, x2: number, y2: number,
  stroke: string, sw: number,
): SVGElement {
  return el('line', { x1, y1, x2, y2, stroke, 'stroke-width': sw });
}

function addTo(parent: SVGElement, ...children: SVGElement[]): void {
  for (const c of children) parent.appendChild(c);
}

/** Draw a single window (rect, arched, or French door) onto svg. */
function addWindow(
  svg: SVGElement,
  x: number, y: number, w: number, h: number,
  type: 'rect' | 'arched' | 'french' = 'rect',
): void {
  const g = el('g', {}) as SVGGElement;
  const pad = 4;
  const dark = '#152840';

  // Stone surround
  g.appendChild(r(x - pad, y - pad, w + pad * 2, h + pad * 2, '#C4A878', { rx: '1' }));
  g.appendChild(r(x - 2, y - 2, w + 4, h + 4, '#B09060', { rx: '1' }));

  if (type === 'french') {
    const ar = w * 0.48;
    g.appendChild(r(x, y + ar, w, h - ar, dark));
    g.appendChild(el('ellipse', { cx: x + w / 2, cy: y + ar, rx: w / 2, ry: ar * 0.95, fill: dark }));
    g.appendChild(seg(x + w / 2, y + ar * 0.9, x + w / 2, y + h, '#203A58', 1.5));
    g.appendChild(seg(x, y + ar + (h - ar) * 0.5, x + w, y + ar + (h - ar) * 0.5, '#203A58', 1.5));
    g.appendChild(r(x + 3, y + ar + 4, w * 0.37, (h - ar) * 0.28, '#2A6090', { opacity: '0.5', rx: '1' }));
  } else if (type === 'arched') {
    const ar = w * 0.5;
    g.appendChild(r(x, y + ar, w, h - ar, dark));
    g.appendChild(el('ellipse', { cx: x + w / 2, cy: y + ar, rx: w / 2, ry: ar, fill: dark }));
    // Keystone
    g.appendChild(el('polygon', {
      points: `${x + w / 2 - 5},${y - 4} ${x + w / 2 + 5},${y - 4} ${x + w / 2 + 3},${y + 10} ${x + w / 2 - 3},${y + 10}`,
      fill: '#C0A860',
    }));
    g.appendChild(seg(x + w / 2, y + ar, x + w / 2, y + h, '#203A58', 1.5));
    g.appendChild(seg(x, y + ar + (h - ar) * 0.5, x + w, y + ar + (h - ar) * 0.5, '#203A58', 1.5));
    g.appendChild(r(x + 3, y + ar + 4, w * 0.37, (h - ar) * 0.26, '#2A6090', { opacity: '0.4', rx: '1' }));
  } else {
    g.appendChild(r(x, y, w, h, dark));
    g.appendChild(seg(x + w / 2, y, x + w / 2, y + h, '#203A58', 1.5));
    g.appendChild(seg(x, y + h * 0.44, x + w, y + h * 0.44, '#203A58', 1.5));
    g.appendChild(r(x + 2, y + 2, w * 0.37, h * 0.27, '#2A6090', { opacity: '0.5', rx: '1' }));
  }

  svg.appendChild(g);
}

/** Draw windows for a list of bay centres with given row/width/type. */
function windows(
  svg: SVGElement,
  centres: number[],
  row: { y: number; h: number },
  w: number,
  type: 'rect' | 'arched' | 'french' = 'rect',
): void {
  for (const c of centres) addWindow(svg, c - w / 2, row.y, w, row.h, type);
}

/** Build and return the palace SVG element. */
export function createPalaceSvg(): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg') as SVGSVGElement;
  svg.setAttribute('viewBox', '0 0 1200 800');
  svg.setAttribute('preserveAspectRatio', 'xMidYMax meet');
  svg.setAttribute('aria-hidden', 'true');

  // ── Y levels ──────────────────────────────────────────────────────
  const RF = 193;  // roofline / cornice top
  const BR = 228;  // balustrade rail bottom
  const AB = 290;  // attic zone bottom
  const F3 = 375;  // 3rd floor bottom
  const PN = 468;  // piano nobile bottom
  const GF = 580;  // ground floor bottom
  const PL = 630;  // plinth bottom / forecourt start

  // Window rows
  const AT  = { y: BR + 5,  h: 42 };
  const T3  = { y: AB + 8,  h: 62 };
  const PNR = { y: F3 + 8,  h: 78 };
  const G1  = { y: PN + 10, h: 78 };

  // Bay centres for each section
  const LWC = [52, 114, 176, 238];        // left wing  (4 bays)
  const LPC = [293, 362];                  // left pavilion  (2 bays)
  const CC  = [452, 526, 600, 674, 748];  // central  (5 bays)
  const RPC = [838, 907];                  // right pavilion  (2 bays)
  const RWC = [962, 1024, 1086, 1148];    // right wing  (4 bays)

  // ── SKY ──────────────────────────────────────────────────────────
  addTo(svg,
    r(0, 0, 1200, 800, '#06101E'),
    r(0, 0, 1200, 420, '#0C1A30', { opacity: '0.95' }),
    r(0, 0, 1200, 220, '#12213A', { opacity: '0.7' }),
    r(0, 0, 1200, 130, '#182C46', { opacity: '0.5' }),
  );

  // Stars
  for (const [sx, sy, sr] of [
    [72,24,2],[148,46,1.4],[218,16,1.4],[342,36,1.4],[472,20,2],[558,54,1.4],
    [682,10,2],[798,40,1.4],[936,26,1.4],[1042,50,2],[1132,17,1.4],[1177,36,1.4],
    [104,92,1.4],[274,76,2],[418,105,1.4],[618,86,1.4],[748,66,2],[900,100,1.4],
    [1108,80,1.4],[58,138,2],[312,122,1.4],[532,145,1.4],[782,128,2],[1062,143,1.4],
    [190,60,1.4],[430,72,2],[720,32,1.4],[870,58,1.4],[1000,110,2],[160,165,1.4],
  ] as [number, number, number][]) {
    svg.appendChild(el('circle', { cx: sx, cy: sy, r: sr, fill: 'white', opacity: '0.6' }));
  }

  // Moon
  addTo(svg, circ(1058, 72, 40, '#E8D880'), circ(1076, 57, 32, '#06101E'));

  // Night clouds
  for (const [cx, cy, rx, ry, op] of [
    [170,124,95,25,0.95],[118,137,58,20,0.9],[232,135,65,20,0.9],
    [858,104,118,27,0.75],[802,118,74,21,0.75],[922,118,84,21,0.75],
  ] as [number,number,number,number,number][]) {
    svg.appendChild(el('ellipse', { cx, cy, rx, ry, fill: '#141E34', opacity: String(op) }));
  }

  // ── PALACE STRUCTURE ─────────────────────────────────────────────

  // Wings — back plane
  addTo(svg,
    r(0, 200, 262, PL - 200, '#BFAF94'),
    r(938, 200, 262, PL - 200, '#BFAF94'),
    r(252, 200, 12, PL - 200, '#887860', { opacity: '0.45' }),  // depth shadow
    r(936, 200, 12, PL - 200, '#887860', { opacity: '0.45' }),
  );

  // Pavilions — middle plane
  addTo(svg,
    r(260, 192, 152, PL - 192, '#D0C6A6'),
    r(788, 192, 152, PL - 192, '#D0C6A6'),
    r(408, 192, 6, PL - 192, '#887860', { opacity: '0.38' }),  // inner edge shadow
    r(784, 192, 6, PL - 192, '#887860', { opacity: '0.38' }),
  );

  // Central block — front plane (lightest)
  svg.appendChild(r(408, 185, 384, PL - 185, '#E0D8BE'));

  // ── BALUSTRADE ───────────────────────────────────────────────────
  addTo(svg,
    r(0, RF - 7, 1200, 11, '#ACA070'),     // cornice under balustrade
    r(0, RF + 4, 1200, 5, '#C2B080'),       // base rail
    r(0, BR - 7, 1200, 8, '#C8B888'),       // top rail
  );
  for (let i = 0; i < 100; i++) {
    svg.appendChild(r(i * 12 + 2, RF + 9, 5, BR - RF - 17, '#B8A870', { rx: '1' }));
  }

  // ── CENTRAL PEDIMENT ─────────────────────────────────────────────
  addTo(svg,
    el('polygon', { points: `490,${RF} 710,${RF} 600,138`, fill: '#D8D0B0', stroke: '#A09870', 'stroke-width': '3' }),
    circ(600, 170, 16, '#C09020'),
    circ(600, 170, 11, '#D8A830'),
  );

  // ── STRING COURSES (between floors) ──────────────────────────────
  // Below attic
  svg.appendChild(r(0, AB, 1200, 4, '#A89870', { opacity: '0.8' }));
  // Above 3rd floor (stepped by depth)
  addTo(svg,
    r(0, F3 - 4, 262, 5, '#A89870', { opacity: '0.65' }),
    r(938, F3 - 4, 262, 5, '#A89870', { opacity: '0.65' }),
    r(260, F3 - 7, 152, 7, '#B09878'),
    r(788, F3 - 7, 152, 7, '#B09878'),
    r(408, F3 - 11, 384, 11, '#B8A880'),
  );
  // Above ground floor (stepped)
  addTo(svg,
    r(0, PN - 4, 262, 5, '#A89870', { opacity: '0.65' }),
    r(938, PN - 4, 262, 5, '#A89870', { opacity: '0.65' }),
    r(260, PN - 8, 152, 8, '#B09878'),
    r(788, PN - 8, 152, 8, '#B09878'),
    r(408, PN - 12, 384, 12, '#B8A880'),
  );

  // ── PLINTH & STEPS ───────────────────────────────────────────────
  addTo(svg,
    r(0, GF, 262, PL - GF, '#A89870'),
    r(938, GF, 262, PL - GF, '#A89870'),
    r(260, GF - 5, 152, PL - GF + 5, '#B0A078'),
    r(788, GF - 5, 152, PL - GF + 5, '#B0A078'),
    r(408, GF - 10, 384, PL - GF + 10, '#B8A880'),
    r(440, PL, 320, 8, '#C0B090'),     // step 1
    r(462, PL + 8, 276, 8, '#B8A888'),  // step 2
  );

  // ── COLUMNS on central facade ─────────────────────────────────────
  for (const cx of [432, 490, 544, 656, 710, 768]) {
    addTo(svg,
      r(cx - 7, PNR.y - 5, 14, GF - PNR.y + 5, '#D2C8A6', { rx: '1' }),
      r(cx - 11, PNR.y - 11, 22, 9, '#B8A870'),   // capital
      r(cx - 11, GF - 9, 22, 9, '#B8A870'),         // base
    );
  }

  // ── WINDOWS ──────────────────────────────────────────────────────

  // Left wing
  windows(svg, LWC, AT, 36);
  windows(svg, LWC, T3, 42);
  windows(svg, LWC, PNR, 48);
  windows(svg, LWC, G1, 48, 'arched');

  // Left pavilion
  windows(svg, LPC, AT, 40);
  windows(svg, LPC, T3, 46);
  windows(svg, LPC, PNR, 52);
  windows(svg, LPC, G1, 52, 'arched');

  // Central
  windows(svg, CC, AT, 50);
  windows(svg, CC, T3, 56);
  windows(svg, [CC[0], CC[4]], PNR, 60);               // outer PN windows
  windows(svg, [CC[1], CC[2], CC[3]], PNR, 56, 'french'); // central balcony doors
  windows(svg, CC, G1, 60, 'arched');

  // Right pavilion
  windows(svg, RPC, AT, 40);
  windows(svg, RPC, T3, 46);
  windows(svg, RPC, PNR, 52);
  windows(svg, RPC, G1, 52, 'arched');

  // Right wing
  windows(svg, RWC, AT, 36);
  windows(svg, RWC, T3, 42);
  windows(svg, RWC, PNR, 48);
  windows(svg, RWC, G1, 48, 'arched');

  // ── BALCONY STRUCTURE ─────────────────────────────────────────────
  const BX = 487;
  const BY = PNR.y + PNR.h + 2;  // slab sits just below the French doors
  const BW = 226;
  addTo(svg,
    r(BX, BY, BW, 16, '#C8B880'),                        // slab
    r(BX + 2, BY + 16, BW - 4, 5, '#8A7840', { opacity: '0.55' }),  // shadow
  );
  for (let i = 0; i < 21; i++) {
    svg.appendChild(r(BX + 4 + i * 10.5, BY + 16, 5, 25, '#C0A858', { rx: '1' }));
  }
  svg.appendChild(r(BX, BY + 41, BW, 7, '#C8B880'));  // top rail

  // ── FLAGPOLE & UNION JACK ─────────────────────────────────────────
  addTo(svg,
    seg(600, RF, 600, 28, '#A09078', 3.5),
    circ(600, 26, 5, '#C8A030'),
    r(605, 30, 90, 56, '#012169'),
    seg(605, 30, 695, 86, 'white', 12),
    seg(695, 30, 605, 86, 'white', 12),
    seg(605, 30, 695, 86, '#C8102E', 6),
    seg(695, 30, 605, 86, '#C8102E', 6),
    r(641, 30, 13, 56, 'white'),
    r(605, 51, 90, 13, 'white'),
    r(644, 30, 7, 56, '#C8102E'),
    r(605, 54, 90, 7, '#C8102E'),
  );

  // ── FORECOURT & GROUNDS ──────────────────────────────────────────
  addTo(svg,
    r(0, PL, 1200, 800 - PL, '#4E4030'),      // main forecourt
    r(0, PL, 1200, 30, '#6E6250'),              // driveway
    r(0, PL + 30, 300, 800 - PL - 30, '#28401A'),   // left grass
    r(900, PL + 30, 300, 800 - PL - 30, '#28401A'),  // right grass
    r(0, PL + 30, 300, 3, '#34521E'),           // grass highlight
    r(900, PL + 30, 300, 3, '#34521E'),
    r(300, PL + 30, 600, 800 - PL - 30, '#605844'),  // central paving
  );

  // Fence with spear-top railings
  svg.appendChild(r(0, PL - 15, 1200, 5, '#8A7840'));
  for (let i = 0; i < 52; i++) {
    addTo(svg,
      r(i * 23 + 1, PL - 31, 7, 21, '#8A7850', { rx: '1' }),
      el('polygon', {
        points: `${i * 23 + 4.5},${PL - 31} ${i * 23 + 2},${PL - 38} ${i * 23 + 7},${PL - 38}`,
        fill: '#C8A030',
      }),
    );
  }

  // Gate posts and bars
  addTo(svg,
    r(537, PL - 48, 18, 51, '#8A8060'),
    r(645, PL - 48, 18, 51, '#8A8060'),
    circ(546, PL - 50, 8, '#B8A030'),
    circ(654, PL - 50, 8, '#B8A030'),
  );
  for (let i = 0; i < 7; i++) {
    svg.appendChild(r(560 + i * 12, PL - 44, 5, 44, '#8A7840', { rx: '1' }));
  }

  // Guard boxes
  addTo(svg,
    r(380, PL - 34, 26, 34, '#1A2C0E'),
    r(794, PL - 34, 26, 34, '#1A2C0E'),
    r(380, PL - 37, 26, 5, '#243614'),
    r(794, PL - 37, 26, 5, '#243614'),
  );

  // Victoria Memorial
  addTo(svg,
    circ(600, 760, 33, '#8A8068'),
    circ(600, 760, 24, '#9A9078'),
    r(597, 727, 6, 36, '#A8A080'),
    circ(600, 724, 12, '#C8A828'),
    circ(600, 724, 8, '#D8B838'),
  );

  // Warm uplighting at palace base
  addTo(svg,
    el('ellipse', { cx: '600', cy: '632', rx: '520', ry: '22', fill: '#C89028', opacity: '0.07' }),
    el('ellipse', { cx: '600', cy: '632', rx: '300', ry: '12', fill: '#C89028', opacity: '0.1' }),
  );

  return svg;
}

/** Insert the palace SVG into #palace-bg in the DOM. */
export function insertPalaceBackground(): void {
  const container = document.getElementById('palace-bg');
  if (!container) return;
  container.appendChild(createPalaceSvg());
}
