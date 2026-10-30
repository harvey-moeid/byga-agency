import type { AIProvider } from "./aiProviders";
import type { UGCStory } from "./ugc";

export type Room =
  "research" | "content" | "schedule" | "publish" | "analytics";
export type Status =
  | "draft"
  | "review"
  | "approved"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed";
export interface Account {
  id: string;
  name: string;
  handle: string;
  color: string;
  connected: boolean;
  nickname?: string;
  scopes?: string[];
}
export interface Content {
  id: string;
  revision?: number;
  accountId: string;
  title: string;
  caption: string;
  prompt: string;
  status: Status;
  createdAt: string;
  scheduledAt?: string;
  fileId?: string;
  views: number;
  likes: number;
  error?: string;
  publishOptions?: PublishOptions;
  platformVideoId?: string;
  approvedCreatorId?: string;
  publishedAt?: string;
  analyticsSyncedAt?: string;
  researchIds?: string[];
  ugc?: UGCStory;
  studioProjectId?: string;
  creative?: import("./creative").CreativeProject;
}
export interface Competitor {
  id: string;
  handle: string;
  category: string;
  last_checked?: string;
  last_error?: string;
}
export interface Asset {
  id: string;
  name: string;
  size: number;
  type: string;
  createdAt: string;
  media?: { duration: number; width: number; height: number };
}
export interface Activity {
  id: string;
  room: Room;
  message: string;
  time: string;
}
export interface Settings {
  provider: AIProvider;
  model: string;
  retentionMonths: number;
  automaticDrafts: boolean;
  notification: "none" | "discord" | "telegram";
  configured?: string[];
  researchEnabled?: boolean;
  webTrendsEnabled?: boolean;
  automaticRecommendations?: boolean;
  timezone?: string;
  avatarAssetId?: string;
}
export interface Workspace {
  accounts: Account[];
  contents: Content[];
  competitors: Competitor[];
  assets: Asset[];
  activity: Activity[];
  settings: Settings;
  publishJobs?: PublishJob[];
  trends?: Trend[];
  researchVideos?: ResearchVideo[];
  recommendations?: Recommendation[];
  analyticsHistory?: AnalyticsPoint[];
}
export const rooms: {
  id: Room;
  name: string;
  agent: string;
  role: string;
  color: string;
}[] = [
  {
    id: "research",
    name: "Ruang Riset",
    agent: "Aria",
    role: "Research analyst",
    color: "#d9a25d",
  },
  {
    id: "content",
    name: "Ruang Konten",
    agent: "Nova",
    role: "Content creator",
    color: "#a491c7",
  },
  {
    id: "schedule",
    name: "Ruang Jadwal",
    agent: "Kai",
    role: "Schedule planner",
    color: "#7daca1",
  },
  {
    id: "publish",
    name: "Ruang Publish",
    agent: "Leo",
    role: "Publishing manager",
    color: "#de987b",
  },
  {
    id: "analytics",
    name: "Ruang Analytics",
    agent: "Iris",
    role: "Performance analyst",
    color: "#83a5c1",
  },
];
export const statusNames: Record<Status, string> = {
  draft: "Draft",
  review: "Menunggu review",
  approved: "Disetujui",
  scheduled: "Terjadwal",
  published: "Dipublikasikan",
  publishing: "Memproses publish",
  failed: "Gagal",
};
export function approve(content: Content): Content {
  if (content.status !== "review")
    throw new Error("Hanya konten menunggu review yang dapat disetujui.");
  if (!content.fileId)
    throw new Error("Upload video sebelum menyetujui konten.");
  return { ...content, status: "approved", error: undefined };
}
export function schedule(
  content: Content,
  date: string,
  now = Date.now(),
): Content {
  if (!["approved", "scheduled"].includes(content.status))
    throw new Error("Konten harus disetujui sebelum dijadwalkan.");
  if (!content.fileId) throw new Error("Video belum tersedia.");
  if (!Number.isFinite(Date.parse(date)) || Date.parse(date) <= now)
    throw new Error("Pilih waktu di masa depan.");
  return {
    ...content,
    status: "scheduled",
    scheduledAt: new Date(date).toISOString(),
    error: undefined,
  };
}
export function demoDraft(brief: string, accountId: string): Content {
  const title = brief.trim();
  if (title.length < 5) throw new Error("Brief minimal 5 karakter.");
  return {
    id: crypto.randomUUID(),
    accountId,
    title,
    caption: `Pernah kepikiran ${title.toLowerCase()}? 👀\nIni 3 hal yang wajib kamu tahu. Simpan dulu, coba nanti!\n\n#TipsHarian #BelajarBareng #TikTokIndonesia`,
    prompt: `Video vertikal 9:16, durasi 20–30 detik. Topik: ${title}. Buka dengan close-up dan hook 3 detik. Tampilkan 3 poin dengan b-roll natural, cahaya hangat, gerakan kamera halus. Tambahkan teks singkat yang mudah dibaca. Akhiri dengan ajakan menyimpan video.`,
    status: "draft",
    createdAt: new Date().toISOString(),
    views: 0,
    likes: 0,
  };
}
export function makeDemo(): Workspace {
  const now = new Date();
  const future = (hours: number) =>
    new Date(now.getTime() + hours * 3600000).toISOString();
  const accounts: Account[] = [
    {
      id: "a1",
      name: "Byga Studio",
      handle: "@bygastudio",
      color: "#809e79",
      connected: false,
    },
    {
      id: "a2",
      name: "Muid Daily",
      handle: "@muiddaily",
      color: "#b393cb",
      connected: false,
    },
    {
      id: "a3",
      name: "Kopi & Cerita",
      handle: "@kopidancerita",
      color: "#ca9e72",
      connected: false,
    },
  ];
  const contents: Content[] = [
    ["c1", "a1", "3 tools AI yang bikin kerja lebih ringan", "review"],
    ["c2", "a2", "A little reset for your busy day", "scheduled"],
    ["c3", "a3", "Cerita di balik secangkir kopi", "scheduled"],
    ["c4", "a1", "Your next creative breakthrough", "published"],
    ["c5", "a2", "5 kebiasaan kecil, dampak besar", "published"],
    ["c6", "a3", "Morning coffee ritual", "published"],
  ].map(([id, accountId, title, status], i) => ({
    ...demoDraft(title, accountId),
    id,
    status: status as Status,
    fileId: i > 0 ? "sample-video" : undefined,
    scheduledAt: status === "scheduled" ? future(i * 2) : undefined,
    views: i >= 3 ? [12480, 8920, 6240][i - 3] : 0,
    likes: i >= 3 ? [842, 615, 390][i - 3] : 0,
  }));
  return {
    accounts,
    contents,
    assets: [],
    competitors: [
      { id: "r1", handle: "@creativehabits", category: "Creative & lifestyle" },
      { id: "r2", handle: "@dailywithai", category: "Technology" },
    ],
    activity: [
      {
        id: "l1",
        room: "content",
        message: "Nova menyiapkan draft baru untuk Byga Studio",
        time: now.toISOString(),
      },
      {
        id: "l2",
        room: "schedule",
        message: "Kai menyusun 2 konten di kalender",
        time: new Date(now.getTime() - 120000).toISOString(),
      },
      {
        id: "l3",
        room: "research",
        message: "Aria menemukan inspirasi baru untuk tim",
        time: new Date(now.getTime() - 480000).toISOString(),
      },
    ],
    settings: {
      provider: "openrouter",
      model: "openai/gpt-4o-mini",
      retentionMonths: 3,
      automaticDrafts: false,
      notification: "none",
    },
  };
}

