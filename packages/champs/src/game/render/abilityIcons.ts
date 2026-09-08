/**
 * Pure, Phaser-free SVG skill-icon library for the HUD ability bar (and the
 * champion-select ability list).
 *
 * Each champion ability resolves to a deterministic icon id via
 * {@link resolveAbilityIconId}. The resolver prefers a per (champion.id + slot)
 * mapping so every roster champion x Q/W/E/R (+ passive) gets a recognizable,
 * flavored glyph (e.g. Ashborne arrow/bolt, Nightveil daggers, Ironhold
 * shield/hammer, Embermage flame/orb, Dawnsong halo/note, Frostquill ice
 * shard, Grimtrail claws), and falls back to a per-behavior glyph
 * (skillshot/dash/aoe/heal/stun/buff) for any ability that is not explicitly
 * mapped.
 *
 * {@link abilityIconSvg} turns an icon id into a self-contained 24x24 inline
 * SVG string. The glyphs use `currentColor` for stroke/fill so they tint with
 * the surrounding tile (the HUD sets the champion accent color on the tile).
 * There are NO external references (no `<image>`, no url()), so the markup is
 * safe to inline via `dangerouslySetInnerHTML` and never triggers a network
 * fetch, keeping the zero-binary-asset / offline principle intact.
 */

import type { AbilityBehavior, AbilitySlot } from '../../data/champions';

/** All icon ids the library knows how to draw. */
export type AbilityIconId =
  // Champion-flavored glyphs.
  | 'ashborne-arrow'
  | 'ashborne-volley'
  | 'ashborne-roll'
  | 'ashborne-rain'
  | 'nightveil-dagger'
  | 'nightveil-cloak'
  | 'nightveil-blink'
  | 'nightveil-execute'
  | 'ironhold-cleave'
  | 'ironhold-bulwark'
  | 'ironhold-charge'
  | 'ironhold-quake'
  | 'embermage-bolt'
  | 'embermage-nova'
  | 'embermage-sigil'
  | 'embermage-meteor'
  | 'dawnsong-note'
  | 'dawnsong-mend'
  | 'dawnsong-halo'
  | 'dawnsong-anthem'
  | 'thornwarden-thorn'
  | 'thornwarden-sweep'
  | 'thornwarden-vine'
  | 'thornwarden-roots'
  | 'grimtrail-claw'
  | 'grimtrail-pounce'
  | 'grimtrail-track'
  | 'grimtrail-verdict'
  | 'frostquill-shard'
  | 'frostquill-hail'
  | 'frostquill-freeze'
  | 'frostquill-winter'
  | 'duskarrow-dusk'
  | 'duskarrow-trap'
  | 'duskarrow-step'
  | 'duskarrow-volley'
  | 'wardlight-beacon'
  | 'wardlight-glow'
  | 'wardlight-flare'
  | 'wardlight-lantern'
  // Behavior fallback glyphs.
  | 'behavior-skillshot'
  | 'behavior-dash'
  | 'behavior-aoe'
  | 'behavior-heal'
  | 'behavior-stun'
  | 'behavior-buff';

/**
 * Per (champion.id + slot) icon assignments. Slots are Q/W/E/R plus the passive
 * P. Any slot missing here falls back to the ability's behavior glyph.
 */
const CHAMPION_SLOT_ICONS: Record<
  string,
  Partial<Record<AbilitySlot, AbilityIconId>>
