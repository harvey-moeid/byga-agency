import { useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  Copy,
  Download,
  Film,
  Image,
  LoaderCircle,
  Sparkles,
} from "lucide-react";
import type { Account, Content } from "./domain";
import {
  defaultUGCBrief,
  ugcExport,
  ugcImagePrompt,
  ugcTones,
  ugcVideoPrompt,
  type UGCBrief,
} from "./ugc";

export function UGCStoryboard({
  item,
  copy,
  notify,
}: {
  item: Content;
  copy: (text: string) => void;
  notify: (text: string) => void;
}) {
  const story = item.ugc;
  if (!story) return null;
  function download() {
    const url = URL.createObjectURL(
      new Blob([ugcExport(item)], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `ugc-story-${item.id}.txt`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("Storyboard diunduh.");
  }
  return (
    <section className="ugc-storyboard" aria-label="Storyboard UGC">
      <div className="section-head ugc-section-head">
        <div>
          <span className="eyebrow">STORY → IMAGE → MOTION</span>
          <h2>Storyboard UGC</h2>
          <p>
            {story.scenes.length} adegan · {story.brief.sceneDuration}{" "}
            detik/adegan · {story.scenes.length * story.brief.sceneDuration}{" "}
            detik total · 9:16
          </p>
        </div>
        <div className="ugc-actions">
          <button
            type="button"
            className="button secondary"
            onClick={() => copy(ugcExport(item))}
          >
            <Copy size={15} />
            Salin semua prompt
          </button>
          <button type="button" className="button secondary" onClick={download}>
            <Download size={15} />
            Unduh storyboard
          </button>
        </div>
      </div>
      <p className="muted">
        Buat gambar dari prompt setiap adegan, lalu gunakan gambar itu sebagai
        frame awal image-to-video. Tambahkan narasi dan subtitle saat editing.
      </p>
      <div className="ugc-summary">
        <div>
          <h3>Hook</h3>
          <p>{story.hook}</p>
          <h3>Alur cerita</h3>
          <p>{story.synopsis}</p>
        </div>
        <div>
          <h3>Konsistensi karakter & produk</h3>
          <p>{story.characterLock}</p>
          <h3>Negative prompt</h3>
          <p>{story.negativePrompt}</p>
        </div>
      </div>
      <div className="ugc-scenes">
        {story.scenes.map((scene, i) => (
          <article className="ugc-scene" key={i} aria-label={`Adegan ${i + 1}`}>
            <div className="section-head">
              <h3>
                {i + 1}. {scene.title}
              </h3>
              <span className="soft-badge">
                {i * story.brief.sceneDuration}–
                {(i + 1) * story.brief.sceneDuration} dtk
              </span>
            </div>
            <div className="ugc-narration">
              <strong>Narasi / voice-over</strong>
              <p>{scene.narration}</p>
              <button
                type="button"
                className="text-button"
                onClick={() => copy(scene.narration)}
              >
                <Copy size={14} />
                Salin narasi {i + 1}
              </button>
            </div>
            <div className="ugc-prompt-grid">
              <div>
                <label>
                  <Image size={15} /> Text-to-image · adegan {i + 1}
                  <textarea
                    aria-label={`Text-to-image · adegan ${i + 1}`}
                    readOnly
                    rows={7}
                    value={ugcImagePrompt(story, scene)}
                  />
                </label>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => copy(ugcImagePrompt(story, scene))}
                >
                  <Copy size={14} />
                  Salin prompt gambar {i + 1}
                </button>
              </div>
              <div>
                <label>
                  <Film size={15} /> Image-to-video · adegan {i + 1}
                  <textarea
                    aria-label={`Image-to-video · adegan ${i + 1}`}
                    readOnly
                    rows={7}
                    value={ugcVideoPrompt(story, scene)}
                  />
                </label>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => copy(ugcVideoPrompt(story, scene))}
                >
                  <Copy size={14} />
                  Salin prompt video {i + 1}
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function UGCGenerator({
  accounts,
  contents,
  live,
  busy,
  onGenerate,
  onOpen,
  onSettings,
  initialBrief = defaultUGCBrief,
  initialAccountId = "",
}: {
  accounts: Account[];
  contents: Content[];
  live: boolean;
  busy: boolean;
  onGenerate: (accountId: string, brief: UGCBrief) => Promise<void>;
  onOpen: (item: Content) => void;
  onSettings: () => void;
  initialBrief?: UGCBrief;
  initialAccountId?: string;
}) {
  const [brief, setBrief] = useState<UGCBrief>(initialBrief);
  const [selectedAccount, setSelectedAccount] = useState(initialAccountId);
  const accountId = accounts.some((a) => a.id === selectedAccount)
    ? selectedAccount
    : accounts[0]?.id || "";
  const stories = contents.filter((item) => item.ugc);
  const set = <K extends keyof UGCBrief>(key: K, value: UGCBrief[K]) =>
    setBrief((b) => ({ ...b, [key]: value }));
  async function submit(e: FormEvent) {
    e.preventDefault();
    await onGenerate(accountId, brief);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ONE STORY, EVERY SCENE</span>
          <h1>
            Prompt UGC<span>.</span>
          </h1>
          <p>
            Dari ide cerita ke prompt gambar dan gerakan yang saling terhubung.
          </p>
        </div>
      </div>
      <div className="ugc-layout">
        <form className="panel ugc-form" onSubmit={submit}>
          <h2>Brief cerita</h2>
          <p className="muted">
            {live
              ? "Menggunakan provider AI pilihan Anda di Settings."
              : "Mode demo: contoh storyboard dari template, tanpa panggilan AI."}{" "}
            Hasil berupa teks prompt; gambar dan video dibuat di tool pilihan
            Anda.
          </p>
          {!accounts.length && (
            <div className="notice">
              <p>
                Tambahkan akun TikTok agar storyboard dapat disimpan sebagai
                draft.
              </p>
              <button
                type="button"
                className="text-button"
                onClick={onSettings}
              >
                Buka Settings <ArrowUpRight size={14} />
              </button>
            </div>
          )}
          <fieldset disabled={busy}>
            <label>
              Akun untuk draft
              <select
                required
                value={accountId}
                onChange={(e) => setSelectedAccount(e.target.value)}
              >
                <option value="" disabled>
                  Pilih akun
                </option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.handle}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Ide cerita UGC
              <textarea
                required
                minLength={5}
                maxLength={2000}
                rows={4}
                value={brief.idea}
                onChange={(e) => set("idea", e.target.value)}
                placeholder="Misalnya: cerita pekerja remote yang belajar menyiapkan kopi pagi agar hari terasa lebih tenang…"
              />
            </label>
            <label>
              Produk / brand (opsional)
              <textarea
                maxLength={500}
                rows={2}
                value={brief.product}
                onChange={(e) => set("product", e.target.value)}
                placeholder="Nama, ciri visual, dan fakta produk yang boleh disebutkan."
              />
            </label>
            <label>
              Karakter & penampilan
              <textarea
                required
                minLength={5}
                maxLength={800}
                rows={3}
                value={brief.character}
                onChange={(e) => set("character", e.target.value)}
              />
            </label>
            <label>
              Target audiens
              <input
                required
                minLength={2}
                maxLength={300}
                value={brief.audience}
                onChange={(e) => set("audience", e.target.value)}
              />
            </label>
            <label>
              Gaya cerita
              <select
                value={brief.tone}
                onChange={(e) =>
                  set("tone", e.target.value as UGCBrief["tone"])
                }
              >
                {Object.entries(ugcTones).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-grid">
              <label>
                Jumlah adegan
                <select
                  value={brief.sceneCount}
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
                Durasi per adegan
                <select
                  value={brief.sceneDuration}
                  onChange={(e) =>
                    set(
                      "sceneDuration",
                      +e.target.value as UGCBrief["sceneDuration"],
                    )
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
            <div className="form-hint">
              <Sparkles size={16} />
              9:16 · {brief.sceneCount * brief.sceneDuration} detik · narasi
              Indonesia · prompt visual Inggris
            </div>
            <button
              className="button primary full"
              disabled={busy || !accountId}
            >
              {busy ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <Sparkles size={17} />
              )}
              {busy
                ? "Menyusun cerita…"
                : live
                  ? "Generate storyboard UGC"
                  : "Buat storyboard demo"}
            </button>
          </fieldset>
        </form>
        <section
          className="panel ugc-history"
          aria-label="Cerita UGC tersimpan"
        >
          <div className="section-head">
            <h2>Cerita tersimpan</h2>
            <span className="soft-badge">{stories.length} CERITA</span>
          </div>
          <p className="muted">
            Storyboard tersimpan di Content library. Buka cerita untuk menyalin
            prompt per adegan atau mengunduh seluruh naskah.
          </p>
          {stories.length ? (
            stories.map((item) => (
              <button
                className="ugc-history-item"
                key={item.id}
                onClick={() => onOpen(item)}
              >
                <span>
                  <strong>{item.title}</strong>
                  <small>
                    {accounts.find((a) => a.id === item.accountId)?.name} ·{" "}
                    {item.ugc!.scenes.length} adegan ·{" "}
                    {item.ugc!.scenes.length * item.ugc!.brief.sceneDuration}{" "}
                    detik
                  </small>
                </span>
                <ArrowUpRight size={18} />
              </button>
            ))
          ) : (
            <div className="empty">
              <Film size={30} />
              <h3>Cerita pertama dimulai di sini.</h3>
              <p>
                Isi brief, lalu susun rangkaian adegan dengan karakter yang
                konsisten.
              </p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
