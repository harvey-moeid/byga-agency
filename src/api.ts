export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
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
  const data = await response.json().catch(() => {
    throw new ApiError(
      "Backend tidak mengembalikan respons yang valid.",
      response.status,
    );
  });
  if (!response.ok)
    throw new ApiError(
      (data as { error?: string }).error || "Permintaan gagal.",
      response.status,
    );
  return data as T;
}
