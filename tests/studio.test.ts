import { describe, expect, it } from "vitest";
import {
  approveProposal,
  approvedContext,
  beginTurn,
  changed,
  createProject,
  demoStudioTurn,
  finishTurn,
  inputKey,
  nextStage,
  promptCurrent,
  proposalCurrent,
  rejectProposal,
  stopTurn,
  type StudioProject,
  type StudioStage,
} from "../src/studio";
import { defaultUGCBrief } from "../src/ugc";
function project() {
  return createProject("Kopi pagi", "a", {
    ...defaultUGCBrief,
    idea: "Cerita ritual kopi pagi",
    sceneCount: 3,
  });
}
function generate(
  p: StudioProject,
  stage: StudioStage,
  sceneId?: string,
  text = "Siapkan hasil",
) {
  const runId = crypto.randomUUID();
  p = beginTurn(
    p,
    { id: runId, agentId: "content", action: stage, sceneId },
    text,
  );
  return demoStudioTurn(p, runId, text);
}
function approve(p: StudioProject) {
  return approveProposal(p, p.proposals.at(-1)!.id).project;
}
function through(stage: StudioStage) {
  let p = project();
  for (const s of ["brief", "story", "images", "videos", "review"] as const) {
    p = approve(generate(p, s));
    if (s === stage) break;
  }
  return p;
}
describe("creative studio approvals and shared context", () => {
  it("never exposes unapproved brief, proposals or other-agent conversations to shared context", () => {
    let p = project();
    expect(approvedContext(p).brief).toBeUndefined();
    p = generate(p, "brief");
    expect(approvedContext(p).brief).toBeUndefined();
    p = approve(p);
    expect(approvedContext(p).brief?.idea).toBe("Cerita ritual kopi pagi");
    p = changed({
      ...p,
      briefDraft: {
        ...p.briefDraft,
        idea: "Unsaved context must stay private",
      },
    });
    expect(JSON.stringify(approvedContext(p))).not.toContain("Unsaved context");
    expect(approvedContext(p)).not.toHaveProperty("messages");
  });
  it("requires each approved stage and only creates content after final approval", () => {
    let p = project();
    expect(() => generate(p, "story")).toThrow("brief");
    p = approve(generate(p, "brief"));
    expect(() => generate(p, "images")).toThrow("cerita");
    p = approve(generate(p, "story"));
    expect(() => generate(p, "videos")).toThrow("gambar");
    p = approve(generate(p, "images"));
    p = approve(generate(p, "videos"));
    expect(() => generate(p, "final")).toThrow("review");
    p = approve(generate(p, "review"));
    p = generate(p, "final");
    expect(p.final).toBeUndefined();
    const result = approveProposal(p, p.proposals.at(-1)!.id);
    expect(result.content).toMatchObject({
      studioProjectId: p.id,
      status: "draft",
      ugc: { scenes: expect.any(Array) },
    });
    expect(result.project.final?.contentId).toBe(result.content!.id);
    expect(result.project.history).toHaveLength(6);
    expect(() =>
      approveProposal(result.project, p.proposals.at(-1)!.id),
    ).toThrow("sudah diproses");
  });
  it("invalidates only prompts belonging to a revised scene and preserves previous versions", () => {
    let p = through("review");
    const images = structuredClone(p.images),
      videos = structuredClone(p.videos);
    p = generate(p, "story", "s2", "Revisi adegan kedua jadi lebih hangat");
    expect(promptCurrent(p, "videos", "s2")).toBe(true);
    p = approve(p);
    expect(promptCurrent(p, "images", "s1")).toBe(true);
    expect(promptCurrent(p, "videos", "s3")).toBe(true);
    expect(promptCurrent(p, "images", "s2")).toBe(false);
    expect(promptCurrent(p, "videos", "s2")).toBe(false);
    expect(p.images).toEqual(images);
    expect(p.videos).toEqual(videos);
    expect(p.history.filter((h) => h.payload.stage === "story")).toHaveLength(
      2,
    );
    expect(nextStage(p)).toBe("images");
    p = approve(generate(p, "images", "s2", "Buat prompt baru"));
    expect(promptCurrent(p, "images", "s2")).toBe(true);
    expect(promptCurrent(p, "videos", "s2")).toBe(false);
    expect(nextStage(p)).toBe("videos");
  });
  it("marks downstream context stale after approving a different brief", () => {
    let p = through("videos");
    p = changed({
      ...p,
      briefDraft: {
        ...p.briefDraft,
        character: "Different creator with a navy shirt",
      },
    });
    expect(promptCurrent(p, "images", "s1")).toBe(true);
    p = approve(generate(p, "brief"));
    expect(promptCurrent(p, "images", "s1")).toBe(false);
    expect(approvedContext(p).story).toBeUndefined();
    expect(approvedContext(p).images).toEqual({});
  });
  it("refuses stale competing story proposals and cancelled results", () => {
    let p = through("brief");
    p = generate(p, "story");
    const first = p.proposals.at(-1)!;
    p = generate(p, "story");
    const second = p.proposals.at(-1)!;
    p = approveProposal(p, second.id).project;
    expect(proposalCurrent(p, first)).toBe(false);
    expect(() => approveProposal(p, first.id)).toThrow();
    const id = crypto.randomUUID();
    p = beginTurn(p, { id, agentId: "content", action: "chat" }, "Pertanyaan");
    p = stopTurn(p, id);
    expect(() => finishTurn(p, id, "Late result")).toThrow("dihentikan");
    expect(() =>
      beginTurn(p, { id, agentId: "content", action: "chat" }, "Replay"),
    ).toThrow("dihentikan");
  });
  it("rejects malformed prompt batches, duplicate scenes and rejected previews", () => {
    let p = through("story");
    const id = crypto.randomUUID();
    p = beginTurn(
      p,
      { id, agentId: "schedule", action: "images" },
      "Buat prompt",
    );
    expect(() =>
      finishTurn(p, id, "Ready", {
        stage: "images",
        data: {
          prompts: [
            { sceneId: "s1", prompt: "A sufficiently detailed still frame" },
          ],
        },
      }),
    ).toThrow("tepat adegan");
    expect(() =>
      finishTurn(p, id, "Ready", {
        stage: "images",
        data: {
          prompts: [1, 2, 3].map(() => ({
            sceneId: "s1",
            prompt: "A sufficiently detailed still frame",
          })),
        },
      }),
    ).toThrow("tepat adegan");
    p = stopTurn(p, id);
    p = generate(p, "images");
    const proposal = p.proposals.at(-1)!;
    p = rejectProposal(p, proposal.id);
    expect(() => approveProposal(p, proposal.id)).toThrow();
    expect(p.images).toEqual({});
  });
});
