import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { Agent, interceptors, request as undiciRequest, type Dispatcher } from "undici";
import type {
  TuneWeaveMediaRegistration,
  TuneWeaveMediaStream,
  TuneWeaveRequest,
  TuneWeaveRuntimeConfig,
  TuneWeaveRuntimeStatus,
} from "@shared/types/tuneweave";
import { applyTuneWeaveBodyHeaders, encodeTuneWeaveRequestBody } from "./body";
import { isTuneWeaveBinaryResponse, parseTuneWeaveResponseBody } from "./response";

const DEFAULT_BASE_URL = "http://127.0.0.1:7832";
const MAX_CREDENTIALS = 8;
const DEFAULT_MEDIA_TTL_MS = 15 * 60 * 1000;
const MEDIA_PATH_PREFIX = "/tuneweave-media/";

const redirectDispatcher = new Agent().compose(
  interceptors.redirect({
    maxRedirections: 5,
    throwOnMaxRedirect: true,
    stripHeadersOnCrossOriginRedirect: [
      "authorization",
      "cookie",
      "proxy-authorization",
      "x-tuneweave-credential",
    ],
  }),
);
export class TuneWeaveRequestError extends Error {
  readonly status?: number;
  readonly body?: unknown;

  constructor(message: string, status?: number, body?: unknown) {
    super(message);
    this.name = "TuneWeaveRequestError";
    this.status = status;
    this.body = body;
  }
}

export function normalizeTuneWeaveBaseUrl(value: string): string {
  const url = new URL(value || DEFAULT_BASE_URL);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("TuneWeave base URL must use http or https");
  }
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

export function sanitizeTuneWeaveCredentials(values: readonly string[]): string[] {
  const result: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (!value || result.includes(value)) continue;
    if (value.length > 8192) throw new Error("TuneWeave credential is too long");
    result.push(value);
    if (result.length > MAX_CREDENTIALS) {
      throw new Error(`TuneWeave accepts at most ${MAX_CREDENTIALS} credentials`);
    }
  }
  return result;
}

const assertRelativePath = (path: string): void => {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\0")) {
    throw new Error("TuneWeave path must be an absolute relative path");
  }
  if (/^\/https?:/i.test(path)) throw new Error("absolute upstream URLs are not allowed");
};

export function buildTuneWeaveUrl(
  baseUrl: string,
  path: string,
  query?: TuneWeaveRequest["query"],
): URL {
  assertRelativePath(path);
  const url = new URL(`${normalizeTuneWeaveBaseUrl(baseUrl)}${path}`);
  for (const [key, rawValue] of Object.entries(query ?? {})) {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) {
      if (value === undefined || value === null) continue;
      url.searchParams.append(key, String(value));
    }
  }
  return url;
}

interface RuntimeCredential {
  value: string;
  platform?: string;
}

let runtimeBaseUrl = normalizeTuneWeaveBaseUrl(
  process.env.TUNEWEAVE_API_BASE?.trim() || DEFAULT_BASE_URL,
);
let runtimeCredentials: RuntimeCredential[] = [];

interface MediaTicket {
  stream: TuneWeaveMediaStream;
  expiresAt: number;
}

const mediaTickets = new Map<string, MediaTicket>();
let mediaProxyServer: Server | null = null;
let mediaProxyPort: number | null = null;
let mediaProxyStarting: Promise<number> | null = null;

const appendHeader = (headers: string[], name: string, value: string): void => {
  headers.push(name, value);
};

const storeCallerCredential = (credential: unknown): boolean => {
  const record =
    credential && typeof credential === "object" ? (credential as Record<string, unknown>) : null;
  const value =
    typeof credential === "string"
      ? credential.trim()
      : typeof record?.value === "string"
        ? record.value.trim()
        : "";
  if (!value || value.length > 8192) return false;
  const platform = typeof record?.platform === "string" ? record.platform : undefined;

  const duplicate = runtimeCredentials.find((item) => item.value === value);
  if (duplicate) return true;
  if (platform) {
    runtimeCredentials = runtimeCredentials.filter((item) => item.platform !== platform);
  }
  if (runtimeCredentials.length >= MAX_CREDENTIALS) return false;
  runtimeCredentials.push({ value, platform });
  return true;
};

/**
 * caller_credential 的 secret 在主进程截获，渲染进程只收到非敏感元数据。
 * 该函数同时递归处理统一包络中的 data 字段。
 */
