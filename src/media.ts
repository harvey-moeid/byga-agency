export async function videoMetadata(
  file: File,
): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const timer = setTimeout(
      () => finish(new Error("Metadata video tidak dapat dibaca.")),
      10000,
    );
    function finish(error?: Error) {
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      if (error) reject(error);
    }
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const result = {
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      };
      if (
        !Number.isFinite(result.duration) ||
        !result.width ||
        !result.height
      ) {
        finish(new Error("Metadata video tidak valid."));
        return;
      }
      resolve(result);
      finish();
    };
    video.onerror = () =>
      finish(new Error("Video tidak dapat diputar. Pilih file yang valid."));
    video.src = url;
  });
}
