import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  approachAngle,
  avatarClip,
  planRoute,
  roomPositions,
  tourRooms,
  visitingStations,
  type Point,
} from "../src/officeMotion";
describe("office navigation", () => {
  it("routes every room pair through the matching open doors", () => {
    for (const origin of tourRooms)
      for (const destination of tourRooms) {
        const from = visitingStations[origin],
          route = planRoute(from, destination);
        if (origin === destination) {
          expect(route).toEqual([]);
          continue;
        }
        expect(route.at(-1)).toEqual(visitingStations[destination]);
        let previous: Point = from;
        for (const point of route) {
          for (const wall of [-0.45, 0.45]) {
            if ((previous[1] - wall) * (point[1] - wall) < 0) {
              const x =
                previous[0] +
                ((point[0] - previous[0]) * (wall - previous[1])) /
                  (point[1] - previous[1]);
              const row =
                wall < 0
                  ? (["research", "content", "schedule"] as const)
                  : (["publish", "analytics"] as const);
              expect(
                row.some((r) => Math.abs(roomPositions[r][0] - x) < 0.55),
              ).toBe(true);
            }
          }
          expect(Math.abs(point[0])).toBeLessThan(6.9);
          previous = point;
        }
      }
  });
  it("can reroute from inside the corridor without teleporting", () => {
    const route = planRoute([1.2, 0.08], "research");
    expect(route[0]).toEqual([1.2, 0]);
    expect(route.at(-1)).toEqual(visitingStations.research);
    expect(
      approachAngle(Math.PI - 0.01, -Math.PI + 0.01, 0.016),
    ).toBeGreaterThan(Math.PI - 0.01);
  });
  it("chooses the requested motion and never uses walking as a resting fallback", () => {
    expect(avatarClip(["Walk", "Idle", "Type"], "Type")).toBe("Type");
    expect(avatarClip(["walking"], "Read")).toBeUndefined();
    expect(avatarClip(["Idle", "Walking"], "Read")).toBe("Idle");
  });
});
describe("bundled human avatars", () => {
  const manifest = JSON.parse(
    readFileSync("public/avatars/manifest.json", "utf8"),
  );
  it("includes five licensed self-contained skinned models with working clips", () => {
    expect(manifest.license).toBe("MIT");
    expect(manifest.avatars).toHaveLength(5);
    let bytes = 0;
    for (const asset of manifest.avatars) {
      const file = readFileSync(`public/avatars/${asset.name}.glb`);
      bytes += file.length;
      expect(file.readUInt32LE(0)).toBe(0x46546c67);
      expect(file.readUInt32LE(8)).toBe(file.length);
      expect(createHash("sha256").update(file).digest("hex")).toBe(
        asset.sha256,
      );
      const gltf = JSON.parse(
        file.subarray(20, 20 + file.readUInt32LE(12)).toString(),
      );
      expect(gltf.skins.length).toBeGreaterThan(0);
      expect(gltf.skins[0].joints.length).toBeGreaterThan(30);
      expect(gltf.buffers.every((b: { uri?: string }) => !b.uri)).toBe(true);
      expect(
        gltf.images.every(
          (i: { uri?: string; bufferView?: number }) =>
            !i.uri && i.bufferView !== undefined,
        ),
      ).toBe(true);
      expect(
        gltf.animations.map((a: { name: string }) => a.name).sort(),
      ).toEqual(["Idle", "Present", "Read", "Type", "Walk"]);
      for (const animation of gltf.animations)
        expect(
          animation.channels.some(
            (c: { target: { path: string } }) => c.target.path === "rotation",
          ),
        ).toBe(true);
    }
    expect(bytes).toBeLessThan(12 * 1024 * 1024);
  });
});
