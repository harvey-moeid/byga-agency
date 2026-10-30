import "./studio.css";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  FolderOpen,
  History,
  ImagePlus,
  LoaderCircle,
  MessageCircle,
  Plus,
  Save,
  Settings2,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import type { Account, Asset, Content, Room } from "./domain";
import type { StudioController } from "./useStudio";
import {
  agentIds,
  defaultAgents,
  inputKey,
  nextStage,
  presets,
  promptCurrent,
  proposalCurrent,
  stageNames,
  type CharacterProfile,
  type ProjectBrief,
  type ProposalPayload,
  type StudioAgent,
  type StudioProject,
  type StudioProposal,
  type StudioStage,
} from "./studio";
import { defaultUGCBrief, ugcTones } from "./ugc";
import { getVideo } from "./storage";
const avatarFiles: Record<Room, string> = {
  research: "aria",
  content: "nova",
  schedule: "kai",
  publish: "leo",
  analytics: "iris",
};
export function AgentPortrait({ agent }: { agent: StudioAgent }) {
  return (
    <span className="studio-portrait" style={{ background: agent.color }}>
      <img src={`/avatars/${avatarFiles[agent.id]}.png`} alt="" />
    </span>
  );
}
export function StudioError({ studio }: { studio: StudioController }) {
  return studio.error ? (
    <div className="studio-error" role="alert">
      <p>{studio.error}</p>
      <button type="button" className="text-button" onClick={studio.clearError}>
        Tutup
      </button>
    </div>
  ) : null;
}
export function StudioProjectBar({
  studio,
  onNew,
  onProjects,
}: {
  studio: StudioController;
  onNew: () => void;
  onProjects: () => void;
}) {
  return (
    <section className="studio-project-bar" aria-label="Proyek aktif">
      <div className="studio-project-icon">
        <FolderOpen size={20} />
      </div>
      <div className="studio-project-title">
        <span className="eyebrow">PROYEK AKTIF</span>
        {studio.project ? (
          <>
            <strong>{studio.project.name}</strong>
            <small>
              {stageNames[nextStage(studio.project)]}
              {studio.project.run
                ? " · agen sedang bekerja"
                : " · konteks bersama"}
            </small>
          </>
        ) : (
          <>
            <strong>Cerita berikutnya dimulai di sini.</strong>
            <small>
              Pilih proyek untuk menyatukan percakapan dan hasil tim.
            </small>
          </>
        )}
      </div>
      {studio.summaries.length > 0 && (
        <label className="studio-project-select">
          <span className="sr-only">Pilih proyek aktif</span>
          <select
            value={studio.activeId}
            onChange={(e) => void studio.select(e.target.value)}
          >
            <option value="" disabled>
              Pilih proyek
            </option>
            {studio.summaries.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {!studio.project && studio.summaries[0] && (
        <button
          className="button secondary"
          onClick={() => void studio.select(studio.summaries[0].id)}
        >
          Lanjutkan proyek terakhir
        </button>
      )}
      <button className="button secondary" onClick={onProjects}>
        <FolderOpen size={15} />
        Semua proyek
      </button>
      <button className="button primary" onClick={onNew}>
        <Plus size={15} />
        Proyek baru
      </button>
    </section>
  );
}
export function NewProjectDialog({
  accounts,
  studio,
  onClose,
  onCreated,
  onSettings,
}: {
  accounts: Account[];
  studio: StudioController;
  onClose: () => void;
  onCreated: () => void;
  onSettings: () => void;
}) {
  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id || "");
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    nameRef.current?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div
      className="modal-backdrop"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
        if (e.key === "Tab") {
          const nodes = e.currentTarget.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)",
          );
          const first = nodes[0],
            last = nodes[nodes.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Proyek UGC baru"
      >
        <div className="modal-head">
          <div>
            <span className="eyebrow">A NEW STORY</span>
            <h2>Proyek UGC baru</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Tutup proyek baru"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <p className="muted">
          Satu proyek menyimpan brief, karakter, chat tiap agen, dan seluruh
          versi hasil yang Anda setujui.
        </p>
        <StudioError studio={studio} />
        {!accounts.length ? (
          <div className="notice">
            <p>Tambahkan akun TikTok untuk menyimpan proyek.</p>
            <button className="button secondary" onClick={onSettings}>
              Buka Settings
            </button>
          </div>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              const project = await studio.create(name, accountId);
              setSaving(false);
              if (project) {
                onClose();
                onCreated();
              }
            }}
          >
            <label>
              Nama proyek
              <input
                ref={nameRef}
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Misalnya: Cerita kopi sebelum kerja"
              />
            </label>
            <label>
              Akun proyek
              <select
                required
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.handle}
                  </option>
                ))}
              </select>
            </label>
            <button className="button primary full" disabled={saving}>
              {saving ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <ArrowRight size={16} />
              )}
              Mulai proyek
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
export function AgentEditor({
  agent,
  studio,
}: {
  agent: StudioAgent;
  studio: StudioController;
}) {
  const [form, setForm] = useState(agent);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setForm(agent);
  }, [agent.id, agent.revision]);
  return (
    <form
      className="studio-agent-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        const result = await studio.saveAgent(form);
        setSaving(false);
        if (result) {
          setForm(result);
          setSaved(true);
        }
      }}
    >
      <div className="form-grid">
        <label>
          Nama agen
          <input
            required
            maxLength={40}
            value={form.name}
            onChange={(e) => {
              setSaved(false);
              setForm({ ...form, name: e.target.value });
            }}
          />
        </label>
        <label>
          Aksen warna
          <input
            type="color"
            value={form.color}
            onChange={(e) => {
              setSaved(false);
              setForm({ ...form, color: e.target.value });
            }}
          />
        </label>
      </div>
      <label>
        Preset instruksi
        <select
          aria-label="Preset instruksi"
          value={form.preset}
          onChange={(e) => {
            const preset = e.target.value as StudioAgent["preset"];
            setSaved(false);
            setForm({
              ...form,
              preset,
              role: presets[preset].role,
              instructions: presets[preset].instructions,
            });
          }}
        >
          {Object.entries(presets).map(([id, p]) => (
            <option key={id} value={id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Peran agen
        <input
          required
          maxLength={80}
          value={form.role}
          onChange={(e) => {
            setSaved(false);
            setForm({ ...form, role: e.target.value });
          }}
        />
      </label>
      <label>
        Instruksi agen
        <textarea
          aria-label="Instruksi agen"
          required
          minLength={10}
          maxLength={6000}
          rows={7}
          value={form.instructions}
          onChange={(e) => {
            setSaved(false);
            setForm({ ...form, instructions: e.target.value });
          }}
        />
      </label>
      <p className="muted small">
        Preset adalah titik awal. Anda dapat menyesuaikan seluruh instruksi.
        Persetujuan hasil tetap berada di tangan Anda.
      </p>
      <button className="button primary" disabled={saving}>
        {saving ? (
          <LoaderCircle size={15} className="spin" />
        ) : (
          <Save size={15} />
        )}
        Simpan agen
      </button>
      {saved && (
        <p className="studio-saved" role="status">
          Pengaturan agen tersimpan.
        </p>
      )}
    </form>
  );
}
export function PayloadView({ payload }: { payload: ProposalPayload }) {
  if (payload.stage === "brief")
    return (
      <div className="studio-payload">
        <h4>{payload.data.idea || "Brief proyek"}</h4>
        <dl>
          <dt>Karakter</dt>
          <dd>{payload.data.character}</dd>
          <dt>Produk</dt>
          <dd>{payload.data.product || "Tanpa produk"}</dd>
          <dt>Audiens</dt>
          <dd>{payload.data.audience}</dd>
          <dt>Format</dt>
          <dd>
            {payload.data.sceneCount} adegan × {payload.data.sceneDuration}{" "}
            detik · 9:16 · {ugcTones[payload.data.tone]}
          </dd>
        </dl>
      </div>
    );
  if (payload.stage === "images" || payload.stage === "videos")
    return (
      <div className="studio-payload">
        {payload.data.prompts.map((p) => (
          <div className="studio-preview-scene" key={p.sceneId}>
            <h4>Adegan {p.sceneId.slice(1)}</h4>
            <p>{p.prompt}</p>
          </div>
        ))}
      </div>
    );
  if (payload.stage === "review")
    return (
      <div className="studio-payload">
        <p>{payload.data.summary}</p>
        <ul>
          {payload.data.issues.map((issue, i) => (
            <li key={i}>{issue}</li>
          ))}
        </ul>
      </div>
    );
  if (payload.stage === "story")
    return (
      <div className="studio-payload">
        <h4>{payload.data.title}</h4>
        <p>{payload.data.synopsis}</p>
        <p>
          <strong>Hook:</strong> {payload.data.hook}
        </p>
        <details>
          <summary>Konsistensi karakter & caption</summary>
          <p>{payload.data.characterLock}</p>
          <p>{payload.data.caption}</p>
          <p>{payload.data.negativePrompt}</p>
        </details>
        {payload.data.scenes.map((s) => (
          <div className="studio-preview-scene" key={s.id}>
            <h4>
              {s.id.slice(1)}. {s.title}
            </h4>
            <p>{s.narration}</p>
            <p className="muted">{s.description}</p>
          </div>
        ))}
      </div>
    );
  return (
    <div className="studio-payload">
      <h4>{payload.data.title}</h4>
      <p>{payload.data.caption}</p>
      {payload.data.scenes.map((s, i) => (
        <details key={i}>
          <summary>
            Adegan {i + 1} · {s.title}
          </summary>
          <p>{s.narration}</p>
          <h4>Text-to-image</h4>
          <p>{s.textToImage}</p>
          <h4>Image-to-video</h4>
          <p>{s.imageToVideo}</p>
        </details>
      ))}
    </div>
  );
}
function ProposalCard({
  project,
  proposal,
  studio,
}: {
  project: StudioProject;
  proposal: StudioProposal;
  studio: StudioController;
}) {
  const [saving, setSaving] = useState(false);
  const current = proposalCurrent(project, proposal);
  return (
    <section
      className={`studio-proposal ${current ? "pending" : ""}`}
      aria-label={`Pratinjau ${stageNames[proposal.payload.stage]}`}
    >
      <div className="studio-proposal-label">
        <Sparkles size={14} />
        <strong>{stageNames[proposal.payload.stage]}</strong>
        <span>
          {proposal.status === "approved"
            ? "Disetujui"
            : proposal.status === "rejected"
              ? "Ditolak"
              : current
                ? "Menunggu persetujuan"
                : "Perlu ditinjau ulang"}
        </span>
      </div>
      <details open={current}>
        <summary>Lihat hasil</summary>
        <PayloadView payload={proposal.payload} />
      </details>
      {proposal.status === "pending" && (
        <div className="studio-approval-actions">
          <button
            className="button primary"
            disabled={!current || saving || !!studio.working}
            onClick={async () => {
              setSaving(true);
              await studio.decide(project.id, proposal.id, "approve");
              setSaving(false);
            }}
          >
            <Check size={15} />
            Setujui {stageNames[proposal.payload.stage]}
          </button>
          <button
            className="button secondary"
            disabled={saving || !!studio.working}
            onClick={async () => {
              setSaving(true);
              await studio.decide(project.id, proposal.id, "reject");
              setSaving(false);
            }}
          >
            Tolak
          </button>
        </div>
      )}
    </section>
  );
}
const actionLabels: Record<StudioStage, string> = {
  brief: "Pratinjau brief",
  story: "Buat cerita",
  images: "Buat prompt gambar",
  videos: "Buat prompt video",
  review: "Review proyek",
  final: "Pratinjau draft final",
};
export function AgentPanel({
  agentId,
  studio,
  live,
  onClose,
  onAgent,
  onNew,
  onProjects,
  onOpenRoom,
  initialSceneId,
}: {
  agentId: Room;
  studio: StudioController;
  live: boolean;
  onClose: () => void;
  onAgent: (id: Room) => void;
  onNew: () => void;
  onProjects: () => void;
  onOpenRoom: () => void;
  initialSceneId?: string;
}) {
  const agent = studio.agents.find((a) => a.id === agentId) || defaultAgents[1];
  const [settings, setSettings] = useState(false);
  const [text, setText] = useState("");
  const [sceneId, setSceneId] = useState("");
  const [tab, setTab] = useState<"chat" | "versions">("chat");
  const scroll = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const project = studio.project;
  const messages = project?.messages.filter((m) => m.agentId === agentId) || [];
  useEffect(() => {
    closeRef.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    scroll.current?.scrollTo({
      top: scroll.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, settings, tab, project?.id]);
  useEffect(() => {
    setText("");
    setSceneId(initialSceneId || "");
    setSettings(false);
  }, [agentId, project?.id, initialSceneId]);
  const can = (stage: StudioStage) => {
    try {
      if (project) {
        inputKey(
          project,
          stage,
          stage === "images" || stage === "videos" || stage === "story"
            ? sceneId || undefined
            : undefined,
        );
        return stage !== "brief" || project.briefDraft.idea.trim().length >= 5;
      }
    } catch {}
    return false;
  };
  async function action(stage: StudioStage) {
    if (!project) return;
    const result = await studio.turn(
      project.id,
      agentId,
      text.trim() ||
        `${actionLabels[stage]}${sceneId ? ` untuk adegan ${sceneId.slice(1)}` : ""}. Tampilkan hasil untuk saya tinjau dahulu.`,
      stage,
      stage === "story" || stage === "images" || stage === "videos"
        ? sceneId || undefined
        : undefined,
    );
    if (result) setText("");
  }
  async function send(e: FormEvent) {
    e.preventDefault();
    if (!project || !text.trim()) return;
    const result = await studio.turn(project.id, agentId, text.trim());
    if (result) setText("");
  }
  return (
    <aside
      className="studio-agent-panel"
      role="dialog"
      aria-label={`${agent.name} · AI teammate`}
      aria-modal={window.innerWidth <= 700 ? true : undefined}
      onKeyDown={(e) => {
        if (e.key !== "Tab" || window.innerWidth > 700) return;
        const nodes = e.currentTarget.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary",
        );
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }}
    >
      <header className="studio-chat-header">
        <AgentPortrait agent={agent} />
        <div>
          <span className="eyebrow">YOUR CREATIVE TEAM</span>
          <h2>{agent.name}</h2>
          <p>{agent.role}</p>
        </div>
        <button
          className="icon-button"
          aria-label="Atur agen"
          aria-pressed={settings}
          onClick={() => setSettings(!settings)}
        >
          <Settings2 size={18} />
        </button>
        <button
          ref={closeRef}
          className="icon-button"
          aria-label="Tutup percakapan"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      <div className="studio-agent-switch" aria-label="Pilih agen">
        {studio.agents.map((a) => (
          <button
            key={a.id}
            className={a.id === agentId ? "active" : ""}
            onClick={() => onAgent(a.id)}
            style={{ borderColor: a.id === agentId ? a.color : undefined }}
          >
            {a.name}
          </button>
        ))}
      </div>
      <div className="studio-chat-project">
        <FolderOpen size={14} />
        {studio.summaries.length ? (
          <select
            aria-label="Proyek percakapan"
            value={studio.activeId}
            onChange={(e) => void studio.select(e.target.value)}
          >
            <option value="" disabled>
              Pilih proyek
            </option>
            {studio.summaries.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        ) : (
          <span>Belum ada proyek</span>
        )}
        <button
          className="icon-button"
          aria-label="Buat proyek dari percakapan"
          onClick={onNew}
        >
          <Plus size={18} />
        </button>
      </div>
      <div className="studio-open-room">
        <button className="text-button" onClick={onOpenRoom}>
          Buka ruang kerja <ArrowUpRight size={13} />
        </button>
      </div>
      <StudioError studio={studio} />
      {settings ? (
        <div className="studio-chat-scroll">
          <h3>Atur karakter agen</h3>
          <AgentEditor key={agent.id} agent={agent} studio={studio} />
        </div>
      ) : !project ? (
        <div className="studio-chat-empty">
          <MessageCircle size={38} />
          <h3>Halo, saya {agent.name}.</h3>
          <p>
            Kita bisa berdiskusi bebas atau mulai dari langkah terpandu. Pilih
            proyek agar tim memakai konteks yang sama.
          </p>
          <button className="button primary" onClick={onNew}>
            <Plus size={15} />
            Buat proyek pertama
          </button>
          <button className="text-button" onClick={onProjects}>
            Lihat proyek tersimpan <ArrowUpRight size={14} />
          </button>
        </div>
      ) : (
        <>
          <div className="studio-chat-tabs">
            <button
              className={tab === "chat" ? "active" : ""}
              onClick={() => setTab("chat")}
            >
              <MessageCircle size={14} />
              Percakapan
            </button>
            <button
              className={tab === "versions" ? "active" : ""}
              onClick={() => setTab("versions")}
            >
              <History size={14} />
              Versi disetujui
            </button>
            <small>{live ? "Live AI" : "Demo template"}</small>
          </div>
          <div
            className="studio-chat-scroll"
            ref={scroll}
            aria-label="Riwayat percakapan"
          >
            {tab === "versions" ? (
              <VersionHistory project={project} />
            ) : (
              <>
                <div className="studio-chat-welcome">
                  <strong>{agent.name} siap menemani.</strong>
                  <p>
                    Chat ini khusus untuk Anda dan {agent.name}. Semua agen
                    memakai hasil proyek yang sudah disetujui. Gunakan tombol
                    tindakan atau tulis arahan Anda.
                  </p>
                </div>
                {messages.map((message) => {
                  const proposal = project.proposals.find(
                    (p) => p.id === message.proposalId,
                  );
                  return (
                    <div
                      key={message.id}
                      className={`studio-message ${message.role}`}
                    >
                      <small>
                        {message.role === "user" ? "Anda" : agent.name}
                      </small>
                      <p>{message.text}</p>
                      {message.suggestedAction &&
                        can(message.suggestedAction) && (
                          <button
                            className="text-button"
                            disabled={!!studio.working}
                            onClick={() =>
                              void action(message.suggestedAction!)
                            }
                          >
                            {actionLabels[message.suggestedAction]}{" "}
                            <ArrowRight size={14} />
                          </button>
                        )}
                      {proposal && (
                        <ProposalCard
                          project={project}
                          proposal={proposal}
                          studio={studio}
                        />
                      )}
                    </div>
                  );
                })}
                {studio.working?.projectId === project.id &&
                  studio.working.agentId === agentId && (
                    <div className="studio-thinking" role="status">
                      <LoaderCircle className="spin" size={16} />
                      {agent.name} sedang menyusun hasil…
                    </div>
                  )}
              </>
            )}
          </div>
          <div className="studio-chat-tools">
            <div className="studio-next-step">
              <span>
                Berikutnya: <strong>{stageNames[nextStage(project)]}</strong>
              </span>
              <button className="text-button" onClick={onProjects}>
                Buka brief <ArrowUpRight size={13} />
              </button>
            </div>
            {project.story && (
              <label className="studio-scene-select">
                Cakupan revisi
                <select
                  aria-label="Cakupan revisi"
                  value={sceneId}
                  onChange={(e) => setSceneId(e.target.value)}
                >
                  <option value="">Semua adegan</option>
                  {project.story.data.scenes.map((s) => (
                    <option key={s.id} value={s.id}>
                      Adegan {s.id.slice(1)} · {s.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="studio-quick-actions">
              {(Object.keys(stageNames) as StudioStage[]).map((stage) => (
                <button
                  key={stage}
                  disabled={!can(stage) || !!studio.working}
                  onClick={() => void action(stage)}
                >
                  {stage === nextStage(project) && <Sparkles size={12} />}
                  {actionLabels[stage]}
                </button>
              ))}
            </div>
            <form onSubmit={send}>
              <label className="sr-only" htmlFor="studio-message">
                Pesan untuk agen
              </label>
              <textarea
                id="studio-message"
                maxLength={4000}
                rows={2}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={`Diskusikan ide atau beri arahan untuk ${agent.name}…`}
                disabled={!!studio.working}
              />
              <div className="studio-composer-footer">
                <small>{text.length}/4000 · hasil menunggu persetujuan</small>
                {studio.working ? (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={(e) => {
                      e.preventDefault();
                      void studio.cancel();
                    }}
                  >
                    <Square size={13} />
                    Hentikan generasi
                  </button>
                ) : (
                  <button
                    type="submit"
                    key="send-message"
                    className="button primary"
                    disabled={!text.trim()}
                  >
                    <ArrowRight size={15} />
                    Kirim
                  </button>
                )}
              </div>
            </form>
          </div>
        </>
      )}
    </aside>
  );
}
export function VersionHistory({ project }: { project: StudioProject }) {
  return (
    <div className="studio-version-history">
      {project.history.length ? (
        [...project.history].reverse().map((p, i) => (
          <details key={p.id}>
            <summary>
              <span>{stageNames[p.payload.stage]}</span>
              <small>
                Versi {project.history.length - i} ·{" "}
                {new Date(p.createdAt).toLocaleString("id-ID")}
              </small>
            </summary>
            <PayloadView payload={p.payload} />
          </details>
        ))
      ) : (
        <p className="muted">
          Hasil yang Anda setujui akan muncul di sini. Versi sebelumnya tetap
          bisa dibaca saat Anda merevisi.
        </p>
      )}
    </div>
  );
}
export function ReferenceImage({ id, live }: { id: string; live: boolean }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (live) {
      setUrl(`/api/files/${encodeURIComponent(id)}`);
      return;
    }
    let active = true,
      objectUrl = "";
    void getVideo(id)
      .then((blob) => {
        if (blob && active) {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, live]);
  return url ? (
    <img
      className="studio-reference-image"
      src={url}
      alt="Referensi karakter cerita"
    />
  ) : null;
}
function CharacterEditor({
  studio,
  assets,
  live,
  onUpload,
}: {
  studio: StudioController;
  assets: Asset[];
  live: boolean;
  onUpload: (file: File) => Promise<string | undefined>;
}) {
  const [form, setForm] = useState<CharacterProfile>({
    id: crypto.randomUUID(),
    name: "",
    appearance: "",
    outfit: "",
    revision: 0,
  });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  return (
    <section className="panel studio-character-editor">
      <h2>Karakter cerita tersimpan</h2>
      <p className="muted">
        Profil ini untuk tokoh cerita UGC. Nama agen di kantor diatur melalui
        tombol Atur agen.
      </p>
      <label>
        Pilih profil karakter
        <select
          value={
            studio.characters.some((c) => c.id === form.id) ? form.id : "new"
          }
          onChange={(e) => {
            setStatus("");
            setForm(
              studio.characters.find((c) => c.id === e.target.value) || {
                id: crypto.randomUUID(),
                name: "",
                appearance: "",
                outfit: "",
                revision: 0,
              },
            );
          }}
        >
          <option value="new">+ Karakter baru</option>
          {studio.characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          const result = await studio.saveCharacter(form);
          setSaving(false);
          if (result) {
            setForm(result);
            setStatus("Profil karakter tersimpan.");
          }
        }}
      >
        <label>
          Nama karakter cerita
          <input
            required
            maxLength={60}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label>
          Penampilan karakter
          <textarea
            required
            minLength={5}
            maxLength={500}
            rows={3}
            value={form.appearance}
            onChange={(e) => setForm({ ...form, appearance: e.target.value })}
            placeholder="Ciri wajah, rambut, usia dewasa, dan detail identitas visual…"
          />
        </label>
        <label>
          Pakaian karakter
          <input
            required
            minLength={2}
            maxLength={250}
            value={form.outfit}
            onChange={(e) => setForm({ ...form, outfit: e.target.value })}
          />
        </label>
        <label>
          Gambar referensi
          <select
            value={form.referenceAssetId || ""}
            onChange={(e) =>
              setForm({
                ...form,
                referenceAssetId: e.target.value || undefined,
              })
            }
          >
            <option value="">Tanpa gambar referensi</option>
            {assets
              .filter((a) => a.type.startsWith("image/"))
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </label>
        <label className="button secondary">
          <ImagePlus size={15} />
          Upload referensi
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            disabled={saving}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setSaving(true);
              const id = await onUpload(file);
              if (id) setForm((f) => ({ ...f, referenceAssetId: id }));
              setSaving(false);
              e.target.value = "";
            }}
          />
        </label>
        <p className="muted small">
          PNG/JPG/WebP maksimal 5 MB. Gunakan gambar referensi yang sama di tool
          pembuat gambar/video untuk menjaga identitas karakter.
        </p>
        {form.referenceAssetId && (
          <ReferenceImage id={form.referenceAssetId} live={live} />
        )}
        <button className="button primary" disabled={saving}>
          <Save size={15} />
          Simpan profil karakter
        </button>
        {status && (
          <p className="studio-saved" role="status">
            {status}
          </p>
        )}
      </form>
    </section>
  );
}
export function ProjectBriefEditor({
  project,
  studio,
  onAgent,
}: {
  project: StudioProject;
  studio: StudioController;
  onAgent: (id: Room) => void;
}) {
  const [form, setForm] = useState<ProjectBrief>(project.briefDraft);
  const [saveState, setSaveState] = useState("Tersimpan");
  const [dirty, setDirty] = useState(false);
  const sequence = useRef(0);
  const pending = useRef<Promise<unknown>>(Promise.resolve());
  const saving = useRef(false);
  const draftRef = useRef(form);
  const dirtyRef = useRef(false);
  useEffect(
    () => () => {
      ++sequence.current;
      if (dirtyRef.current) void studio.saveBrief(project.id, draftRef.current);
    },
    [project.id],
  );
  function edit(next: ProjectBrief) {
    draftRef.current = next;
    dirtyRef.current = true;
    setDirty(true);
    setForm(next);
  }
  useEffect(() => {
    if (!dirty || studio.working?.projectId === project.id) return;
    const id = ++sequence.current;
    setSaveState("Perubahan belum tersimpan…");
    const timer = setTimeout(() => {
      saving.current = true;
      setSaveState("Menyimpan…");
      pending.current = studio.saveBrief(project.id, form).then((result) => {
        saving.current = false;
        if (id !== sequence.current) return;
        if (result) {
          dirtyRef.current = false;
          setDirty(false);
          setSaveState("Tersimpan otomatis");
        } else setSaveState("Belum tersimpan · coba simpan lagi");
      });
    }, 700);
    return () => clearTimeout(timer);
  }, [form, dirty, studio.working?.runId]);
  const set = <K extends keyof ProjectBrief>(
    key: K,
    value: ProjectBrief[K],
  ) => {
    edit({ ...form, [key]: value });
  };
  async function flush() {
    ++sequence.current;
    await pending.current;
    const result = dirty ? await studio.saveBrief(project.id, form) : project;
    if (result) {
      dirtyRef.current = false;
      setDirty(false);
      setSaveState("Tersimpan otomatis");
    }
    return result;
  }
  return (
    <section className="panel studio-brief-editor">
      <div className="section-head">
        <div>
          <span className="eyebrow">PROJECT BRIEF</span>
          <h2>{project.name}</h2>
        </div>
        <span className="studio-save-status" role="status">
          {saveState}
        </span>
      </div>
      <p className="muted">
        Brief tersimpan otomatis. Agen lain memakai versi yang telah Anda
        setujui; perubahan di bawah belum mengubah konteks bersama.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (await flush()) {
            onAgent("research");
            await studio.turn(
              project.id,
              "research",
              "Tampilkan brief terbaru untuk saya tinjau dan setujui.",
              "brief",
            );
          }
        }}
      >
        <fieldset disabled={!!studio.working}>
          <label>
            Ide dan tujuan cerita
            <textarea
              required
              minLength={5}
              maxLength={2000}
              rows={4}
              value={form.idea}
              onChange={(e) => set("idea", e.target.value)}
              placeholder="Apa yang terjadi, apa masalahnya, dan pesan apa yang ingin dibawa penonton?"
            />
          </label>
          <label>
            Produk / brand proyek (opsional)
            <textarea
              rows={2}
              maxLength={500}
              value={form.product}
              onChange={(e) => set("product", e.target.value)}
              placeholder="Nama, warna/bentuk, dan fakta produk yang boleh disebutkan."
            />
          </label>
          <label>
            Gunakan karakter tersimpan
            <select
              value={form.characterProfile?.id || ""}
              onChange={(e) => {
                const profile = studio.characters.find(
                  (c) => c.id === e.target.value,
                );
                if (profile) {
                  const { revision: _revision, ...snapshot } = profile;
                  edit({
                    ...form,
                    characterProfile: snapshot,
                    character:
                      `${profile.appearance} Pakaian: ${profile.outfit}`.slice(
                        0,
                        800,
                      ),
                  });
                } else set("characterProfile", undefined);
              }}
            >
              <option value="">Deskripsi karakter manual</option>
              {studio.characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Deskripsi karakter proyek
            <textarea
              required
              minLength={5}
              maxLength={800}
              rows={3}
              value={form.character}
              onChange={(e) => set("character", e.target.value)}
            />
          </label>
          <label>
            Audiens cerita
            <input
              required
              minLength={2}
              maxLength={300}
              value={form.audience}
              onChange={(e) => set("audience", e.target.value)}
            />
          </label>
          <div className="form-grid">
            <label>
              Gaya cerita proyek
              <select
                value={form.tone}
                onChange={(e) =>
                  set("tone", e.target.value as ProjectBrief["tone"])
                }
              >
                {Object.entries(ugcTones).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Jumlah adegan proyek
              <select
                value={form.sceneCount}
                onChange={(e) => set("sceneCount", +e.target.value)}
              >
                {[3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n} adegan
                  </option>
                ))}
              </select>
            </label>
            <label>
              Durasi adegan proyek
              <select
                value={form.sceneDuration}
                onChange={(e) =>
                  set("sceneDuration", +e.target.value as 5 | 8 | 10)
                }
              >
                {[5, 8, 10].map((n) => (
                  <option key={n} value={n}>
                    {n} detik
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="studio-brief-footer">
            <span>{form.sceneCount * form.sceneDuration} detik · 9:16</span>
            <button
              type="button"
              className="button secondary"
              onClick={() => void flush()}
            >
              <Save size={14} />
              Simpan brief
            </button>
            <button className="button primary">
              <Check size={15} />
              Pratinjau & ajukan brief
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
export function ProjectsPage({
  studio,
  accounts,
  assets,
  live,
  onNew,
  onAgent,
  onUpload,
  onContent,
}: {
  studio: StudioController;
  accounts: Account[];
  assets: Asset[];
  live: boolean;
  onNew: () => void;
  onAgent: (id: Room, sceneId?: string) => void;
  onUpload: (file: File) => Promise<string | undefined>;
  onContent: (id: string) => void;
}) {
  const project =
    studio.project?.creative && studio.project.creative.origin !== "ugc"
      ? undefined
      : studio.project;
  const [tab, setTab] = useState<
    "brief" | "results" | "characters" | "versions"
  >("brief");
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ONE PROJECT, ONE SHARED STORY</span>
          <h1>
            Proyek UGC<span>.</span>
          </h1>
          <p>Susun bersama tim, tinjau tiap tahap, lalu produksi per adegan.</p>
        </div>
        <button className="button primary" onClick={onNew}>
          <Plus size={16} />
          Proyek baru
        </button>
      </div>
      <StudioError studio={studio} />
      <div className="studio-projects-layout">
        <aside className="panel studio-project-list">
          <h2>Proyek Anda</h2>
          {studio.summaries
            .filter((p) => !p.creative || p.legacyUGC)
            .map((p) => (
              <button
                className={`studio-project-item ${p.id === studio.activeId ? "active" : ""}`}
                key={p.id}
                onClick={() => void studio.select(p.id)}
              >
                <FolderOpen size={17} />
                <span>
                  <strong>{p.name}</strong>
                  <small>
                    {accounts.find((a) => a.id === p.accountId)?.name} ·{" "}
                    {p.needsReview
                      ? "Perlu ditinjau ulang"
                      : stageNames[p.nextStage]}
                  </small>
                </span>
                <ArrowUpRight size={14} />
              </button>
            ))}
          {!studio.summaries.length && (
            <p className="muted">
              Belum ada proyek. Mulai dari ide kecil, lalu kembangkan bersama
              agen Anda.
            </p>
          )}
        </aside>
        <div className="studio-project-main">
          <div className="tabs studio-project-tabs">
            {[
              ["brief", "Brief"],
              ["results", "Hasil per adegan"],
              ["characters", "Karakter cerita"],
              ["versions", "Riwayat versi"],
            ].map(([id, label]) => (
              <button
                key={id}
                className={tab === id ? "active" : ""}
                onClick={() => setTab(id as typeof tab)}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "characters" ? (
            <CharacterEditor
              studio={studio}
              assets={assets}
              live={live}
              onUpload={onUpload}
            />
          ) : !project ? (
            <section className="panel studio-project-empty">
              <Sparkles size={30} />
              <h2>Pilih atau buat proyek.</h2>
              <p className="muted">
                Brief dan hasil produksi akan tersusun di sini. Anda juga bisa
                menyimpan profil karakter melalui tab Karakter cerita.
              </p>
              <button className="button primary" onClick={onNew}>
                Mulai proyek pertama
              </button>
            </section>
          ) : (
            <>
              <div className="studio-project-export">
                <button
                  className="text-button"
                  onClick={() => downloadProject(project)}
                >
                  <Save size={13} />
                  Unduh proyek & riwayat (.json)
                </button>
              </div>
              <StageProgress project={project} />
              {tab === "brief" && (
                <ProjectBriefEditor
                  key={project.id}
                  project={project}
                  studio={studio}
                  onAgent={onAgent}
                />
              )}
              {tab === "versions" && (
                <section className="panel studio-history-panel">
                  <h2>Riwayat hasil disetujui</h2>
                  <VersionHistory project={project} />
                </section>
              )}
              {tab === "results" && (
                <ProjectResults
                  project={project}
                  studio={studio}
                  onAgent={onAgent}
                  onContent={onContent}
                />
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
function downloadProject(project: StudioProject) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(project, null, 2)], {
      type: "application/json;charset=utf-8",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `byga-project-${project.id}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function StageProgress({ project }: { project: StudioProject }) {
  const current = nextStage(project);
  const order = Object.keys(stageNames) as StudioStage[];
  return (
    <ol className="studio-stage-progress" aria-label="Tahapan proyek">
      {order.map((stage, i) => (
        <li
          key={stage}
          className={
            current === stage
              ? "current"
              : order.indexOf(current) > i
                ? "done"
                : ""
          }
        >
          <span>
            {order.indexOf(current) > i ? <Check size={12} /> : i + 1}
          </span>
          <strong>{stageNames[stage]}</strong>
        </li>
      ))}
    </ol>
  );
}
function ProjectResults({
  project,
  studio,
  onAgent,
  onContent,
}: {
  project: StudioProject;
  studio: StudioController;
  onAgent: (id: Room, sceneId?: string) => void;
  onContent: (id: string) => void;
}) {
  const [copied, setCopied] = useState("");
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("Prompt disalin.");
    } catch {
      setCopied(
        "Clipboard tidak tersedia. Pilih dan salin teks prompt secara manual.",
      );
    }
  }
  return (
    <section className="panel studio-results">
      <div className="section-head">
        <h2>Hasil yang telah disetujui</h2>
        <button className="button secondary" onClick={() => onAgent("content")}>
          <MessageCircle size={15} />
          Diskusikan revisi
        </button>
      </div>
      {copied && (
        <p className="studio-saved" role="status">
          {copied}
        </p>
      )}
      {project.final && (
        <div className="studio-final-link">
          <p>
            Draft final tersedia di Content library. Perubahan proyek berikutnya
            tidak menimpa draft versi lama.
          </p>
          <button
            className="button secondary"
            onClick={() => onContent(project.final!.contentId)}
          >
            Buka draft final <ArrowUpRight size={14} />
          </button>
        </div>
      )}
      {!project.story ? (
        <p className="muted">
          Setujui brief dan cerita melalui percakapan agen untuk mulai menyusun
          adegan.
        </p>
      ) : (
        <>
          <h3>{project.story.data.title}</h3>
          <p className="muted">{project.story.data.synopsis}</p>
          {project.story.briefId !== project.brief?.id && (
            <p className="studio-stale">
              Cerita perlu ditinjau ulang karena brief telah berubah.
            </p>
          )}
          {project.story.data.scenes.map((scene) => (
            <article className="studio-result-scene" key={scene.id}>
              <div className="section-head">
                <h3>
                  {scene.id.slice(1)}. {scene.title}
                </h3>
                <button
                  className="text-button"
                  onClick={() => onAgent("content", scene.id)}
                >
                  Revisi adegan <ArrowUpRight size={13} />
                </button>
              </div>
              <p>{scene.narration}</p>
              <p className="muted">{scene.description}</p>
              {(["images", "videos"] as const).map((stage) => {
                const prompt = project[stage][scene.id];
                const valid = promptCurrent(project, stage, scene.id);
                return (
                  <div key={stage} className="studio-result-prompt">
                    <strong>{stageNames[stage]}</strong>
                    <span
                      className={
                        prompt && !valid ? "studio-stale" : "studio-saved"
                      }
                    >
                      {!prompt
                        ? "Belum disetujui"
                        : valid
                          ? "Disetujui"
                          : "Perlu ditinjau ulang"}
                    </span>
                    {prompt && (
                      <>
                        <textarea
                          aria-label={`${stageNames[stage]} disetujui ${scene.id}`}
                          readOnly
                          rows={5}
                          value={prompt.data}
                        />
                        <button
                          className="text-button"
                          onClick={() => void copy(prompt.data)}
                        >
                          <Copy size={13} />
                          Salin{" "}
                          {stage === "images"
                            ? "prompt gambar"
                            : "prompt video"}
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </article>
          ))}
        </>
      )}
    </section>
  );
}
export function AgentSettings({ studio }: { studio: StudioController }) {
  const [selected, setSelected] = useState<Room>("content");
  const agent = studio.agents.find((a) => a.id === selected)!;
  return (
    <section className="panel studio-agent-settings">
      <div className="section-head">
        <div>
          <h2>Tim & instruksi agen</h2>
          <p>Nama, peran, warna dan instruksi dapat Anda atur sendiri.</p>
        </div>
      </div>
      <StudioError studio={studio} />
      <div className="studio-agent-switch">
        {studio.agents.map((a) => (
          <button
            key={a.id}
            className={selected === a.id ? "active" : ""}
            onClick={() => setSelected(a.id)}
          >
            {a.name}
          </button>
        ))}
      </div>
      <AgentEditor key={agent.id} agent={agent} studio={studio} />
    </section>
  );
}
