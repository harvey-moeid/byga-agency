import { z } from "zod";
import type { Content } from "./domain";
import type { CharacterProfile, StudioProject } from "./studio";

// Flow capabilities are separate from legacy UGC. Recheck sources when updating.
export const omniProfile = {
  id: "google-flow-omni-flash-1.1",
  apiModel: "gemini-omni-1.1-flash",
  label: "Google Flow — Gemini Omni Flash 1.1",
  durations: [4, 6, 8, 10],
  ratios: ["9:16", "16:9"],
  modes: { first: true, firstLast: true, references: true },
  verifiedAt: "2026-10-30",
  source: "https://support.google.com/flow/answer/16352836",
} as const;
const omniDurationSchema = z.union(
  omniProfile.durations.map((d) => z.literal(d)),
);
export interface MediaGenerationAdapter {
  readonly id: "openai-images" | "gemini-omni-1.1-flash";
  status(): Promise<{ configured: boolean; tested: boolean }>;
  // Server only. Implementation must require an explicit user generation action.
  generate(
    input: {
      prompt: string;
      assetIds: string[];
      duration?: number;
      ratio: string;
    },
    signal: AbortSignal,
  ): Promise<{ assetId: string }>;
}
export const mediaIntegrations = [
  {
    id: "openai-images",
    label: "OpenAI Images API",
    status: "Belum dikonfigurasi",
  },
  {
    id: omniProfile.apiModel,
    label: "Gemini Interactions API",
    status: "Belum dikonfigurasi",
  },
] as const;
export const imagePresets = {
  Photorealistic:
    "Photographic realism with natural skin texture and plausible materials",
  Cinematic:
    "Cinematic realistic film still with deliberate depth and motivated lighting",
  Hyperrealistic:
    "Hyperrealistic fine material detail with physically plausible textures",
  "3D Character":
    "Stylized three-dimensional character with coherent geometry and soft rendered materials",
  Anime: "Anime illustration with clean line work and controlled cel shading",
  "Commercial Product":
    "Commercial product photograph with accurate product geometry and restrained reflections",
  "UGC Smartphone":
    "Candid smartphone photograph with natural exposure and everyday detail",
  Fashion:
    "Editorial fashion photograph emphasizing garment texture and silhouette",
  "TikTok Content":
    "Vertical cinematic realistic social content with a clear focal subject and caption-safe space",
  "AI Avatar":
    "Consistent digital presenter portrait with recognizable identifying features",
  Storytelling: "Narrative cinematic still showing a single clear story beat",
} as const;
export const cameraMoves = {
  "Static Shot": "Keep the camera fixed with no translation, pan or zoom",
  "Slow Push In": "Move the camera slowly forward toward the subject",
  "Pull Back": "Move the camera slowly backward to reveal more of the setting",
  "Pan Left": "Rotate the camera smoothly left from a fixed position",
  "Pan Right": "Rotate the camera smoothly right from a fixed position",
  "Tilt Up": "Tilt the camera upward from a fixed position",
  "Tilt Down": "Tilt the camera downward from a fixed position",
  "Tracking Shot": "Track alongside the subject at matching speed",
  Orbit: "Arc slowly around the subject while maintaining distance",
  "Handheld Cinematic":
    "Use restrained handheld camera drift with a readable stable subject",
  Dolly: "Dolly laterally on a smooth straight path",
  Crane: "Raise the camera gradually to reveal the scene",
} as const;
export const characterMoves = {
  Walking: "Take two measured steps with natural weight transfer",
  Running: "Run a short distance with believable foot contact and momentum",
  Talking: "Speak with subtle lip and jaw movement and natural pauses",
  Turning: "Turn the head and shoulders gradually toward the camera",
  Sitting: "Lower into the seat with natural knee and hip movement",
  Standing: "Rise smoothly to a balanced standing posture",
  "Hand Gestures": "Make one small open-hand gesture, then return to rest",
  "Emotional Acting":
    "Let a restrained emotional reaction develop through the eyes and expression",
  "Subtle Idle Motion":
    "Breathe naturally with occasional blinking and small posture shifts",
} as const;
const text = z.string().trim().max(800);
export const imageSettingsSchema = z.object({
  subject: text,
  characterType: text,
  reference: text,
  outfit: text,
  pose: text,
  expression: text,
  location: text,
  background: text,
  activity: text,
  style: text,
  lighting: text,
  cameraAngle: text,
  shot: text,
  lens: text,
  color: text,
  mood: text,
  composition: text,
});
export const videoSettingsSchema = z.object({
  mode: z.enum(["first", "firstLast", "references"]),
  motion: z.enum(
    Object.keys(characterMoves) as [
      keyof typeof characterMoves,
      ...Array<keyof typeof characterMoves>,
    ],
  ),
  subjectMotion: text,
  body: text,
  expression: text,
  camera: z.enum(
    Object.keys(cameraMoves) as [
      keyof typeof cameraMoves,
      ...Array<keyof typeof cameraMoves>,
    ],
  ),
  framing: text,
  environmentMotion: text,
  lighting: text,
  physics: text,
  audio: text,
  dialogue: text,
  voice: text,
  effects: text,
  timing: text,
});
export type ImageSettings = z.infer<typeof imageSettingsSchema>;
export type VideoSettings = z.infer<typeof videoSettingsSchema>;
export const defaultImage: ImageSettings = {
  subject: "",
  characterType: "Adult human",
  reference: "",
  outfit: "",
  pose: "Relaxed natural posture",
  expression: "Calm and engaged",
  location: "",
  background: "Uncluttered background",
  activity: "One readable visual action",
  style: imagePresets.Cinematic,
  lighting: "Soft motivated daylight",
  cameraAngle: "Eye level",
  shot: "Medium shot",
  lens: "Natural perspective, gentle depth of field",
  color: "Natural cinematic color",
  mood: "Warm and approachable",
  composition: "Clear focal subject, room for captions",
};
export const defaultVideo: VideoSettings = {
  mode: "first",
  motion: "Subtle Idle Motion",
  subjectMotion: "",
  body: "Natural balance and weight",
  expression: "Subtle, natural facial response",
  camera: "Slow Push In",
  framing: "Maintain the initial subject framing",
  environmentMotion: "Small ambient movement only",
  lighting: "Keep the initial light direction, exposure and color temperature",
  physics: "Believable gravity, contact, inertia and anatomy",
  audio: "Quiet location ambience",
  dialogue: "",
  voice: "Natural conversational Indonesian",
  effects: "No added effects",
  timing: "",
};
const assetId = z.string().min(1).max(100);
const assetsSchema = z.object({
  first: assetId.optional(),
  last: assetId.optional(),
  references: z.array(assetId).max(5),
  video: assetId.optional(),
});
export type SceneAssets = z.infer<typeof assetsSchema>;
const promptSchema = z.object({
  text: z.string().max(16000),
  inputKey: z.string().max(40000),
  source: z.enum(["template", "manual", "ai"]),
});
const sceneFields = {
  id: z.uuid(),
  title: z.string().trim().min(1).max(120),
  narration: text,
  duration: omniDurationSchema,
  character: text,
  environment: text,
  negative: text,
  image: imageSettingsSchema,
  video: videoSettingsSchema,
  imagePrompt: promptSchema.optional(),
  videoPrompt: promptSchema.optional(),
  assets: assetsSchema,
  revision: z.number().int().nonnegative(),
  approvedRevision: z.number().int().nonnegative().optional(),
};
export const sceneSnapshotSchema = z.object(sceneFields);
export const creativeSceneSchema = sceneSnapshotSchema.extend({
  history: z.array(sceneSnapshotSchema).max(60),
});
export type CreativeScene = z.infer<typeof creativeSceneSchema>;
export const globalsSchema = z.object({
  idea: z.string().trim().max(2000),
  caption: z.string().max(2200),
  character: text,
  environment: text,
  characterLock: z.boolean(),
  environmentLock: z.boolean(),
  characterProfileId: assetId.optional(),
  characterRevision: z.number().int().nonnegative().optional(),
  characterReferenceId: assetId.optional(),
  ratio: z.enum(omniProfile.ratios),
  language: z.enum(["en", "id"]),
  negative: text,
});
export type CreativeGlobals = z.infer<typeof globalsSchema>;
export const creativeSchema = z.object({
  origin: z.enum(["native", "ugc"]).default("native"),
  modelId: z.literal(omniProfile.id),
  globals: globalsSchema,
  scenes: z.array(creativeSceneSchema).min(1).max(12),
  retainedAssetIds: z.array(assetId).max(1000).default([]),
  presets: z
    .array(
      z.object({
        id: z.uuid(),
        name: z.string().trim().min(1).max(60),
        image: imageSettingsSchema,
      }),
    )
    .max(20),
  approvedContext: globalsSchema.optional(),
  exported: z
    .object({ contentId: z.uuid(), key: z.string().max(64) })
    .optional(),
  enhancement: z
    .object({
      id: z.uuid(),
      sceneId: z.uuid(),
      kind: z.enum(["image", "video", "story", "review"]),
      text: z.string().min(1).max(16000),
      inputKey: z.string().max(50000),
      agentId: z.string(),
      createdAt: z.string(),
    })
    .optional(),
});
export type CreativeProject = z.infer<typeof creativeSchema>;
export function newScene(index = 0): CreativeScene {
  return {
    id: crypto.randomUUID(),
    title:
      ["Hook", "Masalah", "Proses", "Solusi", "CTA"][index] ||
      `Scene ${index + 1}`,
    narration: "",
    duration: 6,
    character: "",
    environment: "",
    negative: "",
    image: { ...defaultImage },
    video: { ...defaultVideo },
    assets: { references: [] },
    revision: 0,
    history: [],
  };
}
export function createCreative(): CreativeProject {
  return {
    origin: "native",
    modelId: omniProfile.id,
    globals: {
      idea: "",
      caption: "",
      character:
        "Kreator dewasa Indonesia, rambut hitam sebahu, kaus krem polos",
      environment: "Ruang kerja dengan cahaya jendela",
      characterLock: true,
      environmentLock: true,
      ratio: "9:16",
      language: "en",
      negative: "No identity drift, malformed hands, added text or watermarks",
    },
    scenes: Array.from({ length: 5 }, (_, i) => newScene(i)),
    retainedAssetIds: [],
    presets: [],
  };
}
export function characterDescription(profile: CharacterProfile) {
  return [
    profile.appearance,
    profile.face,
    profile.hair,
    profile.skin,
    profile.outfit,
    profile.accessories,
    profile.proportions,
    profile.style,
    profile.features,
  ]
    .filter(Boolean)
    .join("; ");
}
export function syncCreativeCharacter(
  creative: CreativeProject,
  profile: CharacterProfile,
) {
  if (
    creative.globals.characterProfileId !== profile.id ||
    creative.globals.characterRevision === profile.revision
  )
    return creative;
  return updateGlobals(creative, {
    ...creative.globals,
    character: characterDescription(profile),
    characterRevision: profile.revision,
    characterReferenceId: profile.referenceAssetId,
  });
}
function visualContext(p: CreativeProject, s: CreativeScene) {
  return {
    character: p.globals.characterLock
      ? p.globals.character
      : s.character || p.globals.character,
    environment: p.globals.environmentLock
      ? p.globals.environment
      : s.environment || p.globals.environment,
  };
}
export function promptKey(
  p: CreativeProject,
  s: CreativeScene,
  kind: "image" | "video",
) {
  const g = p.globals;
  return JSON.stringify({
    idea: g.idea,
    ratio: g.ratio,
    language: g.language,
    negative: g.negative,
    context: visualContext(p, s),
    profileRevision: g.characterLock ? g.characterRevision : undefined,
    reference: g.characterLock ? g.characterReferenceId : undefined,
    title: s.title,
    narration: s.narration,
    negativeScene: s.negative,
    settings: kind === "image" ? s.image : s.video,
    ...(kind === "video"
      ? {
          duration: s.duration,
          assets: { ...s.assets, video: undefined },
          imagePrompt: s.imagePrompt,
        }
      : {}),
  });
}
export function promptIsCurrent(
  p: CreativeProject,
  s: CreativeScene,
  kind: "image" | "video",
) {
  const prompt = kind === "image" ? s.imagePrompt : s.videoPrompt;
  return !!prompt?.text.trim() && prompt.inputKey === promptKey(p, s, kind);
}
export function sceneStatus(p: CreativeProject, s: CreativeScene) {
  if (!promptIsCurrent(p, s, "image") || !promptIsCurrent(p, s, "video"))
    return s.imagePrompt || s.videoPrompt ? "Perlu diperbarui" : "Brief";
  if (s.approvedRevision === s.revision) return "Disetujui";
  if (s.assets.video) return "Siap review";
  return s.assets.first ? "Gambar tersedia" : "Prompt tersedia";
}
// Descriptive sentences, one still / one continuous motion; user text remains plain data.
export function imagePrompt(p: CreativeProject, s: CreativeScene) {
  const { character, environment } = visualContext(p, s),
    i = s.image,
    id = p.globals.language === "id";
  const subject = p.globals.characterLock ? character : i.subject || character;
  return [
    id
      ? `Buat satu gambar diam ${p.globals.ratio} untuk ide: ${p.globals.idea}. Adegan: ${s.title}.`
      : `Create one ${p.globals.ratio} still image for this idea: ${p.globals.idea}. Scene: ${s.title}.`,
    `${id ? "Subjek" : "Subject"}: ${subject}. ${id ? "Jenis karakter" : "Character type"}: ${i.characterType}.`,
    `${id ? "Identitas visual" : "Visual identity"}: ${character}. ${id ? "Pakaian" : "Outfit"}: ${p.globals.characterLock ? "Use only the outfit in the locked identity description" : i.outfit || "Use the described outfit"}.`,
    `${id ? "Pose dan ekspresi" : "Pose and expression"}: ${i.pose}; ${i.expression}. ${id ? "Aktivitas yang terlihat" : "Visible activity"}: ${i.activity}.`,
    `${id ? "Lingkungan" : "Environment"}: ${environment}. ${p.globals.environmentLock ? "Keep the locked setting and its background details." : `Location: ${i.location || environment}. Background: ${i.background}.`}`,
    `${id ? "Tampilan visual" : "Visual treatment"}: ${i.style}. ${id ? "Cahaya" : "Lighting"}: ${i.lighting}.`,
    `${id ? "Kamera" : "Camera"}: ${i.shot}, ${i.cameraAngle}; ${i.lens}. ${id ? "Warna dan suasana" : "Color and mood"}: ${i.color}; ${i.mood}.`,
    `${id ? "Komposisi" : "Composition"}: ${i.composition}.`,
    i.reference || p.globals.characterReferenceId
      ? `${id ? "Referensi" : "Reference guidance"}: ${i.reference || "Use the separately attached character reference"}. Preserve recognizable features; text alone cannot guarantee an identical face.`
      : "",
    `${id ? "Hindari" : "Avoid"}: ${[p.globals.negative, s.negative].filter(Boolean).join("; ")}.`,
    id
      ? "Satu momen visual yang masuk akal; tanpa kolase atau urutan gerakan."
      : "Show one physically coherent moment, without collage or a sequence of movements.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
export function videoPrompt(p: CreativeProject, s: CreativeScene) {
  const v = s.video,
    { character, environment } = visualContext(p, s),
    id = p.globals.language === "id";
  return [
    id
      ? `Animasikan gambar frame pertama yang diunggah, ${s.duration} detik, ${p.globals.ratio}, satu shot kontinu.`
      : `Animate the separately uploaded first-frame image for ${s.duration} seconds, ${p.globals.ratio}, in one continuous shot.`,
    `${id ? "Pertahankan identitas" : "Preserve visual identity"}: ${character}. ${id ? "Lingkungan" : "Setting"}: ${environment}. Keep the reference face, clothing, body proportions and object geometry recognizable.`,
    v.mode === "firstLast"
      ? "Use the separately attached last-frame image as the desired end composition; transition gradually within this shot."
      : v.mode === "references"
        ? "Use separately attached reference images to guide appearance without changing the first-frame composition abruptly."
        : "Start from the first-frame composition.",
    `${id ? "Gerakan subjek" : "Subject movement"}: ${v.subjectMotion || characterMoves[v.motion]}. ${id ? "Tubuh" : "Body"}: ${v.body}. ${id ? "Ekspresi" : "Expression"}: ${v.expression}.`,
    `${id ? "Kamera" : "Camera"}: ${cameraMoves[v.camera]}. ${id ? "Framing" : "Framing"}: ${v.framing}.`,
    `${id ? "Gerakan lingkungan" : "Environmental motion"}: ${v.environmentMotion}. ${id ? "Kontinuitas cahaya" : "Lighting continuity"}: ${v.lighting}. ${id ? "Fisika" : "Physics"}: ${v.physics}.`,
    `${id ? "Timing yang diinginkan" : "Desired timing"}: ${v.timing || `0–${Math.min(1, s.duration)}s establish the reference; 1–${s.duration - 1}s perform the action; final second settle naturally`}.`,
    `${id ? "Audio latar" : "Background audio"}: ${v.audio}. ${id ? "Efek suara" : "Sound effects"}: ${v.effects}.`,
    v.dialogue
      ? `${id ? "Dialog" : "Dialogue"}: ${JSON.stringify(v.dialogue)}. ${id ? "Arahan suara" : "Voice direction"}: ${v.voice}. Keep speech short enough for the clip; exact delivery and timing need review.`
      : id
        ? "Tanpa dialog."
        : "No spoken dialogue.",
    `${id ? "Hindari" : "Avoid"}: identity drift, morphing, abrupt cuts, impossible motion; ${[p.globals.negative, s.negative].filter(Boolean).join("; ")}.`,
  ].join("\n\n");
}
function reviseScene(
  s: CreativeScene,
  patch: Partial<CreativeScene>,
): CreativeScene {
  if (s.history.length >= 60)
    throw new Error(
      "Riwayat scene penuh. Duplikasikan scene untuk melanjutkan; aset lama tetap dilindungi.",
    );
  const { history, ...snapshot } = s;
  return {
    ...s,
    ...patch,
    revision: s.revision + 1,
    approvedRevision: undefined,
    history: [...history, snapshot],
  };
}
export function updateGlobals(
  p: CreativeProject,
  globals: CreativeGlobals,
): CreativeProject {
  if (JSON.stringify(p.globals) === JSON.stringify(globals)) return p;
  return {
    ...p,
    globals,
    retainedAssetIds: [
      ...new Set(
        [...(p.retainedAssetIds || []), p.globals.characterReferenceId].filter(
          (id): id is string => !!id,
        ),
      ),
    ],
    scenes: p.scenes.map((s) => ({ ...s, approvedRevision: undefined })),
    enhancement: undefined,
  };
}
const scenePatch = sceneSnapshotSchema
  .pick({
    title: true,
    narration: true,
    duration: true,
    character: true,
    environment: true,
    negative: true,
    image: true,
    video: true,
  })
  .partial();
export const creativeCommandSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("init"),
    convertDuration: omniDurationSchema.optional(),
  }),
  z.object({ action: z.literal("globals"), globals: globalsSchema }),
  z.object({ action: z.literal("approveBrief") }),
  z.object({ action: z.literal("storyboard") }),
  z.object({
    action: z.literal("scene"),
    sceneId: z.uuid(),
    patch: scenePatch,
  }),
  z.object({
    action: z.literal("generate"),
    sceneId: z.uuid().optional(),
    kind: z.enum(["image", "video", "both"]),
  }),
  z.object({
    action: z.literal("editPrompt"),
    sceneId: z.uuid(),
    kind: z.enum(["image", "video"]),
    text: z.string().trim().min(1).max(16000),
  }),
  z.object({ action: z.literal("duplicate"), sceneId: z.uuid() }),
  z.object({ action: z.literal("approve"), sceneId: z.uuid() }),
  z.object({
    action: z.literal("asset"),
    sceneId: z.uuid(),
    slot: z.enum(["first", "last", "reference", "video"]),
    assetId,
  }),
  z.object({
    action: z.literal("restore"),
    sceneId: z.uuid(),
    revision: z.number().int().nonnegative(),
  }),
  z.object({
    action: z.literal("savePreset"),
    sceneId: z.uuid(),
    name: z.string().trim().min(1).max(60),
  }),
  z.object({ action: z.literal("deletePreset"), presetId: z.uuid() }),
  z.object({ action: z.literal("acceptEnhancement"), enhancementId: z.uuid() }),
  z.object({ action: z.literal("dismissEnhancement") }),
  z.object({ action: z.literal("export") }),
]);
export type CreativeCommand = z.infer<typeof creativeCommandSchema>;
export function initCreative(
  project: StudioProject,
  duration?: 4 | 6 | 8 | 10,
) {
  const p = createCreative();
  p.origin = "ugc";
  const legacy = project.brief?.data || project.briefDraft;
  if (
    !omniProfile.durations.includes(legacy.sceneDuration as 4 | 6 | 8 | 10) &&
    !duration
  )
    throw new Error(
      `Durasi UGC ${legacy.sceneDuration} detik tidak didukung Omni. Pilih konversi eksplisit; data UGC asli tetap tersimpan.`,
    );
  const convertedDuration = duration || (legacy.sceneDuration as 8 | 10);
  p.globals.idea = legacy.idea;
  p.globals.character = project.story?.data.characterLock || legacy.character;
  if (legacy.characterProfile) {
    p.globals.characterProfileId = legacy.characterProfile.id;
    p.globals.characterReferenceId = legacy.characterProfile.referenceAssetId;
  }
  if (project.story) {
    p.globals.caption = project.story.data.caption;
    p.scenes = project.story.data.scenes.map((s, i) => ({
      ...newScene(i),
      title: s.title,
      narration: s.narration,
      environment: s.description,
      image: { ...defaultImage, activity: s.description },
      duration: convertedDuration,
    }));
  } else
    p.scenes = Array.from({ length: legacy.sceneCount }, (_, i) => ({
      ...newScene(i),
      duration: convertedDuration,
    }));
  return p;
}
export function enhancementKey(
  p: CreativeProject,
  s: CreativeScene,
  kind: "image" | "video" | "story" | "review",
) {
  return JSON.stringify({
    context: p.approvedContext,
    kind,
    input:
      kind === "image" || kind === "video"
        ? promptKey(p, s, kind)
        : {
            title: s.title,
            narration: s.narration,
            image: s.imagePrompt,
            video: s.videoPrompt,
            assets: s.assets,
          },
  });
}
export function applyCreative(
  p: CreativeProject,
  raw: CreativeCommand,
): CreativeProject {
  const command = creativeCommandSchema.parse(raw);
  if (command.action === "init" || command.action === "export") return p;
  if (command.action === "globals") return updateGlobals(p, command.globals);
  if (command.action === "storyboard") {
    if (p.globals.idea.length < 5)
      throw new Error("Isi ide utama minimal 5 karakter.");
    const beats = [
      "Perkenalkan situasi",
      "Tunjukkan tantangan",
      "Perlihatkan proses",
      "Tampilkan perubahan",
      "Ajak audiens mencoba",
    ];
    return {
      ...p,
      scenes: p.scenes.map((s, i) =>
        reviseScene(s, {
          narration:
            s.narration ||
            `${beats[i % beats.length]}: ${p.globals.idea.slice(0, 180)}.`,
          image: {
            ...s.image,
            activity: `${beats[i % beats.length]} — ${p.globals.idea.slice(0, 350)}`,
          },
        }),
      ),
    };
  }
  if (command.action === "approveBrief") {
    if (p.globals.idea.length < 5)
      throw new Error(
        "Isi ide utama minimal 5 karakter sebelum menyetujui brief.",
      );
    return {
      ...p,
      approvedContext: structuredClone(p.globals),
      enhancement: undefined,
    };
  }
  if (command.action === "dismissEnhancement")
    return { ...p, enhancement: undefined };
  if (command.action === "deletePreset")
    return {
      ...p,
      presets: p.presets.filter((x) => x.id !== command.presetId),
    };
  if (command.action === "acceptEnhancement") {
    const e = p.enhancement,
      s = p.scenes.find((s) => s.id === e?.sceneId);
    if (
      !e ||
      !s ||
      e.id !== command.enhancementId ||
      e.inputKey !== enhancementKey(p, s, e.kind)
    )
      throw new Error(
        "Usulan AI kedaluwarsa. Generate ulang dari konteks terbaru.",
      );
    if (e.kind === "review") return { ...p, enhancement: undefined };
    const next =
      e.kind === "story"
        ? applyCreative(p, {
            action: "scene",
            sceneId: s.id,
            patch: { narration: e.text.slice(0, 800) },
          })
        : applyCreative(p, {
            action: "editPrompt",
            sceneId: s.id,
            kind: e.kind,
            text: e.text,
          });
    if (e.kind === "image" || e.kind === "video")
      next.scenes.find((x) => x.id === s.id)![
        e.kind === "image" ? "imagePrompt" : "videoPrompt"
      ]!.source = "ai";
    return { ...next, enhancement: undefined };
  }
  const s =
    "sceneId" in command && command.sceneId
      ? p.scenes.find((s) => s.id === command.sceneId)
      : undefined;
  if ("sceneId" in command && command.sceneId && !s)
    throw new Error("Scene tidak ditemukan.");
  if (command.action === "savePreset") {
    if (p.presets.length >= 20)
      throw new Error("Maksimal 20 preset. Hapus preset lama terlebih dahulu.");
    return {
      ...p,
      presets: [
        ...p.presets,
        { id: crypto.randomUUID(), name: command.name, image: { ...s!.image } },
      ],
    };
  }
  if (command.action === "duplicate") {
    if (p.scenes.length >= 12) throw new Error("Maksimal 12 scene.");
    return {
      ...p,
      scenes: [
        ...p.scenes,
        {
          ...structuredClone(s!),
          id: crypto.randomUUID(),
          title: `${s!.title.slice(0, 110)} copy`,
          revision: 0,
          approvedRevision: undefined,
          history: [],
        },
      ],
    };
  }
  return {
    ...p,
    scenes: p.scenes.map((scene) => {
      if (s && scene.id !== s.id) return scene;
      if (command.action === "scene") return reviseScene(scene, command.patch);
      if (command.action === "restore") {
        const version = scene.history.find(
          (v) => v.revision === command.revision,
        );
        if (!version) throw new Error("Revisi tidak ditemukan.");
        return reviseScene(scene, version);
      }
      if (command.action === "asset") {
        const assets = { ...scene.assets };
        if (command.slot === "reference")
          assets.references = [
            ...new Set([...assets.references, command.assetId]),
          ].slice(-5);
        else assets[command.slot] = command.assetId;
        return reviseScene(scene, { assets });
      }
      if (command.action === "approve") {
        if (
          !promptIsCurrent(p, scene, "image") ||
          !promptIsCurrent(p, scene, "video")
        )
          throw new Error("Perbarui kedua prompt sebelum approval scene.");
        if (!scene.assets.first || !scene.assets.video)
          throw new Error(
            "Upload gambar dan video, lalu review sebelum approval scene.",
          );
        if (scene.video.mode === "firstLast" && !scene.assets.last)
          throw new Error(
            "Mode first + last memerlukan last-frame sebelum approval.",
          );
        if (
          scene.video.mode === "references" &&
          !scene.assets.references.length
        )
          throw new Error(
            "Mode references memerlukan gambar referensi sebelum approval.",
          );
        return { ...scene, approvedRevision: scene.revision };
      }
      if (command.action === "editPrompt") {
        const field = command.kind === "image" ? "imagePrompt" : "videoPrompt";
        return reviseScene(scene, {
          [field]: {
            text: command.text,
            inputKey: promptKey(p, scene, command.kind),
            source: "manual",
          },
        });
      }
      if (command.action === "generate") {
        if (p.globals.idea.length < 5)
          throw new Error("Isi ide utama minimal 5 karakter.");
        const next = { ...scene };
        if (command.kind !== "video")
          next.imagePrompt = {
            text: imagePrompt(p, next),
            inputKey: promptKey(p, next, "image"),
            source: "template",
          };
        if (command.kind !== "image")
          next.videoPrompt = {
            text: videoPrompt(p, next),
            inputKey: promptKey(p, next, "video"),
            source: "template",
          };
        return reviseScene(scene, next);
      }
      return scene;
    }),
  };
}
export function creativeExport(p: CreativeProject, format: "txt" | "json") {
  if (format === "json") return JSON.stringify(p, null, 2);
  let time = 0;
  return [
    `${omniProfile.label}\n${p.globals.idea}\nCaption: ${p.globals.caption}\nRatio: ${p.globals.ratio}`,
    ...p.scenes.map((s) => {
      const start = time;
      time += s.duration;
      return [
        `${start}–${time}s · ${s.title} · ${sceneStatus(p, s)} · revision ${s.revision}`,
        `Narasi: ${s.narration}`,
        `IMAGE PROMPT (${s.imagePrompt?.source || "empty"})\n${s.imagePrompt?.text || ""}`,
        `VIDEO PROMPT (${s.videoPrompt?.source || "empty"})\n${s.videoPrompt?.text || ""}`,
        `Assets: ${JSON.stringify(s.assets)}`,
      ].join("\n\n");
    }),
  ].join("\n\n---\n\n");
}
export function creativeDraft(project: StudioProject): Content {
  const p = project.creative!;
  if (
    !p.scenes.every(
      (s) =>
        s.approvedRevision === s.revision &&
        promptIsCurrent(p, s, "image") &&
        promptIsCurrent(p, s, "video"),
    )
  )
    throw new Error(
      "Review dan approve semua scene terbaru sebelum mengirim draft.",
    );
  return {
    id: crypto.randomUUID(),
    accountId: project.accountId,
    title: project.name,
    caption: p.globals.caption,
    prompt: creativeExport(p, "txt"),
    creative: structuredClone(p),
    studioProjectId: project.id,
    status: "draft",
    createdAt: new Date().toISOString(),
    views: 0,
    likes: 0,
  };
}
export function creativeAssetIds(p: CreativeProject): string[] {
  return [
    ...new Set(
      [
        ...(p.retainedAssetIds || []),
        p.approvedContext?.characterReferenceId,
        p.globals.characterReferenceId,
        ...p.scenes.flatMap((s) =>
          [s, ...s.history].flatMap((v) => [
            v.assets.first,
            v.assets.last,
            v.assets.video,
            ...v.assets.references,
          ]),
        ),
      ].filter((id): id is string => !!id),
    ),
  ];
}
