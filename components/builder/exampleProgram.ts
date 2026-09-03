// The program the builder opens with. It exercises the ops a survival house
// actually needs, so the first thing a person sees is editable rather than
// empty.
export const EXAMPLE_PROGRAM = `build(ctx => {
  const m = ctx.mass({ w: 13, d: 9 });
  m.storeys({ count: 2, height: 4 });

  m.foundation({ role: 'foundation', depth: 1 });
  m.floor({ storey: 0, role: 'floor' });
  m.floor({ storey: 1, role: 'floor' });

  m.walls({ role: 'wall_primary' });
  m.corners({ role: 'structure_post' });

  m.mirrorX(() => {
    m.window({ face: 'north', x: 3, y: 2, w: 1, h: 2, role: 'glass' });
    m.window({ face: 'south', x: 3, y: 2, w: 1, h: 2, role: 'glass' });
    m.window({ face: 'north', x: 3, y: 6, w: 1, h: 2, role: 'glass' });
  });

  m.door({ face: 'south', x: 0, role: 'door' });

  m.gableRoof({
    axis: 'x',
    pitch: 1,
    overhang: 1,
    role: 'roof_primary',
    trimRole: 'roof_trim',
    infillRole: 'wall_primary',
  });
});
`;