> = {
  ashborne: {
    P: 'ashborne-arrow',
    Q: 'ashborne-arrow',
    W: 'ashborne-volley',
    E: 'ashborne-roll',
    R: 'ashborne-rain',
  },
  nightveil: {
    P: 'nightveil-dagger',
    Q: 'nightveil-dagger',
    W: 'nightveil-cloak',
    E: 'nightveil-blink',
    R: 'nightveil-execute',
  },
  ironhold: {
    P: 'ironhold-bulwark',
    Q: 'ironhold-cleave',
    W: 'ironhold-bulwark',
    E: 'ironhold-charge',
    R: 'ironhold-quake',
  },
  embermage: {
    P: 'embermage-bolt',
    Q: 'embermage-bolt',
    W: 'embermage-nova',
    E: 'embermage-sigil',
    R: 'embermage-meteor',
  },
  dawnsong: {
    P: 'dawnsong-mend',
    Q: 'dawnsong-note',
    W: 'dawnsong-mend',
    E: 'dawnsong-halo',
    R: 'dawnsong-anthem',
  },
  thornwarden: {
    P: 'thornwarden-thorn',
    Q: 'thornwarden-sweep',
    W: 'thornwarden-thorn',
    E: 'thornwarden-vine',
    R: 'thornwarden-roots',
  },
  grimtrail: {
    P: 'grimtrail-track',
    Q: 'grimtrail-claw',
    W: 'grimtrail-pounce',
    E: 'grimtrail-track',
    R: 'grimtrail-verdict',
  },
  frostquill: {
    P: 'frostquill-shard',
    Q: 'frostquill-shard',
    W: 'frostquill-hail',
    E: 'frostquill-freeze',
    R: 'frostquill-winter',
  },
  duskarrow: {
    P: 'duskarrow-dusk',
    Q: 'duskarrow-dusk',
    W: 'duskarrow-trap',
    E: 'duskarrow-step',
    R: 'duskarrow-volley',
  },
  wardlight: {
    P: 'wardlight-glow',
    Q: 'wardlight-beacon',
    W: 'wardlight-glow',
    E: 'wardlight-flare',
    R: 'wardlight-lantern',
  },
};

/** Behavior -> fallback glyph. Covers every {@link AbilityBehavior}. */
const BEHAVIOR_ICONS: Record<AbilityBehavior, AbilityIconId> = {
  skillshot: 'behavior-skillshot',
  dash: 'behavior-dash',
  aoe: 'behavior-aoe',
  heal: 'behavior-heal',
  stun: 'behavior-stun',
  buff: 'behavior-buff',
};

/**
 * Resolve an ability to a deterministic icon id. Prefers the champion-flavored
 * per-slot glyph, falling back to the behavior glyph. Always returns a defined,
 * drawable id.
 */
export function resolveAbilityIconId(
  championId: string,
  slot: AbilitySlot,
  behavior: AbilityBehavior,
): AbilityIconId {
  const perChampion = CHAMPION_SLOT_ICONS[championId];
  const flavored = perChampion?.[slot];
  if (flavored) return flavored;
  return BEHAVIOR_ICONS[behavior];
}

