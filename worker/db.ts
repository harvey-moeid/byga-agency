import type { Env } from "./env";
import type { Content, Settings } from "../src/domain";
import { decrypt } from "./security";
export async function readSettings(env: Env): Promise<Settings> {
  const row = await env.DB.prepare(
    "SELECT data FROM settings WHERE id=1",
  ).first<{ data: string }>();
  return JSON.parse(row!.data);
}
export async function credential(env: Env, name: string) {
  const row = await env.DB.prepare(
    "SELECT encrypted FROM credentials WHERE name=?",
  )
    .bind(name)
    .first<{ encrypted: string }>();
  return row ? decrypt(row.encrypted, env.ENCRYPTION_KEY) : null;
}
export async function log(env: Env, room: string, message: string) {
  await env.DB.prepare("INSERT INTO activity VALUES(?,?,?,?)")
    .bind(crypto.randomUUID(), room, message, new Date().toISOString())
    .run();
}
export async function content(env: Env, id: string) {
  const row = await env.DB.prepare("SELECT data FROM contents WHERE id=?")
    .bind(id)
    .first<{ data: string }>();
  if (!row) throw new Error("Konten tidak ditemukan.");
  return JSON.parse(row.data) as Content;
}
export async function save(env: Env, item: Content, oldStatus?: string) {
  const values = [
    JSON.stringify(item),
    item.status,
    item.scheduledAt || null,
    item.fileId || null,
  ];
  if (oldStatus) {
    const result = await env.DB.prepare(
      "UPDATE contents SET data=?, status=?, scheduled_at=?, file_id=? WHERE id=? AND status=?",
    )
      .bind(...values, item.id, oldStatus)
      .run();
    if (!result.meta.changes)
      throw new Error("Konten berubah. Muat ulang sebelum mencoba lagi.");
  } else
    await env.DB.prepare(
      "INSERT INTO contents(id,account_id,data,status,scheduled_at,created_at,file_id) VALUES(?,?,?,?,?,?,?)",
    )
      .bind(
        item.id,
        item.accountId,
        JSON.stringify(item),
        item.status,
        item.scheduledAt || null,
        item.createdAt,
        item.fileId || null,
      )
      .run();
}
export function deadline(months: number, now = new Date()) {
  const year = now.getUTCFullYear(),
    month = now.getUTCMonth() - months,
    day = now.getUTCDate();
  const result = new Date(
    Date.UTC(
      year,
      month,
      1,
      now.getUTCHours(),
      now.getUTCMinutes(),
      now.getUTCSeconds(),
      now.getUTCMilliseconds(),
    ),
  );
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result.toISOString();
}
