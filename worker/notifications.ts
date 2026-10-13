import type { Env } from "./env";
import { credential, readSettings, log } from "./db";
export function backoff(attempt: number) {
  return Math.min(3600000, 60000 * 2 ** Math.max(0, attempt - 1));
}
export async function notify(
  env: Env,
  message: string,
  key: string = crypto.randomUUID(),
) {
  if ((await readSettings(env)).notification === "none") return;
  await env.DB.prepare(
    "INSERT OR IGNORE INTO notification_jobs(id,message,next_at,created_at) VALUES(?,?,?,?)",
  )
    .bind(key, message, Date.now(), new Date().toISOString())
    .run();
}
export async function deliverNotifications(env: Env) {
  const rows = await env.DB.prepare(
    "SELECT * FROM notification_jobs WHERE status='ready' AND next_at<=? AND lease_until<=? ORDER BY next_at LIMIT 5",
  )
    .bind(Date.now(), Date.now())
    .all<{ id: string; message: string; attempts: number }>();
  const settings = await readSettings(env);
  for (const job of rows.results) {
    const nonce = crypto.randomUUID();
    const claimed = await env.DB.prepare(
      "UPDATE notification_jobs SET lease=?,lease_until=? WHERE id=? AND status='ready' AND lease_until<=? AND next_at<=?",
    )
      .bind(nonce, Date.now() + 60000, job.id, Date.now(), Date.now())
      .run();
    if (!claimed.meta.changes) continue;
    try {
      let response: Response;
      if (settings.notification === "discord") {
        const url = await credential(env, "discordWebhook");
        if (!url) throw new Error("Webhook belum tersedia");
        response = await fetch(url, {
          method: "POST",
          redirect: "manual",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: `${job.message}\n${env.APP_URL}` }),
          signal: AbortSignal.timeout(15000),
        });
      } else if (settings.notification === "telegram") {
        const token = await credential(env, "telegramToken"),
          chatId = await credential(env, "telegramChatId");
        if (!token || !chatId) throw new Error("Bot belum tersedia");
        response = await fetch(
          `https://api.telegram.org/bot${token}/sendMessage`,
          {
            method: "POST",
            redirect: "manual",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: `${job.message}\n${env.APP_URL}`,
            }),
            signal: AbortSignal.timeout(15000),
          },
        );
      } else {
        await env.DB.prepare(
          "UPDATE notification_jobs SET status='cancelled',lease=NULL,lease_until=0 WHERE id=? AND lease=?",
        )
          .bind(job.id, nonce)
          .run();
        continue;
      }
      if (!response.ok) throw new Error("Delivery rejected");
      if (settings.notification === "telegram") {
        const result = (await response.json()) as { ok?: boolean };
        if (result.ok !== true) throw new Error("Telegram rejected delivery");
      } else await response.body?.cancel();
      await env.DB.prepare(
        "UPDATE notification_jobs SET status='sent',lease=NULL,lease_until=0 WHERE id=? AND lease=?",
      )
        .bind(job.id, nonce)
        .run();
    } catch {
      const attempts = job.attempts + 1;
      await env.DB.prepare(
        "UPDATE notification_jobs SET attempts=?,status=?,next_at=?,lease=NULL,lease_until=0 WHERE id=? AND lease=?",
      )
        .bind(
          attempts,
          attempts >= 5 ? "failed" : "ready",
          Date.now() + backoff(attempts),
          job.id,
          nonce,
        )
        .run();
      if (attempts >= 5)
        await log(
          env,
          "publish",
          "Notifikasi gagal setelah 5 percobaan. Periksa Settings.",
        );
    }
  }
}
