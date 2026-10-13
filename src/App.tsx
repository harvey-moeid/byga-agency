import {
  lazy,
  Suspense,
  useState,
  useEffect,
  useRef,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  Search,
  Bell,
  ChevronDown,
  LayoutDashboard,
  Layers3,
  CalendarDays,
  Send,
  BarChart3,
  Folder,
  Settings as SettingsIcon,
  Compass,
  Check,
  Clock,
  MoreHorizontal,
  Maximize2,
  RotateCcw,
  MousePointer2,
  X,
  Upload,
  Trash2,
  Copy,
  LogOut,
  Eye,
  Heart,
  ShieldCheck,
  LoaderCircle,
  Sparkles,
  Menu,
  ExternalLink,
} from "lucide-react";
import {
  rooms,
  statusNames,
  makeDemo,
  demoDraft,
  approve,
  schedule,
  revise,
  type Workspace,
  type Content,
  type Room,
  type Activity,
} from "./domain";
import { saveVideo, getVideo, deleteVideo } from "./storage";
import { api, ApiError } from "./api";
import {
  PublishApproval,
  PublishQueue,
  ResearchResults,
  AnalyticsInsights,
} from "./IntegrationPanels";
import { videoMetadata } from "./media";
import { dateKey, dateInput, localToISO, optimalTime } from "./time";
import type { PublishOptions } from "./domain";
const Office = lazy(() => import("./Office"));
type Page =
  | "office"
  | "research"
  | "content"
  | "schedule"
  | "publish"
  | "analytics"
  | "files"
  | "settings";