export const sanitizeTuneWeaveResponse = (value: unknown, captureCredentials = true): unknown => {
  if (
    isTuneWeaveBinaryResponse(value) ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value)
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeTuneWeaveResponse(item, captureCredentials));
  }
  if (!value || typeof value !== "object") return value;

  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key !== "caller_credential" || child === null || child === undefined) {
      output[key] = sanitizeTuneWeaveResponse(child, captureCredentials);
      continue;
    }

    const stored = captureCredentials ? storeCallerCredential(child) : false;
    if (typeof child === "string") {
      output[key] = { stored };
      continue;
    }
    if (typeof child === "object") {
      const metadata = { ...(child as Record<string, unknown>) };
      delete metadata.value;
      const sanitizedMetadata = sanitizeTuneWeaveResponse(metadata, captureCredentials);
      output[key] = {
        ...(sanitizedMetadata && typeof sanitizedMetadata === "object"
          ? (sanitizedMetadata as Record<string, unknown>)
          : {}),
        stored,
      };
      continue;
    }
    output[key] = { stored: false };
  }
  return output;
};

export const requestTuneWeave = async (input: TuneWeaveRequest): Promise<unknown> => {
  const method = input.method ?? "GET";
  const url = buildTuneWeaveUrl(runtimeBaseUrl, input.path, input.query);
  const headers: string[] = [];

  for (const [name, value] of Object.entries(input.headers ?? {})) {
    appendHeader(headers, name, value);
  }
  appendHeader(headers, "Accept", "application/json, text/plain, */*");
  appendHeader(headers, "X-Request-ID", `splayer-${randomBytes(12).toString("hex")}`);

  if (input.includeCredentials !== false) {
    for (const credential of runtimeCredentials) {
      appendHeader(headers, "X-TuneWeave-Credential", credential.value);
    }
  }

  const body = encodeTuneWeaveRequestBody(input);
  applyTuneWeaveBodyHeaders(input, (name, value) => appendHeader(headers, name, value));

  let response: Awaited<ReturnType<typeof undiciRequest>>;
  try {
    response = await undiciRequest(url, {
      method: method as Dispatcher.HttpMethod,
      headers,
      body,
      dispatcher: redirectDispatcher,
      headersTimeout: 30_000,
      bodyTimeout: 60_000,
    });
  } catch (error) {
    throw new TuneWeaveRequestError(error instanceof Error ? error.message : String(error));
  }

  let responseBody: unknown;
  try {
    responseBody = await parseTuneWeaveResponseBody(
      response,
      response.statusCode >= 400 ? "auto" : (input.responseType ?? "auto"),
    );
  } catch (error) {
    throw new TuneWeaveRequestError(
      error instanceof Error ? error.message : "TuneWeave response decoding failed",
      response.statusCode,
    );
  }

  if (response.statusCode < 200 || response.statusCode >= 300) {
    const safeBody = sanitizeTuneWeaveResponse(responseBody, false);
    const message =
      safeBody && typeof safeBody === "object" && "error" in safeBody
        ? String(
            (safeBody as { error?: { message?: unknown } }).error?.message ??
              `TuneWeave request failed with HTTP ${response.statusCode}`,
          )
        : `TuneWeave request failed with HTTP ${response.statusCode}`;
    throw new TuneWeaveRequestError(message, response.statusCode, safeBody);
  }
  return isTuneWeaveBinaryResponse(responseBody)
    ? responseBody
    : sanitizeTuneWeaveResponse(responseBody, true);
};

const parseMediaExpiry = (value: TuneWeaveMediaStream["expires_at"]): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 10_000_000_000 ? value : value * 1000;
  }
  if (typeof value === "string" && value) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now() + DEFAULT_MEDIA_TTL_MS;
};

const purgeExpiredMediaTickets = (): void => {
  const now = Date.now();
  for (const [token, ticket] of mediaTickets) {
    if (ticket.expiresAt <= now) mediaTickets.delete(token);
  }
};

const copyUpstreamHeaders = (
  response: ServerResponse,
  headers: Record<string, string | string[] | undefined>,
): void => {
  const allowed = new Set([
    "accept-ranges",
    "content-disposition",
    "content-length",
    "content-range",
    "content-type",
    "etag",
    "last-modified",
  ]);
  for (const [name, value] of Object.entries(headers)) {
    if (!allowed.has(name.toLowerCase()) || value === undefined) continue;
    response.setHeader(name, value);
  }
  response.setHeader("Cache-Control", "no-store");
};

