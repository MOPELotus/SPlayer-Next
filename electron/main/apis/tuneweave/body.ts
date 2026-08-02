import { Blob } from "node:buffer";
import { FormData } from "undici";
import type {
  TuneWeaveMultipartBody,
  TuneWeaveMultipartFile,
  TuneWeaveRequest,
} from "@shared/types/tuneweave";

const MAX_MULTIPART_FILES = 32;
const MAX_MULTIPART_FILE_BYTES = 512 * 1024 * 1024;
const MAX_MULTIPART_TOTAL_BYTES = 1024 * 1024 * 1024;

export type TuneWeaveEncodedBody = string | FormData | undefined;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hasHeader = (headers: Record<string, string> | undefined, name: string): boolean =>
  Object.keys(headers ?? {}).some((key) => key.toLowerCase() === name.toLowerCase());

const assertSafeFieldName = (value: string, label: string): string => {
  const field = value.trim();
  if (!field || field.length > 256 || /[\r\n\0]/.test(field)) {
    throw new Error(`${label} is invalid`);
  }
  return field;
};

const normalizeFile = (value: unknown, index: number): TuneWeaveMultipartFile => {
  if (!isRecord(value)) throw new Error(`multipart file ${index} must be an object`);
  const field = assertSafeFieldName(String(value.field ?? ""), `multipart file ${index} field`);
  const fileName = String(value.fileName ?? "").trim();
  if (!fileName || fileName.length > 512 || /[\r\n\0]/.test(fileName)) {
    throw new Error(`multipart file ${index} name is invalid`);
  }
  const contentType =
    typeof value.contentType === "string" && value.contentType.trim()
      ? value.contentType.trim()
      : "application/octet-stream";
  if (/[^\x20-\x7e]/.test(contentType) || /[\r\n]/.test(contentType)) {
    throw new Error(`multipart file ${index} content type is invalid`);
  }
  if (!(value.bytes instanceof Uint8Array)) {
    throw new Error(`multipart file ${index} bytes must be Uint8Array`);
  }
  if (value.bytes.byteLength > MAX_MULTIPART_FILE_BYTES) {
    throw new Error(`multipart file ${index} exceeds 512 MiB`);
  }
  return { field, fileName, contentType, bytes: value.bytes };
};

const encodeMultipart = (
  rawBody: unknown,
  headers: Record<string, string> | undefined,
): FormData => {
  if (hasHeader(headers, "content-type")) {
    throw new Error("multipart Content-Type is generated automatically");
  }
  if (!isRecord(rawBody)) throw new Error("multipart body must be an object");
  const body = rawBody as TuneWeaveMultipartBody;
  const form = new FormData();

  if (body.fields !== undefined) {
    if (!isRecord(body.fields)) throw new Error("multipart fields must be an object");
    for (const [rawName, rawValue] of Object.entries(body.fields)) {
      const name = assertSafeFieldName(rawName, "multipart field name");
      const values = Array.isArray(rawValue) ? rawValue : [rawValue];
      for (const value of values) {
        if (typeof value !== "string") {
          throw new Error(`multipart field ${name} must contain strings`);
        }
        form.append(name, value);
      }
    }
  }

  const files = body.files ?? [];
  if (!Array.isArray(files)) throw new Error("multipart files must be an array");
  if (files.length > MAX_MULTIPART_FILES) {
    throw new Error(`multipart accepts at most ${MAX_MULTIPART_FILES} files`);
  }
  let totalBytes = 0;
  files.forEach((rawFile, index) => {
    const file = normalizeFile(rawFile, index);
    totalBytes += file.bytes.byteLength;
    if (totalBytes > MAX_MULTIPART_TOTAL_BYTES) {
      throw new Error("multipart files exceed 1 GiB in total");
    }
    const bytes = Buffer.from(
      file.bytes.buffer,
      file.bytes.byteOffset,
      file.bytes.byteLength,
    );
    form.append(
      file.field,
      new Blob([bytes], { type: file.contentType }),
      file.fileName,
    );
  });

  return form;
};

/** Encode a renderer-safe TuneWeave request body for Undici. */
export const encodeTuneWeaveRequestBody = (input: TuneWeaveRequest): TuneWeaveEncodedBody => {
  const method = input.method ?? "GET";
  if (input.body === undefined) return undefined;
  if (method === "GET" || method === "HEAD") {
    throw new Error(`${method} TuneWeave requests cannot contain a body`);
  }

  switch (input.bodyType ?? "json") {
    case "json":
      return JSON.stringify(input.body);
    case "text":
      if (typeof input.body !== "string") throw new Error("text body must be a string");
      return input.body;
    case "multipart":
      return encodeMultipart(input.body, input.headers);
    default:
      throw new Error(`unsupported TuneWeave body type: ${String(input.bodyType)}`);
  }
};

export const applyTuneWeaveBodyHeaders = (
  input: TuneWeaveRequest,
  append: (name: string, value: string) => void,
): void => {
  if (input.body === undefined) return;
  const bodyType = input.bodyType ?? "json";
  if (bodyType === "multipart" || hasHeader(input.headers, "content-type")) return;
  append(
    "Content-Type",
    bodyType === "text" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
  );
};
