export async function hash(value: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
async function key(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const decode = (str: string) =>
  Uint8Array.from(atob(str), (x) => x.charCodeAt(0));
export async function encrypt(value: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await key(secret),
    new TextEncoder().encode(value),
  );
  return `${encode(iv)}.${encode(new Uint8Array(ciphertext))}`;
}
export async function decrypt(value: string, secret: string) {
  const [iv, body] = value.split(".");
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: decode(iv) },
      await key(secret),
      decode(body),
    ),
  );
}
export async function constantEqual(a: string, b: string) {
  const [x, y] = await Promise.all([hash(a), hash(b)]);
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0;
}
