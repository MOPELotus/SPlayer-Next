import { request as undiciRequest } from "undici";
import type {
  TuneWeaveBinaryResponse,
  TuneWeaveResponseType,
} from "@shared/types/tuneweave";

type UndiciResponse = Awaited<ReturnType<typeof undiciRequest>>;

const headerValue = (
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string => {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
};

const isJsonContentType = (contentType: string): boolean =>
  contentType.includes("application/json") || contentType.includes("+json");

const isTextContentType = (contentType: string): boolean =>
  contentType.startsWith("text/") ||
  contentType.includes("application/xml") ||
  contentType.includes("+xml") ||
  contentType.includes("application/javascript") ||
  contentType.includes("application/x-www-form-urlencoded") ||
  contentType.includes("application/vnd.apple.mpegurl") ||
  contentType.includes("application/dash+xml");

export const parseContentDispositionFileName = (value: string): string | undefined => {
  if (!value) return undefined;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(value)?.[1];
  if (utf8) {
    try {
      return decodeURIComponent(utf8).replace(/[\\/\0]/g, "_");
    } catch {
      return utf8.replace(/[\\/\0]/g, "_");
    }
  }
  const quoted = /filename="([^"]+)"/i.exec(value)?.[1];
  const plain = /filename=([^;]+)/i.exec(value)?.[1]?.trim();
  const name = quoted ?? plain;
  return name ? name.replace(/[\\/\0]/g, "_") : undefined;
};

export const isTuneWeaveBinaryResponse = (
  value: unknown,
): value is TuneWeaveBinaryResponse =>
  Boolean(value) &&
  typeof value === "object" &&
  (value as { kind?: unknown }).kind === "binary" &&
  (value as { bytes?: unknown }).bytes instanceof Uint8Array;

export const parseTuneWeaveResponseBody = async (
  response: UndiciResponse,
  requestedType: TuneWeaveResponseType = "auto",
): Promise<unknown> => {
  const contentType = headerValue(response.headers, "content-type").toLowerCase();
  const responseType =
    requestedType === "auto"
      ? isJsonContentType(contentType)
        ? "json"
        : isTextContentType(contentType)
          ? "text"
          : "bytes"
      : requestedType;

  if (responseType === "bytes") {
    const contentDisposition = headerValue(response.headers, "content-disposition");
    const bytes = new Uint8Array(await response.body.arrayBuffer());
    return {
      kind: "binary",
      status: response.statusCode,
      contentType: contentType || "application/octet-stream",
      contentDisposition: contentDisposition || undefined,
      fileName: parseContentDispositionFileName(contentDisposition),
      bytes,
    } satisfies TuneWeaveBinaryResponse;
  }

  const text = await response.body.text();
  if (!text) return null;
  if (responseType === "text") return text;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("TuneWeave returned invalid JSON");
  }
};
