// Shared validation for Creative Studio, including demo uploads (no API required).
export async function validateCreativeMedia(file: File): Promise<void> {
  const b = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const tag = (start: number, end: number) =>
    new TextDecoder().decode(b.slice(start, end));
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v);
  const jpeg = b[0] === 255 && b[1] === 216 && b[2] === 255;
  const webp = tag(0, 4) === "RIFF" && tag(8, 12) === "WEBP";
  const mp4 = tag(4, 8) === "ftyp";
  const webm = [26, 69, 223, 163].every((v, i) => b[i] === v);
  const mime = png
    ? "image/png"
    : jpeg
      ? "image/jpeg"
      : webp
        ? "image/webp"
        : mp4
          ? "video/mp4"
          : webm
            ? "video/webm"
            : undefined;
  if (!mime || file.type !== mime || !file.size)
    throw new Error(
      "Pilih PNG/JPG/WebP atau MP4/WebM dengan MIME dan signature yang sesuai.",
    );
  if (file.size > (mime.startsWith("image/") ? 5 : 50) * 1024 * 1024)
    throw new Error("Maksimal gambar 5 MB, video 50 MB.");
}
