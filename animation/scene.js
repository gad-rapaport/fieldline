/*
 * Fieldline product film (22 s, 1920x1080).
 * Story: a bakery freezer fails -> the call becomes a service request -> it is assigned in Fieldline ->
 * tasks, rules and safe concurrent editing carry it to "Resolved" -> the technician fixes the freezer.
 * Every product behaviour shown exists in the app; the laptop shows a real screenshot of it.
 * Style: grey hairline environment with flat-filled characters (inspiration notes in docs/ANIMATION-BRIEF.md).
 */
const { ease, prog, tw, life, rand, wave, h, place, createStage, attachPlayer } = Motion;

const C = {
  paper: '#f3f1ec',
  hair: '#c9c2b4',
  line: '#2a3441',
  ink: '#18202a',
  navy: '#18202a',
  navy2: '#253141',
  rust: '#b23c17',
  bright: '#e8673c',
  skin: '#e2a57c',
  skinShade: '#c7845d',
  hairDark: '#2b1d16',
  white: '#ffffff',
  water: '#5aa9c9',
  st: {
    new: ['#e6edf8', '#1f4b8f', 'New'],
    assigned: ['#ece8f8', '#4a3a99', 'Assigned'],
    in_progress: ['#ddf1ed', '#0f5e52', 'In progress'],
    resolved: ['#e3f2df', '#2c6324', 'Resolved'],
  },
};
const DUR = 22;
const svg = document.getElementById('stage');
const stage = createStage({ duration: DUR, root: svg });

// ---------- definitions ----------
const defs = h('defs', {}, [
  h('clipPath', { id: 'screenClip' }, [h('rect', { x: 0, y: 0, width: 880, height: 550, rx: 6 })]),
  h('mask', { id: 'curtainMask' }, [
    h('rect', { x: 0, y: 0, width: 1920, height: 1080, fill: 'white' }),
    h('circle', { id: 'curtainHole', cx: 520, cy: 560, r: 0, fill: 'black' }),
  ]),
  h('pattern', { id: 'tiles', width: 120, height: 120, patternUnits: 'userSpaceOnUse' }, [
    h('path', { d: 'M120 0H0V120', fill: 'none', stroke: '#e3ddd1', 'stroke-width': 2 }),
  ]),
]);
svg.appendChild(defs);

const bg = h('rect', { width: 1920, height: 1080, fill: C.paper });
svg.appendChild(bg);

/** Hairline that draws itself on (stroke-dashoffset), the look of the opening environment. */
function drawable(el) {
  el.setAttribute('fill', el.getAttribute('fill') ?? 'none');
  return el;
}

// ---------- characters ----------
/**
 * A flat character with hairline outline. Feet at (0,0). Arms are two-segment strokes posed by angles.
 * Returns setters so scenes can pose, blink and change expression per frame.
 */
