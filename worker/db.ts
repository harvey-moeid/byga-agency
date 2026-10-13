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
export class ContentConflict extends Error {
  constructor() {
    super("Konten atau publish berubah. Muat ulang sebelum mencoba lagi.");
  }
}
export function checkRevision(item: Content, expected?: number) {
  if (expected !== undefined && expected !== (item.revision || 0))
    throw new ContentConflict();
}
// A leased or remotely initialized job must never lose the approval it is using.
const cancellable =
  "lease_until<=? AND status IN ('ready','retry_wait','blocked','failed') AND (publish_id IS NULL OR status='failed')";
export async function save(
  env: Env,
  item: Content,
  previous?: Content,
  cancelJob = false,
) {
  item.revision = previous ? (previous.revision || 0) + 1 : 0;
  const values = [
    JSON.stringify(item),
    item.status,
    item.scheduledAt || null,
    item.fileId || null,
  ];
  if (previous) {
    const now = Date.now();
    const update = env.DB.prepare(
      `UPDATE contents SET data=?, status=?, scheduled_at=?, file_id=? WHERE id=? AND json(data)=json(?)${cancelJob ? ` AND NOT EXISTS(SELECT 1 FROM publish_jobs WHERE content_id=contents.id AND NOT (${cancellable}))` : ""}`,
    ).bind(
      ...values,
      item.id,
      JSON.stringify(previous),
      ...(cancelJob ? [now] : []),
    );
    const results = cancelJob
      ? await env.DB.batch([
          update,
          env.DB.prepare(
            `DELETE FROM publish_jobs WHERE content_id=? AND ${cancellable} AND EXISTS(SELECT 1 FROM contents WHERE id=? AND json(data)=json(?))`,
          ).bind(item.id, now, item.id, JSON.stringify(item)),
        ])
      : [await update.run()];
    if (!results[0].meta.changes) throw new ContentConflict();
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
export async function deleteContent(env: Env, item: Content) {
  const result = await env.DB.prepare(
    `DELETE FROM contents WHERE id=? AND json(data)=json(?) AND NOT EXISTS(SELECT 1 FROM publish_jobs WHERE content_id=contents.id AND NOT (${cancellable}))`,
  )
    .bind(item.id, JSON.stringify(item), Date.now())
    .run();
  if (!result.meta.changes) throw new ContentConflict();
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
