// The connections the player makes by pinning evidence to blueprint locations.
//
// Schema:
//   id          unique string id
//   title       short label (shown in the desk's deduction tray)
//   requires    array of { evidenceId, placedOn } — ALL must be satisfied by
//               the current desk placements for the deduction to resolve
//   revealText  the line shown when the deduction resolves (and during reshape)
//   unlocks     the geometryStates id to apply (see geometryStates.js)
//
// A deduction resolves the moment every `requires` pair is present on the board.
// To add a chain: define the evidence + locations, add a deduction here, then a
// matching geometry state in geometryStates.js. Nothing else is hardcoded.

export const DEDUCTIONS = [
  {
    id: 'fire_before_notice',
    title: 'The fire came first',
    requires: [
      { evidenceId: 'transcript_boiler_fire', placedOn: 'boiler_room' },
      { evidenceId: 'log_captain_notified', placedOn: 'bridge' },
    ],
    revealText: 'The fire broke out before the captain was ever notified.',
    unlocks: 'geo_fire_first',
  },
  {
    id: 'coal_loaded_burning',
    title: 'Loaded already alight',
    requires: [
      { evidenceId: 'manifest_coal_bunker', placedOn: 'cargo_hold' },
      { evidenceId: 'log_wireless_distress', placedOn: 'wireless_room' },
    ],
    revealText:
      'Bunker six was loaded already smouldering — and the truth was wired ' +
      'away as "all well aboard."',
    unlocks: 'geo_coal_path',
  },
];

export const DEDUCTION_BY_ID = Object.fromEntries(DEDUCTIONS.map((d) => [d.id, d]));
