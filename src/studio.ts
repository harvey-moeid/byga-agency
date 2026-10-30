import type { CreativeProject } from "./creative";
import { z } from "zod";
import type { Content, Room } from "./domain";
import {
  defaultUGCBrief,
  demoUGCDraft,
  ugcBriefSchema,
  ugcDraft,
  ugcOutputSchema,
  type UGCOutput,
} from "./ugc";

export const agentIds = [
  "research",
  "content",
  "schedule",
  "publish",
  "analytics",
] as const;
export const stageNames = {
  brief: "Brief",
  story: "Cerita & naskah",
  images: "Prompt gambar",
  videos: "Prompt video",
  review: "Review akhir",
  final: "Draft final",
} as const;
export type StudioStage = keyof typeof stageNames;
export const presets = {
  research: {
    label: "Riset ide",
    role: "Peneliti ide",
    instructions:
      "Bantu menemukan sudut cerita yang relevan, audiens dan masalah sehari-hari. Ajukan pertanyaan untuk mengisi brief. Bedakan fakta, asumsi dan ide kreatif; jangan mengarang data tren.",
  },
  writer: {
    label: "Penulis cerita UGC",
    role: "Penulis cerita UGC",
    instructions:
      "Tulis cerita UGC natural dengan hook, masalah, proses, perubahan dan CTA. Buat narasi singkat berbahasa Indonesia sesuai durasi. Jaga karakter dan detail produk konsisten. Jangan mengarang klaim atau pengalaman pelanggan nyata.",
  },
  image: {
    label: "Pembuat prompt gambar",
    role: "Sutradara visual",
    instructions:
      "Target ChatGPT image generation. Ubah adegan yang sudah disetujui menjadi prompt still frame fotorealistis 9:16 berbahasa Inggris. Jelaskan framing, cahaya, subjek, pakaian, produk dan latar. Pertahankan identitas antar adegan, tanpa kolase atau teks buatan.",
  },
  video: {
    label: "Pembuat prompt video",
    role: "Sutradara gerakan",
    instructions:
      "Target Google Flow Gemini Omni Flash 1.1; gunakan durasi profil proyek yang diberikan. Susun prompt image-to-video berbahasa Inggris yang memakai gambar adegan sebagai frame awal. Arahkan gerakan kamera, ekspresi dan satu aksi realistis sesuai durasi. Hindari morphing, perpindahan identitas dan gerakan berlebihan.",
  },
  reviewer: {
    label: "Reviewer konten",
    role: "Reviewer kreatif",
    instructions:
      "Periksa kesinambungan cerita, narasi, prompt visual, durasi dan klaim produk. Tunjukkan kekurangan yang spesifik dan saran revisi per adegan. Jangan menyatakan hasil sudah disetujui tanpa persetujuan pengguna.",
  },
  planner: {
    label: "Pengelola jadwal",
    role: "Perencana konten",
    instructions:
      "Bantu menyusun rencana produksi dan jadwal konten. Gunakan hanya data proyek yang tersedia. Usulkan tindakan dan jelaskan dampaknya sebelum perubahan. Publish TikTok selalu memerlukan review dan final approval terpisah.",
  },
  custom: {
    label: "Instruksi custom",
    role: "Asisten kreatif",
    instructions:
      "Bantu pengguna menyelesaikan proyek UGC dengan pertanyaan yang jelas, usulan konkret, dan hasil yang menunggu persetujuan.",
  },
} as const;
export const agentSchema = z.object({
  id: z.enum(agentIds),
  name: z.string().trim().min(1).max(40),
  role: z.string().trim().min(1).max(80),
  preset: z.enum([
    "research",
    "writer",
    "image",
    "video",
    "reviewer",
    "planner",
    "custom",
  ]),
  instructions: z.string().trim().min(10).max(6000),
  color: z.string().regex(/^#[a-fA-F0-9]{6}$/),
  revision: z.number().int().nonnegative(),
});
export type StudioAgent = z.infer<typeof agentSchema>;
export const defaultAgents: StudioAgent[] = [
  ["research", "Aria", "research", "#c18e51"],
  ["content", "Nova", "writer", "#a183b7"],
  ["schedule", "Kai", "image", "#6f9e89"],
  ["publish", "Leo", "video", "#c67c60"],
  ["analytics", "Iris", "reviewer", "#7598ad"],
].map(([id, name, preset, color]) => ({
  id: id as Room,
  name,
  preset: preset as StudioAgent["preset"],
  role: presets[preset as keyof typeof presets].role,
  instructions: presets[preset as keyof typeof presets].instructions,
  color,
  revision: 0,
}));

export const characterSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(60),
  face: z.string().max(300).optional(),
  hair: z.string().max(200).optional(),
  skin: z.string().max(200).optional(),
  accessories: z.string().max(200).optional(),
  proportions: z.string().max(200).optional(),
  style: z.string().max(200).optional(),
  features: z.string().max(300).optional(),
  appearance: z.string().trim().min(5).max(500),
  outfit: z.string().trim().min(2).max(250),
  referenceAssetId: z.string().max(100).optional(),
  revision: z.number().int().nonnegative(),
});
export type CharacterProfile = z.infer<typeof characterSchema>;
export const projectBriefSchema = z.object({
  ...ugcBriefSchema.shape,
  characterProfile: characterSchema.omit({ revision: true }).optional(),
});
export type ProjectBrief = z.infer<typeof projectBriefSchema>;
export const projectBriefDraftSchema = projectBriefSchema.extend({
  idea: z.string().max(2000),
  character: z.string().max(800),
  audience: z.string().max(300),
});
export const storySchema = z.object({
  title: z.string().trim().min(1).max(200),
  caption: z.string().trim().min(1).max(2200),
  hook: z.string().trim().min(1).max(400),
  synopsis: z.string().trim().min(1).max(1000),
  characterLock: z.string().trim().min(1).max(1200),
  negativePrompt: z.string().trim().min(1).max(800),
  scenes: z
    .array(
      z.object({
        id: z.string().regex(/^s[1-6]$/),
        title: z.string().trim().min(1).max(120),
        narration: z.string().trim().min(1).max(400),
        description: z.string().trim().min(1).max(1200),
      }),
    )
    .min(3)
    .max(6),
});
export type StudioStory = z.infer<typeof storySchema>;
const batchSchema = z.object({
  prompts: z
    .array(
      z.object({
        sceneId: z.string().regex(/^s[1-6]$/),
        prompt: z.string().trim().min(10).max(1800),
      }),
    )
    .min(1)
    .max(6),
});
export const proposalPayloadSchema = z.discriminatedUnion("stage", [
  z.object({ stage: z.literal("brief"), data: projectBriefSchema }),
  z.object({ stage: z.literal("story"), data: storySchema }),
  z.object({ stage: z.literal("images"), data: batchSchema }),
  z.object({ stage: z.literal("videos"), data: batchSchema }),
  z.object({
    stage: z.literal("review"),
    data: z.object({
      summary: z.string().trim().min(1).max(2400),
      issues: z.array(z.string().trim().min(1).max(600)).max(12),
    }),
  }),
  z.object({ stage: z.literal("final"), data: ugcOutputSchema }),
]);
export type ProposalPayload = z.infer<typeof proposalPayloadSchema>;
export interface StudioProposal {
  id: string;
  runId: string;
  agentId: Room;
  payload: ProposalPayload;
  inputKey: string;
  sceneId?: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}
