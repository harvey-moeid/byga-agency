import { useEffect, useRef, useState } from "react";
import type { Account } from "./domain";
import { api } from "./api";

interface MonitoringResponse {
  mode: "api" | "public";
  handle: string;
  profileUrl: string;
  reason?: string;
  profile?: {
    display_name?: string;
    username?: string;
    bio_description?: string;
    is_verified?: boolean;
    follower_count?: number;
    following_count?: number;
    likes_count?: number;
    video_count?: number;
  };
  videos?: {
    id: string;
    title?: string;
    share_url?: string;
    view_count?: number;
    like_count?: number;
    comment_count?: number;
    share_count?: number;
  }[];
  missingScopes?: string[];
}

function publicProfileUrl(handle: string) {
  if (!/^@[A-Za-z0-9_.]{1,24}$/.test(handle)) return "";
  return "https://www.tiktok.com/" + handle;
}

function TikTokPublicEmbed({ handle }: { handle: string }) {
  const target = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = target.current;
    if (!host || !publicProfileUrl(handle)) return;
    host.replaceChildren();
    const block = document.createElement("blockquote");
    block.className = "tiktok-embed";
    block.setAttribute("cite", publicProfileUrl(handle));
    block.setAttribute("data-unique-id", handle.slice(1));
    block.setAttribute("data-embed-type", "creator");
    block.style.maxWidth = "720px";
    block.style.minWidth = "288px";
    const section = document.createElement("section");
    const link = document.createElement("a");
    link.href = publicProfileUrl(handle);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = handle;
    section.append(link);
    block.append(section);
    host.append(block);
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://www.tiktok.com/embed.js";
    host.append(script);
    return () => {
      script.remove();
      host.replaceChildren();
    };
  }, [handle]);
  return (
    <div className="tiktok-public">
      <p className="muted small">
        Profil dan video publik ditampilkan langsung oleh TikTok. Jika embed
        dibatasi browser, buka profil lewat tautan di bawah.
      </p>
      <div ref={target} className="tiktok-embed-container" />
      <a
        className="button secondary tiktok-public-link"
        href={publicProfileUrl(handle)}
        target="_blank"
        rel="noopener noreferrer"
      >
        Buka {handle} di TikTok
      </a>
      <p className="muted small">
        Mode A tidak memerlukan Login Kit atau API key. Statistik tidak direkam
        atau diklaim sebagai data API.
      </p>
    </div>
  );
}

