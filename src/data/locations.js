// Nodes on the 2D blueprint (the researcher's desk).
//
// Schema:
//   id           unique string id (referenced by deductions[].requires[].placedOn)
//   label        display label on the blueprint
//   blueprintPos normalised position on the blueprint image, {x,y} in [0..1]
//   acceptsTags  a fragment may be pinned here only if it shares >=1 tag.
//                Pinning a fragment whose tags don't intersect is rejected
//                with non-destructive feedback.
//
// To add a location: append here and reference its `id` from a deduction.

export const LOCATIONS = [
  {
    id: 'boiler_room',
    label: 'Boiler Room',
    blueprintPos: { x: 0.30, y: 0.72 },
    acceptsTags: ['fire', 'boiler_room', 'coal'],
  },
  {
    id: 'bridge',
    label: 'Bridge',
    blueprintPos: { x: 0.74, y: 0.22 },
    acceptsTags: ['timeline', 'bridge', 'command'],
  },
  {
    id: 'cargo_hold',
    label: 'Cargo Hold',
    blueprintPos: { x: 0.18, y: 0.44 },
    acceptsTags: ['coal', 'cargo_hold', 'fire'],
  },
  {
    id: 'wireless_room',
    label: 'Wireless Room',
    blueprintPos: { x: 0.80, y: 0.58 },
    acceptsTags: ['distress', 'wireless_room', 'timeline'],
  },
];

export const LOCATION_BY_ID = Object.fromEntries(LOCATIONS.map((l) => [l.id, l]));