function person({ top, bottom, hairColor = C.hairDark, hairStyle = 'bun', accessory }) {
  const g = h('g');
  const stroke = { stroke: C.line, 'stroke-width': 3, 'stroke-linejoin': 'round' };
  g.appendChild(h('rect', { x: -50, y: -200, width: 46, height: 200, rx: 18, fill: bottom, ...stroke }));
  g.appendChild(h('rect', { x: 4, y: -200, width: 46, height: 200, rx: 18, fill: bottom, ...stroke }));
  g.appendChild(h('ellipse', { cx: -30, cy: -2, rx: 34, ry: 14, fill: C.line }));
  g.appendChild(h('ellipse', { cx: 30, cy: -2, rx: 34, ry: 14, fill: C.line }));
  const armBack = h('path', {
    fill: 'none',
    stroke: top,
    'stroke-width': 34,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  });
  const handBack = h('circle', { r: 17, fill: C.skin, ...stroke });
  g.appendChild(armBack);
  g.appendChild(handBack);
  g.appendChild(
    h('path', {
      d: 'M-78 -380 Q-82 -400 -60 -405 L60 -405 Q82 -400 78 -380 L66 -200 L-66 -200 Z',
      fill: top,
      ...stroke,
    }),
  );
  if (accessory === 'apron') {
    g.appendChild(h('path', { d: 'M-48 -330 L48 -330 L58 -205 L-58 -205 Z', fill: C.white, ...stroke }));
    g.appendChild(
      h('path', { d: 'M-30 -330 L-40 -398 M30 -330 L40 -398', stroke: C.line, 'stroke-width': 3 }),
    );
  }
  if (accessory === 'belt') {
    g.appendChild(h('rect', { x: -68, y: -236, width: 136, height: 22, fill: C.line }));
    g.appendChild(h('rect', { x: 18, y: -232, width: 34, height: 30, rx: 4, fill: '#e3ddd1', ...stroke }));
  }
  g.appendChild(h('rect', { x: -16, y: -428, width: 32, height: 30, fill: C.skinShade }));
  const head = h('g');
  head.appendChild(h('circle', { cx: 0, cy: -476, r: 54, fill: C.skin, ...stroke }));
  if (hairStyle === 'bun') {
    head.appendChild(h('circle', { cx: 6, cy: -548, r: 26, fill: hairColor }));
    head.appendChild(
      h('path', {
        d: 'M-56 -478 Q-60 -540 0 -536 Q58 -538 56 -486 Q30 -512 -10 -508 Q-40 -500 -56 -478 Z',
        fill: hairColor,
      }),
    );
  } else {
    head.appendChild(
      h('path', {
        d: 'M-58 -470 Q-66 -546 0 -540 Q64 -544 58 -470 L62 -400 L40 -404 L42 -478 Q10 -500 -36 -488 L-40 -404 L-62 -400 Z',
        fill: hairColor,
      }),
    );
  }
  const eyes = h('g');
  eyes.appendChild(h('ellipse', { cx: -19, cy: -478, rx: 5, ry: 7, fill: C.line }));
  eyes.appendChild(h('ellipse', { cx: 19, cy: -478, rx: 5, ry: 7, fill: C.line }));
  head.appendChild(eyes);
  const mouth = h('path', { fill: 'none', stroke: C.line, 'stroke-width': 4, 'stroke-linecap': 'round' });
  head.appendChild(mouth);
  g.appendChild(head);
  const armFront = h('path', {
    fill: 'none',
    stroke: top,
    'stroke-width': 34,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  });
  const handFront = h('circle', { r: 17, fill: C.skin, ...stroke });
  g.appendChild(armFront);
  g.appendChild(handFront);
  const holder = h('g');
  g.appendChild(holder);

  const arm = (path, hand, sx, a1, a2) => {
    const sy = -388;
    const ex = sx + Math.sin(a1) * 100;
    const ey = sy + Math.cos(a1) * 100;
    const hx = ex + Math.sin(a1 + a2) * 92;
    const hy = ey + Math.cos(a1 + a2) * 92;
    path.setAttribute(
      'd',
      `M${sx} ${sy} L${ex.toFixed(1)} ${ey.toFixed(1)} L${hx.toFixed(1)} ${hy.toFixed(1)}`,
    );
    hand.setAttribute('cx', hx.toFixed(1));
    hand.setAttribute('cy', hy.toFixed(1));
    return [hx, hy];
  };
  return {
    g,
    holder,
    /** Angles in radians from straight down; positive swings toward +x. */
    pose(backA1, backA2, frontA1, frontA2) {
      arm(armBack, handBack, -62, backA1, backA2);
      return arm(armFront, handFront, 62, frontA1, frontA2);
    },
    face(smile, blink, headTilt = 0) {
      mouth.setAttribute('d', `M-18 -446 Q0 ${(-446 + smile * 16).toFixed(1)} 18 -446`);
      eyes.setAttribute('transform', `translate(0 -478) scale(1 ${blink.toFixed(3)}) translate(0 478)`);
      head.setAttribute('transform', `rotate(${headTilt.toFixed(2)} 0 -420)`);
    },
  };
}

const blinkAt = (t, seed) => {
  const period = 3.1 + rand(seed) * 1.4;
  const phase = (t + rand(seed + 1) * 3) % period;
  return phase < 0.12 ? 0.15 : 1;
};

// ---------- scene A/D: the bakery ----------
const shop = h('g', { id: 'shop' });
svg.appendChild(shop);
shop.appendChild(h('rect', { x: 0, y: 0, width: 1920, height: 860, fill: 'url(#tiles)' }));
const hairlines = [
  h('line', { x1: 0, y1: 860, x2: 1920, y2: 860, stroke: C.line, 'stroke-width': 3 }),
  h('line', { x1: 1180, y1: 380, x2: 1820, y2: 380, stroke: C.hair, 'stroke-width': 3 }),
  h('line', { x1: 1180, y1: 250, x2: 1820, y2: 250, stroke: C.hair, 'stroke-width': 3 }),
  h('rect', { x: 1150, y: 640, width: 700, height: 220, stroke: C.line, 'stroke-width': 3, fill: C.white }),
  h('line', { x1: 1150, y1: 690, x2: 1850, y2: 690, stroke: C.hair, 'stroke-width': 3 }),
  h('rect', { x: 210, y: 250, width: 420, height: 610, stroke: C.line, 'stroke-width': 3, fill: '#f8f7f4' }),
  h('rect', {
    x: 250,
    y: 300,
    width: 340,
    height: 160,
    rx: 6,
    stroke: C.hair,
    'stroke-width': 3,
    fill: 'none',
  }),
  h('line', {
    x1: 570,
    y1: 520,
    x2: 570,
    y2: 660,
    stroke: C.line,
    'stroke-width': 10,
    'stroke-linecap': 'round',
  }),
  h('rect', {
    x: 330,
    y: 170,
    width: 180,
    height: 62,
    rx: 8,
    stroke: C.line,
    'stroke-width': 3,
    fill: C.ink,
  }),
];
hairlines.forEach((el) => shop.appendChild(drawable(el)));
const loaves = h('g');
for (let i = 0; i < 6; i++) {
  loaves.appendChild(
    h('rect', {
      x: 1200 + i * 100,
      y: 330,
      width: 82,
      height: 46,
      rx: 22,
      fill: '#e5c08f',
      stroke: C.line,
      'stroke-width': 3,
    }),
  );
  loaves.appendChild(
    h('path', {
      d: `M${1218 + i * 100} 344 l14 18 M${1240 + i * 100} 340 l14 18 M${1262 + i * 100} 340 l12 16`,
      stroke: '#b98a4e',
      'stroke-width': 3,
    }),
  );
}
for (let i = 0; i < 5; i++) {
  loaves.appendChild(
    h('circle', { cx: 1230 + i * 120, cy: 222, r: 26, fill: '#d9a066', stroke: C.line, 'stroke-width': 3 }),
  );
}
shop.appendChild(loaves);
shop.appendChild(
  h('text', {
    x: 1500,
    y: 780,
    'text-anchor': 'middle',
    'font-size': 40,
    'font-weight': 700,
    fill: C.ink,
    text: 'Granite Bakery',
  }),
);
const tempText = h('text', {
  x: 420,
  y: 214,
  'text-anchor': 'middle',
  'font-size': 38,
  'font-weight': 700,
  class: 'mono',
  fill: C.bright,
  text: '+6°C',
});
shop.appendChild(tempText);
shop.appendChild(
  h('text', {
    x: 420,
    y: 560,
    'text-anchor': 'middle',
    'font-size': 26,
    'font-weight': 600,
    fill: '#8a8577',
    text: 'WALK-IN FREEZER',
  }),
);
const drips = h('g');
for (let i = 0; i < 9; i++)
  drips.appendChild(h('path', { d: 'M0 -12 Q8 2 0 10 Q-8 2 0 -12 Z', fill: C.water }));
