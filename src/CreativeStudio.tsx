import { useEffect, useState } from "react";
import {
  Check,
  Copy,
  Download,
  Film,
  Image,
  Plus,
  Sparkles,
  Upload,
} from "lucide-react";
import type { Account, Asset } from "./domain";
import type { StudioController } from "./useStudio";
import type { StudioProject } from "./studio";
import { characterSchema } from "./studio";
import { getVideo } from "./storage";
import {
  cameraMoves,
  characterDescription,
  characterMoves,
  creativeExport,
  imagePresets,
  mediaIntegrations,
  omniProfile,
  promptIsCurrent,
  sceneStatus,
  type CreativeCommand,
  type CreativeGlobals,
  type CreativeProject,
  type CreativeScene,
  type ImageSettings,
  type VideoSettings,
} from "./creative";
import "./creative.css";
const steps = [
  "Brief & Storyboard",
  "Image Prompt Builder",
  "Image Asset Manager",
  "Video Prompt Builder",
  "Video Asset Manager",
  "Review & Export",
];
const imageLabels: Record<keyof ImageSettings, string> = {
  subject: "Deskripsi subjek",
  characterType: "Jenis karakter",
  reference: "Arahan referensi wajah/karakter",
  outfit: "Pakaian scene",
  pose: "Pose",
  expression: "Ekspresi gambar",
  location: "Lokasi scene",
  background: "Background scene",
  activity: "Aktivitas / momen visual",
  style: "Gaya visual",
  lighting: "Lighting gambar",
  cameraAngle: "Camera angle",
  shot: "Shot type",
  lens: "Lens / look",
  color: "Color grading",
  mood: "Mood",
  composition: "Komposisi",
};
const videoLabels: Record<
  Exclude<keyof VideoSettings, "mode" | "motion" | "camera">,
  string
