import { describe, expect, it } from "vitest";
import {
  defaultUGCBrief,
  demoUGCDraft,
  ugcDraft,
  ugcExport,
  ugcImagePrompt,
  ugcVideoPrompt,
} from "../src/ugc";
import { ugcFixture } from "./fixtures/ugc";
const brief = { ...defaultUGCBrief, idea: "Cerita rutinitas kopi pagi" };

describe("UGC story continuity and production handoff", () => {
  it.each([3, 4, 5, 6])(
    "creates exactly %i demo scenes with consistent identity and timing",
    (sceneCount) => {
      const item = demoUGCDraft("a", {
        ...brief,
        sceneCount,
        sceneDuration: 8,
      });
      const story = item.ugc!;
      expect(story.scenes).toHaveLength(sceneCount);
      expect(item.status).toBe("draft");
      expect(item.prompt).toContain(`${sceneCount * 8} detik`);
      for (const scene of story.scenes) {
        const image = ugcImagePrompt(story, scene);
        expect(image).toContain(story.characterLock);
        expect(image).toContain(scene.textToImage);
        expect(image).toContain(story.negativePrompt);
        const video = ugcVideoPrompt(story, scene);
        expect(video).toContain("as the first frame");
        expect(video).toContain("8 seconds");
        expect(video).toContain(scene.imageToVideo);
      }
      const exported = ugcExport(item);
      expect(exported).toContain(
        `ADEGAN ${sceneCount} · ${(sceneCount - 1) * 8}–${sceneCount * 8} detik`,
      );
      expect(exported.match(/TEXT TO IMAGE/g)).toHaveLength(sceneCount);
      expect(exported.match(/IMAGE TO VIDEO/g)).toHaveLength(sceneCount);
      expect(exported).toContain(item.caption);
    },
  );
  it("supports maximum input lengths in demo without failing output validation", () => {
    const item = demoUGCDraft("a", {
      ...brief,
      idea: "i".repeat(2000),
      product: "p".repeat(500),
      character: "c".repeat(800),
      audience: "a".repeat(300),
      sceneCount: 6,
    });
    expect(item.ugc?.scenes).toHaveLength(6);
    expect(item.title.length).toBeLessThanOrEqual(200);
    expect(item.prompt.length).toBeLessThanOrEqual(8000);
  });
  it("rejects incomplete output and scene counts that disagree with the brief", () => {
    expect(() =>
      ugcDraft("a", brief, {
        ...ugcFixture,
        scenes: ugcFixture.scenes.slice(0, 3),
      }),
    ).toThrow("Jumlah adegan");
    expect(() =>
      ugcDraft("a", brief, {
        ...ugcFixture,
        scenes: [
          { ...ugcFixture.scenes[0], textToImage: "" },
          ...ugcFixture.scenes.slice(1),
        ],
      }),
    ).toThrow();
  });
});
