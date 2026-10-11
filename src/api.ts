export async function api<T = Record<string, unknown>>(
  path: string,
  body?: unknown,
  method = body ? "POST" : "GET",
): Promise<T> {
  const response = await fetch("/api" + path, {
    method,
    headers:
      body instanceof FormData ? {} : { "Content-Type": "application/json" },
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const data = await response
    .json()
    .catch(() => ({ error: "Backend tidak dapat dihubungi." }));
  if (!response.ok)
    throw new Error((data as { error?: string }).error || "Permintaan gagal.");
  return data as T;
}