export interface StudioMessage {
  id: string;
  agentId: Room;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  proposalId?: string;
  suggestedAction?: StudioStage;
}
export interface Approved<T> {
  id: string;
  data: T;
  approvedAt: string;
  agentId: Room;
}
export interface ApprovedStory extends Approved<StudioStory> {
  briefId: string;
  characterKey: string;
  sceneKeys: Record<string, string>;
}
export interface ApprovedPrompt extends Approved<string> {
  inputKey: string;
}
export type StudioAction = "chat" | StudioStage;
export interface StudioRun {
  id: string;
  agentId: Room;
  action: StudioAction;
  sceneId?: string;
  startedAt: number;
  inputKey: string;
}
export interface StudioProject {
  id: string;
  accountId: string;
  name: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  creative?: CreativeProject;
  briefDraft: ProjectBrief;
  brief?: Approved<ProjectBrief>;
  story?: ApprovedStory;
  images: Record<string, ApprovedPrompt>;
  videos: Record<string, ApprovedPrompt>;
  review?: Approved<{ summary: string; issues: string[] }> & {
    inputKey: string;
  };
  messages: StudioMessage[];
  proposals: StudioProposal[];
  history: StudioProposal[];
  run?: StudioRun;
  cancelledRuns: string[];
  final?: { contentId: string; inputKey: string; createdAt: string };
}
export interface ProjectSummary {
  id: string;
  accountId: string;
  name: string;
  revision: number;
  updatedAt: string;
  creative?: boolean;
  legacyUGC?: boolean;
  nextStage: StudioStage;
  needsReview: boolean;
}
export interface StudioState {
  agents: StudioAgent[];
  characters: CharacterProfile[];
  projects: StudioProject[];
}
export class StudioConflict extends Error {}
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
export function createProject(
  name: string,
  accountId: string,
  brief: ProjectBrief = defaultUGCBrief,
): StudioProject {
  const time = now();
  return {
    id: uid(),
    name: z.string().trim().min(1).max(100).parse(name),
    accountId,
    briefDraft: brief,
    revision: 0,
    createdAt: time,
    updatedAt: time,
    images: {},
    videos: {},
    messages: [],
    proposals: [],
    history: [],
    cancelledRuns: [],
  };
}
export function changed(project: StudioProject): StudioProject {
  return { ...project, revision: project.revision + 1, updatedAt: now() };
}
export function requireRevision(project: StudioProject, revision: number) {
  if (revision !== project.revision)
    throw new StudioConflict(
      "Proyek berubah. Versi terbaru sudah dimuat; periksa sebelum mencoba lagi.",
    );
}
export function requireStory(project: StudioProject) {
  if (!project.brief) throw new Error("Setujui brief terlebih dahulu.");
  if (!project.story || project.story.briefId !== project.brief.id)
    throw new Error("Setujui cerita terbaru terlebih dahulu.");
  return project.story;
}
export function sceneKey(project: StudioProject, sceneId: string) {
  const story = requireStory(project);
  if (!story.sceneKeys[sceneId]) throw new Error("Adegan tidak ditemukan.");
  return JSON.stringify([
    project.brief!.id,
    story.characterKey,
    sceneId,
    story.sceneKeys[sceneId],
  ]);
}
export function promptCurrent(
  project: StudioProject,
  stage: "images" | "videos",
  sceneId: string,
): boolean {
  try {
    const prompt = project[stage][sceneId];
    if (!prompt) return false;
    const key =
      stage === "images"
        ? sceneKey(project, sceneId)
        : videoKey(project, sceneId);
    return prompt.inputKey === key;
  } catch {
    return false;
  }
}
export function videoKey(project: StudioProject, sceneId: string): string {
  if (!promptCurrent(project, "images", sceneId))
    throw new Error(
      "Setujui prompt gambar terbaru untuk adegan ini terlebih dahulu.",
    );
  return JSON.stringify([
    sceneKey(project, sceneId),
    project.images[sceneId].id,
  ]);
}
export function inputKey(
  project: StudioProject,
  stage: StudioAction,
  sceneId?: string,
): string {
  if (stage === "chat") return "chat";
  if (stage === "brief") return JSON.stringify(project.briefDraft);
  if (!project.brief) throw new Error("Setujui brief terlebih dahulu.");
  if (stage === "story")
    return JSON.stringify([project.brief.id, project.story?.id]);
  const story = requireStory(project);
  const ids = sceneId ? [sceneId] : story.data.scenes.map((s) => s.id);
  if (stage === "images")
    return JSON.stringify(ids.map((id) => sceneKey(project, id)));
  if (stage === "videos")
    return JSON.stringify(ids.map((id) => videoKey(project, id)));
  for (const scene of story.data.scenes) {
    if (!promptCurrent(project, "videos", scene.id))
      throw new Error(
        "Setujui prompt gambar dan video terbaru untuk semua adegan terlebih dahulu.",
      );
  }
  if (
    stage === "final" &&
    (!project.review || project.review.inputKey !== inputKey(project, "review"))
  )
    throw new Error("Setujui review akhir terbaru terlebih dahulu.");
  return JSON.stringify([
    project.brief.id,
    story.id,
    ...story.data.scenes.map((s) => [
      s.id,
      project.images[s.id].id,
      project.videos[s.id].id,
    ]),
  ]);
}
export function proposalCurrent(
  project: StudioProject,
  proposal: StudioProposal,
) {
  try {
    return (
      proposal.status === "pending" &&
      proposal.inputKey ===
        inputKey(project, proposal.payload.stage, proposal.sceneId)
    );
  } catch {
    return false;
  }
}
export function nextStage(project: StudioProject): StudioStage {
  if (!project.brief || !same(project.briefDraft, project.brief.data))
    return "brief";
  if (!project.story || project.story.briefId !== project.brief.id)
    return "story";
  const scenes = project.story.data.scenes;
  if (scenes.some((s) => !promptCurrent(project, "images", s.id)))
    return "images";
  if (scenes.some((s) => !promptCurrent(project, "videos", s.id)))
    return "videos";
  if (
    !project.review ||
    project.review.inputKey !== inputKey(project, "review")
  )
    return "review";
  return "final";
}
export function projectSummary(p: StudioProject): ProjectSummary {
  return {
    id: p.id,
    accountId: p.accountId,
    name: p.name,
    revision: p.revision,
    updatedAt: p.updatedAt,
    creative: !!p.creative,
    legacyUGC: p.creative?.origin === "ugc",
    nextStage: nextStage(p),
    needsReview:
      !!p.story &&
      (p.story.briefId !== p.brief?.id ||
        p.story.data.scenes.some(
          (s) =>
            (!!p.images[s.id] && !promptCurrent(p, "images", s.id)) ||
            (!!p.videos[s.id] && !promptCurrent(p, "videos", s.id)),
        )),
  };
}
export function beginTurn(
  project: StudioProject,
  run: Omit<StudioRun, "startedAt" | "inputKey">,
  text: string,
): StudioProject {
  if (project.cancelledRuns.includes(run.id))
    throw new StudioConflict("Generasi telah dihentikan.");
  if (project.run && Date.now() - project.run.startedAt < 90_000)
    throw new StudioConflict(
      "Agen lain masih bekerja di proyek ini. Tunggu atau hentikan generasi.",
    );
  if (run.action === "brief") projectBriefSchema.parse(project.briefDraft);
  const key = inputKey(project, run.action, run.sceneId);
  return changed({
    ...project,
    run: { ...run, startedAt: Date.now(), inputKey: key },
    messages: [
      ...project.messages,
      {
        id: uid(),
        agentId: run.agentId,
        role: "user" as const,
        text,
        createdAt: now(),
      },
    ],
  });
}
export function finishTurn(
  project: StudioProject,
  runId: string,
  message: string,
  payload?: ProposalPayload,
  suggestedAction?: StudioStage,
): StudioProject {
  const run = project.run;
  if (!run || run.id !== runId || project.cancelledRuns.includes(runId))
    throw new StudioConflict(
      "Generasi telah dihentikan atau digantikan; hasil tidak diterapkan.",
    );
  if (run.inputKey !== inputKey(project, run.action, run.sceneId))
    throw new StudioConflict(
      "Konteks proyek berubah saat agen bekerja. Generate ulang dengan versi terbaru.",
    );
  let proposal: StudioProposal | undefined;
  if (payload) {
    payload = proposalPayloadSchema.parse(payload);
    if (payload.stage !== run.action)
      throw new Error("Tahap hasil AI tidak sesuai permintaan.");
    if (payload.stage === "story") {
      if (
        payload.data.scenes.length !== project.brief!.data.sceneCount ||
        payload.data.scenes.some((s, i) => s.id !== `s${i + 1}`)
      )
        throw new Error("Urutan atau jumlah adegan AI tidak sesuai brief.");
    }
    if (payload.stage === "images" || payload.stage === "videos") {
      const ids = run.sceneId
        ? [run.sceneId]
        : project.story!.data.scenes.map((s) => s.id);
      if (
        payload.data.prompts.length !== ids.length ||
        new Set(payload.data.prompts.map((p) => p.sceneId)).size !==
          ids.length ||
        payload.data.prompts.some((p) => !ids.includes(p.sceneId))
      )
        throw new Error("Prompt AI belum mencakup tepat adegan yang diminta.");
    }
    proposal = {
      id: uid(),
      runId,
      agentId: run.agentId,
      payload,
      inputKey: run.inputKey,
      sceneId: run.sceneId,
      status: "pending",
      createdAt: now(),
    };
  }
  return changed({
    ...project,
    run: undefined,
    proposals: proposal ? [...project.proposals, proposal] : project.proposals,
    messages: [
      ...project.messages,
      {
        id: uid(),
        agentId: run.agentId,
        role: "assistant" as const,
        text: message.slice(0, 6000),
        createdAt: now(),
        proposalId: proposal?.id,
        suggestedAction,
      },
    ],
  });
}
export function stopTurn(
  project: StudioProject,
  runId: string,
  message = "Generasi dihentikan. Hasil tidak diterapkan.",
): StudioProject {
  const run = project.run?.id === runId ? project.run : undefined;
  return changed({
    ...project,
    run: run ? undefined : project.run,
    proposals: project.proposals.map((p) =>
      p.runId === runId && p.status === "pending"
        ? { ...p, status: "rejected" as const }
        : p,
    ),
    cancelledRuns: [
      ...project.cancelledRuns.filter((id) => id !== runId).slice(-19),
      runId,
    ],
    messages: run
      ? [
          ...project.messages,
          {
            id: uid(),
            agentId: run.agentId,
            role: "assistant" as const,
            text: message,
            createdAt: now(),
          },
        ]
      : project.messages,
  });
}
export function finalOutput(project: StudioProject): UGCOutput {
  inputKey(project, "final");
  const story = project.story!.data;
  return {
    ...story,
    scenes: story.scenes.map((s) => ({
      title: s.title,
      narration: s.narration,
      textToImage: project.images[s.id].data,
      imageToVideo: project.videos[s.id].data,
    })),
  };
}
export function approveProposal(
  project: StudioProject,
  id: string,
): { project: StudioProject; content?: Content } {
  const proposal = project.proposals.find((p) => p.id === id);
  if (!proposal || !proposalCurrent(project, proposal))
    throw new StudioConflict(
      "Hasil sudah diproses atau konteksnya berubah. Tinjau/generate versi terbaru.",
    );
  const payload = proposal.payload;
  let next = { ...project };
  let content: Content | undefined;
  const approved = <T>(data: T): Approved<T> => ({
    id: uid(),
    data,
    approvedAt: now(),
    agentId: proposal.agentId,
  });
  if (payload.stage === "brief")
    next.brief = same(project.brief?.data, payload.data)
      ? project.brief
      : approved(payload.data);
  if (payload.stage === "story") {
    const old = project.story;
    const characterKey =
      old &&
      same(
        [old.data.characterLock, old.data.negativePrompt],
        [payload.data.characterLock, payload.data.negativePrompt],
      )
        ? old.characterKey
        : uid();
    next.story = {
      ...approved(payload.data),
      briefId: project.brief!.id,
      characterKey,
      sceneKeys: Object.fromEntries(
        payload.data.scenes.map((s) => [
          s.id,
          old &&
          same(
            old.data.scenes.find((o) => o.id === s.id),
            s,
          )
            ? old.sceneKeys[s.id]
            : uid(),
        ]),
      ),
    };
  }
  if (payload.stage === "images" || payload.stage === "videos") {
    const stage = payload.stage;
    next[stage] = { ...project[stage] };
    for (const item of payload.data.prompts) {
      const key =
        stage === "images"
          ? sceneKey(project, item.sceneId)
          : videoKey(project, item.sceneId);
      const old = project[stage][item.sceneId];
      next[stage][item.sceneId] =
        old?.data === item.prompt && old.inputKey === key
          ? old
          : { ...approved(item.prompt), inputKey: key };
    }
  }
  if (payload.stage === "review")
    next.review = {
      ...approved(payload.data),
      inputKey: inputKey(project, "review"),
    };
  if (payload.stage === "final") {
    // Rebuild from approved state; never trust a submitted final draft body.
    content = ugcDraft(
      project.accountId,
      project.brief!.data,
      finalOutput(project),
    );
    content.studioProjectId = project.id;
    next.final = {
      contentId: content.id,
      inputKey: inputKey(project, "final"),
      createdAt: now(),
    };
  }
  const accepted = { ...proposal, status: "approved" as const };
  next = changed({
    ...next,
    proposals: project.proposals.map((p) => (p.id === id ? accepted : p)),
    history: [...project.history, accepted],
    messages: [
      ...project.messages,
      {
        id: uid(),
        agentId: proposal.agentId,
        role: "assistant" as const,
        text: `${stageNames[payload.stage]} disetujui.${content ? " Draft final ditambahkan ke Content library; belum dipublikasikan." : " Konteks bersama diperbarui."}`,
        createdAt: now(),
      },
    ],
  });
  return { project: next, content };
}
export function rejectProposal(
  project: StudioProject,
  id: string,
): StudioProject {
  const proposal = project.proposals.find((p) => p.id === id);
  if (!proposal || proposal.status !== "pending")
    throw new StudioConflict("Hasil sudah diproses.");
  return changed({
    ...project,
    proposals: project.proposals.map((p) =>
      p.id === id ? { ...p, status: "rejected" } : p,
    ),
  });
}
export function approvedContext(project: StudioProject) {
  const currentStory =
    project.story?.briefId === project.brief?.id
      ? project.story?.data
      : undefined;
  return {
    project: project.name,
    brief: project.brief?.data,
    story: currentStory,
    images: Object.fromEntries(
      Object.entries(project.images)
        .filter(([id]) => promptCurrent(project, "images", id))
        .map(([id, p]) => [id, p.data]),
    ),
    videos: Object.fromEntries(
      Object.entries(project.videos)
        .filter(([id]) => promptCurrent(project, "videos", id))
        .map(([id, p]) => [id, p.data]),
    ),
    review:
      project.review &&
      (() => {
        try {
          return project.review.inputKey === inputKey(project, "review");
        } catch {
          return false;
        }
      })()
        ? project.review.data
        : undefined,
  };
}
export function demoStudioTurn(
  project: StudioProject,
  runId: string,
  text: string,
): StudioProject {
  const run = project.run!;
  const action = run.action;
  if (action === "chat")
    return finishTurn(
      project,
      runId,
      `Contoh percakapan demo. Saya mencatat: “${text.slice(0, 500)}”. Kita dapat mendiskusikan ide atau memakai tombol tindakan di bawah. Tahap berikutnya: ${stageNames[nextStage(project)]}. Hasil akan saya tampilkan dahulu untuk persetujuan Anda.`,
      undefined,
      nextStage(project),
    );
  if (action === "brief")
    return finishTurn(
      project,
      runId,
      "Berikut pratinjau brief. Periksa karakter, produk dan durasinya sebelum menyetujui.",
      { stage: "brief", data: project.briefDraft },
    );
  if (action === "final")
    return finishTurn(
      project,
      runId,
      "Seluruh tahap sudah disetujui. Periksa naskah final sebelum menambahkannya ke Content library.",
      { stage: "final", data: finalOutput(project) },
    );
  if (action === "story") {
    const sample = demoUGCDraft(project.accountId, project.brief!.data);
    const { scenes, brief: _brief, ...rest } = sample.ugc!;
    const data: StudioStory = {
      ...rest,
      title: sample.title,
      caption: sample.caption,
      scenes: scenes.map((s, i) => ({
        id: `s${i + 1}`,
        title: s.title,
        narration: s.narration,
        description: s.textToImage.slice(0, 1200),
      })),
    };
    if (/revisi|ubah|ganti/i.test(text)) {
      const old = project.story?.data;
      if (old) {
        data.title = old.title;
        data.caption = old.caption;
        data.hook = old.hook;
        data.synopsis = old.synopsis;
        data.characterLock = old.characterLock;
        data.negativePrompt = old.negativePrompt;
        data.scenes = old.scenes.map((s) =>
          !run.sceneId || s.id === run.sceneId
            ? {
                ...s,
                narration: `Revisi demo: ${text.slice(0, 180)}`,
                description: `${s.description.slice(0, 850)} Revision direction: ${text.slice(0, 200)}`,
              }
            : s,
        );
      }
    }
    return finishTurn(
      project,
      runId,
      "Contoh cerita demo siap ditinjau. Ini template, bukan hasil model AI.",
      { stage: "story", data },
    );
  }
  if (action === "review")
    return finishTurn(
      project,
      runId,
      "Contoh review demo. Tetap periksa kembali klaim, durasi narasi dan hasil media Anda.",
      {
        stage: "review",
        data: {
          summary:
            "Seluruh adegan memiliki cerita, prompt gambar dan prompt video yang telah disetujui. Review ulang kualitas hasil render di tool produksi sebelum publish.",
          issues: [
            "Pastikan narasi muat dalam durasi setiap adegan.",
            "Cocokkan wajah, pakaian dan produk pada hasil gambar/video.",
          ],
        },
      },
    );
  const story = requireStory(project).data;
  return finishTurn(
    project,
    runId,
    `Contoh ${stageNames[action]} siap. Periksa setiap adegan sebelum menyetujui.`,
    {
      stage: action,
      data: {
        prompts: story.scenes
          .filter((s) => !run.sceneId || s.id === run.sceneId)
          .map((s) => ({
            sceneId: s.id,
            prompt:
              action === "images"
                ? `Photorealistic UGC still, vertical 9:16. ${story.characterLock.slice(0, 450)}. ${s.description.slice(0, 700)} Natural window light, smartphone framing. Avoid: ${story.negativePrompt.slice(0, 300)}.`
                : `Use the approved scene image as the first frame, ${project.brief!.data.sceneDuration} seconds, vertical 9:16. Preserve identity, outfit and product. Subtle handheld push-in, natural blink and one gentle action. Scene: ${s.title}. ${text.slice(0, 200)} Avoid morphing, flicker and added objects.`,
          })),
      },
    },
  );
}
