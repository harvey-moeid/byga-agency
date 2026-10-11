import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { Workspace, PublishOptions, CreatorInfo } from "./domain";
import { api } from "./api";
type Actions = {
  workspace: Workspace;
  live: boolean;
  run: (fn: () => Promise<void>) => Promise<void>;
  refresh: () => Promise<Workspace>;
  toast: (message: string) => void;
};
export function PublishApproval({
  accountId,
  onChange,
}: {
  accountId: string;
  onChange: (value: PublishOptions | undefined) => void;
}) {
  const [creator, setCreator] = useState<CreatorInfo>();
  const [error, setError] = useState("");
  const [options, setOptions] = useState<PublishOptions>({
    privacyLevel: "",
    disableComment: false,
    disableDuet: false,
    disableStitch: false,
    brandContent: false,
    brandOrganic: false,
    isAigc: false,
    rightsConfirmed: false,
    musicConfirmed: false,
    publishConsent: false,
  });
  useEffect(() => {
    let alive = true;
    api<CreatorInfo>("/accounts/" + accountId + "/creator")
      .then((c) => {
        if (!alive) return;
        setCreator(c);
        setOptions((o) => ({
          ...o,
          disableComment: c.comment_disabled,
          disableDuet: c.duet_disabled,
          disableStitch: c.stitch_disabled,
        }));
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [accountId]);
  useEffect(() => {
    onChange(
      creator &&
        options.privacyLevel &&
        options.rightsConfirmed &&
        options.musicConfirmed &&
        options.publishConsent &&
        !(options.brandContent && options.privacyLevel === "SELF_ONLY")
        ? options
        : undefined,
    );
  }, [creator, options, onChange]);
  if (error)
    return (
      <div className="notice error">
        <p>{error}</p>
      </div>
    );
  if (!creator)
    return <p className="muted small">Memuat pilihan creator TikTok…</p>;
  const field = (key: keyof PublishOptions, value: boolean | string) =>
    setOptions((o) => ({ ...o, [key]: value }));
  return (
    <section className="approval-options">
      <h3>
        <ShieldCheck size={17} />
        Final approval TikTok
      </h3>
      <p className="muted small">
        Akun terverifikasi: <strong>{creator.creator_nickname}</strong> ·
        maksimal {creator.max_video_post_duration_sec} detik
      </p>
      <label>
        Siapa yang dapat melihat?
        <select
          required
          value={options.privacyLevel}
          onChange={(e) => field("privacyLevel", e.target.value)}
        >
          <option value="" disabled>
            Pilih privasi (wajib)
          </option>
          {creator.privacy_level_options.map((p) => (
            <option key={p} value={p}>
              {(
                {
                  SELF_ONLY: "Only me",
                  PUBLIC_TO_EVERYONE: "Public",
                  MUTUAL_FOLLOW_FRIENDS: "Friends",
                  FOLLOWER_OF_CREATOR: "Followers",
                } as Record<string, string>
              )[p] || p}
            </option>
          ))}
        </select>
      </label>
      {(
        [
          ["disableComment", "Nonaktifkan komentar", creator.comment_disabled],
          ["disableDuet", "Nonaktifkan Duet", creator.duet_disabled],
          ["disableStitch", "Nonaktifkan Stitch", creator.stitch_disabled],
          ["brandContent", "Konten berbayar / branded content", false],
          ["brandOrganic", "Promosi brand milik sendiri", false],
          ["isAigc", "Konten dibuat/dimodifikasi dengan AI", false],
          [
            "rightsConfirmed",
            "Saya memiliki izin penggunaan video dan seluruh asetnya.",
            false,
          ],
          [
            "musicConfirmed",
            "Saya menyetujui Music Usage Confirmation TikTok untuk audio video ini.",
            false,
          ],
          [
            "publishConsent",
            "Saya mengizinkan konten ini dipublish dengan pilihan di atas, sekarang atau pada jadwal yang saya pilih.",
            false,
          ],
        ] as const
      ).map(([key, label, disabled]) => (
        <label className="checkbox-label" key={key}>
          <input
            type="checkbox"
            checked={Boolean(options[key])}
            disabled={disabled}
            onChange={(e) => field(key, e.target.checked)}
          />
          {label}
        </label>
      ))}
      <p className="muted small">
        <a
          href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en"
          target="_blank"
          rel="noreferrer"
        >
          Music Usage Confirmation
        </a>
        {options.brandContent && options.privacyLevel === "SELF_ONLY" && (
          <strong className="form-error">
            {" "}
            Branded content tidak boleh Only me.
          </strong>
        )}
      </p>
    </section>
  );
}
export function PublishQueue({
  workspace,
  live,
  run,
  refresh,
  toast,
}: Actions) {
  return (
    <section className="panel">
      <div className="section-head">
        <h2>Antrean eksekusi</h2>
        <span className="soft-badge">RETRY + STATUS CHECK</span>
      </div>
      <p className="muted small">
        {live
          ? "Publish membutuhkan OAuth, final approval, dan izin API aktif. Hasil belum pasti diperiksa ulang, tanpa membuat post kedua."
          : "Demo tidak mengirim video. Antrean nyata tersedia setelah login ke backend."}
      </p>
      {(workspace.publishJobs || []).map((j) => (
        <div className="job-row" key={j.id}>
          <div>
            <strong>
              {workspace.contents.find((c) => c.id === j.content_id)?.title ||
                "Konten"}
            </strong>
            <small>
              {j.status} · {j.attempts}/5 percobaan ·{" "}
              {j.last_error || "Menunggu langkah berikutnya"}
            </small>
            {["ready", "retry_wait", "processing"].includes(j.status) && (
              <small>
                Berikutnya:{" "}
                {new Date(j.next_at).toLocaleString("id-ID", {
                  timeZone: workspace.settings.timezone || "Asia/Jakarta",
                })}
              </small>
            )}
          </div>
          {j.status === "blocked" && !j.publish_id && (
            <button
              className="button secondary"
              onClick={() =>
                run(async () => {
                  await api("/publish-jobs/" + j.id + "/resume", {});
                  await refresh();
                  toast("Pekerjaan siap diproses.");
                })
              }
            >
              Lanjutkan
            </button>
          )}
          {j.publish_id && !["succeeded", "failed"].includes(j.status) && (
            <button
              className="button secondary"
              onClick={() =>
                run(async () => {
                  await api("/publish-jobs/" + j.id + "/reconcile", {});
                  await refresh();
                  toast("Status publish diperiksa.");
                })
              }
            >
              <RefreshCw size={14} />
              Periksa status
            </button>
          )}
        </div>
      ))}
      {!workspace.publishJobs?.length && (
        <p className="empty-inline">Belum ada pekerjaan publish.</p>
      )}
    </section>
  );
}
export function ResearchResults({
  workspace,
  live,
  run,
  refresh,
  toast,
  onUse,
}: Actions & { onUse: (id: string, title: string) => void }) {
  return (
    <>
      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Riset terbaru</h2>
            <p>
              Google Trends dan hashtag dari akun yang dipantau, dengan sumber
              yang terlihat.
            </p>
          </div>
          <button
            className="button secondary"
            disabled={!live}
            onClick={() =>
              run(async () => {
                const result = await api<{
                  results: { error?: string; disabled?: boolean }[];
                }>("/research/sync", {});
                await api("/research/report", {});
                await refresh();
                const errors = result.results
                  .filter((x) => x.error)
                  .map((x) => x.error);
                toast(
                  errors.length
                    ? errors.join(" · ")
                    : "Riset diperbarui. Sumber nonaktif dapat diaktifkan di Settings.",
                );
              })
            }
          >
            <RefreshCw size={14} />
            Sinkronkan riset
          </button>
        </div>
        <div className="trend-grid">
          {(workspace.trends || []).map((t) => (
            <article key={t.id} className="trend-card">
              <span className="eyebrow">{t.source}</span>
              <h3>{t.title}</h3>
              <p>
                {t.traffic || "Topik referensi"} ·{" "}
                {new Date(t.fetchedAt).toLocaleDateString("id-ID")}
              </p>
              <button
                className="text-button"
                onClick={() => onUse(t.id, t.title)}
              >
                Kirim ke ruang konten
                <ArrowUpRight size={14} />
              </button>
            </article>
          ))}
        </div>
        {!workspace.trends?.length && (
          <p className="empty-inline">
            Belum ada riset tersimpan. Aktifkan sumber di Settings; TikTok
            Research memerlukan persetujuan terpisah dari Login Kit.
          </p>
        )}
      </section>
      <section className="panel">
        <h2>Video kompetitor tersimpan</h2>
        {(workspace.researchVideos || []).map((v) => (
          <div className="research-video" key={v.id}>
            <div>
              <strong>@{v.username}</strong>
              <p>{v.description}</p>
              <small>
                {v.views.toLocaleString("id-ID")} views ·{" "}
                {v.likes.toLocaleString("id-ID")} likes ·{" "}
                {new Date(v.createdAt).toLocaleString("id-ID", {
                  timeZone: workspace.settings.timezone || "Asia/Jakarta",
                })}
              </small>
            </div>
            <button
              className="button secondary"
              onClick={() =>
                onUse(
                  v.id,
                  v.description.slice(0, 200) || "Inspirasi kompetitor",
                )
              }
            >
              Gunakan referensi
            </button>
          </div>
        ))}
        {!workspace.researchVideos?.length && (
          <p className="empty-inline">
            Tidak ada video kompetitor yang diambil. Tidak ada scraping atau
            metrik buatan.
          </p>
        )}
      </section>
    </>
  );
}
export function AnalyticsInsights({
  workspace,
  live,
  run,
  refresh,
  toast,
}: Actions) {
  const [metric, setMetric] = useState<"views" | "likes">("views");
  const [account, setAccount] = useState("all");
  const contents = new Set(
    workspace.contents
      .filter((c) => account === "all" || c.accountId === account)
      .map((c) => c.id),
  );
  const history = (workspace.analyticsHistory || [])
    .filter((x) => contents.has(x.contentId))
    .sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));
  const last = new Map<string, number>();
  const values = history
    .map((x) => {
      last.set(x.contentId, x[metric]);
      return {
        value: [...last.values()].reduce((a, b) => a + b, 0),
        time: x.recordedAt,
      };
    })
    .slice(-60);
  const max = Math.max(1, ...values.map((x) => x.value));
  const path = values
    .map(
      (v, i) =>
        `${i ? "L" : "M"}${30 + (i / Math.max(1, values.length - 1)) * 680},${170 - (v.value / max) * 135}`,
    )
    .join(" ");
  return (
    <>
      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Histori performa</h2>
            <p>Snapshot API tersimpan, bukan estimasi.</p>
          </div>
          <button
            className="button secondary"
            disabled={!live}
            onClick={() =>
              run(async () => {
                const result = await api<{ updated: number; errors: string[] }>(
                  "/analytics/sync",
                  {},
                );
                await refresh();
                toast(
                  `${result.updated} post diperbarui${result.errors.length ? `; ${result.errors.length} akun perlu diperiksa` : ""}.`,
                );
              })
            }
          >
            <RefreshCw size={14} />
            Sinkronkan analytics
          </button>
        </div>
        <div className="filter-row">
          <div className="tabs">
            <button
              className={metric === "views" ? "active" : ""}
              onClick={() => setMetric("views")}
            >
              Views
            </button>
            <button
              className={metric === "likes" ? "active" : ""}
              onClick={() => setMetric("likes")}
            >
              Likes
            </button>
          </div>
          <select
            aria-label="Akun histori analytics"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
          >
            <option value="all">Semua akun</option>
            {workspace.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        {values.length ? (
          <div className="history-chart">
            <svg
              viewBox="0 0 740 210"
              role="img"
              aria-label={`Histori ${metric}: ${values.length} snapshot`}
            >
              <path d="M30,170H710M30,35H710M30,102H710" stroke="#e4e9dc" />
              <text x="30" y="22" fill="#7e8d6d" fontSize="11">
                {max.toLocaleString("id-ID")} {metric}
              </text>
              <path d={path} stroke="#809e79" strokeWidth="3" fill="none" />
              <text x="30" y="200" fill="#7e8d6d" fontSize="10">
                {new Date(values[0].time).toLocaleDateString("id-ID")}
              </text>
              <text x="620" y="200" fill="#7e8d6d" fontSize="10">
                {new Date(values[values.length - 1].time).toLocaleDateString(
                  "id-ID",
                )}
              </text>
            </svg>
          </div>
        ) : (
          <p className="empty-inline">
            Histori muncul setelah post terkonfirmasi dan analytics
            disinkronkan. Post private mungkin tidak tersedia lewat Display API.
          </p>
        )}
      </section>
      <section className="panel">
        <h2>Rekomendasi per akun</h2>
        <p className="muted small">
          Minimal 3 post dengan ID dan data API untuk waktu optimal. Jam memakai{" "}
          {workspace.settings.timezone || "Asia/Jakarta"}.
        </p>
        {workspace.accounts.map((a) => {
          const rec = workspace.recommendations?.find(
            (r) => r.accountId === a.id,
          );
          return (
            <article key={a.id} className="recommendation-card">
              <div className="section-head">
                <h3>{a.name}</h3>
                <button
                  className="button secondary"
                  disabled={!live}
                  onClick={() =>
                    run(async () => {
                      await api("/recommendations/" + a.id, {});
                      await refresh();
                      toast("Rekomendasi diperbarui.");
                    })
                  }
                >
                  <Sparkles size={14} />
                  Analisis histori
                </button>
              </div>
              {rec ? (
                <>
                  <p>{rec.summary}</p>
                  <small>
                    {rec.sampleSize} post ·{" "}
                    {rec.source === "ai" ? "Analisis AI" : "Analisis historis"}{" "}
                    · {new Date(rec.createdAt).toLocaleDateString("id-ID")}
                  </small>
                  {!!rec.bestHours.length && (
                    <div className="hour-pills">
                      {rec.bestHours.map((hour) => (
                        <span key={hour}>
                          <CalendarDays size={13} />
                          {String(hour).padStart(2, "0")}:00
                        </span>
                      ))}
                    </div>
                  )}
                  {rec.ideas.map((idea) => (
                    <p className="recommendation-idea" key={idea}>
                      <Check size={13} />
                      {idea}
                    </p>
                  ))}
                </>
              ) : (
                <p>Belum ada rekomendasi tersimpan.</p>
              )}
            </article>
          );
        })}
      </section>
    </>
  );
}