const handleMediaRequest = async (
  token: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> => {
  purgeExpiredMediaTickets();
  const ticket = mediaTickets.get(token);
  if (!ticket) {
    response.writeHead(404).end("media ticket not found or expired");
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }

  const headers: string[] = [];
  for (const [name, value] of Object.entries(ticket.stream.headers ?? {})) {
    appendHeader(headers, name, value);
  }
  if (request.headers.range) appendHeader(headers, "Range", request.headers.range);
  if (request.headers["if-range"]) {
    appendHeader(headers, "If-Range", String(request.headers["if-range"]));
  }

  try {
    const upstream = await undiciRequest(ticket.stream.url, {
      method: request.method as Dispatcher.HttpMethod,
      headers,
      dispatcher: redirectDispatcher,
      headersTimeout: 30_000,
      bodyTimeout: 0,
    });
    response.statusCode = upstream.statusCode;
    copyUpstreamHeaders(response, upstream.headers);
    if (request.method === "HEAD") {
      upstream.body.destroy();
      response.end();
      return;
    }
    upstream.body.on("error", () => {
      if (!response.destroyed) response.destroy();
    });
    request.once("aborted", () => upstream.body.destroy());
    response.once("close", () => upstream.body.destroy());
    upstream.body.pipe(response);
  } catch {
    if (!response.headersSent) response.writeHead(502);
    response.end("failed to fetch TuneWeave media");
  }
};

const ensureMediaProxy = async (): Promise<number> => {
  if (mediaProxyPort !== null) return mediaProxyPort;
  if (mediaProxyStarting) return mediaProxyStarting;

  mediaProxyStarting = new Promise<number>((resolve, reject) => {
    const server = createServer((request, response) => {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      if (!requestUrl.pathname.startsWith(MEDIA_PATH_PREFIX)) {
        response.writeHead(404).end();
        return;
      }
      const token = requestUrl.pathname.slice(MEDIA_PATH_PREFIX.length);
      void handleMediaRequest(token, request, response);
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      mediaProxyServer = server;
      mediaProxyPort = (server.address() as AddressInfo).port;
      resolve(mediaProxyPort);
    });
  }).finally(() => {
    mediaProxyStarting = null;
  });
  return mediaProxyStarting;
};

export const registerTuneWeaveMedia = async (
  stream: TuneWeaveMediaStream,
): Promise<TuneWeaveMediaRegistration> => {
  if (!stream?.url || !/^https?:\/\//i.test(stream.url)) {
    throw new Error("TuneWeave media stream does not contain a valid HTTP URL");
  }
  purgeExpiredMediaTickets();
  const port = await ensureMediaProxy();
  const token = randomBytes(24).toString("base64url");
  const expiresAt = Math.max(Date.now() + 10_000, parseMediaExpiry(stream.expires_at));
  mediaTickets.set(token, { stream: structuredClone(stream), expiresAt });
  return {
    url: `http://127.0.0.1:${port}${MEDIA_PATH_PREFIX}${token}`,
    expiresAt,
  };
};

export const configureTuneWeave = (config: TuneWeaveRuntimeConfig): TuneWeaveRuntimeStatus => {
  if (config.baseUrl !== undefined) runtimeBaseUrl = normalizeTuneWeaveBaseUrl(config.baseUrl);
  return getTuneWeaveStatus();
};

export const clearTuneWeaveCredentials = (): void => {
  runtimeCredentials = [];
};

export const getTuneWeaveStatus = (): TuneWeaveRuntimeStatus => ({
  baseUrl: runtimeBaseUrl,
  credentialCount: runtimeCredentials.length,
  mediaProxyPort,
});

export const closeTuneWeaveMediaProxy = (): void => {
  mediaTickets.clear();
  mediaProxyServer?.close();
  mediaProxyServer = null;
  mediaProxyPort = null;
};

export const callTuneWeave = async (
  name: string,
  params: Record<string, unknown>,
): Promise<unknown> => {
  switch (name) {
    case "request":
      return requestTuneWeave(params as unknown as TuneWeaveRequest);
    case "configure":
      return configureTuneWeave(params as TuneWeaveRuntimeConfig);
    case "status":
      return getTuneWeaveStatus();
    case "health":
      return requestTuneWeave({ path: "/healthz", includeCredentials: false });
    case "media:register":
      return registerTuneWeaveMedia(params.stream as TuneWeaveMediaStream);
    default:
      throw new Error(`unknown TuneWeave operation: ${name}`);
  }
};
