import assert from "node:assert/strict";
import test from "node:test";
import {
  isTuneWeaveBinaryResponse,
  parseContentDispositionFileName,
  parseTuneWeaveResponseBody,
} from "./response";

const fakeResponse = (contentType: string, data: Uint8Array, contentDisposition = "") =>
  ({
    statusCode: 200,
    headers: {
      "content-type": contentType,
      "content-disposition": contentDisposition,
    },
    body: {
      arrayBuffer: async () =>
        data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
      text: async () => new TextDecoder().decode(data),
    },
  }) as never;

test("parses content-disposition filenames safely", () => {
  assert.equal(
    parseContentDispositionFileName("attachment; filename*=UTF-8''hello%20world.flac"),
    "hello world.flac",
  );
  assert.equal(
    parseContentDispositionFileName('attachment; filename="../unsafe.txt"'),
    ".._unsafe.txt",
  );
});

test("returns structured bytes for binary responses", async () => {
  const result = await parseTuneWeaveResponseBody(
    fakeResponse("audio/flac", new Uint8Array([1, 2, 3]), 'attachment; filename="song.flac"'),
  );
  assert.ok(isTuneWeaveBinaryResponse(result));
  assert.equal(result.fileName, "song.flac");
  assert.equal(result.contentType, "audio/flac");
  assert.deepEqual([...result.bytes], [1, 2, 3]);
});

test("keeps JSON and text responses readable", async () => {
  const json = await parseTuneWeaveResponseBody(
    fakeResponse("application/json", new TextEncoder().encode('{"ok":true}')),
  );
  assert.deepEqual(json, { ok: true });
  const text = await parseTuneWeaveResponseBody(
    fakeResponse("text/plain", new TextEncoder().encode("hello")),
  );
  assert.equal(text, "hello");
});