shop.appendChild(drips);
const frost = h('g');
for (let i = 0; i < 10; i++) {
  frost.appendChild(
    h('path', {
      d: 'M-12 0H12M0 -12V12M-8 -8L8 8M8 -8L-8 8',
      stroke: C.water,
      'stroke-width': 3,
      'stroke-linecap': 'round',
    }),
  );
}
shop.appendChild(frost);
const check = h('g', { opacity: 0 }, [
  h('circle', { cx: 0, cy: 0, r: 60, fill: '#e3f2df', stroke: '#2c6324', 'stroke-width': 5 }),
  h('path', {
    d: 'M-26 2 L-6 22 L28 -18',
    fill: 'none',
    stroke: '#2c6324',
    'stroke-width': 10,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  }),
]);
shop.appendChild(check);

const owner = person({ top: C.rust, bottom: '#3b4656', accessory: 'apron', hairStyle: 'bun' });
shop.appendChild(owner.g);
const phone = h('rect', { width: 26, height: 48, rx: 6, fill: C.ink });
owner.holder.appendChild(phone);
const tech = person({
  top: '#0f5e52',
  bottom: '#2a3441',
  hairStyle: 'long',
  hairColor: '#4a2a1e',
  accessory: 'belt',
});
shop.appendChild(tech.g);
const toolbox = h('g', {}, [
  h('rect', {
    x: -60,
    y: -10,
    width: 120,
    height: 70,
    rx: 8,
    fill: C.bright,
    stroke: C.line,
    'stroke-width': 3,
  }),
  h('path', { d: 'M-26 -10 V-30 H26 V-10', fill: 'none', stroke: C.line, 'stroke-width': 6 }),
  h('line', { x1: -60, y1: 14, x2: 60, y2: 14, stroke: C.line, 'stroke-width': 3 }),
]);
shop.appendChild(toolbox);

// call rings and the speech bubble that becomes the request card
const rings = h('g');
for (let i = 0; i < 3; i++)
  rings.appendChild(h('circle', { r: 40, fill: 'none', stroke: C.rust, 'stroke-width': 4 }));
shop.appendChild(rings);

// ---------- dark layer: curtain, desk and abstract space ----------
const dark = h('g', { mask: 'url(#curtainMask)' });
svg.appendChild(dark);
const curtain = h('path', { fill: C.navy });
dark.appendChild(curtain);

const desk = h('g');
dark.appendChild(desk);
desk.appendChild(h('rect', { x: 0, y: 820, width: 1920, height: 260, fill: C.navy2 }));
const laptop = h('g');
desk.appendChild(laptop);
laptop.appendChild(
  h('rect', {
    x: -470,
    y: -300,
    width: 940,
    height: 600,
    rx: 24,
    fill: '#0d1218',
    stroke: '#3a4655',
    'stroke-width': 3,
  }),
);
const screenGroup = h('g', { transform: 'translate(-440 -275)' });
laptop.appendChild(screenGroup);
const shot = h('image', {
  href: '../docs/screenshots/request-detail.png',
  x: 0,
  y: 0,
  width: 880,
  height: 657,
  'clip-path': 'url(#screenClip)',
  preserveAspectRatio: 'xMinYMin slice',
});
screenGroup.appendChild(shot);
// Highlight over the real "Reassign to / Assign" control in the screenshot (1440-wide source scaled to 880).
const sc = 880 / 1440;
const focusRing = h('rect', {
  x: 1088 * sc,
  y: 292 * sc,
  width: 300 * sc,
  height: 70 * sc,
  rx: 8,
  fill: 'none',
  stroke: C.bright,
  'stroke-width': 5,
});
screenGroup.appendChild(focusRing);
const cursor = h('path', {
  d: 'M0 0 L0 34 L9 26 L16 42 L22 39 L15 24 L27 24 Z',
  fill: C.white,
  stroke: C.ink,
  'stroke-width': 2.5,
});
screenGroup.appendChild(cursor);
laptop.appendChild(
  h('path', {
    d: 'M-520 300 L520 300 L560 340 L-560 340 Z',
    fill: '#2f3b4b',
    stroke: '#3a4655',
    'stroke-width': 3,
  }),
);
const hands = h('g');
desk.appendChild(hands);
const handL = h('g', {}, [
  h('path', {
    d: 'M-80 260 Q-40 120 20 60',
    fill: 'none',
    stroke: C.rust,
    'stroke-width': 90,
    'stroke-linecap': 'round',
  }),
  h('ellipse', { cx: 30, cy: 40, rx: 48, ry: 38, fill: C.skin, stroke: C.line, 'stroke-width': 3 }),
]);
const handR = h('g', {}, [
  h('path', {
    d: 'M80 260 Q40 120 -20 60',
    fill: 'none',
    stroke: C.rust,
    'stroke-width': 90,
    'stroke-linecap': 'round',
  }),
  h('ellipse', { cx: -30, cy: 40, rx: 48, ry: 38, fill: C.skin, stroke: C.line, 'stroke-width': 3 }),
]);
hands.appendChild(handL);
hands.appendChild(handR);

