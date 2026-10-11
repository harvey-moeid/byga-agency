const database = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("byga-videos", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("videos");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("Penyimpanan video browser tidak tersedia."));
  });
export async function saveVideo(id: string, file: File) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("videos", "readwrite");
      tx.objectStore("videos").put(file, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function getVideo(id: string) {
  const db = await database();
  try {
    return await new Promise<Blob | undefined>((resolve, reject) => {
      const r = db.transaction("videos").objectStore("videos").get(id);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
export async function deleteVideo(id: string) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("videos", "readwrite");
      tx.objectStore("videos").delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
