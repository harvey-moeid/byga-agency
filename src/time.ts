const offsets: Record<string, number> = {
  "Asia/Jakarta": 7,
  "Asia/Makassar": 8,
  "Asia/Jayapura": 9,
  UTC: 0,
};
export function dateKey(value: string | Date, timezone = "Asia/Jakarta") {
  const d = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (key: string) => parts.find((x) => x.type === key)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function dateInput(value: string | Date, timezone = "Asia/Jakarta") {
  const d = value instanceof Date ? value : new Date(value);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return dateKey(d, timezone) + "T" + time;
}
export function localToISO(value: string, timezone = "Asia/Jakarta") {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || !(timezone in offsets))
    throw new Error("Waktu atau zona waktu tidak valid.");
  const parsed = new Date(
    value + `${offsets[timezone] === 0 ? "+00" : "+0" + offsets[timezone]}:00`,
  );
  if (
    !Number.isFinite(parsed.getTime()) ||
    dateInput(parsed, timezone) !== value
  )
    throw new Error("Waktu tidak valid.");
  return parsed.toISOString();
}
export function optimalTime(
  hours: number[],
  timezone = "Asia/Jakarta",
  now = Date.now(),
) {
  if (!hours.length)
    throw new Error("Belum cukup histori untuk memilih waktu optimal.");
  const hour = hours[0];
  let date = new Date(
    localToISO(
      dateKey(new Date(now), timezone) + `T${String(hour).padStart(2, "0")}:00`,
      timezone,
    ),
  );
  if (date.getTime() <= now) date = new Date(date.getTime() + 86400000);
  return dateInput(date, timezone);
}
