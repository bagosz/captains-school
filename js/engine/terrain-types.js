// The terrain library (2024 Rules Manual with the FAQ): every kind of terrain piece the engine knows, what it is in
// the rulebook, how it acts on moving and on Line of Sight, where its rules are (`ref`: an anchor of the fan copy and
// of `docs/rules/`; `keys`: the entries in rules-text.js) and which code carries them out (`code`).
// Code that asks about sight goes through this file (sightShapes, isCover) instead of testing T.k itself; the move
// rules still test T.k where `code` points.
// A piece is { k, x, y, w, h } in inches (a rectangle) plus the flags of its kind; `ht` overrides the kind's height.
// `a` turns it by that many degrees (clockwise) about its centre; { x, y, w, h } is the rectangle before it turns, and
// every geometry test works in the piece's own frame (geometry.js). Not yet for fortress walls, ladders and the
// deployment or exit zones, which still assume square pieces. No imports: the engine and the UI may both read it.
//
// sight:  'block'  hides everything behind it up to its top; a target it hides only in part is In The Way (rock, building).
//         'cover'  never hides a target whole, but is In The Way when it hides part of one (woods, walls, hedges).
//         'ground' raised ground: a sight line that dips below its top inside it is hidden (hills, cliffs, a fortress
//                  wall); hiding part of a target it is In The Way (a fortress wall: as its battlements).
//         'none'   no effect on sight (water, ladders, doorways).
// ht: the height of the top above the ground it stands on (for 'ground' the piece's own z is used instead).
export const TERRAIN = {
  brush: {
    name: 'woods', rule: 'Difficult Terrain', sight: 'cover', ht: 3,
    move: 'Difficult Terrain: every 1″ moved in it costs 2″ (Cavalry 3″ here). Woodland Creature ignores it.',
    see: 'Cover: In The Way when it hides any part of the target; a shooter touching it or inside it ignores it.',
    ref: ['move_phase/#difficult-terrain-10', 'shoot_phase/#in-the-way-22', 'shoot_phase/#shooting-from-behind-cover-24'],
    keys: ['terrain', 'itw', 'cover'], code: 'rules.js: moveCost, slowedAt, freeIn, inTheWay',
  },
  scree: {   // brush with rocky: true
    name: 'scree', rule: 'Difficult Terrain', sight: 'cover', ht: 0.3,
    move: 'Difficult Terrain (loose rocks): every 1″ costs 2″. Mountain Dweller ignores it. Counts as rock for Collapse Rocks.',
    see: 'Low cover: In The Way only for sight lines that skim the ground in it (a model standing in it).',
    ref: ['move_phase/#difficult-terrain-10', 'shoot_phase/#in-the-way-22'],
    keys: ['terrain', 'itw'], code: 'rules.js: freeIn; magic.js: rockyAt',
  },
  rock: {
    name: 'rocks', rule: 'Impassable', sight: 'block', ht: 3,
    move: 'Cannot be entered.',
    see: 'Hides what is behind it up to its top; hiding part of the target it is In The Way. A shooter touching it shoots around it (ignored while it can still see the target).',
    ref: ['the_rules/#line-of-sight', 'shoot_phase/#in-the-way-22', 'shoot_phase/#shooting-from-behind-cover-24'],
    keys: ['itw', 'cover'], code: 'rules.js: blocksMove, hiddenBy, inTheWay',
  },
  building: {
    name: 'building', rule: 'Impassable (but for its doorways)', sight: 'block', ht: 4,
    move: 'Cannot be entered except through a door piece.',
    see: 'Hides what is behind it up to its top; a shooter cannot shoot over a whole building by touching it.',
    ref: ['the_rules/#line-of-sight', 'shoot_phase/#shooting-from-behind-cover-24', 'sieges/#doors-gates-and-hatches'],
    keys: ['itw'], code: 'rules.js: blocksMove, doorOf',
  },
  door: {
    name: 'doorway', rule: 'Doorway', sight: 'none',
    move: 'The opening in a building: a model in a doorway too narrow for two defends it like a Barrier.',
    ref: ['fight_phase/#doorways-41', 'sieges/#doors-gates-and-hatches'],
    keys: ['barriers'], code: 'rules.js: doorOf',
  },
  wall: {
    name: 'wall', rule: 'Obstacle (Barrier)', sight: 'cover', ht: 0.5,
    move: 'Obstacle: crossed freely by a model at least twice its height, otherwise a Jump Test; a model touching it defends it as a Barrier.',
    see: 'Low cover: In The Way when it hides part of the target; a shooter touching it (or shooting over the shoulder of a friend touching it) ignores it.',
    ref: ['move_phase/#obstacles-11', 'fight_phase/#barriers-38', 'shoot_phase/#shooting-from-behind-cover-24'],
    keys: ['obstacles', 'jump', 'barriers', 'cover'], code: 'terrain.js: obstacleHt, barrierOn, planCross; rules.js: canDefend',
  },
  hedge: {
    name: 'hedge', rule: 'Obstacle (Barrier)', sight: 'cover', ht: 1,
    move: 'Obstacle 1″ high: a man crosses with a Jump Test, a troll strides over it.',
    see: 'Cover: In The Way when it hides part of the target; a shooter touching it ignores it.',
    ref: ['move_phase/#obstacles-11', 'fight_phase/#barriers-38', 'shoot_phase/#shooting-from-behind-cover-24'],
    keys: ['obstacles', 'jump', 'barriers', 'cover'], code: 'terrain.js: obstacleHt, barrierOn, planCross',
  },
  plateau: {
    name: 'hill', rule: 'Raised ground (z: its height)', sight: 'ground',
    move: 'A step up to half the model\'s height is walked; higher takes a Climb Test (sheer: no Climb); a drop is Descended, deeper falls. stairs: walked; bridge: a span over a gap.',
    see: 'Hides whatever is below the sight line from the viewer\'s head over its edge. A model on raised ground sees over models and low cover below it.',
    ref: ['move_phase/#climbing-14-15', 'move_phase/#descending', 'move_phase/#unscalable-terrain', 'shoot_phase/#shooting-from-or-at-elevated-positions', 'the_rules/#line-of-sight'],
    keys: ['obstacles', 'climb', 'falling'], code: 'terrain.js: levelAt, zOf, planCross; rules.js: elevatedFor',
  },
  fortress: {   // plateau with fort: true
    name: 'battlements', rule: 'Fortress wall (Sieges)', sight: 'ground', battlements: 0.7,
    move: 'Too tall and sheer to Climb: up by the stairs or a Siege Ladder; the gate is a model of its own.',
    see: 'Hides everything behind it from the ground. Battlements 0.7″ high line its outer face: a model on the wall is partly hidden by them (In The Way), and a defender on the wall ignores them as it shoots out.',
    ref: ['sieges/#castles-and-fortresses', 'sieges/#stairs', 'sieges/#siege-ladders', 'shoot_phase/#shooting-from-behind-cover-24'],
    keys: ['siegeWalls', 'cover'], code: 'fortress.js; terrain.js: planCross',
  },
  ladder: {
    name: 'ladder', rule: 'Ladder', sight: 'none',
    move: 'Walked up or down paying its height in inches, no Climb Test, no Difficult Terrain; a Siege Ladder is carried and raised (fortress.js).',
    ref: ['move_phase/#ladders-ropes-and-similar-16', 'sieges/#siege-ladders'],
    keys: ['climb', 'siegeWalls'], code: 'terrain.js: ladderRise',
  },
  water: {
    name: 'water', rule: 'Water feature', sight: 'none',
    move: 'shallow: Difficult Terrain (not for Cavalry, Monsters, War Beasts), Swim Test when Prone in it; deep: Swim Test to move; neither: cannot be entered.',
    ref: ['advanced_rules/#water-features', 'advanced_rules/#shallow-water', 'advanced_rules/#deep-water'],
    keys: ['water'], code: 'terrain.js: swimSeq, inDeep; rules.js: blocksMove, slowedAt; a curving river: geometry.js riverPieces (turned pieces along a centreline, drawn as one strip by board.js drawBand)',
  },
  house: {   // building with house: true (a Rohan House of the Battle of Edoras box); store: true makes it a Storehouse
    name: 'Rohan House', rule: 'Impassable (a building)', sight: 'block', ht: 4,
    move: 'A building: cannot be entered. In a scenario with burning buildings (fire) a Storehouse can be set alight by a model in base contact and put out again.',
    see: 'Hides what is behind it up to its thatched roof; a burning one hides just the same.',
    fire: 'Set Alight the City (Torch the City, Battle of Edoras p. 11): an Evil model touching it at the end of the Move Phase, not Engaged, rolls a D6: 6+ (+1 with a flaming brand) sets it on fire. Put the Fires Out: a Good model ending its Activation touching it, not Engaged, puts it out on 5+. Either model may not shoot or Support a Combat that turn.',
    ref: ['the_rules/#line-of-sight', 'shoot_phase/#shooting-from-behind-cover-24'],
    keys: ['itw', 'storehouses'], code: 'rules.js: blocksMove (as building); narrative.js: lightSeq, quenchSeq; board.js: drawHouse, drawFires',
  },
};

