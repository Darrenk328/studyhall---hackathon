import type { ClientEvent } from "./turn";

/** Parse a fetch() response body of Server-Sent Events into pipeline events, as they arrive. */
export async function* readSse<E = ClientEvent>(body: ReadableStream<Uint8Array>): AsyncGenerator<E> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let cut: number;
      while ((cut = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 2);
        const data = block
          .split("\n")
          .filter((l) => l.startsWith("data: "))
          .map((l) => l.slice(6))
          .join("\n");
        if (data) yield JSON.parse(data) as E;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Friendly text for non-streaming error responses from /api/answer. */
export async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string; issues?: { message: string }[] };
    if (body.message) return body.message;
    if (body.issues?.length) return body.issues.map((i) => i.message).join(" ");
  } catch {
    // not JSON
  }
  return res.status === 429 ? "Too many questions at once. Please wait a minute." : "Something went wrong. Please try again.";
}
