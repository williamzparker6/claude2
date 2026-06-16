// Primary-source fragments the researcher collects in the 3D world.
//
// Schema:
//   id        unique string id (referenced by deductions + pickups)
//   type      "transcript" | "manifest" | "log"  (drives the chip colour/icon)
//   title     short display title
//   source    who/what produced it (shown in the reader pane)
//   text      the readable body shown in the desk's transcript reader
//   foundAt   the blueprint location it semantically belongs to
//   tags      free-form tags; a fragment may be placed on any location whose
//             `acceptsTags` shares at least one tag (see locations.js)
//
// To add a fragment: append an object here, then drop a pickup with the same
// `id` into a level (see world/levels/chapter1.js) so it can be collected.

export const EVIDENCE = [
  {
    id: 'transcript_boiler_fire',
    type: 'transcript',
    title: "Stoker's Interview — Fragment 3",
    source: 'J. Hartley, Junior Stoker',
    text:
      "…the fire was already roaring when I went to wake the officers. " +
      "Bunker six had been hot for days — we shovelled the burning coal into " +
      "the furnaces to be rid of it, same as always. No one above decks knew. " +
      "Not yet.",
    foundAt: 'boiler_room',
    tags: ['fire', 'boiler_room', 'timeline'],
  },
  {
    id: 'log_captain_notified',
    type: 'log',
    title: "Bridge Log — Smudged Entry",
    source: "First Officer's Hand, RMS Meridian",
    text:
      "11.40 — Informed by Chief Engineer of a fire in the forward bunker. " +
      "Captain notified at once. He seemed… unsurprised. Ordered the matter " +
      "kept from the passengers. Course unchanged.",
    foundAt: 'bridge',
    tags: ['timeline', 'bridge', 'command'],
  },
  {
    id: 'manifest_coal_bunker',
    type: 'manifest',
    title: 'Cargo Manifest — Bunker Six',
    source: 'Southampton Coaling Office',
    text:
      "Bunker 6: 412 tons Welsh steam coal, loaded part-spent from the " +
      "colliery yard at a discount. Noted 'liable to heat.' Stowed against " +
      "schedule. Inspection waived to make the tide.",
    foundAt: 'cargo_hold',
    tags: ['coal', 'cargo_hold', 'fire'],
  },
  {
    id: 'log_wireless_distress',
    type: 'log',
    title: 'Wireless Room Log',
    source: 'Marconi Operator, second watch',
    text:
      "02.07 — Outgoing: 'All well aboard, proceeding as scheduled.' " +
      "Signed by order. The bunker had been smouldering since Southampton. " +
      "We told the world a comfortable lie while the iron grew warm beneath us.",
    foundAt: 'wireless_room',
    tags: ['distress', 'wireless_room', 'timeline'],
  },
];

// Convenience lookup map.
export const EVIDENCE_BY_ID = Object.fromEntries(EVIDENCE.map((e) => [e.id, e]));
