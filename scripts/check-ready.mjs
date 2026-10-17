import { setTimeout } from "node:timers/promises";

const base = new URL(process.env.BYGA_APP_URL || "https://agency.muidsoft.com");
if (
  base.protocol !== "https:" &&
  !["127.0.0.1", "localhost"].includes(base.hostname)
)
  throw new Error("Readiness verification requires HTTPS outside localhost.");
let status = "unreachable";
for (let attempt = 0; attempt < 6; attempt++) {
  try {
    const response = await fetch(new URL("/api/ready", base), {
      signal: AbortSignal.timeout(5000),
      redirect: "error",
      cache: "no-store",
    });
    status = String(response.status);
    if (response.ok && (await response.json()).ok === true) {
      console.log(
        "Production readiness passed: secrets, D1 schema/settings and R2.",
      );
      process.exit(0);
    }
  } catch {
    status = "unreachable or invalid response";
  }
  if (attempt < 5) await setTimeout(3000);
}
throw new Error(
  `Production readiness failed (${status}). Inspect deployment and Worker logs.`,
);
