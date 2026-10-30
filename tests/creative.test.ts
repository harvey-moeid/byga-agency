import { describe, expect, it } from "vitest";
import {
  applyCreative,
  createCreative,
  creativeDraft,
  creativeExport,
  imagePresets,
  initCreative,
  omniProfile,
  promptIsCurrent,
  promptKey,
  syncCreativeCharacter,
  creativeAssetIds,
} from "../src/creative";
import {
  createProject,
  defaultAgents,
  demoStudioTurn,
  beginTurn,
  approveProposal,
} from "../src/studio";
import { defaultUGCBrief, ugcBriefSchema } from "../src/ugc";
import { validateCreativeMedia } from "../src/creativeMedia";
function setup() {
  const p = createCreative();
  p.globals.idea = "Ritual kopi pagi yang tenang";
  return p;
}
describe("Creative native template engine and compatibility", () => {
  it("builds five 6s scenes with a capability profile independent of UGC", () => {
    const p = setup();
    expect(p.scenes).toHaveLength(5);
    expect(p.scenes.reduce((t, s) => t + s.duration, 0)).toBe(30);
    expect(new Set(p.scenes.map((s) => s.id)).size).toBe(5);
    expect(omniProfile.durations).toEqual([4, 6, 8, 10]);
    expect(
      ugcBriefSchema.parse({ ...defaultUGCBrief, idea: "Valid idea" })
        .sceneDuration,
    ).toBe(5);
    expect(
      ugcBriefSchema.safeParse({
        ...defaultUGCBrief,
        idea: "Valid idea",
        sceneDuration: 6,
      }).success,
    ).toBe(false);
  });
  it("generates nonempty descriptive prompts deterministically, without a provider", () => {
    const p = setup(),
      s = p.scenes[0];
    s.image.pose = "Hold a blue ceramic mug at chest level";
    s.video.subjectMotion = "Lift the mug slowly and smile";
    s.video.camera = "Static Shot";
    s.video.dialogue = "Selamat pagi";
    const a = applyCreative(p, { action: "generate", kind: "both" }),
      b = applyCreative(p, { action: "generate", kind: "both" });
    expect(a.scenes[0].imagePrompt?.text).toBe(b.scenes[0].imagePrompt?.text);
    expect(a.scenes[0].imagePrompt?.text).toContain(s.image.pose);
    expect(a.scenes[0].videoPrompt?.text).toContain("6 seconds, 9:16");
    expect(a.scenes[0].videoPrompt?.text).toContain(s.video.subjectMotion);
    expect(a.scenes[0].videoPrompt?.text).toContain("Keep the camera fixed");
    expect(a.scenes[0].videoPrompt?.text).toContain("Selamat pagi");
    expect(
      a.scenes.every(
        (s) => promptIsCurrent(a, s, "image") && promptIsCurrent(a, s, "video"),
      ),
    ).toBe(true);
    expect(Object.keys(imagePresets)).toHaveLength(11);
  });
  it("honors language, ratio, mode, duration, camera and negative constraints", () => {
    const p = setup();
    p.globals.language = "id";
    p.globals.ratio = "16:9";
    p.globals.negative = "Jangan tambahkan logo";
    p.scenes[0].video.mode = "firstLast";
    p.scenes[0].duration = 10;
    const a = applyCreative(p, { action: "generate", kind: "both" });
    expect(a.scenes[0].imagePrompt?.text).toContain(
      "Buat satu gambar diam 16:9",
    );
    expect(a.scenes[0].videoPrompt?.text).toContain("10 detik, 16:9");
    expect(a.scenes[0].videoPrompt?.text).toContain("last-frame");
    expect(a.scenes[0].imagePrompt?.text).toContain("Jangan tambahkan logo");
    expect(() =>
      applyCreative(p, {
        action: "scene",
        sceneId: p.scenes[0].id,
        patch: { duration: 5 as 6 },
      }),
    ).toThrow();
  });
  it("keeps locked character and environment structurally identical across scenes", () => {
    let p = setup();
    p.scenes[1].character = "ignored identity";
    p.scenes[1].environment = "ignored setting";
    p.scenes[1].image.outfit = "ignored costume";
    p.scenes[1].image.location = "ignored location";
    p = applyCreative(p, { action: "generate", kind: "both" });
    for (const s of p.scenes) {
      expect(s.imagePrompt?.text).toContain(p.globals.character);
      expect(s.videoPrompt?.text).toContain(p.globals.environment);
    }
    expect(p.scenes[1].imagePrompt?.text).not.toContain("ignored");
    const next = applyCreative(p, {
      action: "globals",
      globals: { ...p.globals, characterLock: false, environmentLock: false },
    });
    const a = applyCreative(next, { action: "generate", kind: "both" });
    expect(a.scenes[1].imagePrompt?.text).toContain("ignored identity");
  });
  it("revises one scene, keeps other scenes and snapshots unchanged, invalidates stale AI proposals", () => {
    const p = applyCreative(setup(), { action: "generate", kind: "both" });
    const a = applyCreative(p, {
      action: "scene",
      sceneId: p.scenes[0].id,
      patch: {
        narration: "Narasi baru",
        image: { ...p.scenes[0].image, pose: "New pose" },
      },
    });
    expect(a.scenes.slice(1)).toEqual(p.scenes.slice(1));
    expect(p.scenes[0].narration).toBe("");
    expect(a.scenes[0].history.at(-1)?.imagePrompt).toEqual(
      p.scenes[0].imagePrompt,
    );
    expect(promptIsCurrent(a, a.scenes[0], "image")).toBe(false);
    expect(promptIsCurrent(a, a.scenes[1], "image")).toBe(true);
    const restored = applyCreative(a, {
      action: "restore",
      sceneId: a.scenes[0].id,
      revision: 1,
    });
    expect(restored.scenes[0].revision).toBe(3);
    expect(restored.scenes[0].narration).toBe("");
  });
  it("makes video stale when a reference or image prompt changes, but preserves other scenes", () => {
    let p = applyCreative(setup(), { action: "generate", kind: "both" });
    const id = p.scenes[0].id;
    p = applyCreative(p, {
      action: "asset",
      sceneId: id,
      slot: "first",
      assetId: "image-1",
    });
    expect(promptIsCurrent(p, p.scenes[0], "image")).toBe(true);
    expect(promptIsCurrent(p, p.scenes[0], "video")).toBe(false);
    p = applyCreative(p, { action: "generate", sceneId: id, kind: "video" });
    p = applyCreative(p, {
      action: "editPrompt",
      sceneId: id,
      kind: "image",
      text: "A carefully edited image prompt.",
    });
    expect(p.scenes[0].imagePrompt?.source).toBe("manual");
    expect(promptIsCurrent(p, p.scenes[0], "video")).toBe(false);
  });
  it("refreshes saved characters and marks linked prompts stale, preserving referenced media", () => {
    let p = setup();
    p.globals.characterProfileId = "c";
    p.globals.characterRevision = 1;
    p.globals.characterReferenceId = "old-reference";
    p = applyCreative(p, { action: "generate", kind: "both" });
    const a = syncCreativeCharacter(p, {
      id: "c",
      name: "Ayu",
      appearance: "Adult creator",
      face: "Oval face",
      hair: "Black hair",
      outfit: "Blue shirt",
      revision: 2,
      referenceAssetId: "new-reference",
    });
    expect(a.globals.character).toContain("Oval face; Black hair");
    expect(promptIsCurrent(a, a.scenes[0], "image")).toBe(false);
    expect(creativeAssetIds(a)).toEqual(
      expect.arrayContaining(["old-reference", "new-reference"]),
    );
  });
  it("preserves media through replacement and restoration history", () => {
    let p = setup(),
      id = p.scenes[0].id;
    p = applyCreative(p, {
      action: "asset",
      sceneId: id,
      slot: "first",
      assetId: "old-image",
    });
    p = applyCreative(p, {
      action: "asset",
      sceneId: id,
      slot: "first",
      assetId: "new-image",
    });
    expect(creativeAssetIds(p)).toEqual(
      expect.arrayContaining(["old-image", "new-image"]),
    );
  });
  it("rejects premature approval/export and produces immutable draft snapshots after review", () => {
    let p = applyCreative(setup(), { action: "generate", kind: "both" });
    expect(() =>
      applyCreative(p, { action: "approve", sceneId: p.scenes[0].id }),
    ).toThrow("Upload");
    for (const s of p.scenes) {
      p = applyCreative(p, {
        action: "asset",
        sceneId: s.id,
        slot: "first",
        assetId: "image",
      });
      p = applyCreative(p, {
        action: "asset",
        sceneId: s.id,
        slot: "video",
        assetId: "video",
      });
    }
    p = applyCreative(p, { action: "generate", kind: "both" });
    for (const s of p.scenes)
      p = applyCreative(p, { action: "approve", sceneId: s.id });
    const project = { ...createProject("Test", "a"), creative: p };
    const draft = creativeDraft(project);
    expect(draft.status).toBe("draft");
    expect(draft.fileId).toBeUndefined();
    expect(draft.creative).toEqual(p);
    p = applyCreative(p, {
      action: "scene",
      sceneId: p.scenes[0].id,
      patch: { narration: "Edited" },
    });
    expect(draft.creative?.scenes[0].narration).toBe("");
    expect(() => creativeDraft({ ...project, creative: p })).toThrow("Review");
  });
  it("exports TXT/JSON with prompts, assets and timings, and survives JSON recovery", () => {
    const p = applyCreative(setup(), { action: "generate", kind: "both" });
    expect(creativeExport(p, "txt")).toContain("24–30s");
    expect(JSON.parse(creativeExport(p, "json"))).toEqual(p);
    expect(
      promptIsCurrent(JSON.parse(JSON.stringify(p)), p.scenes[0], "image"),
    ).toBe(true);
  });
  it("saves custom presets and duplicates scenes without duplicating approval", () => {
    let p = setup();
    p = applyCreative(p, {
      action: "savePreset",
      sceneId: p.scenes[0].id,
      name: "Warm campaign",
    });
    expect(p.presets[0].image).toEqual(p.scenes[0].image);
    const a = applyCreative(p, {
      action: "duplicate",
      sceneId: p.scenes[0].id,
    });
    expect(a.scenes).toHaveLength(6);
    expect(a.scenes[5].id).not.toBe(a.scenes[0].id);
    p = applyCreative(p, { action: "deletePreset", presetId: p.presets[0].id });
    expect(p.presets).toHaveLength(0);
  });
  it("requires explicit duration conversion for old approved UGC stories", () => {
    let project = createProject("Old", "a", {
      ...defaultUGCBrief,
      idea: "Original idea",
    });
    for (const action of ["brief", "story"] as const) {
      const id = crypto.randomUUID();
      project = beginTurn(
        project,
        { id, agentId: defaultAgents[1].id, action },
        "Generate",
      );
      project = demoStudioTurn(project, id, "Generate");
      project = approveProposal(project, project.proposals.at(-1)!.id).project;
    }
    expect(() => initCreative(project)).toThrow("konversi eksplisit");
    expect(initCreative(project, 6).scenes.every((s) => s.duration === 6)).toBe(
      true,
    );
    expect(project.brief?.data.sceneDuration).toBe(5);
  });
  it("validates MIME/signatures for demo images/videos, rejects spoofed or oversized media", async () => {
    const png = new File(
      [Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])],
      "a.png",
      { type: "image/png" },
    );
    await expect(validateCreativeMedia(png)).resolves.toBeUndefined();
    await expect(
      validateCreativeMedia(
        new File(["<script>"], "a.png", { type: "image/png" }),
      ),
    ).rejects.toThrow("signature");
    await expect(
      validateCreativeMedia(
        new File([new Uint8Array([0, 0, 0, 16, 102, 116, 121, 112])], "a.mp4", {
          type: "video/mp4",
        }),
      ),
    ).resolves.toBeUndefined();
    const oversized = new Uint8Array(5 * 1024 * 1024 + 1);
    oversized.set(new Uint8Array(await png.arrayBuffer()));
    await expect(
      validateCreativeMedia(
        new File([oversized], "large.png", { type: "image/png" }),
      ),
    ).rejects.toThrow("5 MB");
    await expect(
      validateCreativeMedia(
        new File([await png.arrayBuffer()], "a.mp4", { type: "video/mp4" }),
      ),
    ).rejects.toThrow("MIME");
  });
  it("converts draft UGC with explicit selected duration without altering its brief", () => {
    const project = createProject("Legacy draft", "a", {
      ...defaultUGCBrief,
      idea: "Legacy kopi draft",
      sceneCount: 3,
    });
    expect(() => initCreative(project)).toThrow("konversi eksplisit");
    const creative = initCreative(project, 10);
    expect(creative.origin).toBe("ugc");
    expect(creative.scenes).toHaveLength(3);
    expect(creative.scenes.every((s) => s.duration === 10)).toBe(true);
    expect(creative.globals.idea).toBe("Legacy kopi draft");
    expect(project.briefDraft.sceneDuration).toBe(5);
  });
  it("requires the optional reference mode assets before approving a scene", () => {
    let p = setup();
    const id = p.scenes[0].id;
    p = applyCreative(p, {
      action: "scene",
      sceneId: id,
      patch: { video: { ...p.scenes[0].video, mode: "firstLast" } },
    });
    p = applyCreative(p, {
      action: "asset",
      sceneId: id,
      slot: "first",
      assetId: "first",
    });
    p = applyCreative(p, {
      action: "asset",
      sceneId: id,
      slot: "video",
      assetId: "video",
    });
    p = applyCreative(p, { action: "generate", sceneId: id, kind: "both" });
    expect(() => applyCreative(p, { action: "approve", sceneId: id })).toThrow(
      "last-frame",
    );
  });
});