// The library entry of piece T (brush with rocky is scree, a building with house is a Rohan House, a fortress plateau is
// the fortress).
export const kindOf = T => (T.k === 'brush' && T.rocky ? TERRAIN.scree : T.k === 'building' && T.house ? TERRAIN.house : T.k === 'plateau' && T.fort ? TERRAIN.fortress : TERRAIN[T.k]) || { name: T.k, sight: 'none' };
// Cover a shooter can see over: In The Way when it hides part of the target, never hiding it whole.
export const isCover = T => kindOf(T).sight === 'cover';
// Terrain that can stand In The Way of a shot.
export const obstructs = T => kindOf(T).sight !== 'none';

// The boxes piece T puts in the way of sight lines: [{ x, y, w, h, top, role }], top in inches above the table
// (ground: the ground under the piece, for a rock or wall that stands on raised ground). role: 'block', 'cover' or
// 'ground' as above.
// A turned piece's boxes turn with it, about the piece's centre.
export function sightShapes(T, ground = 0) {
  const K = kindOf(T);
  if (K.sight === 'none') return [];
  const turn = T.a ? { a: T.a, ox: T.x + T.w / 2, oy: T.y + T.h / 2 } : {};
  if (K.sight === 'ground') {
    const S = [{ x: T.x, y: T.y, w: T.w, h: T.h, top: T.z || 0, role: 'ground', ...turn }];
    if (K.battlements && T.face) {   // a thin parapet along the outer face, standing on the wall
      const d = 0.12, y = T.face === 'n' ? T.y : T.y + T.h - d;
      S.push({ x: T.x, y, w: T.w, h: d, top: (T.z || 0) + K.battlements, role: 'cover', ...turn });
    }
    return S;
  }
  return [{ x: T.x, y: T.y, w: T.w, h: T.h, top: ground + (T.ht ?? K.ht ?? 1), role: K.sight, ...turn }];
}