const space = h('g');
dark.appendChild(space);
for (let i = 0; i < 40; i++) {
  space.appendChild(
    h('rect', {
      x: rand(i) * 1920,
      y: rand(i + 99) * 1080,
      width: 6 + rand(i + 7) * 26,
      height: 4,
      rx: 2,
      fill: '#3a4655',
    }),
  );
}
const lane = h('g');
space.appendChild(lane);
const laneNames = ['Assigned', 'In progress', 'Resolved'];
lane.appendChild(
  h('line', {
    x1: 0,
    y1: 0,
    x2: 900,
    y2: 0,
    stroke: '#3a4655',
    'stroke-width': 6,
    'stroke-linecap': 'round',
  }),
);
const laneFill = h('line', {
  x1: 0,
  y1: 0,
  x2: 0,
  y2: 0,
  stroke: C.bright,
  'stroke-width': 6,
  'stroke-linecap': 'round',
});
lane.appendChild(laneFill);
const laneDots = laneNames.map((name, i) => {
  const dot = h('circle', { cx: i * 450, cy: 0, r: 16, fill: C.navy, stroke: '#3a4655', 'stroke-width': 6 });
  lane.appendChild(dot);
  lane.appendChild(
    h('text', {
      x: i * 450,
      y: 56,
      'text-anchor': 'middle',
      'font-size': 30,
      'font-weight': 600,
      fill: '#c9cfd6',
      text: name,
    }),
  );
  return dot;
});

// Task panel with the three tasks the seed attaches to this issue.
const taskPanel = h('g');
space.appendChild(taskPanel);
taskPanel.appendChild(h('rect', { x: 0, y: 0, width: 640, height: 300, rx: 18, fill: C.white }));
taskPanel.appendChild(
  h('text', {
    x: 32,
    y: 52,
    'font-size': 24,
    'font-weight': 700,
    fill: '#545e69',
    'letter-spacing': 2,
    text: 'TASKS',
  }),
);
const taskCount = h('text', {
  x: 608,
  y: 52,
  'text-anchor': 'end',
  'font-size': 24,
  fill: '#545e69',
  text: '0 of 3 done',
});
taskPanel.appendChild(taskCount);
const tasks = ['Check compressor current draw', 'Inspect door gasket', 'Log temperature for 2 hours'].map(
  (label, i) => {
    const row = h('g', { transform: `translate(32 ${96 + i * 66})` });
    const box = h('rect', {
      x: 0,
      y: -24,
      width: 34,
      height: 34,
      rx: 6,
      fill: C.white,
      stroke: '#8a8577',
      'stroke-width': 3,
    });
    const tick = h('path', {
      d: 'M6 -8 L14 2 L28 -16',
      fill: 'none',
      stroke: C.white,
      'stroke-width': 5,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    });
    const text = h('text', { x: 56, y: 2, 'font-size': 28, fill: C.ink, text: label });
    const strike = h('line', { x1: 56, y1: -6, x2: 56, y2: -6, stroke: '#8a8577', 'stroke-width': 3 });
    [box, tick, text, strike].forEach((e) => row.appendChild(e));
    taskPanel.appendChild(row);
    return { row, box, tick, text, strike, width: label.length * 14.2 };
  },
);

