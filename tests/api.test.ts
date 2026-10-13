import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../src/api";

afterEach(() => vi.unstubAllGlobals());
describe("dashboard API responses", () => {
  it("preserves the status needed to handle an expired session", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: "Sesi kedaluwarsa." }, { status: 401 }),
        ),
    );
    await expect(api("/workspace")).rejects.toMatchObject({
      status: 401,
      message: "Sesi kedaluwarsa.",
    });
  });
  it("rejects an HTML response even when the server returns HTTP 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<!doctype html>")),
    );
    await expect(api("/workspace")).rejects.toBeInstanceOf(ApiError);
  });
  it("lets the browser set the multipart boundary for video uploads", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: "video" }));
    vi.stubGlobal("fetch", fetchMock);
    const data = new FormData();
    data.append(
      "file",
      new Blob(["video"], { type: "video/mp4" }),
      "video.mp4",
    );
    expect(await api("/files", data)).toEqual({ id: "video" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/files",
      expect.objectContaining({ method: "POST", headers: {}, body: data }),
    );
  });
});