const nav = [
  { id: "office", title: "Workspace", icon: LayoutDashboard },
  { id: "research", title: "Riset & inspirasi", icon: Compass },
  { id: "content", title: "Content library", icon: Layers3 },
  { id: "schedule", title: "Kalender", icon: CalendarDays },
  { id: "publish", title: "Publishing", icon: Send },
  { id: "analytics", title: "Analytics", icon: BarChart3 },
  { id: "files", title: "File manager", icon: Folder },
] as const;
const number = (n: number) =>
  Intl.NumberFormat("id-ID", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
function initial(): Workspace {
  try {
    const raw = localStorage.getItem("byga-workspace-v1");
    if (raw) {
      const data = JSON.parse(raw);
      if (
        Array.isArray(data.accounts) &&
        Array.isArray(data.contents) &&
        data.settings
      )
        return data;
    }
  } catch {}
  return makeDemo();
}
function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prior = document.activeElement as HTMLElement;
    const root = ref.current;
    root?.querySelector<HTMLElement>("input,button,select,textarea")?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const nodes = root?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),select,textarea,a[href]",
        );
        if (!nodes?.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      prior?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${wide ? "wide" : ""}`}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-head">
          <div>
            <span className="eyebrow">BYGA WORKSPACE</span>
            <h2>{title}</h2>
          </div>
          <button className="icon-button" aria-label="Tutup" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function VideoPreview({ id, live }: { id?: string; live: boolean }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let alive = true,
      objectUrl: string | undefined;
    setUrl(undefined);
    if (id && id !== "sample-video") {
      if (live) setUrl("/api/files/" + id);
      else
        getVideo(id)
          .then((blob) => {
            if (blob && alive) {
              objectUrl = URL.createObjectURL(blob);
              setUrl(objectUrl);
            }
          })
          .catch(() => {});
    }
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, live]);
  return url ? (
    <video className="video-preview" controls src={url} preload="metadata" />
  ) : (
    <div className="video-placeholder">
      <Upload size={28} />
      <span>
        {id === "sample-video"
          ? "Video contoh tidak disertakan"
          : "Belum ada video"}
      </span>
      <small>Upload file asli untuk review</small>
    </div>
  );
}
export default function App() {
  const [live, setLive] = useState(
    new URLSearchParams(location.search).get("mode") === "live",
  );
  const [loggedIn, setLoggedIn] = useState(false);
  const [loginPassword, setLoginPassword] = useState("");
  const [workspace, setWorkspace] = useState<Workspace>(initial);
  const [page, setPage] = useState<Page>("office");
  const [selected, setSelected] = useState<Room | null>(null);
  const [focus, setFocus] = useState(false);
  const [reset, setReset] = useState(0);
  const [modal, setModal] = useState<
    "generate" | "account" | "agent" | "notifications" | null
  >(null);
  const [detail, setDetail] = useState<Content | null>(null);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const workspaceRequest = useRef(0);
  const [search, setSearch] = useState("");
  const [menu, setMenu] = useState(false);
  const [filter, setFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [draftAccount, setDraftAccount] = useState(
    workspace.accounts[0]?.id || "",
  );
  const [brief, setBrief] = useState("");
  const [scheduleDate, setScheduleDate] = useState("");
  const [publishOptions, setPublishOptions] = useState<PublishOptions>();
  const [researchIds, setResearchIds] = useState<string[]>([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [avatarUrl, setAvatarUrl] = useState<string>();
  const timezone = workspace.settings.timezone || "Asia/Jakarta";
  const stamp = (date: string) =>
    new Date(date).toLocaleString("id-ID", {
      timeZone: timezone,
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  const [editCaption, setEditCaption] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [competitor, setCompetitor] = useState("");
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [formSettings, setFormSettings] = useState(workspace.settings);
  useEffect(() => {
    if (!live)
      try {
        localStorage.setItem("byga-workspace-v1", JSON.stringify(workspace));
      } catch {
        setToast(
          "Penyimpanan browser penuh. Perubahan hanya tersimpan selama sesi ini.",
        );
      }
  }, [workspace, live]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    let alive = true;
    const requestId = ++workspaceRequest.current;
    if (live)
      api<Workspace>("/workspace")
        .then((data) => {
          if (!alive || requestId !== workspaceRequest.current) return;
          setWorkspace(data);
          setFormSettings(data.settings);
          setLoggedIn(true);
        })
        .catch((error) => {
          if (!alive || requestId !== workspaceRequest.current) return;
          setLoggedIn(false);
          if (!(error instanceof ApiError && error.status === 401))
            setToast(error.message);
        });
    return () => {
      alive = false;
    };
  }, [live]);
  useEffect(() => {
    if (detail) {
      setEditCaption(detail.caption);
      setEditPrompt(detail.prompt);
      setScheduleDate(
        detail.scheduledAt ? dateInput(detail.scheduledAt, timezone) : "",
      );
    }
  }, [detail?.id, detail?.status]);
  const account = (id: string) => workspace.accounts.find((a) => a.id === id);
  const pending = workspace.contents.filter(
    (c) => c.status === "review",
  ).length;
  const scheduled = workspace.contents.filter((c) => c.status === "scheduled");
  const views = workspace.contents.reduce((sum, c) => sum + c.views, 0),
    likes = workspace.contents.reduce((sum, c) => sum + c.likes, 0);
  const log = (room: Room, message: string) =>
    ({
      id: crypto.randomUUID(),
      room,
      message,
      time: new Date().toISOString(),
    }) as Activity;
  const updateContent = (
    item: Content,
    message: string,
    room: Room = "content",
  ) => {
    setWorkspace((w) => ({
      ...w,
      contents: w.contents.map((c) => (c.id === item.id ? item : c)),
      activity: [log(room, message), ...w.activity].slice(0, 100),
    }));
    setDetail(item);
  };
  async function task(fn: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    workspaceRequest.current++;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setLoggedIn(false);
      setToast(e instanceof Error ? e.message : "Terjadi kesalahan.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function refresh() {
    const requestId = ++workspaceRequest.current;
    const data = await api<Workspace>("/workspace");
    if (requestId === workspaceRequest.current) setWorkspace(data);
    return data as Workspace;
  }
  async function generate(e: FormEvent) {
    e.preventDefault();
    await task(async () => {
      if (!draftAccount) throw new Error("Tambahkan akun terlebih dahulu.");
      if (live) {
        const item = await api<Content>("/contents/generate", {
          brief,
          accountId: draftAccount,
          researchIds,
        });
        await refresh();
        setDetail(item);
      } else {
        const item = demoDraft(brief, draftAccount);
        setWorkspace((w) => ({
          ...w,
          contents: [item, ...w.contents],
          activity: [
            log("content", "Nova menyiapkan draft demo baru"),
            ...w.activity,
          ],
        }));
        setDetail(item);
      }
      setModal(null);
      setBrief("");
      setResearchIds([]);
      setToast(
        live
          ? "Draft berhasil dibuat."
          : "Draft simulasi dibuat. Teks ini belum berasal dari model AI.",
      );
    });
  }
  async function transition(
    item: Content,
    action: "approve" | "schedule" | "review" | "publish" | "revise",
    fileId?: string,
  ) {
    await task(async () => {
      if (
        (action === "approve" || action === "review") &&
        detail?.id === item.id &&
        (editCaption !== item.caption || editPrompt !== item.prompt)
      )
        throw new Error(
          "Simpan edit caption dan prompt sebelum melanjutkan review atau approval.",
        );
      if (live) {
        const next = await api<Content>(`/contents/${item.id}/transition`, {
          action,
          date: scheduleDate ? localToISO(scheduleDate, timezone) : undefined,
          publishOptions: action === "approve" ? publishOptions : undefined,
          fileId,
          expectedRevision: item.revision || 0,
        });
        await refresh();
        setDetail(next);
      } else {
        if (action === "publish")
          throw new Error(
            "Mode demo tidak mengirim konten ke TikTok. Gunakan backend live setelah menghubungkan akun.",
          );
        const next =
          action === "revise"
            ? revise(item)
            : action === "approve"
              ? approve(item)
              : action === "schedule"
                ? schedule(item, localToISO(scheduleDate, timezone))
                : { ...item, fileId, status: "review" as const };
        updateContent(
          next,
          `${item.title}: ${statusNames[next.status]}`,
          action === "schedule" ? "schedule" : "content",
        );
      }
      setToast("Perubahan tersimpan.");
    });
  }
  async function upload(file: File, item?: Content) {
    await task(async () => {
      if (
        item &&
        detail?.id === item.id &&
        (editCaption !== item.caption || editPrompt !== item.prompt)
      )
        throw new Error(
          "Simpan edit caption dan prompt sebelum mengirim video untuk review.",
        );
      if (file.size > 50 * 1024 * 1024) throw new Error("Maksimal 50 MB.");
      const header = new Uint8Array(await file.slice(0, 20).arrayBuffer());
      const glb = new TextDecoder().decode(header.slice(0, 4)) === "glTF";
      if (glb && item)
        throw new Error("Konten TikTok memerlukan video, bukan GLB.");
      if (glb && file.size > 10 * 1024 * 1024)
        throw new Error("GLB maksimal 10 MB.");
      if (
        !glb &&
        new TextDecoder().decode(header.slice(4, 8)) !== "ftyp" &&
        !(
          header[0] === 0x1a &&
          header[1] === 0x45 &&
          header[2] === 0xdf &&
          header[3] === 0xa3
        )
      )
        throw new Error("Format file tidak valid.");
      if (glb) {
        if (file.size < 20) throw new Error("GLB tidak valid.");
        const data = new DataView(await file.arrayBuffer());
        if (
          data.getUint32(4, true) !== 2 ||
          data.getUint32(8, true) !== file.size ||
          data.getUint32(16, true) !== 0x4e4f534a
        )
          throw new Error("GLB tidak valid.");
        const json = JSON.parse(
          new TextDecoder().decode(
            data.buffer.slice(20, 20 + data.getUint32(12, true)),
          ),
        );
        if (
          [...(json.buffers || []), ...(json.images || [])].some(
            (x: { uri?: string }) => x.uri && !x.uri.startsWith("data:"),
          )
        )
          throw new Error("Gunakan GLB dengan aset embedded.");
      }
      const media = glb ? undefined : await videoMetadata(file);
      let id: string;
      if (live) {
        const data = new FormData();
        data.append("file", file);
        if (media) data.append("media", JSON.stringify(media));
        id = (await api<{ id: string }>("/files", data)).id;
        await refresh();
        if (item) {
          const next = await api<Content>(`/contents/${item.id}/transition`, {
            action: "review",
            fileId: id,
            expectedRevision: item.revision || 0,
          });
          await refresh();
          setDetail(next);
        }
      } else {
        id = crypto.randomUUID();
        await saveVideo(id, file);
        const asset = {
          id,
          name: file.name,
          type: glb ? "model/gltf-binary" : file.type,
          media,
          size: file.size,
          createdAt: new Date().toISOString(),
        };
        setWorkspace((w) => ({
          ...w,
          assets: [asset, ...w.assets],
          contents: item
            ? w.contents.map((c) =>
                c.id === item.id ? { ...c, fileId: id, status: "review" } : c,
              )
            : w.contents,
          activity: [
            log("content", `${file.name} siap di-review`),
            ...w.activity,
          ],
        }));
        if (item) setDetail({ ...item, fileId: id, status: "review" });
      }
      setToast(
        glb
          ? "Aset GLB tersimpan. Pilih sebagai avatar di Settings."
          : "Video tersimpan dan siap di-review.",
      );
    });
  }
  useEffect(() => {
    setPublishOptions(undefined);
  }, [detail?.id, detail?.status, detail?.revision]);
  useEffect(() => {
    if (!live || !loggedIn) return;
    let alive = true,
      refreshing = false;
    const timer = setInterval(() => {
      if (
        document.visibilityState !== "visible" ||
        refreshing ||
        busyRef.current
      )
        return;
      refreshing = true;
      const requestId = ++workspaceRequest.current;
      api<Workspace>("/workspace")
        .then((data) => {
          if (!alive || requestId !== workspaceRequest.current) return;
          setWorkspace(data);
          setDetail((d) => {
            const next = d && data.contents.find((x) => x.id === d.id);
            return next && next.status !== d?.status ? next : d;
          });
        })
        .catch((error) => {
          if (
            alive &&
            requestId === workspaceRequest.current &&
            error instanceof ApiError &&
            error.status === 401
          ) {
            setLoggedIn(false);
            setToast("Sesi kedaluwarsa. Masuk kembali untuk melanjutkan.");
          }
        })
        .finally(() => {
          refreshing = false;
        });
    }, 15000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [live, loggedIn]);
  useEffect(() => {
    const id = workspace.settings.avatarAssetId;
    let alive = true,
      url: string | undefined;
    setAvatarUrl(undefined);
    if (id) {
      if (live) setAvatarUrl("/api/files/" + id);
      else
        getVideo(id)
          .then((blob) => {
            if (blob && alive) {
              url = URL.createObjectURL(blob);
              setAvatarUrl(url);
            }
          })
          .catch(() => {});
    }
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [workspace.settings.avatarAssetId, live]);
  async function dropSchedule(id: string, date: string) {
    await task(async () => {
      const item = workspace.contents.find((c) => c.id === id);
      if (!item) throw new Error("Konten tidak ditemukan.");
      const hours = item.scheduledAt
        ? dateInput(item.scheduledAt, timezone).slice(11)
        : "18:00";
      const next = schedule(item, localToISO(date + "T" + hours, timezone));
      if (live) {
        await api("/contents/" + id + "/transition", {
          action: "schedule",
          date: next.scheduledAt,
          expectedRevision: item.revision || 0,
        });
        await refresh();
      } else
        setWorkspace((w) => ({
          ...w,
          contents: w.contents.map((c) => (c.id === id ? next : c)),
          activity: [
            log("schedule", item.title + ": jadwal diubah lewat kalender"),
            ...w.activity,
          ],
        }));
      setToast("Jadwal diperbarui.");
    });
  }
  const useResearch = (id: string, title: string) => {
    setBrief(title);
    setResearchIds([id]);
    setDraftAccount(workspace.accounts[0]?.id || "");
    setModal("generate");
  };
  const integrations = { workspace, live, run: task, refresh, toast: setToast };
  const navigate = (target: Page) => {
    setPage(target);
    setSelected(
      target === "office"
        ? null
        : rooms.find((r) => r.id === target)?.id || null,
    );
    setMenu(false);
    setSearch("");
  };
  const pickRoom = (room: Room) => {
    setSelected(room);
  };
  const showDetail = (item: Content) => setDetail(item);
  const visibleContents = workspace.contents.filter(
    (c) =>
      (filter === "all" || c.status === filter) &&
      (accountFilter === "all" || c.accountId === accountFilter) &&
      (c.title + " " + c.caption).toLowerCase().includes(search.toLowerCase()),
  );
  const previewItems = workspace.contents
    .filter((c) => ["review", "draft", "approved"].includes(c.status))
    .slice(0, 3);
  const cards = (items: Content[]) =>
    items.length ? (
      <div className="content-grid">
        {items.map((c, i) => (
          <button
            key={c.id}
            className="content-card"
            onClick={() => showDetail(c)}
          >
            <div className={`content-art art-${i % 4}`}>
              <span className="art-tiny">
                {account(c.accountId)?.name || "TikTok"}
              </span>
              <span className="art-title">{c.title}</span>
              <span className="art-foot">
                9:16 <span>↗</span> SHORT FORM
              </span>
              <span className={`badge status-${c.status}`}>
                {statusNames[c.status]}
              </span>
            </div>
            <div className="content-card-info">
              <strong>{c.title}</strong>
              <span>
                <i style={{ background: account(c.accountId)?.color }} />
                {account(c.accountId)?.handle}
                <ArrowUpRight size={16} />
              </span>
            </div>
          </button>
        ))}
      </div>
    ) : (
      <Empty
        title="Belum ada konten"
        text="Mulai dari sebuah ide. Nova akan membantu menyiapkan caption dan prompt video."
        action={() => setModal("generate")}
        label="Buat konten"
      />
    );
  const contentPage = (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">CREATE SOMETHING GOOD</span>
          <h1>
            Content library<span>.</span>
          </h1>
          <p>Dari ide pertama sampai siap tampil di TikTok.</p>
        </div>
        <button
          className="button primary"
          onClick={() => {
            setDraftAccount(workspace.accounts[0]?.id || "");
            setModal("generate");
          }}
        >
          <Plus size={17} />
          Buat konten
        </button>
      </div>
      <div className="filter-row">
        <div className="tabs">
          {[
            ["all", "Semua"],
            ["draft", "Draft"],
            ["review", "Review"],
            ["approved", "Disetujui"],
            ["scheduled", "Terjadwal"],
          ].map(([id, label]) => (
            <button
              className={filter === id ? "active" : ""}
              key={id}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          aria-label="Filter akun"
          value={accountFilter}
          onChange={(e) => setAccountFilter(e.target.value)}
        >
          <option value="all">Semua akun</option>
          {workspace.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      {cards(visibleContents)}
    </>
  );
  if (live && !loggedIn)
    return (
      <div className="login-page">
        <div className="login-brand">
          <Logo />
          <span>
            byga<span className="logo-dot">.</span>
          </span>
        </div>
        <form
          className="login-card"
          onSubmit={(e) => {
            e.preventDefault();
            task(async () => {
              await api("/login", { password: loginPassword });
              const data = await refresh();
              setFormSettings(data.settings);
              setLoggedIn(true);
              setLoginPassword("");
            });
          }}
        >
          <span className="eyebrow">YOUR CREATIVE HEADQUARTERS</span>
          <h1>Selamat datang kembali.</h1>
          <p>Masuk ke kantor AI pribadi Anda.</p>
          <label>
            Password dashboard
            <input
              required
              autoFocus
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <button className="button primary" disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <ArrowRight size={18} />
            )}
            Masuk workspace
          </button>
          <button
            type="button"
            disabled={busy}
            className="text-button"
            onClick={() => {
              setWorkspace(initial());
              setFormSettings(initial().settings);
              setLive(false);
              setLoggedIn(false);
              setKeys({});
              setDetail(null);
              history.replaceState(null, "", location.pathname);
            }}
          >
            Jelajahi mode demo
          </button>
          <p className="muted small">
            Live memerlukan backend Cloudflare dan Worker secrets.
          </p>
        </form>
        {toast && (
          <div role="alert" className="toast">
            {toast}
          </div>
        )}
      </div>
    );
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menu ? "mobile-open" : ""}`}>
        <button
          className="brand"
          onClick={() => navigate("office")}
          aria-label="Beranda Byga"
        >
          <Logo />
          <span>
            byga<span className="logo-dot">.</span>
          </span>
        </button>
        <div className="workspace-switch">
          <span className="workspace-avatar">B</span>
          <div>
            <strong>Byga Agency</strong>
            <small>Personal workspace</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          {nav.map(({ id, title, icon: Icon }) => (
            <button
              key={id}
              onClick={() => navigate(id)}
              className={`nav-item ${page === id ? "active" : ""}`}
            >
              <Icon size={18} />
              <span>{title}</span>
              {id === "content" && pending > 0 && (
                <span className="nav-count">{pending}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="agent-note">
            <div>
              <span className="live-dot" />
              Your team is here
            </div>
            <p>Lima agen. Satu ruang untuk ide-ide besar Anda.</p>
            <button
              onClick={() => {
                setSelected("content");
                setModal("agent");
              }}
            >
              Kenali tim Anda <ArrowUpRight size={14} />
            </button>
          </div>
          <button
            className={`nav-item ${page === "settings" ? "active" : ""}`}
            onClick={() => navigate("settings")}
          >
            <SettingsIcon size={18} />
            <span>Settings</span>
          </button>
          <button className="profile" onClick={() => navigate("settings")}>
            <span className="profile-avatar">M</span>
            <div>
              <strong>Workspace owner</strong>
              <small>{live ? "Cloud workspace" : "Demo workspace"}</small>
            </div>
            <MoreHorizontal size={17} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="mobile-toggle icon-button"
              aria-label="Buka navigasi"
              onClick={() => setMenu(!menu)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <span>/</span>
            <strong>
              {nav.find((n) => n.id === page)?.title || "Settings"}
            </strong>
          </div>
          <div className="top-actions">
            <label className="search">
              <Search size={16} />
              <input
                placeholder="Cari konten…"
                aria-label="Cari konten"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  if (e.target.value) setPage("content");
                }}
              />
              <kbd>⌕</kbd>
            </label>
            <span className={`mode-pill ${live ? "live" : ""}`}>
              <span />
              {live ? "Live" : "Demo"}
            </span>
            <button
              className="icon-button notification-bell"
              aria-label="Notifikasi"
              onClick={() => setModal("notifications")}
            >
              <Bell size={19} />
              {pending > 0 && <i />}
            </button>
          </div>
        </header>
        <main>
          <div className="demo-banner">
            <span>
              <ShieldCheck size={14} />
              {live
                ? "Workspace live · publish hanya berjalan dengan koneksi akun dan final approval"
                : "Mode demo · data, agen, dan metrik merupakan simulasi. Video tersimpan di browser."}
            </span>
            <button onClick={() => navigate("settings")}>
              {live ? "Konfigurasi" : "Hubungkan layanan"}
              <ArrowUpRight size={13} />
            </button>
          </div>
          {page === "office" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    <span className="live-dot" /> YOUR CREATIVE HEADQUARTERS
                  </span>
                  <h1>
                    Ide besar, tim yang siap<span>.</span>
                  </h1>
                  <p>
                    Selamat datang di kantor Anda. Mari buat sesuatu yang
                    berarti.
                  </p>
                </div>
                <button
                  className="button primary"
                  onClick={() => {
                    setDraftAccount(workspace.accounts[0]?.id || "");
                    setModal("generate");
                  }}
                >
                  <Plus size={17} />
                  Buat konten
                </button>
              </div>
              <div className="stats-grid">
                <Stat
                  label="Agen di workspace"
                  value="5"
                  suffix="agen"
                  icon={<Layers3 size={18} />}
                  foot="Seluruh ruang siap dieksplorasi"
                />
                <Stat
                  label="Menunggu approval"
                  value={String(pending)}
                  suffix="konten"
                  icon={<ShieldCheck size={18} />}
                  foot="Sentuhan terakhir dari Anda"
                  accent
                />
                <Stat
                  label="Konten terjadwal"
                  value={String(scheduled.length)}
                  suffix="post"
                  icon={<CalendarDays size={18} />}
                  foot={
                    scheduled[0]?.scheduledAt
                      ? `Berikutnya: ${stamp(scheduled[0].scheduledAt)}`
                      : "Belum ada jadwal"
                  }
                />
                <Stat
                  label="Total views"
                  value={number(views)}
                  icon={<Eye size={18} />}
                  foot={
                    live
                      ? "Data post tersimpan"
                      : "Metrik contoh · bukan data TikTok"
                  }
                />
              </div>
              <div className="office-layout">
                <section className="office-card">
                  <div className="section-head">
                    <div>
                      <h2>
                        Kantor AI Anda{" "}
                        <span className="soft-badge">3D WORKSPACE</span>
                      </h2>
                      <p>
                        Setiap ruang, satu langkah lebih dekat ke konten hebat.
                      </p>
                    </div>
                    <button
                      className={`follow-toggle ${focus ? "on" : ""}`}
                      onClick={() => setFocus(!focus)}
                    >
                      <span className="toggle-track">
                        <i />
                      </span>
                      Auto-focus
                    </button>
                  </div>
                  <div className="office-canvas">
                    <Suspense
                      fallback={
                        <div className="scene-loading">
                          <LoaderCircle className="spin" />
                          Menyiapkan kantor…
                        </div>
                      }
                    >
                      <Office
                        selected={selected}
                        onSelect={pickRoom}
                        onAgent={(room) => {
                          setSelected(room);
                          setModal("agent");
                        }}
                        focus={focus}
                        reset={reset}
                        activeRoom={workspace.activity[0]?.room || "content"}
                        avatarUrl={avatarUrl}
                        demo={!live}
                        visible={!modal && !detail}
                        metrics={workspace.accounts.map((a) =>
                          workspace.contents
                            .filter((c) => c.accountId === a.id)
                            .reduce((sum, c) => sum + c.views, 0),
                        )}
                      />
                    </Suspense>
                    <div className="scene-tag">
                      <span className="live-dot" /> TEAM WORKSPACE<span>•</span>
                      5 ruangan
                    </div>
                    {selected && (
                      <div className="room-popover">
                        <button
                          className="icon-button"
                          aria-label="Tutup detail ruangan"
                          onClick={() => setSelected(null)}
                        >
                          <X size={13} />
                        </button>
                        <span className="eyebrow">
                          {rooms.find((r) => r.id === selected)?.agent}
                        </span>
                        <h3>{rooms.find((r) => r.id === selected)?.name}</h3>
                        <p>
                          {rooms.find((r) => r.id === selected)?.role}
                          <br />
                          {selected === "content"
                            ? `${pending} konten menunggu review`
                            : selected === "schedule"
                              ? `${scheduled.length} konten terjadwal`
                              : "Lihat detail dan kontrol ruang kerja."}
                        </p>
                        <button
                          className="button primary"
                          onClick={() => navigate(selected)}
                        >
                          Buka ruang
                          <ArrowUpRight size={13} />
                        </button>
                      </div>
                    )}
                    <div className="scene-controls">
                      <button
                        aria-label="Reset kamera"
                        onClick={() => {
                          setSelected(null);
                          setFocus(false);
                          setReset((r) => r + 1);
                        }}
                      >
                        <RotateCcw size={17} />
                      </button>
                      <button
                        aria-label="Fokus seluruh kantor"
                        onClick={() => {
                          setSelected(null);
                          setFocus(false);
                          setReset((r) => r + 1);
                        }}
                      >
                        <Maximize2 size={17} />
                      </button>
                    </div>
                    <div className="scene-hint">
                      <MousePointer2 size={13} />
                      Klik ruangan untuk melihat detail<span>·</span>Drag untuk
                      orbit, scroll untuk zoom
                    </div>
                  </div>
                  <div className="room-legend">
                    {rooms.map((r) => (
                      <button key={r.id} onClick={() => pickRoom(r.id)}>
                        <span style={{ background: r.color }} />
                        {r.name.replace("Ruang ", "")}
                        <ArrowUpRight size={12} />
                      </button>
                    ))}
                  </div>
                </section>
                <section className="team-card">
                  <div className="section-head">
                    <h2>Meet your team</h2>
                    <span className="soft-badge">5 AGENTS</span>
                  </div>
                  <p className="team-intro">
                    Orkestrasi kreatif, dari awal sampai akhir.
                  </p>
                  <div className="team-list">
                    {rooms.map((r, i) => (
                      <button
                        className="team-member"
                        key={r.id}
                        onClick={() => {
                          setSelected(r.id);
                          setModal("agent");
                        }}
                      >
                        <span
                          className={`avatar avatar-${i}`}
                          style={{ background: r.color }}
                        >
                          <img
                            src={`/avatars/${r.agent.toLowerCase()}.png`}
                            alt=""
                            loading="lazy"
                          />
                        </span>
                        <div>
                          <strong>
                            {r.agent}
                            <small>
                              {live
                                ? "Visual"
                                : i === 1
                                  ? "Creating"
                                  : i === 0
                                    ? "Researching"
                                    : "Ready"}
                            </small>
                          </strong>
                          <span>{r.role}</span>
                        </div>
                        <ArrowUpRight size={15} />
                      </button>
                    ))}
                  </div>
                  <div className="team-footer">
                    <Sparkles size={16} />
                    <span>
                      {live
                        ? "Periksa log untuk aktivitas nyata."
                        : "Aktivitas tim disimulasikan di mode demo."}
                    </span>
                  </div>
                </section>
              </div>
              <div className="bottom-grid">
                <section className="queue-card">
                  <div className="section-head">
                    <div>
                      <h2>
                        Sedikit review, lalu siap melaju{" "}
                        <span className="count-bubble">{pending}</span>
                      </h2>
                      <p>Konten berikut menunggu langkah Anda.</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => navigate("content")}
                    >
                      Lihat semua
                      <ArrowRight size={15} />
                    </button>
                  </div>
                  {previewItems.length ? (
                    previewItems.map((c, i) => (
                      <button
                        key={c.id}
                        className="queue-item"
                        onClick={() => showDetail(c)}
                      >
                        <div className={`mini-art art-${i % 4}`}>
                          <Layers3 size={20} />
                        </div>
                        <div>
                          <strong>{c.title}</strong>
                          <span>
                            {account(c.accountId)?.handle} <span>·</span>{" "}
                            Caption + video prompt
                          </span>
                        </div>
                        <span className={`badge status-${c.status}`}>
                          {statusNames[c.status]}
                        </span>
                        <ArrowUpRight size={17} />
                      </button>
                    ))
                  ) : (
                    <p className="empty-inline">
                      Tidak ada konten menunggu review. Buat ide pertama Anda.
                    </p>
                  )}
                </section>
                <section className="activity-card">
                  <div className="section-head">
                    <h2>Aktivitas terbaru</h2>
                    <Clock size={17} />
                  </div>
                  {workspace.activity.slice(0, 3).map((a, i) => (
                    <div className="activity-item" key={a.id}>
                      <span className={`activity-icon tone-${i}`}>
                        <Check size={13} />
                      </span>
                      <div>
                        <p>{a.message}</p>
                        <small>{stamp(a.time)}</small>
                      </div>
                    </div>
                  ))}
                  {!workspace.activity.length && (
                    <p className="empty-inline">
                      Aktivitas baru akan muncul di sini.
                    </p>
                  )}
                  <button
                    className="text-button"
                    onClick={() => setModal("notifications")}
                  >
                    Lihat activity log
                    <ArrowRight size={14} />
                  </button>
                </section>
              </div>
              <section className="accounts-strip">
                <span>AKUN TIKTOK</span>
                {workspace.accounts.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      setAccountFilter(a.id);
                      navigate("content");
                    }}
                  >
                    <i style={{ background: a.color }} />
                    {a.handle}
                    <small>
                      {live && a.connected ? "Terhubung" : "Belum terhubung"}
                    </small>
                  </button>
                ))}
                <button
                  className="add-account"
                  onClick={() => setModal("account")}
                >
                  <Plus size={14} />
                  Tambah akun
                </button>
              </section>
            </>
          )}
          {page === "content" && contentPage}
          {page === "research" && (
            <>
              <ResearchResults {...integrations} onUse={useResearch} />
              <PageHeading
                eyebrow="A LITTLE CURIOSITY GOES A LONG WAY"
                title="Riset & inspirasi"
                text="Kumpulkan referensi yang tepat sebelum mulai berkarya."
              />
              <div className="notice">
                <Compass size={20} />
                <div>
                  <strong>
                    {live
                      ? "Sumber riset sesuai izin akun"
                      : "Papan inspirasi demo"}
                  </strong>
                  <p>
                    Tren dan performa kompetitor nyata membutuhkan API resmi.
                    Referensi di bawah adalah contoh, bukan hasil pengambilan
                    data TikTok.
                  </p>
                </div>
              </div>
              <div className="research-grid">
                {[
                  "Slow living, real stories",
                  "AI untuk rutinitas kreatif",
                  "Behind the scenes",
                ].map((topic, i) => (
                  <article className={`inspiration art-${i}`} key={topic}>
                    <span className="eyebrow">
                      INSPIRATION {String(i + 1).padStart(2, "0")}
                    </span>
                    <h2>{topic}</h2>
                    <p>
                      {
                        [
                          "Cerita sederhana yang terasa dekat.",
                          "Bantu audiens menemukan cara kerja baru.",
                          "Bawa audiens melihat proses di balik hasil.",
                        ][i]
                      }
                    </p>
                    <button
                      className="button light"
                      onClick={() => {
                        setBrief(topic);
                        setDraftAccount(workspace.accounts[0]?.id || "");
                        setModal("generate");
                      }}
                    >
                      Jadikan ide konten
                      <ArrowUpRight size={15} />
                    </button>
                  </article>
                ))}
              </div>
              <section className="panel">
                <div className="section-head">
                  <div>
                    <h2>Akun referensi</h2>
                    <p>
                      Daftar dinamis untuk integrasi riset di tahap berikutnya.
                    </p>
                  </div>
                  <span className="soft-badge">
                    {workspace.competitors.length} AKUN
                  </span>
                </div>
                <form
                  className="inline-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    task(async () => {
                      if (!/^@[A-Za-z0-9_.]{1,24}$/.test(competitor))
                        throw new Error("Gunakan format @username TikTok.");
                      if (live) {
                        await api("/competitors", {
                          handle: competitor,
                          category: "Inspirasi",
                        });
                        await refresh();
                      } else {
                        if (
                          workspace.competitors.some(
                            (c) => c.handle === competitor,
                          )
                        )
                          throw new Error("Akun sudah terdaftar.");
                        setWorkspace((w) => ({
                          ...w,
                          competitors: [
                            ...w.competitors,
                            {
                              id: crypto.randomUUID(),
                              handle: competitor,
                              category: "Inspirasi",
                            },
                          ],
                        }));
                      }
                      setCompetitor("");
                    });
                  }}
                >
                  <input
                    required
                    aria-label="Username kompetitor"
                    placeholder="@akunreferensi"
                    value={competitor}
                    onChange={(e) => setCompetitor(e.target.value)}
                  />
                  <button disabled={busy} className="button primary">
                    <Plus size={16} />
                    Tambah referensi
                  </button>
                </form>
                {workspace.competitors.map((c) => (
                  <div key={c.id} className="list-row">
                    <span className="account-symbol">@</span>
                    <div>
                      <strong>{c.handle}</strong>
                      <small>
                        {c.category} ·{" "}
                        {c.last_checked
                          ? `Diperiksa ${stamp(c.last_checked)}`
                          : "Menunggu pemeriksaan"}{" "}
                        {c.last_error && ` · ${c.last_error}`}
                      </small>
                    </div>
                    <button
                      className="icon-button"
                      aria-label={`Hapus ${c.handle}`}
                      onClick={() =>
                        task(async () => {
                          if (live) {
                            await api(
                              "/competitors/" + c.id,
                              undefined,
                              "DELETE",
                            );
                            await refresh();
                          } else
                            setWorkspace((w) => ({
                              ...w,
                              competitors: w.competitors.filter(
                                (x) => x.id !== c.id,
                              ),
                            }));
                        })
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </section>
            </>
          )}
          {page === "schedule" && (
            <>
              <PageHeading
                eyebrow="MAKE ROOM FOR YOUR NEXT IDEA"
                title="Kalender konten"
                text="Semua akun, satu ritme. Drag konten approved/terjadwal ke hari pilihan. Waktu memakai zona di Settings."
              />
              <div className="week-navigation">
                <button
                  className="button secondary"
                  onClick={() => setWeekOffset((w) => w - 1)}
                >
                  ← Minggu sebelumnya
                </button>
                <span>{timezone}</span>
                <button
                  className="button secondary"
                  onClick={() => setWeekOffset((w) => w + 1)}
                >
                  Minggu berikutnya →
                </button>
              </div>
              <div className="calendar-title">
                <CalendarDays size={22} />
                <h2>
                  {new Date().toLocaleDateString("id-ID", {
                    month: "long",
                    year: "numeric",
                  })}
                </h2>
                <span className="soft-badge">{scheduled.length} TERJADWAL</span>
              </div>
              <div className="calendar-strip">
                {Array.from({ length: 7 }, (_, i) => {
                  const d = new Date();
                  d.setDate(d.getDate() + i + weekOffset * 7);
                  const day = scheduled.filter(
                    (c) =>
                      c.scheduledAt &&
                      dateKey(c.scheduledAt, timezone) === dateKey(d, timezone),
                  );
                  return (
                    <div
                      key={i}
                      className={`calendar-day ${i === 0 && weekOffset === 0 ? "today" : ""}`}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const id = e.dataTransfer.getData("text/plain");
                        if (id) void dropSchedule(id, dateKey(d, timezone));
                      }}
                    >
                      <small>
                        {d.toLocaleDateString("id-ID", { weekday: "short" })}
                      </small>
                      <strong>
                        {new Intl.DateTimeFormat("id-ID", {
                          day: "numeric",
                          timeZone: timezone,
                        }).format(d)}
                      </strong>
                      {day.map((c) => (
                        <button
                          key={c.id}
                          draggable
                          onDragStart={(e) =>
                            e.dataTransfer.setData("text/plain", c.id)
                          }
                          style={{
                            borderLeftColor: account(c.accountId)?.color,
                          }}
                          onClick={() => showDetail(c)}
                        >
                          <small>{account(c.accountId)?.handle}</small>
                          <span>{c.title}</span>
                          <time>
                            {new Date(c.scheduledAt!).toLocaleTimeString(
                              "id-ID",
                              {
                                hour: "2-digit",
                                minute: "2-digit",
                                timeZone: timezone,
                              },
                            )}
                          </time>
                        </button>
                      ))}
                      {!day.length && (
                        <span className="calendar-empty">
                          Ruang untuk ide baru
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              {workspace.accounts.map((a) => (
                <section className="panel" key={a.id}>
                  <div className="section-head">
                    <h2>
                      <i
                        className="account-dot"
                        style={{ background: a.color }}
                      />
                      {a.name} <small>{a.handle}</small>
                    </h2>
                  </div>
                  {workspace.contents
                    .filter(
                      (c) =>
                        c.accountId === a.id &&
                        ["approved", "scheduled", "failed"].includes(c.status),
                    )
                    .map((c) => (
                      <button
                        className="schedule-row"
                        draggable={c.status !== "failed"}
                        onDragStart={(e) =>
                          e.dataTransfer.setData("text/plain", c.id)
                        }
                        key={c.id}
                        onClick={() => showDetail(c)}
                      >
                        <CalendarDays size={19} />
                        <div>
                          <strong>{c.title}</strong>
                          <small>
                            {c.scheduledAt
                              ? stamp(c.scheduledAt)
                              : "Pilih waktu posting"}
                          </small>
                        </div>
                        <span className={`badge status-${c.status}`}>
                          {statusNames[c.status]}
                        </span>
                        <ArrowRight size={16} />
                      </button>
                    ))}
                  {!workspace.contents.some(
                    (c) =>
                      c.accountId === a.id &&
                      ["approved", "scheduled", "failed"].includes(c.status),
                  ) && (
                    <p className="empty-inline">
                      Approve video untuk menambahkannya ke kalender.
                    </p>
                  )}
                </section>
              ))}
            </>
          )}
          {page === "publish" && (
            <>
              <PublishQueue {...integrations} />
              <PageHeading
                eyebrow="THE FINAL STEP, ALWAYS IN YOUR HANDS"
                title="Publishing"
                text="Tidak ada konten yang melaju tanpa persetujuan Anda."
              />
              <div className="notice">
                <ShieldCheck size={22} />
                <div>
                  <strong>Approval tetap di tangan Anda</strong>
                  <p>
                    Hubungkan akun TikTok dan lengkapi final approval sebelum
                    publish. Antrean live mengirim video melalui API resmi dan
                    menunggu konfirmasi TikTok; credential yang belum lengkap
                    memblokir pekerjaan. Demo tidak mengirim post.
                  </p>
                </div>
              </div>
              <div className="filter-row">
                <h2>Antrean per akun</h2>
                <span className="soft-badge">APPROVAL REQUIRED</span>
              </div>
              {workspace.accounts.map((a) => (
                <section className="panel" key={a.id}>
                  <h2>
                    <i
                      className="account-dot"
                      style={{ background: a.color }}
                    />
                    {a.name}
                  </h2>
                  {workspace.contents
                    .filter(
                      (c) =>
                        c.accountId === a.id &&
                        ["review", "approved", "scheduled", "failed"].includes(
                          c.status,
                        ),
                    )
                    .map((c) => (
                      <button
                        className="schedule-row"
                        draggable={c.status !== "failed"}
                        onDragStart={(e) =>
                          e.dataTransfer.setData("text/plain", c.id)
                        }
                        key={c.id}
                        onClick={() => showDetail(c)}
                      >
                        <Send size={19} />
                        <div>
                          <strong>{c.title}</strong>
                          <small>{c.error || statusNames[c.status]}</small>
                        </div>
                        <span className={`badge status-${c.status}`}>
                          {statusNames[c.status]}
                        </span>
                        <ArrowRight size={16} />
                      </button>
                    ))}
                  {!workspace.contents.some(
                    (c) =>
                      c.accountId === a.id &&
                      ["review", "approved", "scheduled", "failed"].includes(
                        c.status,
                      ),
                  ) && <p className="empty-inline">Antrean akun ini kosong.</p>}
                </section>
              ))}
            </>
          )}
          {page === "analytics" && (
            <>
              <AnalyticsInsights {...integrations} />
              <PageHeading
                eyebrow="TURN PERFORMANCE INTO YOUR NEXT IDEA"
                title="Analytics"
                text={
                  live
                    ? "Likes & views disinkronkan dari akun terhubung. Gunakan tombol sinkronisasi untuk memperbarui."
                    : "Metrik contoh untuk mengeksplorasi dashboard. Tidak terhubung ke TikTok."
                }
              />
              <div className="stats-grid">
                <Stat
                  label="Views"
                  value={number(views)}
                  icon={<Eye size={18} />}
                  foot="Seluruh akun"
                />
                <Stat
                  label="Likes"
                  value={number(likes)}
                  icon={<Heart size={18} />}
                  foot="Seluruh akun"
                />
                <Stat
                  label="Post tersimpan"
                  value={String(
                    workspace.contents.filter((c) => c.status === "published")
                      .length,
                  )}
                  icon={<Send size={18} />}
                  foot={live ? "Status tersimpan" : "Contoh data post"}
                />
                <Stat
                  label="Akun terkelola"
                  value={String(workspace.accounts.length)}
                  icon={<Layers3 size={18} />}
                  foot="Satu workspace"
                />
              </div>
              <section className="panel">
                <div className="section-head">
                  <div>
                    <h2>Performa per akun</h2>
                    <p>
                      {live ? "Data tersimpan" : "Contoh metrik"} · likes &
                      views
                    </p>
                  </div>
                  <span className="soft-badge">
                    {live ? "STORED DATA" : "DEMO DATA"}
                  </span>
                </div>
                <div className="chart">
                  {workspace.accounts.map((a) => {
                    const values = workspace.contents
                      .filter((c) => c.accountId === a.id)
                      .reduce((s, c) => s + c.views, 0);
                    return (
                      <div className="chart-row" key={a.id}>
                        <span>{a.handle}</span>
                        <div>
                          <i
                            style={{
                              background: a.color,
                              width: `${views ? Math.max(2, (values / views) * 100) : 0}%`,
                            }}
                          />
                        </div>
                        <strong>{number(values)}</strong>
                      </div>
                    );
                  })}
                </div>
              </section>
              <section className="panel">
                <h2>Konten dengan views tertinggi</h2>
                {[...workspace.contents]
                  .filter((c) => c.views > 0)
                  .sort((a, b) => b.views - a.views)
                  .map((c, i) => (
                    <button
                      className="schedule-row"
                      key={c.id}
                      onClick={() => showDetail(c)}
                    >
                      <span className="rank">0{i + 1}</span>
                      <div>
                        <strong>{c.title}</strong>
                        <small>{account(c.accountId)?.handle}</small>
                      </div>
                      <span className="metrics">
                        <Eye size={14} />
                        {number(c.views)}
                        <Heart size={14} />
                        {number(c.likes)}
                      </span>
                    </button>
                  ))}
                {!views && (
                  <p className="empty-inline">
                    Belum ada data performa yang tersedia.
                  </p>
                )}
              </section>
            </>
          )}
          {page === "files" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    A HOME FOR YOUR CREATIVE ASSETS
                  </span>
                  <h1>
                    File manager<span>.</span>
                  </h1>
                  <p>
                    {live
                      ? "Penyimpanan video R2"
                      : "Video tersimpan lokal di IndexedDB browser"}{" "}
                    · video maksimal 50 MB, GLB 10 MB
                  </p>
                </div>
                <label className="button primary">
                  <Upload size={16} />
                  Upload video
                  <input
                    type="file"
                    hidden
                    accept="video/mp4,video/webm,.glb"
                    disabled={busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) upload(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              <div className="storage-summary">
                <Folder size={24} />
                <div>
                  <strong>
                    {number(
                      workspace.assets.reduce((s, a) => s + a.size, 0) /
                        1024 /
                        1024,
                    )}{" "}
                    MB
                  </strong>
                  <small>
                    {workspace.assets.length} file tersimpan ·{" "}
                    {live ? "Cloudflare R2" : "browser lokal"}
                  </small>
                </div>
              </div>
              <section className="panel">
                {workspace.assets.map((a) => (
                  <div className="list-row" key={a.id}>
                    <span className="file-symbol">
                      <Folder size={19} />
                    </span>
                    <div>
                      <strong>{a.name}</strong>
                      <small>
                        {(a.size / 1024 / 1024).toFixed(2)} MB ·{" "}
                        {stamp(a.createdAt)}
                      </small>
                    </div>
                    <button
                      className="icon-button"
                      aria-label={`Hapus file ${a.name}`}
                      onClick={() =>
                        task(async () => {
                          if (workspace.settings.avatarAssetId === a.id)
                            throw new Error(
                              "Aset avatar sedang digunakan. Ganti pilihan di Settings.",
                            );
                          if (workspace.contents.some((c) => c.fileId === a.id))
                            throw new Error(
                              "File masih digunakan konten dan tidak dapat dihapus.",
                            );
                          if (!confirm(`Hapus file ${a.name} secara permanen?`))
                            return;
                          if (live) {
                            await api("/files/" + a.id, undefined, "DELETE");
                            await refresh();
                          } else {
                            await deleteVideo(a.id);
                            setWorkspace((w) => ({
                              ...w,
                              assets: w.assets.filter((f) => f.id !== a.id),
                            }));
                          }
                          setToast("File dihapus.");
                        })
                      }
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                ))}
                {!workspace.assets.length && (
                  <Empty
                    title="Ruang untuk karya Anda"
                    text="Upload video MP4 atau WebM. File untuk konten dapat diunggah langsung dari detail draft."
                  />
                )}
              </section>
            </>
          )}
          {page === "settings" && (
            <>
              <PageHeading
                eyebrow="YOUR WORKSPACE, YOUR WAY"
                title="Settings"
                text="Kelola akun, provider, dan preferensi workspace."
              />
              <section className="panel">
                <div className="section-head">
                  <div>
                    <h2>Mode workspace</h2>
                    <p>
                      {live
                        ? "Terhubung ke backend Cloudflare."
                        : "Demo lokal: tanpa API key, tanpa publish nyata."}
                    </p>
                  </div>
                  <span className="soft-badge">{live ? "LIVE" : "DEMO"}</span>
                </div>
                <button
                  className="button secondary"
                  onClick={() => {
                    if (live)
                      task(async () => {
                        await api("/logout", {});
                        setLoggedIn(false);
                        setKeys({});
                        setDetail(null);
                      });
                    else {
                      setLive(true);
                      history.replaceState(null, "", "?mode=live");
                    }
                  }}
                >
                  {live ? <LogOut size={16} /> : <ExternalLink size={16} />}{" "}
                  {live ? "Keluar sesi live" : "Masuk backend live"}
                </button>
              </section>
              <form
                className="panel settings-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  task(async () => {
                    if (live) {
                      await api(
                        "/settings",
                        {
                          ...formSettings,
                          keys: Object.fromEntries(
                            Object.entries(keys).filter(([, v]) => v.trim()),
                          ),
                        },
                        "PUT",
                      );
                      await refresh();
                      setKeys({});
                    } else {
                      if (Object.values(keys).some(Boolean))
                        throw new Error(
                          "API key hanya bisa disimpan di backend live, bukan mode demo.",
                        );
                      setWorkspace((w) => ({ ...w, settings: formSettings }));
                    }
                    setToast("Settings tersimpan.");
                  });
                }}
              >
                <h2>AI & otomasi</h2>
                <div className="form-grid">
                  <label>
                    Provider AI
                    <select
                      value={formSettings.provider}
                      onChange={(e) =>
                        setFormSettings((s) => ({
                          ...s,
                          provider: e.target.value as
                            "openrouter" | "cloudflare",
                          model:
                            e.target.value === "cloudflare"
                              ? "@cf/meta/llama-3.1-8b-instruct"
                              : "openai/gpt-4o-mini",
                        }))
                      }
                    >
                      <option value="openrouter">OpenRouter</option>
                      <option value="cloudflare">Cloudflare Workers AI</option>
                    </select>
                  </label>
                  <label>
                    Model
                    <input
                      required
                      value={formSettings.model}
                      onChange={(e) =>
                        setFormSettings((s) => ({
                          ...s,
                          model: e.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    Retensi activity history
                    <select
                      value={formSettings.retentionMonths}
                      onChange={(e) =>
                        setFormSettings((s) => ({
                          ...s,
                          retentionMonths: +e.target.value,
                        }))
                      }
                    >
                      {[1, 3, 6, 12].map((n) => (
                        <option key={n} value={n}>
                          {n} bulan
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Notifikasi
                    <select
                      value={formSettings.notification}
                      onChange={(e) =>
                        setFormSettings((s) => ({
                          ...s,
                          notification: e.target.value as typeof s.notification,
                        }))
                      }
                    >
                      <option value="none">Tidak aktif</option>
                      <option value="discord">Discord webhook</option>
                      <option value="telegram">Telegram bot</option>
                    </select>
                  </label>
                </div>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formSettings.automaticDrafts}
                    onChange={(e) =>
                      setFormSettings((s) => ({
                        ...s,
                        automaticDrafts: e.target.checked,
                      }))
                    }
                  />
                  Buat draft evergreen otomatis setiap hari (live, maksimal 5
                  akun)
                </label>
                <p className="muted small">
                  Draft otomatis memerlukan provider AI aktif. Riset tren dan
                  sinkronisasi analytics memerlukan akun TikTok terhubung.
                </p>
                <div className="form-grid">
                  <label>
                    Zona waktu
                    <select
                      value={formSettings.timezone || "Asia/Jakarta"}
                      onChange={(e) =>
                        setFormSettings((s) => ({
                          ...s,
                          timezone: e.target.value,
                        }))
                      }
                    >
                      {[
                        "Asia/Jakarta",
                        "Asia/Makassar",
                        "Asia/Jayapura",
                        "UTC",
                      ].map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Avatar GLB
                    <select
                      value={formSettings.avatarAssetId || ""}
                      onChange={(e) =>
                        setFormSettings((s) => ({
                          ...s,
                          avatarAssetId: e.target.value || undefined,
                        }))
                      }
                    >
                      <option value="">Nova · avatar manusia bawaan</option>
                      {workspace.assets
                        .filter((a) => a.type === "model/gltf-binary")
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
                {(
                  [
                    [
                      "researchEnabled",
                      "Pantau kompetitor lewat TikTok Research API tiap jam",
                    ],
                    [
                      "webTrendsEnabled",
                      "Ambil Google Trends Indonesia setiap hari",
                    ],
                    [
                      "automaticRecommendations",
                      "Siapkan rekomendasi AI berdasarkan histori setiap hari",
                    ],
                  ] as const
                ).map(([key, label]) => (
                  <label className="checkbox-label" key={key}>
                    <input
                      type="checkbox"
                      checked={!!formSettings[key]}
                      onChange={(e) =>
                        setFormSettings((s) => ({
                          ...s,
                          [key]: e.target.checked,
                        }))
                      }
                    />
                    {label}
                  </label>
                ))}
                <p className="muted small">
                  Daftarkan callback{" "}
                  <code>{location.origin}/api/tiktok/callback</code> di TikTok
                  Developer Portal. Login Kit dan Research API memiliki
                  persetujuan/scope berbeda. Credential baru dapat Anda isi
                  nanti.
                </p>
                <h2>API key & notifikasi</h2>
                <p className="muted small">
                  {live
                    ? "Disimpan terenkripsi di D1; nilai tidak pernah dikirim kembali ke browser. Kosongkan untuk mempertahankan key."
                    : "API key tidak dapat disimpan dalam mode demo. Hubungkan backend live terlebih dahulu."}
                </p>
                <div className="form-grid">
                  {[
                    ["openrouterKey", "OpenRouter API key"],
                    ["tiktokClientKey", "TikTok Login Kit client key"],
                    ["tiktokClientSecret", "TikTok Login Kit client secret"],
                    ["researchClientKey", "TikTok Research client key"],
                    ["researchClientSecret", "TikTok Research client secret"],
                    ["discordWebhook", "Discord webhook URL"],
                    ["telegramToken", "Telegram bot token"],
                    ["telegramChatId", "Telegram chat ID"],
                  ].map(([key, label]) => (
                    <label key={key}>
                      {label}{" "}
                      {workspace.settings.configured?.includes(key) && (
                        <span className="configured">✓ Tersimpan</span>
                      )}
                      <input
                        type="password"
                        autoComplete="new-password"
                        disabled={!live}
                        placeholder={
                          live
                            ? "Masukkan untuk memperbarui"
                            : "Hanya tersedia di mode live"
                        }
                        value={keys[key] || ""}
                        onChange={(e) =>
                          setKeys((k) => ({ ...k, [key]: e.target.value }))
                        }
                      />
                    </label>
                  ))}
                </div>
                <button disabled={busy} className="button primary">
                  <Check size={16} />
                  Simpan settings
                </button>
              </form>
              <section className="panel">
                <div className="section-head">
                  <h2>Akun TikTok</h2>
                  <button
                    className="button secondary"
                    onClick={() => setModal("account")}
                  >
                    <Plus size={15} />
                    Tambah akun
                  </button>
                </div>
                {workspace.accounts.map((a) => (
                  <div className="list-row" key={a.id}>
                    <span
                      className="workspace-avatar"
                      style={{ background: a.color }}
                    >
                      {a.name[0]}
                    </span>
                    <div>
                      <strong>{a.name}</strong>
                      <small>
                        {a.handle} ·{" "}
                        {a.connected
                          ? `Terhubung sebagai ${a.nickname || a.name}`
                          : "Belum terhubung"}
                      </small>
                      {a.scopes?.length && (
                        <small>Izin: {a.scopes.join(", ")}</small>
                      )}
                    </div>
                    <button
                      className="button secondary"
                      disabled={!live || busy}
                      onClick={() =>
                        task(async () => {
                          if (a.connected) {
                            if (
                              !confirm(
                                "Putuskan akun TikTok? Pekerjaan baru akan diblokir sampai terhubung ulang.",
                              )
                            )
                              return;
                            await api("/accounts/" + a.id + "/disconnect", {});
                            await refresh();
                            setToast("Koneksi dicabut.");
                          } else {
                            const result = await api<{ url: string }>(
                              "/accounts/" + a.id + "/oauth",
                              {},
                            );
                            if (
                              new URL(result.url).origin !==
                              "https://www.tiktok.com"
                            )
                              throw new Error("URL OAuth tidak valid.");
                            location.assign(result.url);
                          }
                        })
                      }
                    >
                      {a.connected ? "Putuskan" : "Hubungkan TikTok"}
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Hapus akun ${a.name}`}
                      onClick={() =>
                        task(async () => {
                          if (
                            workspace.contents.some((c) => c.accountId === a.id)
                          )
                            throw new Error(
                              "Akun memiliki konten dan belum bisa dihapus.",
                            );
                          if (live) {
                            await api("/accounts/" + a.id, undefined, "DELETE");
                            await refresh();
                          } else
                            setWorkspace((w) => ({
                              ...w,
                              accounts: w.accounts.filter((x) => x.id !== a.id),
                            }));
                        })
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </section>
              <section className="panel">
                <h2>Aset kantor & avatar</h2>
                <p className="muted">
                  Lima avatar manusia sudah tersedia. Upload GLB dengan tekstur
                  embedded dari File manager untuk mengganti Nova, lalu pilih di
                  Settings. Animasi yang tersedia (Idle/Walk/Typing) digunakan
                  otomatis; silhouette tetap tersedia jika model gagal dimuat.
                </p>
              </section>
            </>
          )}
          <footer className="footer">
            <span>
              byga agency <span>·</span> A little structure. A lot of
              creativity.
            </span>
            <span>
              <span className="live-dot" />
              {live ? "Cloud workspace" : "Demo lokal"}
            </span>
          </footer>
        </main>
      </div>
      {modal === "generate" && (
        <Modal
          title="Ide Anda, langkah pertama."
          onClose={() => setModal(null)}
        >
          <form onSubmit={generate}>
            <p className="muted">
              {live
                ? "Generate caption dan prompt video dengan provider AI Anda."
                : "Simulasi caption dan prompt video. Tidak memanggil model AI."}{" "}
              Video dibuat sendiri di tool pilihan Anda.
            </p>
            <label>
              Akun TikTok
              <select
                required
                value={draftAccount}
                onChange={(e) => setDraftAccount(e.target.value)}
              >
                <option value="" disabled>
                  Pilih akun
                </option>
                {workspace.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.handle}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Topik atau creative brief
              <textarea
                autoFocus
                required
                minLength={5}
                maxLength={2000}
                rows={5}
                placeholder="Misalnya: 3 cara memakai AI untuk menghemat waktu kerja, dengan tone ringan dan relatable…"
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
              />
            </label>
            <div className="form-hint">
              <Sparkles size={16} />
              Output: caption + prompt video vertikal 9:16, 20–30 detik.
            </div>
            <button className="button primary full" disabled={busy}>
              {busy ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <Sparkles size={17} />
              )}{" "}
              {busy
                ? "Menyiapkan draft…"
                : live
                  ? "Generate draft"
                  : "Buat draft demo"}
            </button>
          </form>
        </Modal>
      )}
      {modal === "account" && (
        <Modal title="Satu tim, banyak cerita." onClose={() => setModal(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              task(async () => {
                const a = {
                  name: String(data.get("name")).trim(),
                  handle: String(data.get("handle")).trim(),
                  color: "#809e79",
                };
                if (!/^@[A-Za-z0-9_.]{1,24}$/.test(a.handle))
                  throw new Error("Gunakan format @username TikTok.");
                if (live) {
                  await api("/accounts", a);
                  await refresh();
                } else {
                  if (workspace.accounts.some((x) => x.handle === a.handle))
                    throw new Error("Akun sudah terdaftar.");
                  setWorkspace((w) => ({
                    ...w,
                    accounts: [
                      ...w.accounts,
                      { ...a, id: crypto.randomUUID(), connected: false },
                    ],
                  }));
                }
                setModal(null);
                setToast("Akun ditambahkan. OAuth belum terhubung.");
              });
            }}
          >
            <p className="muted">
              Tambahkan identitas akun untuk mengelompokkan konten. Ini belum
              menghubungkan OAuth TikTok.
            </p>
            <label>
              Nama akun
              <input
                name="name"
                required
                maxLength={60}
                placeholder="Byga Studio"
              />
            </label>
            <label>
              Username TikTok
              <input
                name="handle"
                required
                pattern="@[A-Za-z0-9_.]{1,24}"
                placeholder="@bygastudio"
              />
            </label>
            <button className="button primary full" disabled={busy}>
              <Plus size={16} />
              Tambah akun
            </button>
          </form>
        </Modal>
      )}
      {modal === "agent" && (
        <Modal
          title={`${rooms.find((r) => r.id === selected)?.agent || "Nova"} · AI teammate`}
          onClose={() => setModal(null)}
        >
          <div className="agent-detail">
            <span
              className="big-avatar"
              style={{
                background: rooms.find((r) => r.id === selected)?.color,
              }}
            >
              <Sparkles size={34} />
            </span>
            <h3>
              {rooms.find((r) => r.id === selected)?.role || "Content creator"}
            </h3>
            <p className="muted">
              {live
                ? "Agen adalah representasi visual pekerjaan backend."
                : "Karakter dan aktivitas kerja merupakan simulasi demo."}
            </p>
          </div>
          {workspace.activity
            .filter((a) => a.room === (selected || "content"))
            .slice(0, 8)
            .map((a) => (
              <div className="log-bubble" key={a.id}>
                <p>{a.message}</p>
                <small>{stamp(a.time)}</small>
              </div>
            ))}
          <button
            className="button primary full"
            onClick={() => {
              setModal(null);
              navigate(selected || "content");
            }}
          >
            Buka ruang kerja
            <ArrowUpRight size={17} />
          </button>
        </Modal>
      )}
      {modal === "notifications" && (
        <Modal title="Activity log" onClose={() => setModal(null)}>
          <div className="log-list">
            {workspace.activity.map((a) => (
              <div className="log-bubble" key={a.id}>
                <span className="eyebrow">
                  {rooms.find((r) => r.id === a.room)?.name}
                </span>
                <p>{a.message}</p>
                <small>{stamp(a.time)}</small>
              </div>
            ))}
          </div>
          {!workspace.activity.length && <p>Belum ada aktivitas.</p>}
        </Modal>
      )}
      {detail && (
        <Modal title={detail.title} onClose={() => setDetail(null)} wide>
          <div className="detail-meta">
            <span className={`badge status-${detail.status}`}>
              {statusNames[detail.status]}
            </span>
            <span>{account(detail.accountId)?.handle}</span>
            <small>{stamp(detail.createdAt)}</small>
          </div>
          <div className="detail-grid">
            <div>
              <VideoPreview id={detail.fileId} live={live} />
              {detail.status === "draft" && (
                <label className="button secondary full">
                  <Upload size={16} />
                  Upload video & kirim review
                  <input
                    hidden
                    type="file"
                    accept="video/mp4,video/webm,.glb"
                    disabled={busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) upload(f, detail);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
              {detail.status === "draft" &&
                detail.fileId &&
                detail.fileId !== "sample-video" && (
                  <button
                    className="button secondary full"
                    disabled={busy}
                    onClick={() => transition(detail, "review", detail.fileId)}
                  >
                    <Check size={15} />
                    Review video yang tersimpan
                  </button>
                )}
              <p className="muted small">
                File video asli, tanpa mockup feed. MP4/WebM · maks. 50 MB.
              </p>
              {detail.error && (
                <div className="notice error">
                  <p>{detail.error}</p>
                </div>
              )}
            </div>
            <div>
              <label htmlFor="content-caption">
                Caption
                <textarea
                  id="content-caption"
                  aria-label="Caption"
                  rows={5}
                  maxLength={2200}
                  readOnly={!["draft", "review"].includes(detail.status)}
                  value={editCaption}
                  onChange={(e) => setEditCaption(e.target.value)}
                />
              </label>
              <label htmlFor="content-prompt">
                Prompt video
                <textarea
                  id="content-prompt"
                  aria-label="Prompt video"
                  rows={5}
                  maxLength={8000}
                  readOnly={!["draft", "review"].includes(detail.status)}
                  value={editPrompt}
                  onChange={(e) => setEditPrompt(e.target.value)}
                />
              </label>
              <div className="detail-buttons">
                <button
                  className="button secondary"
                  onClick={() =>
                    task(async () => {
                      await navigator.clipboard.writeText(editPrompt);
                      setToast("Prompt disalin.");
                    })
                  }
                >
                  <Copy size={15} />
                  Salin prompt
                </button>
                {["draft", "review"].includes(detail.status) && (
                  <button
                    disabled={busy}
                    className="button secondary"
                    onClick={() =>
                      task(async () => {
                        if (live) {
                          const saved = await api<Content>(
                            "/contents/" + detail.id,
                            {
                              title: detail.title,
                              caption: editCaption,
                              prompt: editPrompt,
                              expectedRevision: detail.revision || 0,
                            },
                            "PATCH",
                          );
                          await refresh();
                          setDetail(saved);
                        } else
                          updateContent(
                            {
                              ...detail,
                              caption: editCaption,
                              prompt: editPrompt,
                            },
                            "Caption dan prompt diperbarui",
                          );
                        setToast("Edit tersimpan.");
                      })
                    }
                  >
                    <Check size={15} />
                    Simpan edit
                  </button>
                )}{" "}
                {detail.status === "draft" && (
                  <button
                    className="text-button"
                    onClick={() => {
                      setBrief(detail.title);
                      setDraftAccount(detail.accountId);
                      setDetail(null);
                      setModal("generate");
                    }}
                  >
                    <RotateCcw size={14} />
                    Generate versi baru
                  </button>
                )}
              </div>
              {["draft", "review"].includes(detail.status) &&
                (editCaption !== detail.caption ||
                  editPrompt !== detail.prompt) && (
                  <p className="notice" role="status">
                    Ada edit yang belum tersimpan. Simpan edit sebelum review
                    atau approval.
                  </p>
                )}
              {detail.status === "review" &&
                live &&
                account(detail.accountId)?.connected && (
                  <PublishApproval
                    key={`${detail.id}:${detail.revision || 0}:${detail.caption}:${detail.prompt}`}
                    accountId={detail.accountId}
                    onChange={setPublishOptions}
                  />
                )}
              {detail.status === "review" && (
                <button
                  className="button primary full"
                  disabled={
                    busy ||
                    editCaption !== detail.caption ||
                    editPrompt !== detail.prompt ||
                    (live &&
                      !!account(detail.accountId)?.connected &&
                      !publishOptions)
                  }
                  onClick={() => transition(detail, "approve")}
                >
                  <ShieldCheck size={17} />
                  Approve konten
                </button>
              )}
              {["approved", "scheduled"].includes(detail.status) && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    transition(detail, "schedule");
                  }}
                >
                  <label>
                    Waktu posting ({timezone})
                    <input
                      required
                      type="datetime-local"
                      value={scheduleDate}
                      onChange={(e) => setScheduleDate(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="button secondary full"
                    onClick={() =>
                      task(async () => {
                        const recommendation = workspace.recommendations?.find(
                          (r) => r.accountId === detail.accountId,
                        );
                        setScheduleDate(
                          optimalTime(
                            recommendation?.bestHours || [],
                            timezone,
                          ),
                        );
                      })
                    }
                  >
                    <Sparkles size={16} />
                    Gunakan waktu dari histori analytics
                  </button>
                  <button className="button primary full" disabled={busy}>
                    <CalendarDays size={16} />
                    {detail.status === "scheduled"
                      ? "Ubah jadwal"
                      : "Jadwalkan konten"}
                  </button>
                </form>
              )}
              {["approved", "scheduled", "failed"].includes(detail.status) && (
                <button
                  className="button secondary full"
                  disabled={busy}
                  onClick={() => transition(detail, "publish")}
                >
                  <Send size={16} />
                  {live ? "Publish sekarang" : "Periksa kesiapan publish"}
                </button>
              )}
              {["approved", "scheduled", "failed"].includes(detail.status) && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    if (
                      confirm(
                        "Kembalikan ke draft? Approval dan jadwal akan dibatalkan.",
                      )
                    )
                      transition(detail, "revise");
                  }}
                >
                  <RotateCcw size={14} />
                  Kembalikan ke draft
                </button>
              )}
              {["draft", "review", "failed"].includes(detail.status) && (
                <button
                  className="text-button delete-content"
                  disabled={busy}
                  onClick={() =>
                    task(async () => {
                      if (
                        !confirm(
                          "Hapus konten ini? File video tetap tersimpan di File manager.",
                        )
                      )
                        return;
                      if (live) {
                        await api(
                          "/contents/" + detail.id,
                          undefined,
                          "DELETE",
                        );
                        await refresh();
                      } else
                        setWorkspace((w) => ({
                          ...w,
                          contents: w.contents.filter(
                            (c) => c.id !== detail.id,
                          ),
                        }));
                      setDetail(null);
                      setToast("Konten dihapus. File video tetap tersimpan.");
                    })
                  }
                >
                  <Trash2 size={14} />
                  Hapus konten
                </button>
              )}
              <p className="muted small">
                Approval wajib sebelum jadwal. Publish live memerlukan OAuth dan
                final approval TikTok.
              </p>
            </div>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button onClick={() => setToast("")} aria-label="Tutup pesan">
            <X size={16} />
          </button>
        </div>
      )}
      {busy && (
        <div className="working-indicator" role="status">
          <LoaderCircle className="spin" size={15} />
          Memproses…
        </div>
      )}
    </div>
  );
}
function Logo() {
  return (
    <svg
      viewBox="0 0 32 32"
      width="29"
      height="29"
      fill="none"
      aria-hidden="true"
    >
      <path d="M4 10 16 3l12 7-12 7L4 10Z" fill="#849579" />
      <path d="m4 15 12 7 12-7v6l-12 8-12-8v-6Z" fill="#526b4b" />
      <path d="m4 10 12 7v6L4 16v-6Z" fill="#b1bca6" />
      <path d="m28 10-12 7v6l12-7v-6Z" fill="#6c8561" />
    </svg>
  );
}
function Stat({
  label,
  value,
  suffix,
  icon,
  foot,
  accent = false,
}: {
  label: string;
  value: string;
  suffix?: string;
  icon: ReactNode;
  foot: string;
  accent?: boolean;
}) {
  return (
    <section className={`stat ${accent ? "accent" : ""}`}>
      <div>
        <span>{label}</span>
        {icon}
      </div>
      <p>
        {value}
        <small>{suffix}</small>
      </p>
      <span className="stat-foot">
        {accent && <span className="tiny-dot" />}
        {foot}
      </span>
    </section>
  );
}
function PageHeading({
  eyebrow,
  title,
  text,
}: {
  eyebrow: string;
  title: string;
  text: string;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>
          {title}
          <span>.</span>
        </h1>
        <p>{text}</p>
      </div>
    </div>
  );
}
function Empty({
  title,
  text,
  action,
  label,
}: {
  title: string;
  text: string;
  action?: () => void;
  label?: string;
}) {
  return (
    <div className="empty">
      <Layers3 size={30} />
      <h3>{title}</h3>
      <p>{text}</p>
      {action && (
        <button className="button primary" onClick={action}>
          <Plus size={16} />
          {label}
        </button>
      )}
    </div>
  );
}