// Conflict vignette: real wording of the app's conflict panel.
const conflict = h('g');
space.appendChild(conflict);
conflict.appendChild(
  h('rect', {
    x: 0,
    y: 0,
    width: 700,
    height: 150,
    rx: 16,
    fill: '#fff8ec',
    stroke: '#e0a458',
    'stroke-width': 4,
  }),
);
conflict.appendChild(
  h('text', {
    x: 32,
    y: 58,
    'font-size': 30,
    'font-weight': 700,
    fill: '#7a4a00',
    text: 'This request changed while you were editing',
  }),
);
conflict.appendChild(
  h('text', {
    x: 32,
    y: 108,
    'font-size': 26,
    fill: '#7a4a00',
    text: 'Your changes have not been saved. Compare the versions.',
  }),
);
const cursorA = h('g', {}, [
  h('path', {
    d: 'M0 0 L0 40 L11 31 L19 50 L26 47 L18 29 L32 29 Z',
    fill: C.white,
    stroke: C.ink,
    'stroke-width': 2.5,
  }),
  h('rect', { x: 26, y: 40, width: 96, height: 40, rx: 8, fill: '#0f5e52' }),
  h('text', {
    x: 74,
    y: 68,
    'text-anchor': 'middle',
    'font-size': 24,
    'font-weight': 600,
    fill: C.white,
    text: 'Avery',
  }),
]);
const cursorB = h('g', {}, [
  h('path', {
    d: 'M0 0 L0 40 L11 31 L19 50 L26 47 L18 29 L32 29 Z',
    fill: C.white,
    stroke: C.ink,
    'stroke-width': 2.5,
  }),
  h('rect', { x: 26, y: 40, width: 76, height: 40, rx: 8, fill: '#4a3a99' }),
  h('text', {
    x: 64,
    y: 68,
    'text-anchor': 'middle',
    'font-size': 24,
    'font-weight': 600,
    fill: C.white,
    text: 'You',
  }),
]);
space.appendChild(cursorA);
space.appendChild(cursorB);
const savedTag = h('g', {}, [
  h('rect', { x: 0, y: 0, width: 230, height: 54, rx: 27, fill: '#e3f2df' }),
  h('text', {
    x: 115,
    y: 37,
    'text-anchor': 'middle',
    'font-size': 26,
    'font-weight': 700,
    fill: '#2c6324',
    text: 'Saved, version 4',
  }),
]);
space.appendChild(savedTag);

// ---------- the request card (travels through every scene) ----------
const card = h('g');
svg.appendChild(card);
card.appendChild(
  h('rect', {
    x: -300,
    y: -110,
    width: 600,
    height: 220,
    rx: 18,
    fill: C.white,
    stroke: C.line,
    'stroke-width': 3,
  }),
);
card.appendChild(h('rect', { x: -300, y: -110, width: 14, height: 220, rx: 7, fill: C.rust }));
card.appendChild(
  h('text', { x: -262, y: -56, 'font-size': 28, class: 'mono', fill: C.rust, text: 'SR-1142' }),
);
card.appendChild(
  h('text', {
    x: -262,
    y: -10,
    'font-size': 30,
    'font-weight': 700,
    fill: C.ink,
    text: 'Walk-in freezer not holding',
  }),
);
card.appendChild(
  h('text', { x: -262, y: 28, 'font-size': 30, 'font-weight': 700, fill: C.ink, text: 'temperature' }),
);
const pill = h('rect', { x: -262, y: 52, width: 190, height: 42, rx: 21 });
const pillText = h('text', { x: -167, y: 81, 'text-anchor': 'middle', 'font-size': 24, 'font-weight': 600 });
card.appendChild(pill);
card.appendChild(pillText);
card.appendChild(
  h('text', { x: -50, y: 81, 'font-size': 24, 'font-weight': 700, fill: C.rust, text: 'Urgent' }),
);
const assignee = h('g', {}, [
  h('circle', { cx: 120, cy: 73, r: 22, fill: '#0f5e52' }),
  h('text', {
    x: 120,
    y: 81,
    'text-anchor': 'middle',
    'font-size': 18,
    'font-weight': 700,
    fill: C.white,
    text: 'RH',
  }),
  h('text', { x: 152, y: 81, 'font-size': 24, fill: C.ink, text: 'Rina Haddad' }),
]);
card.appendChild(assignee);
const flash = h('rect', {
  x: -300,
  y: -110,
  width: 600,
  height: 220,
  rx: 18,
  fill: 'none',
  stroke: '#2c6324',
  'stroke-width': 8,
});
card.appendChild(flash);
function setStatus(key) {
  const [bgc, fg, label] = C.st[key];
  pill.setAttribute('fill', bgc);
  pillText.setAttribute('fill', fg);
  pillText.textContent = label;
}

// ---------- end card ----------
const end = h('g');
svg.appendChild(end);
end.appendChild(h('rect', { width: 1920, height: 1080, fill: C.paper }));
const mark = h('g', { transform: 'translate(960 380)' });
end.appendChild(mark);
mark.appendChild(h('rect', { x: -90, y: -90, width: 180, height: 180, rx: 34, fill: C.navy }));
const markLines = [
  h('path', { d: 'M-48 -40 H48', stroke: C.bright, 'stroke-width': 18, 'stroke-linecap': 'round' }),
  h('path', { d: 'M-48 0 H18', stroke: C.bright, 'stroke-width': 18, 'stroke-linecap': 'round' }),
  h('path', { d: 'M-48 40 H-12', stroke: C.bright, 'stroke-width': 18, 'stroke-linecap': 'round' }),
];
markLines.forEach((l) => mark.appendChild(l));
const title = h('text', {
  x: 960,
  y: 610,
  'text-anchor': 'middle',
  'font-size': 120,
  'font-weight': 700,
  fill: C.ink,
  'letter-spacing': -2,
  text: 'Fieldline',
});
const tagline = h('text', {
  x: 960,
  y: 680,
  'text-anchor': 'middle',
  'font-size': 40,
  fill: '#545e69',
  text: 'Service requests, field tasks and team workload',
});
const repo = h('text', {
  x: 960,
  y: 770,
  'text-anchor': 'middle',
  'font-size': 32,
  class: 'mono',
  fill: C.rust,
  text: 'github.com/gad-rapaport/fieldline',
});
[title, tagline, repo].forEach((e) => end.appendChild(e));

