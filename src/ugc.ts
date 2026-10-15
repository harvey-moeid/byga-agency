import { z } from "zod";
import type { Content } from "./domain";

export const ugcTones = {
  relatable: "Relatable & natural",
  emotional: "Hangat & emosional",
  humor: "Ringan & lucu",
  educational: "Informatif & praktis",
} as const;
export const ugcBriefSchema = z.object({
  idea: z.string().trim().min(5).max(2000),
  product: z.string().trim().max(500).default(""),
  character: z.string().trim().min(5).max(800),
  audience: z.string().trim().min(2).max(300),
  tone: z.enum(["relatable", "emotional", "humor", "educational"]),
  sceneCount: z.number().int().min(3).max(6),
  sceneDuration: z.union([z.literal(5), z.literal(8), z.literal(10)]),
});
export type UGCBrief = z.infer<typeof ugcBriefSchema>;
export const ugcOutputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  caption: z.string().trim().min(1).max(2200),
  hook: z.string().trim().min(1).max(400),
  synopsis: z.string().trim().min(1).max(1000),
  characterLock: z.string().trim().min(1).max(1200),
  negativePrompt: z.string().trim().min(1).max(800),
  scenes: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(120),
        narration: z.string().trim().min(1).max(400),
        textToImage: z.string().trim().min(1).max(1800),
        imageToVideo: z.string().trim().min(1).max(1800),
      }),
    )
    .min(3)
    .max(6),
});
export type UGCOutput = z.infer<typeof ugcOutputSchema>;
export type UGCScene = UGCOutput["scenes"][number];
export type UGCStory = Omit<UGCOutput, "title" | "caption"> & {
  brief: UGCBrief;
};

