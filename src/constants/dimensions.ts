/**
 * Single source of truth for room / wall dimensions.
 *
 * Every 3D wall is extruded from Y = 0 (floor) to Y = ROOM_HEIGHT (ceiling),
 * and the ceiling cap is locked at exactly ROOM_HEIGHT so the two meet
 * seamlessly with no gaps.
 */
export const ROOM_HEIGHT = 2.8; // 2.8 meters (9 feet)
export const WALL_THICKNESS = 0.15; // 0.15 meters (6 inches)
