import type { Room } from "./domain";
export type Point = [number, number]; // floor x,z
export type WorkAnimation = "Idle" | "Walk" | "Type" | "Read" | "Present";
export const roomPositions: Record<Room, Point> = {
  research: [-4.2, -2.6],
  content: [0, -2.6],
  schedule: [4.2, -2.6],
  publish: [-3, 2.6],
  analytics: [2.3, 2.6],
};
export const stations: Record<Room, Point> = {
  research: [-4.55, -2.25],
  content: [0, -2.42],
  schedule: [4.2, -1.6],
  publish: [-3.6, 3.03],
  analytics: [1.4, 2.95],
};
export const visitingStations: Record<Room, Point> = {
  research: [-3.35, -1.25],
  content: stations.content,
  schedule: [5, -1.25],
  publish: [-2.2, 1.55],
  analytics: [3.1, 1.55],
};
export const jobAnimations: Record<Room, WorkAnimation> = {
  research: "Read",
  content: "Type",
  schedule: "Read",
  publish: "Type",
  analytics: "Present",
};
export const workLabels: Record<WorkAnimation, string> = {
  Idle: "Beristirahat",
  Walk: "Berpindah ruangan",
  Type: "Mengetik",
  Read: "Meninjau referensi",
  Present: "Menganalisis",
};
export const tourRooms: Room[] = [
  "content",
  "research",
  "schedule",
  "publish",
  "analytics",
];
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** Route via the door of the current room, then the central corridor, then the destination door.
 * Works when a new destination interrupts an existing walk, including while inside the corridor. */
export function planRoute(from: Point, destination: Room): Point[] {
  const target = visitingStations[destination];
  if (distance(from, target) < 0.06) return [];
  const candidates: Point[] = [];
  if (Math.abs(from[1]) > 0.4) {
    const row =
      from[1] < 0
        ? (["research", "content", "schedule"] as const)
        : (["publish", "analytics"] as const);
    const current = row.reduce(
      (best, r) =>
        Math.abs(roomPositions[r][0] - from[0]) <
        Math.abs(roomPositions[best][0] - from[0])
          ? r
          : best,
      row[0] as Room,
    );
    const doorX = roomPositions[current][0];
    const landing = from[1] < 0 ? -0.8 : 0.8;
    candidates.push([from[0], landing], [doorX, landing], [doorX, 0]);
  } else candidates.push([from[0], 0]);
  const doorX = roomPositions[destination][0];
  candidates.push(
    [doorX, 0],
    [doorX, target[1] < 0 ? -0.8 : 0.8],
    [target[0], target[1] < 0 ? -0.8 : 0.8],
    target,
  );
  let previous = from;
  return candidates.filter((p) => {
    if (distance(p, previous) < 0.03) return false;
    previous = p;
    return true;
  });
}
export function approachAngle(current: number, target: number, dt: number) {
  const delta = Math.atan2(
    Math.sin(target - current),
    Math.cos(target - current),
  );
  return current + delta * (1 - Math.exp(-Math.min(dt, 0.05) * 9));
}
export function avatarClip(names: string[], state: WorkAnimation) {
  const rules: Record<WorkAnimation, RegExp[]> = {
    Idle: [/^idle$/i, /idle|breath/i],
    Walk: [/^walk$/i, /walk|run/i],
    Type: [/^type$/i, /typ|keyboard|work/i, /seated|sit/i],
    Read: [/^read$/i, /read|document|tablet/i],
    Present: [/^present$/i, /present|gestic|talk/i],
  };
  for (const rule of rules[state]) {
    const name = names.find((n) => rule.test(n));
    if (name) return name;
  }
  // Never play a walk clip as the resting fallback for a custom model.
  return names.find((n) => /idle|breath/i.test(n));
}