export const defaultUGCBrief: UGCBrief = {
  idea: "",
  product: "",
  character:
    "Kreator dewasa Indonesia, rambut hitam sebahu, kaus krem polos, gaya kasual natural.",
  audience: "Dewasa muda Indonesia",
  tone: "relatable",
  sceneCount: 4,
  sceneDuration: 5,
};
export function ugcImagePrompt(story: UGCStory, scene: UGCScene) {
  return `Vertical 9:16, photorealistic UGC smartphone still.\nCharacter continuity: ${story.characterLock}\n${scene.textToImage}\nNegative prompt: ${story.negativePrompt}`;
}
export function ugcVideoPrompt(story: UGCStory, scene: UGCScene) {
  return `Animate the generated image for this scene as the first frame. ${story.brief.sceneDuration} seconds, vertical 9:16. Preserve the reference face, outfit, product shape and setting.\n${scene.imageToVideo}\nNegative prompt: ${story.negativePrompt}`;
}
export function ugcProductionNotes(story: UGCStory) {
  return `UGC cerita · 9:16 · ${story.scenes.length * story.brief.sceneDuration} detik\nHook: ${story.hook}\nAlur: ${story.synopsis}\nKonsistensi karakter: ${story.characterLock}\nHindari: ${story.negativePrompt}`;
}
export function ugcDraft(
  accountId: string,
  rawBrief: UGCBrief,
  rawOutput: unknown,
): Content {
  const brief = ugcBriefSchema.parse(rawBrief);
  const { title, caption, ...output } = ugcOutputSchema.parse(rawOutput);
  if (output.scenes.length !== brief.sceneCount)
    throw new Error(
      "Jumlah adegan AI tidak sesuai brief. Coba generate ulang.",
    );
  const ugc: UGCStory = { ...output, brief };
  return {
    id: crypto.randomUUID(),
    accountId,
    title,
    caption,
    prompt: ugcProductionNotes(ugc),
    ugc,
    status: "draft",
    createdAt: new Date().toISOString(),
    views: 0,
    likes: 0,
  };
}
export function ugcExport(item: Content) {
  if (!item.ugc) return item.prompt;
  const story = item.ugc;
  return [
    item.title,
    `Caption: ${item.caption}`,
    item.prompt,
    ...story.scenes.map((scene, i) =>
      [
        `ADEGAN ${i + 1} · ${i * story.brief.sceneDuration}–${(i + 1) * story.brief.sceneDuration} detik · ${scene.title}`,
        `Narasi: ${scene.narration}`,
        `TEXT TO IMAGE\n${ugcImagePrompt(story, scene)}`,
        `IMAGE TO VIDEO\n${ugcVideoPrompt(story, scene)}`,
      ].join("\n\n"),
    ),
  ].join("\n\n---\n\n");
}
export function demoUGCDraft(accountId: string, brief: UGCBrief): Content {
  const subject = brief.product.slice(0, 150) || "rutinitas sederhana";
  const middle = [
    {
      title: "Masalah sehari-hari",
      narration:
        "Aku sering merasa rutinitasku terlalu ribet. Mungkin kamu juga?",
      action:
        "Medium shot at a cluttered desk, a thoughtful expression, hands resting naturally on the table.",
      motion:
        "Slow handheld push-in, a small sigh, glance from the desk toward the camera.",
    },
    {
      title: "Mencoba cara baru",
      narration: `Di cerita ini, aku mulai mencoba ${subject} dengan langkah kecil.`,
      action:
        "Close-up of the creator examining the relevant everyday object on the desk, window light, candid moment.",
      motion:
        "Gentle tilt from the object to the creator's face, curious expression, no jump cuts.",
    },
    {
      title: "Tunjukkan prosesnya",
      narration:
        "Aku coba pelan-pelan, satu langkah dulu. Nggak harus langsung sempurna.",
      action:
        "Over-the-shoulder view of one simple everyday action, same room and outfit, believable hands.",
      motion:
        "One deliberate hand action, subtle shoulder movement, steady handheld camera.",
    },
    {
      title: "Momen refleksi",
      narration:
        "Bagian yang paling aku suka justru momen kecil saat belajar kebiasaan baru.",
      action:
        "Medium shot of the creator reflecting at the same desk, relaxed posture and warm daylight.",
      motion:
        "Gentle pull-back, natural blink and soft smile, preserve object placement.",
    },
  ];
  // Three scenes still include a resolution between hook and CTA.
  const selected =
    brief.sceneCount === 3
      ? [
          {
            ...middle[2],
            narration: `Aku mulai mencoba ${subject}, satu langkah kecil dulu.`,
          },
        ]
      : brief.sceneCount === 4
        ? [middle[0], middle[2]]
        : middle.slice(0, brief.sceneCount - 2);
  const beats = [
    {
      title: "Hook · dekat dengan keseharian",
      narration:
        brief.tone === "humor"
          ? "Rencananya hidup rapi. Kenyataannya, meja aja masih ngajak debat."
          : "Pernah ngerasa hal kecil di keseharianmu bisa jadi awal cerita baru?",
      action:
        "Eye-level selfie framing of the creator in a lived-in room, natural window light, candid expression.",
      motion:
        "Subtle handheld sway, natural blink, creator turns toward the lens and raises one eyebrow.",
    },
    ...selected,
    {
      title: "Penutup & CTA",
      narration:
        "Kalau kamu, kebiasaan kecil apa yang ingin dicoba? Cerita di komentar, ya.",
      action:
        "Friendly close-up in the same room with the same outfit, warm expression, space for captions added in editing.",
      motion:
        "Slow push-in, a small wave and relaxed smile, hold the last frame for a clean ending.",
    },
  ];
  return ugcDraft(accountId, brief, {
    title: `UGC · ${brief.idea}`.slice(0, 200),
    caption: `Cerita kecil tentang ${brief.idea}. Kamu punya pengalaman serupa? #CeritaUGC #Keseharian`,
    hook: beats[0].narration,
    synopsis:
      `Contoh storyboard demo: ${brief.idea}. Alur hook → keseharian → proses → ajakan bercerita. Gaya ${ugcTones[brief.tone]} untuk ${brief.audience}.`.slice(
        0,
        1000,
      ),
    characterLock: brief.character,
    negativePrompt:
      "different face or outfit, deformed hands, extra fingers, warped product, flicker, face morphing, watermark, generated text, artificial skin",
    scenes: beats.map((beat) => ({
      title: beat.title,
      narration: beat.narration,
      textToImage: `${beat.action} Story context: ${brief.idea.slice(0, 700)}. Product context: ${brief.product.slice(0, 300) || "no branded product"}.`,
      imageToVideo: `${beat.motion} Realistic human motion, consistent lighting, no added objects.`,
    })),
  });
}
