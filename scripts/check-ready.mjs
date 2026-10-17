import { setTimeout } from "node:timers/promises";

const base = new URL(process.env.BYGA_APP_URL || "https://agency.muidsoft.com");
if (
  base.protocol !== "https:" &&
  !["127.0.0.1", "localhost"].includes(base.hostname)
)
  throw new Error("Readiness verification requires HTTPS outside localhost.");
let status = "unreachable";
const attempts = 12;
const endpoint = new URL("/api/ready", base);
for (let attempt = 0; attempt < attempts; attempt++) {
  try {
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(5000),
      redirect: "error",
      cache: "no-store",
    });
    status = `HTTP ${response.status}`;
    const json = await response.json().catch(() => null);
    if (response.ok && json?.ok === true) {
      console.log(
        "Production readiness passed: secrets, D1 schema/settings and R2.",
      );
      process.exit(0);
    }
    if (!json) status += " (non-JSON response; check domain routing)";
  } catch (error) {
    status = error.cause?.code || error.name || "network error";
  }
  console.warn(
    `Readiness ${attempt + 1}/${attempts}: ${endpoint.origin} — ${status}`,
  );
  if (attempt < attempts - 1) await setTimeout(5000);
}
throw new Error(
  `Production readiness failed at ${endpoint} (${status}). Check Cloudflare custom domain/DNS, TLS, and Worker logs.`,
);