// ---------- captions ----------
const caption = h('g');
svg.appendChild(caption);
const capText = h('text', { x: 120, y: 104, 'font-size': 58, 'font-weight': 700, 'letter-spacing': -1 });
const capBar = h('rect', { x: 120, y: 128, height: 8, rx: 4, fill: C.bright });
caption.appendChild(capText);
caption.appendChild(capBar);
const CAPTIONS = [
  { from: 0.8, to: 4.2, text: '7:02 a.m. The freezer stops cooling.', dark: false },
  { from: 5.6, to: 9.6, text: 'One request, assigned in seconds.', dark: true },
  { from: 10.6, to: 14.4, text: 'Tasks first, then it can be resolved.', dark: true },
  { from: 14.8, to: 17.2, text: 'Two editors. Nothing overwritten silently.', dark: true },
  { from: 17.8, to: 19.6, text: 'Fixed, closed and on the record.', dark: false },
];

// ---------- timeline ----------
stage.add((t) => {
  // Hairlines draw on, then stay.
  hairlines.forEach((el, i) => {
    const len = el.getTotalLength ? el.getTotalLength() : 2000;
    const p = ease.outCubic(prog(t, 0.05 + i * 0.07, 0.9));
    el.setAttribute('stroke-dasharray', `${len} ${len}`);
    el.setAttribute('stroke-dashoffset', ((1 - p) * len).toFixed(1));
  });
  place(loaves, { y: tw(t, 0.4, 0.7, 30, 0, ease.outBack), o: prog(t, 0.4, 0.4) });

  // Freezer: warm and dripping until the fix at ~18.2 s, then cold again.
  const fixed = t >= 18.2;
  tempText.textContent = fixed ? '-18°C' : '+6°C';
  tempText.setAttribute('fill', fixed ? C.water : C.bright);
  tempText.setAttribute('opacity', fixed ? 1 : 0.55 + 0.45 * Math.abs(wave(t, 1.2, 1)));
  [...drips.children].forEach((d, i) => {
    const cycle = ((t * 0.9 + rand(i) * 2) % 1.6) / 1.6;
    const x = 240 + rand(i + 3) * 360;
    place(d, { x, y: 470 + cycle * 380, o: fixed ? 0 : life(cycle, 0, 1, 0.1, 0.25) * prog(t, 1, 0.6) });
  });
  [...frost.children].forEach((f, i) => {
    const cycle = (t * 0.35 + rand(i + 20)) % 1;
    place(f, {
      x: 230 + rand(i + 30) * 380,
      y: 840 - cycle * 560,
      r: t * 40,
      o: fixed ? life(t, 18.4, DUR, 0.4, 0.1) * 0.9 : 0,
    });
  });
  place(check, {
    x: 420,
    y: 380,
    s: tw(t, 18.6, 0.5, 0.3, 1, ease.outBack),
    o: life(t, 18.6, DUR, 0.2, 0.1),
  });

  // Owner: worried call, later relieved.
  const ownerIn = tw(t, 0.6, 0.8, 300, 0, ease.outCubic);
  place(owner.g, { x: 860 + ownerIn, y: 860 + wave(t, 2.4, 3) });
  owner.g.setAttribute('opacity', prog(t, 0.6, 0.4));
  const calling = prog(t, 1.8, 0.5) * (1 - prog(t, 17.6, 0.5));
  const [px, py] = owner.pose(
    -0.15 + wave(t, 2.4, 0.03),
    0.2,
    ease.inOutCubic(calling) * 1.9,
    -ease.inOutCubic(calling) * 3.95,
  );
  phone.setAttribute('x', (px - 10).toFixed(1));
  phone.setAttribute('y', (py - 34).toFixed(1));
  phone.setAttribute('opacity', calling);
  const relief = prog(t, 18.7, 0.6);
  owner.face(-0.7 + relief * 1.7, blinkAt(t, 3), wave(t, 3, 2));
  if (t > 17) place(owner.g, { x: 1010, y: 860, s: 0.92 });

  // Technician walks in for the fix.
  const techX = tw(t, 17.4, 1.1, -160, 720, ease.outCubic);
  const walking = t > 17.4 && t < 18.5;
  place(tech.g, {
    x: techX,
    y: 860 - (walking ? Math.abs(wave(t, 0.5, 10)) : 0),
    o: life(t, 17.3, DUR, 0.2, 0.05),
  });
  const swing = walking ? wave(t, 0.5, 0.35) : 0;
  const [tx, ty] = tech.pose(0.1 + swing, 0.15, -0.1 - swing + prog(t, 18.4, 0.4) * -1.2, 0.2);
  tech.face(0.6, blinkAt(t, 9), 0);
  toolbox.setAttribute('opacity', life(t, 17.3, DUR, 0.2, 0.05).toFixed(3));
  toolbox.setAttribute('transform', `translate(${(techX + tx).toFixed(1)} ${(860 + ty + 22).toFixed(1)})`);

  // Call rings around the phone.
  [...rings.children].forEach((ring, i) => {
    const c = ((t - 2.1 - i * 0.35) % 1.05) / 1.05;
    const on = t > 2.1 && t < 3.6;
    ring.setAttribute('cx', (860 + ownerIn + px).toFixed(1));
    ring.setAttribute('cy', (860 + py - 10).toFixed(1));
    ring.setAttribute('r', (30 + c * 90).toFixed(1));
    ring.setAttribute('opacity', on && c >= 0 ? (1 - c).toFixed(3) : 0);
  });
  shop.setAttribute('opacity', t > 19.6 ? 1 - prog(t, 19.6, 0.4) : 1);

  // Curtain: curved navy wipe rising from the bottom (4.3 -> 5.1 s), later a circular hole reveals the shop.
  const rise = ease.inOutCubic(prog(t, 4.3, 0.8));
  const top = 1080 - rise * 1240;
  const bulge = Math.sin(rise * Math.PI) * 180;
  curtain.setAttribute('d', `M0 1080 L0 ${top + bulge} Q960 ${top - bulge} 1920 ${top + bulge} L1920 1080 Z`);
  const hole = document.getElementById('curtainHole');
  hole.setAttribute('r', (ease.inOutCubic(prog(t, 17.0, 0.9)) * 1500).toFixed(1));
  hole.setAttribute('cx', '760');
  hole.setAttribute('cy', '600');

  // Desk scene with the real screenshot.
  const deskIn = ease.outCubic(prog(t, 4.8, 0.7));
  const deskOut = ease.inCubic(prog(t, 9.6, 0.6));
  place(desk, { y: (1 - deskIn) * 700 + deskOut * 900, o: t > 5.05 && t < 10.4 ? 1 : 0 });
  place(laptop, { x: 1060, y: 450 });
  const typing = t > 5.4 && t < 6.6;
  place(handL, {
    x: 860 + (typing ? wave(t, 0.22, 6) : 0),
    y: 840 + (typing ? Math.abs(wave(t, 0.22, 10)) : 0),
  });
  place(handR, {
    x: 1260 - (typing ? wave(t, 0.26, 6) : 0),
    y: 840 + (typing ? Math.abs(wave(t, 0.26, 10, 0.1)) : 0),
  });
  const shotScroll = tw(t, 5.6, 1.2, 0, 0);
  shot.setAttribute('y', (-shotScroll).toFixed(1));
  const cx = tw(t, 6.6, 1.0, 300, 1088 * sc + 210 * sc, ease.inOutCubic);
  const cy = tw(t, 6.6, 1.0, 420, 292 * sc + 38 * sc, ease.inOutCubic);
  const clickPulse = 1 - 0.18 * Math.sin(prog(t, 7.7, 0.25) * Math.PI);
  place(cursor, { x: cx, y: cy, s: clickPulse, o: t > 6.4 ? 1 : 0 });
  focusRing.setAttribute(
    'opacity',
    (life(t, 7.6, 9.4, 0.15, 0.3) * (0.6 + 0.4 * Math.abs(wave(t, 0.6, 1)))).toFixed(3),
  );

  // Abstract space: lane, tasks, conflict.
  const spaceOn = life(t, 9.9, 17.2, 0.4, 0.3);
  space.setAttribute('opacity', spaceOn.toFixed(3));
  place(lane, { x: 510, y: 300 + tw(t, 10.0, 0.6, 40, 0) });
  const laneP =
    t < 10.8
      ? 0
      : t < 13.4
        ? tw(t, 10.8, 0.7, 0, 450, ease.inOutCubic)
        : tw(t, 13.4, 0.7, 450, 900, ease.inOutCubic);
  laneFill.setAttribute('x2', laneP.toFixed(1));
  laneDots.forEach((d, i) => d.setAttribute('fill', laneP >= i * 450 - 1 ? C.bright : C.navy));
  place(taskPanel, {
    x: 1080,
    y: 440 + tw(t, 10.5, 0.6, 60, 0, ease.outBack),
    o: life(t, 10.4, 14.6, 0.3, 0.3),
  });
  let done = 0;
  tasks.forEach((task, i) => {
    const at = 11.3 + i * 0.75;
    const p = prog(t, at, 0.3);
    if (t >= at) done++;
    task.box.setAttribute('fill', p > 0 ? '#0f5e52' : C.white);
    task.box.setAttribute('stroke', p > 0 ? '#0f5e52' : '#8a8577');
    task.tick.setAttribute('stroke-dasharray', '40 40');
    task.tick.setAttribute('stroke-dashoffset', (40 - 40 * ease.outCubic(p)).toFixed(1));
    task.strike.setAttribute('x2', (56 + task.width * ease.outCubic(prog(t, at + 0.15, 0.35))).toFixed(1));
    task.text.setAttribute('fill', p >= 1 ? '#8a8577' : C.ink);
    place(task.row, {
      x: 32 + tw(t, 10.7 + i * 0.12, 0.5, 40, 0),
      y: 96 + i * 66,
      o: prog(t, 10.7 + i * 0.12, 0.3),
    });
  });
  taskCount.textContent = `${done} of 3 done`;
  const conflictOn = life(t, 15.9, 17.1, 0.25, 0.25);
  place(conflict, { x: 440, y: 650 + tw(t, 15.9, 0.4, 30, 0, ease.outBack), o: conflictOn });
  place(cursorA, {
    x: tw(t, 14.8, 0.7, 1900, 1130, ease.outCubic),
    y: tw(t, 14.8, 0.7, 980, 470, ease.outCubic),
    o: life(t, 14.8, 17.0, 0.2, 0.2),
  });
  place(cursorB, {
    x: tw(t, 15.0, 0.8, -200, 700, ease.outCubic),
    y: tw(t, 15.0, 0.8, 1000, 520, ease.outCubic),
    o: life(t, 15.0, 17.0, 0.2, 0.2),
  });
  place(savedTag, {
    x: 1100,
    y: 380,
    s: tw(t, 15.35, 0.35, 0.6, 1, ease.outBack),
    o: life(t, 15.35, 16.6, 0.15, 0.25),
  });

  // Card: born from the call (3.4 s), carried up through the curtain, beside the laptop, centre of the space,
  // then back to the shop as a small "Resolved" badge.
  let cxCard;
  let cyCard;
  let sCard;
  let rCard = 0;
  if (t < 5.2) {
    const born = ease.outBack(prog(t, 3.4, 0.6));
    cxCard = tw(t, 3.4, 1.6, 1040, 520, ease.inOutCubic);
    cyCard = tw(t, 3.4, 1.6, 440, 300, ease.inOutCubic);
    sCard = 0.2 + born * 0.8;
    rCard = tw(t, 3.4, 1.6, -8, 0);
  } else if (t < 9.8) {
    cxCard = 340;
    cyCard = 420 + wave(t, 3, 8);
    sCard = 0.82;
    rCard = wave(t, 4, 1.2);
  } else if (t < 17.2) {
    cxCard = tw(t, 9.8, 0.7, 340, 720, ease.inOutCubic) + (t > 16.0 && t < 16.4 ? Math.sin(t * 90) * 8 : 0);
    cyCard = tw(t, 9.8, 0.7, 420, 520, ease.inOutCubic);
    sCard = tw(t, 9.8, 0.7, 0.82, 1.1, ease.inOutCubic);
  } else {
    cxCard = tw(t, 17.2, 0.9, 720, 1540, ease.inOutCubic);
    cyCard = tw(t, 17.2, 0.9, 520, 470, ease.inOutCubic);
    sCard = tw(t, 17.2, 0.9, 1.1, 0.62, ease.inOutCubic);
    rCard = tw(t, 17.2, 0.9, 0, 4);
  }
  place(card, { x: cxCard, y: cyCard, s: sCard, r: rCard, o: prog(t, 3.4, 0.2) * (1 - prog(t, 19.5, 0.4)) });
  setStatus(t < 7.8 ? 'new' : t < 11.0 ? 'assigned' : t < 13.6 ? 'in_progress' : 'resolved');
  assignee.setAttribute('opacity', prog(t, 7.8, 0.3).toFixed(3));
  flash.setAttribute(
    'opacity',
    (life(t, 13.6, 14.2, 0.05, 0.4) + life(t, 15.35, 15.9, 0.05, 0.3)).toFixed(3),
  );

  // End card.
  const endOn = prog(t, 19.6, 0.5);
  end.setAttribute('opacity', endOn.toFixed(3));
  place(mark, { x: 960, y: 380, s: tw(t, 19.8, 0.6, 0.5, 1, ease.outBack), r: tw(t, 19.8, 0.6, -12, 0) });
  markLines.forEach((l, i) => {
    const len = 100;
    l.setAttribute('stroke-dasharray', `${len} ${len}`);
    l.setAttribute(
      'stroke-dashoffset',
      (len - len * ease.outCubic(prog(t, 20.2 + i * 0.12, 0.4))).toFixed(1),
    );
  });
  [title, tagline, repo].forEach((e, i) =>
    place(e, { y: tw(t, 20.3 + i * 0.15, 0.5, 30, 0), o: prog(t, 20.3 + i * 0.15, 0.4) }),
  );

  // Captions.
  const cap = CAPTIONS.find((c) => t >= c.from && t <= c.to);
  if (cap) {
    const o = life(t, cap.from, cap.to, 0.25, 0.25);
    capText.textContent = cap.text;
    capText.setAttribute('fill', cap.dark ? '#ffffff' : C.ink);
    place(capText, { x: tw(t, cap.from, 0.4, -24, 0), o });
    capBar.setAttribute('width', (ease.outCubic(prog(t, cap.from + 0.1, 0.5)) * 140).toFixed(1));
    capBar.setAttribute('opacity', o.toFixed(3));
  } else {
    capText.setAttribute('opacity', 0);
    capBar.setAttribute('opacity', 0);
  }
});

attachPlayer(stage);