> = {
  subjectMotion: "Subject motion (opsional, mengganti preset)",
  body: "Body movement",
  expression: "Facial expression",
  framing: "Camera framing",
  environmentMotion: "Environmental motion",
  lighting: "Lighting continuity",
  physics: "Physics realism",
  audio: "Background audio",
  dialogue: "Dialogue",
  voice: "Voice direction",
  effects: "Sound effects",
  timing: "Scene timing (opsional)",
};
function download(
  value: string,
  name: string,
  type = "text/plain;charset=utf-8",
) {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function CreativeAssetPreview({
  id,
  live,
  video = false,
}: {
  id?: string;
  live: boolean;
  video?: boolean;
}) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let active = true,
      url: string | undefined;
    setSrc(undefined);
    if (id && live) setSrc(`/api/files/${encodeURIComponent(id)}`);
    else if (id)
      void getVideo(id)
        .then((blob) => {
          if (blob && active) {
            url = URL.createObjectURL(blob);
            setSrc(url);
          }
        })
        .catch(() => undefined);
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, live]);
  return (
    <div className="creative-preview">
      {src ? (
        <>
          {video ? (
            <video src={src} controls playsInline preload="metadata" />
          ) : (
            <img src={src} alt="Aset scene" loading="lazy" />
          )}
          <a
            href={src}
            download={`scene-${id}`}
            target="_blank"
            rel="noreferrer"
          >
            Download aset <Download size={14} />
          </a>
        </>
      ) : (
        <p>
          {id
            ? "Aset tidak tersedia di browser ini."
            : video
              ? "Belum ada video. Upload hasil dari Google Flow."
              : "Belum ada gambar. Upload hasil dari ChatGPT."}
        </p>
      )}
    </div>
  );
}
export function CreativeReview({
  creative: p,
  live,
}: {
  creative: CreativeProject;
  live: boolean;
}) {
  return (
    <div className="creative-review">
      {p.scenes.map((s) => (
        <article className="creative-card" key={s.id}>
          <h3>
            {s.title} · {s.duration}s
          </h3>
          <p>{s.narration}</p>
          <small>
            {sceneStatus(p, s)} · revisi {s.revision}
          </small>
          <div className="creative-media-grid">
            <CreativeAssetPreview id={s.assets.first} live={live} />
            <CreativeAssetPreview id={s.assets.video} live={live} video />
          </div>
          <details>
            <summary>Lihat prompt dan metadata</summary>
            <pre>{s.imagePrompt?.text}</pre>
            <pre>{s.videoPrompt?.text}</pre>
          </details>
        </article>
      ))}
    </div>
  );
}
export default function CreativeStudio({
  studio,
  accounts,
  assets,
  live,
  onUpload,
}: {
  studio: StudioController;
  accounts: Account[];
  assets: Asset[];
  live: boolean;
  onUpload: (file: File) => Promise<string | undefined>;
}) {
  const [name, setName] = useState("Konten TikTok 30 detik");
  const [account, setAccount] = useState(accounts[0]?.id || "");
  const [creating, setCreating] = useState(false);
  return (
    <section className="creative-studio" aria-label="Creative Prompt Studio">
      <header className="creative-hero">
        <div>
          <span className="eyebrow">BYGA / IDEA TO MOTION</span>
          <h1>Creative Prompt Studio</h1>
          <p>Satu cerita. Visual yang terarah. Gerakan yang terhubung.</p>
          <small>
            Template tanpa API · ChatGPT → Google Flow → review Agency
          </small>
        </div>
        <Sparkles size={32} />
      </header>
      {studio.error && (
        <div className="creative-alert" role="alert">
          {studio.error}
          <button className="text-button" onClick={studio.clearError}>
            Tutup
          </button>
        </div>
      )}
      <div className="creative-project-tools creative-card">
        <label>
          Proyek aktif
          <select
            aria-label="Pilih proyek Creative Studio"
            value={studio.activeId}
            disabled={studio.loading || creating || !!studio.working}
            onChange={(e) => void studio.select(e.target.value)}
          >
            <option value="">Pilih proyek</option>
            {studio.summaries.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.creative ? " · Creative" : " · UGC lama"}
              </option>
            ))}
          </select>
        </label>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setCreating(true);
            try {
              await studio.create(name, account, undefined, true);
            } finally {
              setCreating(false);
            }
          }}
        >
          <label>
            Nama proyek Creative
            <input
              value={name}
              maxLength={100}
              required
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Akun konten
            <select
              value={account}
              required
              onChange={(e) => setAccount(e.target.value)}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button primary"
            disabled={creating || !account || !!studio.working}
          >
            <Plus size={16} />
            {creating ? "Membuat…" : "Buat proyek Creative"}
          </button>
        </form>
      </div>
      {studio.loading && <p role="status">Memuat proyek…</p>}
      {studio.project ? (
        studio.project.creative ? (
          <CreativeWorkspace
            key={studio.project.id}
            project={studio.project}
            studio={studio}
            assets={assets}
            live={live}
            onUpload={onUpload}
          />
        ) : (
          <LegacyImport project={studio.project} studio={studio} />
        )
      ) : (
        <div className="creative-card">
          <h2>Mulai dari ide Anda</h2>
          <p>
            Buat proyek untuk storyboard TikTok 5 scene × 6 detik, atau pilih
            proyek tersimpan.
          </p>
        </div>
      )}
    </section>
  );
}
function LegacyImport({
  project,
  studio,
}: {
  project: StudioProject;
  studio: StudioController;
}) {
  const [duration, setDuration] = useState<4 | 6 | 8 | 10>(6);
  return (
    <div className="creative-card">
      <h2>Gunakan proyek UGC di Creative Studio</h2>
      <p>
        Durasi asli{" "}
        {project.brief?.data.sceneDuration || project.briefDraft.sceneDuration}{" "}
        detik tetap disimpan. Omni mendukung 4, 6, 8, dan 10 detik. Pilih durasi
        konversi secara eksplisit; prompt Creative dibuat ulang secara terpisah.
      </p>
      <label>
        Durasi konversi scene
        <select
          value={duration}
          onChange={(e) =>
            setDuration(Number(e.target.value) as typeof duration)
          }
        >
          {omniProfile.durations.map((d) => (
            <option key={d} value={d}>
              {d} detik
            </option>
          ))}
        </select>
      </label>
      <button
        className="button primary"
        onClick={() =>
          void studio.creativeCommand(project.id, {
            action: "init",
            convertDuration: duration,
          })
        }
      >
        Konversi eksplisit ke Creative Studio
      </button>
    </div>
  );
}
function CreativeWorkspace({
  project,
  studio,
  assets,
  live,
  onUpload,
}: {
  project: StudioProject;
  studio: StudioController;
  assets: Asset[];
  live: boolean;
  onUpload: (file: File) => Promise<string | undefined>;
}) {
  const p = project.creative!;
  const [step, setStep] = useState(0),
    [selected, setSelected] = useState(p.scenes[0].id);
  const [globals, setGlobals] = useState(p.globals),
    [globalDirty, setGlobalDirty] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Partial<CreativeScene>>>(
    {},
  );
  const [promptDrafts, setPromptDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [presetName, setPresetName] = useState("Preset saya");
  const scene = p.scenes.find((s) => s.id === selected) || p.scenes[0];
  const draft = { ...scene, ...drafts[scene.id] };
  const dirty =
    globalDirty ||
    !!Object.keys(drafts).length ||
    !!Object.keys(promptDrafts).length;
  const blocked = busy || !!studio.working;
  useEffect(() => {
    if (!globalDirty) setGlobals(p.globals);
  }, [p.globals, globalDirty]);
  function global<K extends keyof CreativeGlobals>(
    key: K,
    value: CreativeGlobals[K],
  ) {
    setGlobals((g) => ({ ...g, [key]: value }));
    setGlobalDirty(true);
  }
  function patch(patch: Partial<CreativeScene>) {
    setDrafts((d) => ({ ...d, [scene.id]: { ...d[scene.id], ...patch } }));
  }
  async function command(command: CreativeCommand) {
    setBusy(true);
    setNotice("");
    try {
      const result = await studio.creativeCommand(project.id, command);
      if (result) {
        setNotice("Tersimpan di " + (live ? "Agency" : "browser demo") + ".");
        return result;
      }
    } finally {
      setBusy(false);
    }
  }
  async function saveGlobals() {
    const result = await command({ action: "globals", globals });
    if (result) {
      setGlobalDirty(false);
      setGlobals(result.creative!.globals);
    }
  }
  async function saveScene() {
    const result = await command({
      action: "scene",
      sceneId: scene.id,
      patch: drafts[scene.id] || {},
    });
    if (result)
      setDrafts((d) => {
        const next = { ...d };
        delete next[scene.id];
        return next;
      });
  }
  async function copy(value?: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Prompt disalin.");
    } catch {
      setNotice(
        "Clipboard tidak tersedia. Pilih dan salin teks prompt secara manual.",
      );
    }
  }
  async function upload(
    file: File,
    slot: "first" | "last" | "reference" | "video",
  ) {
    setBusy(true);
    setNotice("");
    try {
      const id = await onUpload(file);
      if (id)
        await command({
          action: "asset",
          sceneId: scene.id,
          slot,
          assetId: id,
        });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Upload gagal.");
    } finally {
      setBusy(false);
    }
  }
  const approved = p.scenes.filter(
    (s) =>
      s.approvedRevision === s.revision &&
      promptIsCurrent(p, s, "image") &&
      promptIsCurrent(p, s, "video"),
  ).length;
  const total = p.scenes.reduce((sum, s) => sum + s.duration, 0);
  const kind = step === 3 ? "video" : "image";
  const field = kind === "image" ? "imagePrompt" : "videoPrompt";
  const promptId = `${scene.id}:${kind}`;
  const promptText = promptDrafts[promptId] ?? scene[field]?.text ?? "";
  const imageFiles = assets.filter((a) => a.type.startsWith("image/"));
  const videoFiles = assets.filter((a) => a.type.startsWith("video/"));
  const canGenerate = !blocked && !dirty;
  return (
    <>
      <div className="creative-progress creative-card">
        <div>
          <h2>{project.name}</h2>
          <p>
            {p.scenes.length} scene · {total} detik · {p.globals.ratio} ·{" "}
            {approved}/{p.scenes.length} disetujui
          </p>
        </div>
        <progress
          aria-label="Progress approval proyek"
          max={p.scenes.length}
          value={approved}
        />
        <small role="status">
          {blocked
            ? "Memproses…"
            : dirty
              ? "Ada perubahan belum disimpan"
              : `Tersimpan · revisi proyek ${project.revision}`}
        </small>
      </div>
      <nav className="creative-steps" aria-label="Tahapan Creative Studio">
        {steps.map((title, i) => (
          <button
            key={title}
            aria-current={step === i ? "step" : undefined}
            onClick={() => setStep(i)}
          >
            <span>{i + 1}</span>
            {title}
          </button>
        ))}
      </nav>
      {notice && (
        <p className="creative-feedback" role="status">
          {notice}
        </p>
      )}
      {dirty && (
        <p className="creative-alert">
          Simpan perubahan brief, scene, atau prompt sebelum generate, upload,
          dan approval. Draft edit tetap tersedia saat berpindah bagian.
        </p>
      )}
      <div className="creative-timeline" aria-label="Timeline scene">
        {p.scenes.map((s, i) => (
          <button
            key={s.id}
            aria-pressed={scene.id === s.id}
            onClick={() => setSelected(s.id)}
          >
            <strong>
              {i + 1}. {s.title}
            </strong>
            <small>
              {s.duration}s · {sceneStatus(p, s)}
            </small>
            <span>
              {s.assets.first ? "▣ Gambar" : "□ Gambar"} ·{" "}
              {s.assets.video ? "▶ Video" : "□ Video"}
            </span>
          </button>
        ))}
      </div>
      {step === 0 && (
        <div className="creative-card">
          <div className="creative-section-head">
            <h2>Brief & Storyboard</h2>
            <button
              className="button primary"
              disabled={blocked || !globalDirty}
              onClick={() => void saveGlobals()}
            >
              Simpan brief
            </button>
          </div>
          <div className="creative-form-grid">
            <label className="creative-wide">
              Ide utama
              <textarea
                value={globals.idea}
                maxLength={2000}
                onChange={(e) => global("idea", e.target.value)}
              />
            </label>
            <label>
              Karakter global
              <textarea
                value={globals.character}
                maxLength={800}
                onChange={(e) => global("character", e.target.value)}
              />
            </label>
            <label>
              Lingkungan global
              <textarea
                value={globals.environment}
                maxLength={800}
                onChange={(e) => global("environment", e.target.value)}
              />
            </label>
            <label>
              Karakter tersimpan
              <select
                value={globals.characterProfileId || ""}
                onChange={(e) => {
                  const profile = studio.characters.find(
                    (c) => c.id === e.target.value,
                  );
                  setGlobals((g) => ({
                    ...g,
                    characterProfileId: profile?.id,
                    characterRevision: profile?.revision,
                    characterReferenceId: profile?.referenceAssetId,
                    ...(profile
                      ? { character: characterDescription(profile) }
                      : {}),
                  }));
                  setGlobalDirty(true);
                }}
              >
                <option value="">Karakter custom</option>
                {studio.characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · rev {c.revision}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Rasio
              <select
                value={globals.ratio}
                onChange={(e) =>
                  global("ratio", e.target.value as CreativeGlobals["ratio"])
                }
              >
                {omniProfile.ratios.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <label>
              Bahasa output
              <select
                value={globals.language}
                onChange={(e) =>
                  global("language", e.target.value as "en" | "id")
                }
              >
                <option value="en">English</option>
                <option value="id">Bahasa Indonesia</option>
              </select>
            </label>
            <label>
              Negative constraints global
              <textarea
                value={globals.negative}
                maxLength={800}
                onChange={(e) => global("negative", e.target.value)}
              />
            </label>
            <label className="creative-check">
              <input
                type="checkbox"
                checked={globals.characterLock}
                onChange={(e) => global("characterLock", e.target.checked)}
              />
              Character Consistency Lock
            </label>
            <label className="creative-check">
              <input
                type="checkbox"
                checked={globals.environmentLock}
                onChange={(e) => global("environmentLock", e.target.checked)}
              />
              Scene / Environment Lock
            </label>
          </div>
          <p className="muted">
            Lock mempertahankan deskripsi di seluruh scene. Kesamaan wajah tetap
            perlu diperiksa pada hasil gambar/video.
          </p>
          <div className="creative-actions">
            <button
              className="button secondary"
              disabled={!canGenerate}
              onClick={() => void command({ action: "storyboard" })}
            >
              Susun storyboard template
            </button>
            <button
              className="button primary"
              disabled={!canGenerate}
              onClick={() => void command({ action: "generate", kind: "both" })}
            >
              Generate All Prompts
            </button>
            <button
              className="button secondary"
              disabled={!canGenerate}
              onClick={() => void command({ action: "approveBrief" })}
            >
              <Check size={16} />
              Setujui konteks untuk agen
            </button>
          </div>
          <CharacterEditor
            studio={studio}
            project={project}
            disabled={blocked || dirty}
            onNotice={setNotice}
            onUpload={onUpload}
            assets={imageFiles}
          />
        </div>
      )}
      {step !== 5 && (
        <article className="creative-card">
          <div className="creative-section-head">
            <h2>
              {scene.title} <small>rev {scene.revision}</small>
            </h2>
            <span className="creative-badge">{sceneStatus(p, scene)}</span>
          </div>
          {step === 0 && (
            <div className="creative-form-grid">
              <label>
                Judul scene
                <input
                  value={draft.title}
                  maxLength={120}
                  onChange={(e) => patch({ title: e.target.value })}
                />
              </label>
              <label>
                Durasi scene
                <select
                  value={draft.duration}
                  onChange={(e) =>
                    patch({
                      duration: Number(
                        e.target.value,
                      ) as CreativeScene["duration"],
                    })
                  }
                >
                  {omniProfile.durations.map((d) => (
                    <option key={d} value={d}>
                      {d} detik
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Narasi
                <textarea
                  value={draft.narration}
                  maxLength={800}
                  onChange={(e) => patch({ narration: e.target.value })}
                />
              </label>
              <label>
                Negative constraints scene
                <textarea
                  value={draft.negative}
                  maxLength={800}
                  onChange={(e) => patch({ negative: e.target.value })}
                />
              </label>
              <label>
                Karakter scene (saat lock nonaktif)
                <textarea
                  disabled={globals.characterLock}
                  value={draft.character}
                  maxLength={800}
                  onChange={(e) => patch({ character: e.target.value })}
                />
              </label>
              <label>
                Lingkungan scene (saat lock nonaktif)
                <textarea
                  disabled={globals.environmentLock}
                  value={draft.environment}
                  maxLength={800}
                  onChange={(e) => patch({ environment: e.target.value })}
                />
              </label>
            </div>
          )}
          {step === 1 && (
            <>
              <label>
                Preset gambar
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const value = e.target.value;
                    const saved = p.presets.find((x) => x.id === value);
                    patch({
                      image: saved
                        ? { ...saved.image }
                        : {
                            ...draft.image,
                            style:
                              imagePresets[value as keyof typeof imagePresets],
                          },
                    });
                  }}
                >
                  <option value="" disabled>
                    Pilih preset
                  </option>
                  {Object.keys(imagePresets).map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                  {p.presets.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name} · custom
                    </option>
                  ))}
                </select>
              </label>
              <div className="creative-form-grid">
                {(Object.keys(imageLabels) as Array<keyof ImageSettings>).map(
                  (key) => (
                    <label key={key}>
                      {imageLabels[key]}
                      <textarea
                        disabled={
                          (globals.characterLock &&
                            (key === "outfit" || key === "subject")) ||
                          (globals.environmentLock &&
                            (key === "location" || key === "background"))
                        }
                        value={draft.image[key]}
                        maxLength={800}
                        onChange={(e) =>
                          patch({
                            image: { ...draft.image, [key]: e.target.value },
                          })
                        }
                      />
                    </label>
                  ),
                )}
              </div>
              <div className="creative-actions">
                <label>
                  Nama preset
                  <input
                    value={presetName}
                    maxLength={60}
                    onChange={(e) => setPresetName(e.target.value)}
                  />
                </label>
                <button
                  className="button secondary"
                  disabled={!canGenerate || !presetName.trim()}
                  onClick={() =>
                    void command({
                      action: "savePreset",
                      sceneId: scene.id,
                      name: presetName,
                    })
                  }
                >
                  Simpan preset gambar
                </button>
              </div>
              <details>
                <summary>Preset Manager ({p.presets.length}/20)</summary>
                {p.presets.map((x) => (
                  <div className="creative-actions" key={x.id}>
                    <span>{x.name}</span>
                    <button
                      className="button secondary"
                      disabled={blocked}
                      onClick={() =>
                        void command({ action: "deletePreset", presetId: x.id })
                      }
                    >
                      Hapus preset {x.name}
                    </button>
                  </div>
                ))}
              </details>
            </>
          )}
          {step === 3 && (
            <>
              <p>
                {omniProfile.label} · durasi dan rasio perlu dipilih juga di
                Flow.
              </p>
              <div className="creative-form-grid">
                <label>
                  Mode referensi
                  <select
                    value={draft.video.mode}
                    onChange={(e) =>
                      patch({
                        video: {
                          ...draft.video,
                          mode: e.target.value as VideoSettings["mode"],
                        },
                      })
                    }
                  >
                    <option value="first">First frame</option>
                    <option
                      value="firstLast"
                      disabled={!omniProfile.modes.firstLast}
                    >
                      First + last frame
                    </option>
                    <option
                      value="references"
                      disabled={!omniProfile.modes.references}
                    >
                      First frame + referensi
                    </option>
                  </select>
                </label>
                <label>
                  Preset gerakan karakter
                  <select
                    value={draft.video.motion}
                    onChange={(e) =>
                      patch({
                        video: {
                          ...draft.video,
                          motion: e.target.value as VideoSettings["motion"],
                        },
                      })
                    }
                  >
                    {Object.keys(characterMoves).map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Preset camera movement
                  <select
                    value={draft.video.camera}
                    onChange={(e) =>
                      patch({
                        video: {
                          ...draft.video,
                          camera: e.target.value as VideoSettings["camera"],
                        },
                      })
                    }
                  >
                    {Object.keys(cameraMoves).map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </label>
                {(
                  Object.keys(videoLabels) as Array<keyof typeof videoLabels>
                ).map((key) => (
                  <label key={key}>
                    {videoLabels[key]}
                    <textarea
                      value={draft.video[key]}
                      maxLength={800}
                      onChange={(e) =>
                        patch({
                          video: { ...draft.video, [key]: e.target.value },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <div className="creative-form-grid">
                <label>
                  Output duration
                  <select
                    value={draft.duration}
                    onChange={(e) =>
                      patch({
                        duration: Number(
                          e.target.value,
                        ) as CreativeScene["duration"],
                      })
                    }
                  >
                    {omniProfile.durations.map((d) => (
                      <option key={d} value={d}>
                        {d} detik
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Aspect ratio
                  <input readOnly value={p.globals.ratio} />
                </label>
              </div>
              <p className="muted">
                Timing, audio, identitas, dan gerakan adalah arahan; hasil model
                perlu ditinjau. Upload first-frame sebelum menggunakan prompt di
                Flow.
              </p>
            </>
          )}
          {(step === 0 || step === 1 || step === 3) && (
            <div className="creative-actions">
              <button
                className="button primary"
                disabled={blocked || !drafts[scene.id]}
                onClick={() => void saveScene()}
              >
                Save Scene
              </button>
              <button
                className="button secondary"
                disabled={!canGenerate}
                onClick={() =>
                  void command({
                    action: "generate",
                    sceneId: scene.id,
                    kind: "both",
                  })
                }
              >
                Regenerate Scene
              </button>
              <button
                className="button secondary"
                disabled={!canGenerate}
                onClick={() =>
                  void command({ action: "duplicate", sceneId: scene.id })
                }
              >
                Duplicate Scene
              </button>
            </div>
          )}
          {(step === 1 || step === 3) && (
            <div className="creative-prompt">
              <div className="creative-section-head">
                <h3>
                  {kind === "image"
                    ? "ChatGPT Image Prompt"
                    : "Google Flow Video Prompt"}
                </h3>
                <small>
                  {scene[field]?.source || "Belum dibuat"} ·{" "}
                  {promptIsCurrent(p, scene, kind)
                    ? "Terbaru"
                    : "Perlu generate"}
                </small>
              </div>
              <label>
                Edit {kind} prompt
                <textarea
                  className="creative-prompt-editor"
                  value={promptText}
                  maxLength={16000}
                  onChange={(e) =>
                    setPromptDrafts((d) => ({
                      ...d,
                      [promptId]: e.target.value,
                    }))
                  }
                />
              </label>
              <div className="creative-actions">
                <button
                  className="button primary"
                  disabled={!canGenerate}
                  onClick={() =>
                    void command({
                      action: "generate",
                      sceneId: scene.id,
                      kind,
                    })
                  }
                >
                  <Sparkles size={16} />
                  {scene[field] ? "Regenerate Prompt" : "Generate Prompt"}
                </button>
                <button
                  className="button secondary"
                  disabled={
                    blocked ||
                    !promptText.trim() ||
                    promptDrafts[promptId] === undefined ||
                    !!drafts[scene.id] ||
                    globalDirty
                  }
                  onClick={async () => {
                    if (
                      await command({
                        action: "editPrompt",
                        sceneId: scene.id,
                        kind,
                        text: promptText,
                      })
                    )
                      setPromptDrafts((d) => {
                        const next = { ...d };
                        delete next[promptId];
                        return next;
                      });
                  }}
                >
                  Save Prompt
                </button>
                <button
                  className="button secondary"
                  disabled={!promptText}
                  onClick={() => void copy(promptText)}
                >
                  <Copy size={15} />
                  Copy {kind === "image" ? "Image" : "Video"} Prompt
                </button>
                <button
                  className="button secondary"
                  disabled={!promptText}
                  onClick={() =>
                    download(promptText, `${scene.id}-${kind}.txt`)
                  }
                >
                  Export Prompt TXT
                </button>
                <button
                  className="button secondary"
                  disabled={!promptText}
                  onClick={() =>
                    download(
                      JSON.stringify(
                        {
                          sceneId: scene.id,
                          kind,
                          prompt: promptText,
                          source: scene[field]?.source,
                        },
                        null,
                        2,
                      ),
                      `${scene.id}-${kind}.json`,
                      "application/json",
                    )
                  }
                >
                  Export Prompt JSON
                </button>
              </div>
            </div>
          )}
          {(step === 2 || step === 4) && (
            <>
              <h3>
                {step === 2 ? "Image Asset Manager" : "Video Asset Manager"}
              </h3>
              <p>
                {step === 2
                  ? "Upload hasil ChatGPT, first-frame, last-frame, atau gambar referensi. Maksimal 5 MB per gambar PNG/JPG/WebP."
                  : "Upload hasil Google Flow MP4/WebM, maksimal 50 MB. Video per scene disimpan terpisah; rangkai video final sebelum review publishing."}
              </p>
              {(step === 2
                ? (["first", "last", "reference"] as const)
                : (["video"] as const)
              ).map((slot) => (
                <div className="creative-asset-slot" key={slot}>
                  <h4>
                    {
                      {
                        first: "First-frame",
                        last: "Last-frame (opsional)",
                        reference: "Reference images",
                        video: "Video hasil Flow",
                      }[slot]
                    }
                  </h4>
                  <div className="creative-actions">
                    <label
                      className={`button secondary ${!canGenerate ? "creative-disabled" : ""}`}
                    >
                      <Upload size={16} />
                      Upload {slot}
                      <input
                        aria-label={`Upload ${slot}`}
                        type="file"
                        hidden
                        disabled={!canGenerate}
                        accept={
                          step === 2
                            ? "image/png,image/jpeg,image/webp"
                            : "video/mp4,video/webm"
                        }
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void upload(file, slot);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <label>
                      Hubungkan aset tersimpan
                      <select
                        aria-label={`Aset tersimpan ${slot}`}
                        disabled={!canGenerate}
                        value=""
                        onChange={(e) =>
                          void command({
                            action: "asset",
                            sceneId: scene.id,
                            slot,
                            assetId: e.target.value,
                          })
                        }
                      >
                        <option value="">Pilih aset</option>
                        {(step === 2 ? imageFiles : videoFiles).map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {slot === "reference" ? (
                    <div className="creative-media-grid">
                      {scene.assets.references.map((id) => (
                        <CreativeAssetPreview key={id} id={id} live={live} />
                      ))}
                    </div>
                  ) : (
                    <CreativeAssetPreview
                      id={scene.assets[slot]}
                      live={live}
                      video={slot === "video"}
                    />
                  )}
                </div>
              ))}
            </>
          )}
          <div className="creative-media-grid">
            {step !== 2 && (
              <CreativeAssetPreview id={scene.assets.first} live={live} />
            )}
            {step !== 4 && (
              <CreativeAssetPreview id={scene.assets.video} live={live} video />
            )}
          </div>
          <details>
            <summary>Riwayat revisi scene ({scene.history.length})</summary>
            {[...scene.history].reverse().map((version) => (
              <div key={version.revision} className="creative-actions">
                <span>
                  Revisi {version.revision}: {version.title}
                </span>
                <button
                  className="button secondary"
                  disabled={!canGenerate}
                  onClick={() =>
                    void command({
                      action: "restore",
                      sceneId: scene.id,
                      revision: version.revision,
                    })
                  }
                >
                  Pulihkan revisi {version.revision}
                </button>
              </div>
            ))}
          </details>
          <div className="creative-actions">
            <button
              className="button primary"
              disabled={
                !canGenerate || !scene.assets.first || !scene.assets.video
              }
              onClick={() =>
                void command({ action: "approve", sceneId: scene.id })
              }
            >
              <Check size={16} />
              Approve Scene
            </button>
            <button
              className="button secondary"
              disabled={!scene.imagePrompt}
              onClick={() => void copy(scene.imagePrompt?.text)}
            >
              Copy Image Prompt
            </button>
            <button
              className="button secondary"
              disabled={!scene.videoPrompt}
              onClick={() => void copy(scene.videoPrompt?.text)}
            >
              Copy Video Prompt
            </button>
          </div>
        </article>
      )}
      {step === 5 && (
        <div className="creative-card">
          <h2>Review & Export</h2>
          <label>
            Caption
            <textarea
              value={globals.caption}
              maxLength={2200}
              onChange={(e) => global("caption", e.target.value)}
            />
          </label>
          <button
            className="button secondary"
            disabled={blocked || !globalDirty}
            onClick={() => void saveGlobals()}
          >
            Simpan caption & brief
          </button>
          <p>
            Perubahan brief/caption membatalkan approval scene. Review ulang
            hasil terbaru sebelum mengirim draft. Content Library tetap
            memerlukan review video final dan approval publishing yang terpisah.
          </p>
          <div className="creative-actions">
            <button
              className="button secondary"
              onClick={() =>
                download(
                  creativeExport(p, "txt"),
                  `${project.id}-storyboard.txt`,
                )
              }
            >
              <Download size={16} />
              Export Storyboard TXT
            </button>
            <button
              className="button secondary"
              onClick={() =>
                download(
                  creativeExport(p, "json"),
                  `${project.id}-storyboard.json`,
                  "application/json",
                )
              }
            >
              Export Storyboard JSON
            </button>
            <button
              className="button primary"
              disabled={!canGenerate || approved !== p.scenes.length}
              onClick={() => void command({ action: "export" })}
            >
              Kirim draft ke Content Library
            </button>
          </div>
          {p.exported && (
            <p role="status">
              Draft terakhir: {p.exported.contentId}. Perubahan berikutnya
              menghasilkan draft baru setelah approval ulang.
            </p>
          )}
          <CreativeReview creative={p} live={live} />
        </div>
      )}
      <section className="creative-card">
        <h2>Tim kreatif Agency · AI Enhance opsional</h2>
        <p>
          Setujui konteks brief dahulu. Provider dan model memakai Settings
          Agency. Setiap klik Enhance memanggil provider dan dapat memakai
          kuota; hasil menunggu review dan penerapan Anda.
        </p>
        <div className="creative-actions">
          {(["story", "image", "video", "review"] as const).map((k, i) => (
            <button
              key={k}
              className="button secondary"
              disabled={
                !canGenerate ||
                !p.approvedContext ||
                JSON.stringify(p.approvedContext) !== JSON.stringify(p.globals)
              }
              onClick={() =>
                void studio.enhanceCreative(project.id, scene.id, k)
              }
            >
              {
                [
                  "Story Writer",
                  "Image Prompt Creator",
                  "Video Prompt Creator",
                  "Content Reviewer",
                ][i]
              }{" "}
              · Enhance with AI
            </button>
          ))}
          {studio.working && (
            <button
              className="button secondary"
              onClick={() => void studio.cancel()}
            >
              Hentikan AI Enhance
            </button>
          )}
        </div>
        {p.enhancement && (
          <div className="creative-prompt">
            <h3>Usulan {p.enhancement.kind} · belum diterapkan</h3>
            <pre>{p.enhancement.text}</pre>
            <div className="creative-actions">
              <button
                className="button primary"
                disabled={!canGenerate}
                onClick={() =>
                  void command({
                    action: "acceptEnhancement",
                    enhancementId: p.enhancement!.id,
                  })
                }
              >
                {p.enhancement.kind === "review"
                  ? "Selesai meninjau"
                  : "Terapkan usulan AI"}
              </button>
              <button
                className="button secondary"
                disabled={blocked}
                onClick={() => void command({ action: "dismissEnhancement" })}
              >
                Tolak usulan
              </button>
            </div>
          </div>
        )}
      </section>
      <section className="creative-card creative-manual">
        <h2>Transfer manual ke ChatGPT & Google Flow</h2>
        <ol>
          <li>
            Generate dan copy image prompt.{" "}
            <a href="https://chatgpt.com/" target="_blank" rel="noreferrer">
              Buka ChatGPT <Image size={14} />
            </a>
          </li>
          <li>
            Tempel prompt di ChatGPT, buat gambar, download, lalu upload ke
            Image Asset Manager sebagai first-frame.
          </li>
          <li>
            Periksa gambar; generate ulang video prompt setelah aset terhubung.
            Copy video prompt.{" "}
            <a
              href="https://labs.google/fx/tools/flow"
              target="_blank"
              rel="noreferrer"
            >
              Buka Google Flow <Film size={14} />
            </a>
          </li>
          <li>
            Upload gambar di Flow, pilih model, rasio, durasi, lalu tempel
            prompt. Buat dan download video.
          </li>
          <li>
            Upload hasil ke Video Asset Manager. Review dan approve tiap scene,
            lalu kirim draft ke Content Library.
          </li>
        </ol>
        <p>
          Tautan hanya membuka situs resmi. Prompt, upload, dan generasi
          dilakukan pengguna di masing-masing platform.
        </p>
        <div className="creative-form-grid">
          {mediaIntegrations.map((x) => (
            <div key={x.id}>
              <strong>{x.label}</strong>
              <p>
                {x.status} · generasi API belum diimplementasikan atau diuji.
              </p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
function CharacterEditor({
  studio,
  project,
  disabled,
  onNotice,
  onUpload,
  assets,
}: {
  studio: StudioController;
  project: StudioProject;
  disabled: boolean;
  onNotice: (text: string) => void;
  onUpload: (file: File) => Promise<string | undefined>;
  assets: Asset[];
}) {
  const p = project.creative!;
  const [form, setForm] = useState({
    id: crypto.randomUUID() as string,
    name: "Karakter saya",
    appearance: p.globals.character,
    outfit: "Kaus krem",
    face: "",
    hair: "",
    skin: "",
    accessories: "",
    proportions: "",
    style: "",
    features: "",
    referenceAssetId: "",
    revision: 0,
  });
  return (
    <details className="creative-character">
      <summary>Simpan / perbarui profil karakter Agency</summary>
      <label>
        Edit profil tersimpan
        <select
          value={form.id}
          onChange={(e) => {
            const profile = studio.characters.find(
              (x) => x.id === e.target.value,
            );
            if (profile)
              setForm({
                ...form,
                ...profile,
                referenceAssetId: profile.referenceAssetId || "",
              });
            else setForm({ ...form, id: crypto.randomUUID(), revision: 0 });
          }}
        >
          <option
            value={
              studio.characters.some((c) => c.id === form.id) ? "" : form.id
            }
          >
            Profil baru
          </option>
          {studio.characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <div className="creative-form-grid">
        {(
          [
            ["name", "Nama karakter"],
            ["appearance", "Deskripsi penampilan"],
            ["face", "Face description"],
            ["hair", "Hair"],
            ["skin", "Skin appearance"],
            ["outfit", "Outfit"],
            ["accessories", "Accessories"],
            ["proportions", "Body proportions"],
            ["style", "Character style"],
            ["features", "Identifying visual features"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              value={form[key]}
              maxLength={
                key === "name"
                  ? 60
                  : key === "appearance"
                    ? 500
                    : key === "outfit"
                      ? 250
                      : key === "face" || key === "features"
                        ? 300
                        : 200
              }
              onChange={(e) =>
                setForm((f) => ({ ...f, [key]: e.target.value }))
              }
            />
          </label>
        ))}
        <label>
          Referensi karakter
          <select
            value={form.referenceAssetId}
            onChange={(e) =>
              setForm((f) => ({ ...f, referenceAssetId: e.target.value }))
            }
          >
            <option value="">Tanpa referensi</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="button secondary">
          Upload referensi karakter
          <input
            type="file"
            hidden
            accept="image/png,image/jpeg,image/webp"
            disabled={disabled}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) {
                const id = await onUpload(file);
                if (id) setForm((f) => ({ ...f, referenceAssetId: id }));
              }
            }}
          />
        </label>
      </div>
      <button
        className="button secondary"
        disabled={disabled}
        onClick={async () => {
          const parsed = characterSchema.safeParse({
            ...form,
            referenceAssetId: form.referenceAssetId || undefined,
          });
          if (!parsed.success) {
            onNotice(
              "Lengkapi nama, penampilan (minimal 5 karakter) dan pakaian.",
            );
            return;
          }
          const result = await studio.saveCharacter(parsed.data);
          if (result) {
            setForm((f) => ({ ...f, revision: result.revision }));
            onNotice(
              "Profil karakter tersimpan. Pilih profil di brief untuk menggunakannya; perubahan profil terpilih menandai prompt terkait stale.",
            );
          }
        }}
      >
        Simpan profil karakter
      </button>
    </details>
  );
}