export function TikTokMonitoring({
  accounts,
  live,
  configured,
  onConnect,
}: {
  accounts: Account[];
  live: boolean;
  configured: boolean;
  onConnect: (account: Account) => void;
}) {
  const [selectedId, setSelectedId] = useState(accounts[0]?.id || "");
  const account = accounts.find((a) => a.id === selectedId) || accounts[0];
  const [preference, setPreference] = useState<"api" | "public">("api");
  const [retry, setRetry] = useState(0);
  const [data, setData] = useState<MonitoringResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!account || !live || !account.connected || preference === "public") {
      setData(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setData(null);
    setLoading(true);
    api<MonitoringResponse>("/accounts/" + account.id + "/monitor")
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(() => {
        if (!cancelled)
          setData({
            mode: "public",
            handle: account.handle,
            profileUrl: publicProfileUrl(account.handle),
            reason: "Permintaan monitoring API gagal. Menggunakan profil publik.",
          });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [account?.id, account?.connected, account?.handle, live, preference, retry]);

  if (!account)
    return <p className="muted">Tambahkan akun TikTok untuk melihat profilnya.</p>;

  const publicMode =
    preference === "public" ||
    !live ||
    !account.connected ||
    (!loading && data?.mode === "public");
  const profile = !publicMode && data?.mode === "api" ? data.profile : undefined;
  const number = (value: number | undefined) =>
    typeof value === "number" ? value.toLocaleString("id-ID") : "—";
  return (
    <section className="tiktok-monitor" aria-label="Pemantauan akun TikTok">
      <div className="section-head">
        <div>
          <h3>Monitoring akun · API dengan fallback otomatis</h3>
          <p>API read-only menjadi pilihan utama; profil publik selalu tersedia.</p>
        </div>
      </div>
      <label className="tiktok-monitor-account">
        Akun yang dipantau
        <select
          aria-label="Akun TikTok yang dipantau"
          value={account.id}
          onChange={(e) => {
            setSelectedId(e.target.value);
            setData(null);
          }}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.handle})
            </option>
          ))}
        </select>
      </label>
      <div className="tiktok-monitor-modes" role="group" aria-label="Pilihan mode pemantauan">
        <button
          type="button"
          className={preference === "api" ? "button primary" : "button secondary"}
          aria-pressed={preference === "api"}
          onClick={() => {
            setPreference("api");
            setRetry((n) => n + 1);
          }}
        >
          B · API read-only
        </button>
        <button
          type="button"
          className={preference === "public" ? "button primary" : "button secondary"}
          aria-pressed={preference === "public"}
          onClick={() => setPreference("public")}
        >
          A · Profil publik
        </button>
      </div>
      {preference === "api" && !account.connected && (
        <div className="tiktok-monitor-notice" role="status">
          <strong>API TikTok belum terhubung — Mode A aktif.</strong>
          <p>
            {configured
              ? "Hubungkan akun dengan izin baca saja. Jika TikTok belum menyetujui akses, profil publik tetap dapat digunakan."
              : "Client Key dan Client Secret belum dikonfigurasi. Anda tetap bisa melihat akun publik tanpa API."}
          </p>
          {live && configured && (
            <button
              type="button"
              className="button secondary"
              onClick={() => onConnect(account)}
            >
              Hubungkan API TikTok (read-only)
            </button>
          )}
        </div>
      )}
      {preference === "api" && loading && (
        <p className="muted" role="status">Memeriksa akses API TikTok…</p>
      )}
      {preference === "api" && !loading && data?.reason && (
        <p className="tiktok-monitor-notice" role="status">{data.reason}</p>
      )}
      {preference === "api" && !loading && publicMode && account.connected && (
        <button
          type="button"
          className="button secondary"
          onClick={() => setRetry((n) => n + 1)}
        >
          Coba lagi API
        </button>
      )}
      {profile && !loading && (
        <div className="tiktok-monitor-profile">
          <p className="tiktok-monitor-mode-ok">Mode B · TikTok Display API</p>
          <h3>{profile.display_name || account.name} {profile.is_verified ? "✓" : ""}</h3>
          <p className="muted">{account.handle}</p>
          {profile.bio_description && <p>{profile.bio_description}</p>}
          <div className="tiktok-monitor-metrics">
            <div><span>Followers</span><strong>{number(profile.follower_count)}</strong></div>
            <div><span>Following</span><strong>{number(profile.following_count)}</strong></div>
            <div><span>Total likes</span><strong>{number(profile.likes_count)}</strong></div>
            <div><span>Video publik</span><strong>{number(profile.video_count)}</strong></div>
          </div>
          {data?.missingScopes?.length ? (
            <p className="muted small">Izin tambahan diperlukan: {data.missingScopes.join(", ")}.</p>
          ) : null}
          {data?.videos?.length ? (
            <div className="tiktok-monitor-videos">
              <h4>Video terbaru dari API</h4>
              {data.videos.map((video) => (
                <div className="tiktok-monitor-video" key={video.id}>
                  <strong>{video.title || "Video " + video.id}</strong>
                  <span>Views: {number(video.view_count)} · Likes: {number(video.like_count)}</span>
                  {video.share_url?.startsWith("https://www.tiktok.com/") && (
                    <a href={video.share_url} target="_blank" rel="noopener noreferrer">Lihat video</a>
                  )}
                </div>
              ))}
            </div>
          ) : <p className="muted small">Belum ada video yang tersedia melalui izin API akun ini.</p>}
          <a href={publicProfileUrl(account.handle)} target="_blank" rel="noopener noreferrer">Buka profil TikTok</a>
        </div>
      )}
      {publicMode && (
        <div className="tiktok-monitor-public">
          <p className="tiktok-monitor-mode-public">
            Mode A · Profil publik tanpa API
          </p>
          <TikTokPublicEmbed handle={account.handle} />
        </div>
      )}
      <p className="muted small">
        Tidak ada auto-post dari panel ini. Informasi API hanya berasal dari akun
        yang memberikan izin OAuth; jika tidak tersedia, data statistik API
        tidak dibuat-buat.
      </p>
    </section>
  );
}
