import { describe, it, expect } from "vitest";
import { approve, schedule, demoDraft, makeDemo, revise } from "../src/domain";
import { encrypt, decrypt, constantEqual } from "../worker/security";
describe("approval & scheduling invariants", () => {
  it("requires a video before approval", () => {
    const c = demoDraft("Creative habits", "a1");
    expect(() => approve({ ...c, status: "review" })).toThrow("Upload video");
  });
  it("rejects approving a draft even if a video exists", () => {
    expect(() =>
      approve({ ...demoDraft("Creative habits", "a1"), fileId: "video" }),
    ).toThrow("menunggu review");
  });
  it("requires explicit approval for scheduling", () => {
    expect(() =>
      schedule(
        { ...demoDraft("Creative habits", "a1"), fileId: "video" },
        "2030-01-01T00:00:00Z",
      ),
    ).toThrow("disetujui");
  });
  it("approves then schedules a real video for a future timestamp", () => {
    const c = approve({
      ...demoDraft("Creative habits", "a1"),
      status: "review",
      fileId: "video",
    });
    const result = schedule(c, "2030-01-01T09:00:00+07:00", 0);
    expect(result.status).toBe("scheduled");
    expect(result.scheduledAt).toBe("2030-01-01T02:00:00.000Z");
  });
  it("rejects past and invalid dates", () => {
    const c = {
      ...demoDraft("Creative habits", "a1"),
      status: "approved" as const,
      fileId: "video",
    };
    expect(() => schedule(c, "not-a-date")).toThrow("masa depan");
    expect(() => schedule(c, "2020-01-01T00:00:00Z")).toThrow("masa depan");
  });
  it("rejects repeated approvals", () => {
    const c = approve({
      ...demoDraft("Creative habits", "a1"),
      status: "review",
      fileId: "video",
    });
    expect(() => approve(c)).toThrow("menunggu review");
  });
  it("revokes approval and schedule when editing resumes", () => {
    const c = schedule(
      approve({
        ...demoDraft("Creative habits", "a1"),
        status: "review",
        fileId: "video",
      }),
      "2030-01-01T00:00:00Z",
      0,
    );
    const draft = revise(c);
    expect(draft.status).toBe("draft");
    expect(draft.scheduledAt).toBeUndefined();
    expect(() => schedule(draft, "2030-01-01T00:00:00Z", 0)).toThrow(
      "disetujui",
    );
  });
  it("keeps all demo accounts visibly disconnected", () => {
    expect(makeDemo().accounts.every((a) => !a.connected)).toBe(true);
  });
});
describe("credential protection", () => {
  it("round-trips AES-GCM without storing plaintext", async () => {
    const encrypted = await encrypt("private-token", "test-key");
    expect(encrypted).not.toContain("private-token");
    expect(await decrypt(encrypted, "test-key")).toBe("private-token");
  });
  it("randomizes ciphertext and rejects the wrong key", async () => {
    const a = await encrypt("token", "key-1"),
      b = await encrypt("token", "key-1");
    expect(a).not.toBe(b);
    await expect(decrypt(a, "key-2")).rejects.toThrow();
  });
  it("checks passwords without plain equality", async () => {
    expect(await constantEqual("secret", "secret")).toBe(true);
    expect(await constantEqual("secret", "wrong")).toBe(false);
  });
});
