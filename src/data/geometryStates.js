// How a resolved deduction physically rewrites the world.
//
// Schema:
//   id         unique string id (referenced by deductions[].unlocks)
//   enable     mesh names to show + make collidable (faded in)
//   disable    mesh names to hide + remove from collision (faded out)
//   transform  array of { target, to, durationMs } — tween a named mesh to one
//              of its preset transform states (presets live on the mesh's
//              userData.transformStates, defined where the mesh is built)
//
// The names here are resolved against the level's mesh registry
// (see world/levels/chapter1.js). world/GeometryStates.js performs the
// show/hide/tween and the collision set updates automatically.

export const GEOMETRY_STATES = [
  {
    id: 'geo_fire_first',
    enable: ['corridor_C_open_path'],
    disable: ['corridor_C_intact_wall'],
    transform: [{ target: 'grand_staircase', to: 'rotated_90', durationMs: 1800 }],
  },
  {
    id: 'geo_coal_path',
    enable: ['corridor_D_reformed_bridge'],
    disable: ['corridor_D_collapsed_wall'],
    transform: [{ target: 'corridor_D_segment', to: 'reformed', durationMs: 1600 }],
  },
];

export const GEOMETRY_STATE_BY_ID = Object.fromEntries(
  GEOMETRY_STATES.map((g) => [g.id, g]),
);