/** Inner SVG body (paths/shapes) for each icon id, drawn on a 24x24 grid. */
const ICON_BODIES: Record<AbilityIconId, string> = {
  // --- Ashborne: precise archery. ---
  'ashborne-arrow':
    '<path d="M3 21L21 3" /><path d="M14 3h7v7" /><path d="M3 21l4-1 1-4" fill="currentColor" stroke="none" />',
  'ashborne-volley':
    '<path d="M3 20L14 6" /><path d="M8 20L18 7" /><path d="M13 20L21 9" /><path d="M11 4l4 1 -1 4" />',
  'ashborne-roll':
    '<path d="M4 15c4-6 12-6 16 0" /><path d="M4 15l3-1M20 15l-3-1" /><circle cx="12" cy="9" r="2.4" fill="currentColor" stroke="none" />',
  'ashborne-rain':
    '<path d="M5 3l3 8M12 2l0 9M19 3l-3 8" /><path d="M5 15l1 5M12 15l0 5M19 15l-1 5" /><path d="M3 13h18" />',
  // --- Nightveil: shadow blades. ---
  'nightveil-dagger':
    '<path d="M12 2l3 12-3 3-3-3z" fill="currentColor" stroke="none" /><path d="M9 17h6M12 17v5" />',
  'nightveil-cloak':
    '<path d="M12 3l7 6-7 12-7-12z" /><path d="M12 3v18" /><path d="M5 9h14" />',
  'nightveil-blink':
    '<path d="M4 12h9" /><path d="M9 8l5 4-5 4" fill="currentColor" stroke="none" /><path d="M16 6v12M20 6v12" />',
  'nightveil-execute':
    '<path d="M4 4l10 10M8 4L4 4l0 4" /><path d="M20 4L10 14M16 4l4 0l0 4" /><circle cx="12" cy="18" r="3" />',
  // --- Ironhold: iron and stone. ---
  'ironhold-cleave':
    '<path d="M6 4l6 6" /><path d="M12 10c4-4 6-2 6-2s2 2-2 6l-4-4z" fill="currentColor" stroke="none" /><path d="M4 20l6-6" />',
  'ironhold-bulwark':
    '<path d="M12 2l8 3v6c0 5-4 8-8 11-4-3-8-6-8-11V5z" /><path d="M12 7v9M8 11h8" />',
  'ironhold-charge':
    '<path d="M3 12h10" /><path d="M9 7l6 5-6 5" fill="currentColor" stroke="none" /><path d="M17 6l0 12" /><path d="M20 8l0 8" />',
  'ironhold-quake':
    '<path d="M2 15l4-3 3 4 3-8 3 6 3-3 4 4" /><path d="M4 20h16" />',
  // --- Embermage: arcane fire. ---
  'embermage-bolt':
    '<path d="M13 2L5 13h5l-2 9 9-12h-5z" fill="currentColor" stroke="none" />',
  'embermage-nova':
    '<circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />',
  'embermage-sigil':
    '<circle cx="12" cy="12" r="9" /><path d="M12 3l7.8 13.5H4.2z" /><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />',
  'embermage-meteor':
    '<circle cx="15" cy="9" r="5" fill="currentColor" stroke="none" /><path d="M3 21l6-6M2 15l4-1M8 22l1-4" />',
  // --- Dawnsong: light and song. ---
  'dawnsong-note':
    '<circle cx="7" cy="18" r="3" fill="currentColor" stroke="none" /><path d="M10 18V5l9-2v11" /><path d="M19 14a3 3 0 1 1-2-2.8" fill="none" />',
  'dawnsong-mend':
    '<path d="M12 21C5 16 3 11 3 8a4.5 4.5 0 0 1 9-1 4.5 4.5 0 0 1 9 1c0 3-2 8-9 13z" /><path d="M12 8v6M9 11h6" />',
  'dawnsong-halo':
    '<ellipse cx="12" cy="7" rx="7" ry="2.6" /><path d="M12 11c-3 2-3 8 0 10 3-2 3-8 0-10z" fill="currentColor" stroke="none" />',
  'dawnsong-anthem':
    '<path d="M12 3v18" /><path d="M12 6c4-3 8 0 8 0M12 6c-4-3-8 0-8 0" /><path d="M12 12c3-2 6 0 6 0M12 12c-3-2-6 0-6 0" /><circle cx="12" cy="20" r="2" fill="currentColor" stroke="none" />',
  // --- Thornwarden: bramble and root. ---
  'thornwarden-thorn':
    '<path d="M12 22V6" /><path d="M12 10l6-4M12 14l-6-4M12 8l-5-3M12 16l5-3" /><path d="M12 6l3-3-4 0z" fill="currentColor" stroke="none" />',
  'thornwarden-sweep':
    '<path d="M4 12a8 8 0 0 1 16 0" /><path d="M4 12l2-3M20 12l-2-3M12 4l0 3" /><path d="M8 12l-2 3M16 12l2 3M12 12l0 4" />',
  'thornwarden-vine':
    '<path d="M3 3c6 2 6 8 9 9s6 4 9 9" /><path d="M8 6l-3 1 1-3M15 15l3-1-1 3" />',
  'thornwarden-roots':
    '<path d="M12 3v7" /><path d="M12 10c-4 0-7 4-9 11M12 10c4 0 7 4 9 11M12 10v11" /><circle cx="12" cy="8" r="2.4" fill="currentColor" stroke="none" />',
  // --- Grimtrail: feral hunt. ---
  'grimtrail-claw':
    '<path d="M5 3c2 6 2 12 0 18M11 3c2 6 2 12 0 18M17 3c2 6 2 12 0 18" />',
  'grimtrail-pounce':
    '<path d="M3 18c4-10 14-10 18 0" /><path d="M6 18l-2 3M18 18l2 3M12 8l0-5" /><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />',
  'grimtrail-track':
    '<ellipse cx="9" cy="15" rx="2.4" ry="3.2" fill="currentColor" stroke="none" /><ellipse cx="16" cy="10" rx="2.4" ry="3.2" fill="currentColor" stroke="none" /><circle cx="6" cy="10" r="1.4" fill="currentColor" stroke="none" /><circle cx="19" cy="15" r="1.4" fill="currentColor" stroke="none" />',
  'grimtrail-verdict':
    '<path d="M12 2l2.5 6.5L21 11l-6.5 2.5L12 20l-2.5-6.5L3 11l6.5-2.5z" fill="currentColor" stroke="none" /><circle cx="12" cy="11" r="1.6" />',
  // --- Frostquill: rime and ice. ---
  'frostquill-shard':
    '<path d="M12 2l3 10-3 10-3-10z" fill="currentColor" stroke="none" /><path d="M6 8l6 4 6-4" />',
  'frostquill-hail':
    '<path d="M4 4l2 6M11 3l1 7M18 5l-1 6" /><path d="M5 16l1 4M12 15l0 5M19 16l-1 4" /><circle cx="7" cy="13" r="1.2" fill="currentColor" stroke="none" /><circle cx="13" cy="13" r="1.2" fill="currentColor" stroke="none" /><circle cx="18" cy="13" r="1.2" fill="currentColor" stroke="none" />',
  'frostquill-freeze':
    '<path d="M12 2v20M4 7l16 10M20 7L4 17" /><path d="M12 2l-2 3M12 2l2 3M12 22l-2-3M12 22l2-3" />',
  'frostquill-winter':
    '<path d="M3 12h18" /><path d="M3 12l3-2M3 12l3 2M21 12l-3-2M21 12l-3 2" /><path d="M9 8l0 8M15 8l0 8" />',
  // --- Duskarrow: twilight ranger. ---
  'duskarrow-dusk':
    '<path d="M3 21L21 3" /><path d="M13 3h8v8" /><circle cx="7" cy="17" r="2" fill="currentColor" stroke="none" />',
  'duskarrow-trap':
    '<path d="M12 4v6M9 7l3 3 3-3M6 10l6 6 6-6" /><path d="M4 20h16" />',
  'duskarrow-step':
    '<path d="M21 12H7" /><path d="M11 7l-4 5 4 5" fill="currentColor" stroke="none" /><path d="M4 6v12" />',
  'duskarrow-volley':
    '<path d="M2 22L22 2" /><path d="M14 2h8v8" /><path d="M2 22l5-1 1-5" fill="currentColor" stroke="none" /><path d="M6 14l4 4" />',
  // --- Wardlight: lantern keeper. ---
  'wardlight-beacon':
    '<path d="M4 12h9" /><path d="M9 8l5 4-5 4" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="3" />',
  'wardlight-glow':
    '<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />',
  'wardlight-flare':
    '<circle cx="12" cy="12" r="3.4" fill="currentColor" stroke="none" /><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><path d="M6 6l2.5 2.5M18 6l-2.5 2.5M6 18l2.5-2.5M18 18l-2.5-2.5" />',
  'wardlight-lantern':
    '<path d="M9 3h6M10 3v2M14 3v2" /><rect x="7" y="5" width="10" height="13" rx="2" /><path d="M12 7v9M9 11h6" /><path d="M10 18v2M14 18v2" />',
  // --- Behavior fallbacks. ---
  'behavior-skillshot':
    '<path d="M3 12h14" /><path d="M13 7l6 5-6 5" fill="currentColor" stroke="none" />',
  'behavior-dash':
    '<path d="M3 7l5 5-5 5M10 7l5 5-5 5M17 7l5 5-5 5" />',
  'behavior-aoe':
    '<circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />',
  'behavior-heal':
    '<path d="M12 21C5 16 3 11 3 8a4.5 4.5 0 0 1 9-1 4.5 4.5 0 0 1 9 1c0 3-2 8-9 13z" /><path d="M12 8v6M9 11h6" />',
  'behavior-stun':
    '<path d="M12 12l7-4 -3 5 4 1 -8 6 3-6-4-1z" fill="currentColor" stroke="none" /><circle cx="6" cy="6" r="1.5" fill="currentColor" stroke="none" />',
  'behavior-buff':
    '<path d="M12 4l6 7h-4v9h-4v-9H6z" fill="currentColor" stroke="none" />',
};

/**
 * Build a self-contained 24x24 inline SVG string for an icon id. Uses
 * `currentColor` so the glyph tints with the tile. Returns a small,
 * dependency-free `<svg>` fragment safe to inline.
 */
export function abilityIconSvg(id: AbilityIconId): string {
  const body = ICON_BODIES[id] ?? ICON_BODIES['behavior-skillshot'];
  return (
    '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    body +
    '</svg>'
  );
}

/** Convenience: resolve an ability's icon id then return its SVG markup. */
export function abilitySvgFor(
  championId: string,
  slot: AbilitySlot,
  behavior: AbilityBehavior,
): string {
  return abilityIconSvg(resolveAbilityIconId(championId, slot, behavior));
}

/** Every icon id the library can draw (useful for tests / previews). */
export const ALL_ABILITY_ICON_IDS = Object.keys(ICON_BODIES) as AbilityIconId[];