export function revise(content: Content): Content {
  if (!["approved", "scheduled", "failed"].includes(content.status))
    throw new Error("Konten tidak dapat dikembalikan ke draft.");
  return {
    ...content,
    status: "draft",
    scheduledAt: undefined,
    publishOptions: undefined,
    approvedCreatorId: undefined,
    error: undefined,
  };
}

export interface PublishOptions {
  creatorId?: string;
  privacyLevel: string;
  disableComment: boolean;
  disableDuet: boolean;
  disableStitch: boolean;
  brandContent: boolean;
  brandOrganic: boolean;
  isAigc: boolean;
  rightsConfirmed: boolean;
  musicConfirmed: boolean;
  publishConsent: boolean;
}
export interface CreatorInfo {
  creatorId?: string;
  creator_avatar_url?: string;
  creator_username?: string;
  creator_nickname: string;
  privacy_level_options: string[];
  comment_disabled: boolean;
  duet_disabled: boolean;
  stitch_disabled: boolean;
  max_video_post_duration_sec: number;
}
export interface PublishJob {
  id: string;
  content_id: string;
  account_id: string;
  status: string;
  attempts: number;
  next_at: number;
  publish_id?: string;
  last_error?: string;
  updated_at: string;
}
export interface Trend {
  id: string;
  title: string;
  source: string;
  fetchedAt: string;
  traffic?: string;
  url?: string;
}
export interface ResearchVideo {
  id: string;
  competitorId: string;
  username: string;
  description: string;
  createdAt: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  hashtags: string[];
  fetchedAt: string;
}
export interface Recommendation {
  accountId: string;
  summary: string;
  bestHours: number[];
  ideas: string[];
  sampleSize: number;
  createdAt: string;
  source: "ai" | "historical";
}
export interface AnalyticsPoint {
  contentId: string;
  views: number;
  likes: number;
  recordedAt: string;
}
