import "server-only";

/** An LMS reply we can explain to the teacher. `status` 401/403 means "connect again" / "no access". */
export class LmsError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * fetch with a timeout and one retry on a network error, 429 or 5xx, for the
 * Google Classroom and Moodle APIs (S25). Returns the parsed JSON body.
 */
export async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<unknown> {
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
      if ((res.status === 429 || res.status >= 500) && attempt === 0) {
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
      const text = await res.text();
      let body: unknown = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        throw new LmsError("The service sent back something we couldn't read.", res.status || 502);
      }
      if (!res.ok) {
        const message =
          (body as { error?: { message?: string }; error_description?: string } | null)?.error?.message ??
          (body as { error_description?: string } | null)?.error_description ??
          `HTTP ${res.status}`;
        throw new LmsError(message, res.status);
      }
      return body;
    } catch (e) {
      if (e instanceof LmsError) throw e;
      last = e;
      if (attempt === 0) continue;
    }
  }
  throw new LmsError(last instanceof Error && last.name === "TimeoutError" ? "The service took too long to answer." : "We couldn't reach the service.", 504);
}
