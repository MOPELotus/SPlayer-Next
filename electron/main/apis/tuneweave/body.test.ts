import assert from "node:assert/strict";
import test from "node:test";
import { FormData } from "undici";
import {
  applyTuneWeaveBodyHeaders,
  encodeTuneWeaveRequestBody,
} from "./body";

test("encodes JSON and text request bodies", () => {
  assert.equal(
    encodeTuneWeaveRequestBody({ method: "POST", path: "/v1/test", body: { a: 1 } }),
    '{"a":1}',
  );
  assert.equal(
    encodeTuneWeaveRequestBody({
      method: "POST",
      path: "/v1/test",
      bodyType: "text",
      body: "hello",
    }),
    "hello",
  );
});

test("generates content type headers for non-multipart bodies", () => {
  const headers: string[] = [];
  applyTuneWeaveBodyHeaders(
    { method: "POST", path: "/v1/test", body: { a: 1 } },
    (name, value) => headers.push(name, value),
  );
  assert.deepEqual(headers, ["Content-Type", "application/json; charset=utf-8"]);
});

test("encodes multipart fields and file bytes", () => {
  const body = encodeTuneWeaveRequestBody({
    method: "POST",
    path: "/v1/media/files",
    bodyType: "multipart",
    body: {
      fields: { purpose: "cover", tag: ["a", "b"] },
      files: [
        {
          field: "file",
          fileName: "cover.png",
          contentType: "image/png",
          bytes: new Uint8Array([1, 2, 3]),
        },
      ],
    },
  });
  assert.ok(body instanceof FormData);
  assert.equal(body.get("purpose"), "cover");
  assert.deepEqual(body.getAll("tag"), ["a", "b"]);
  const file = body.get("file");
  assert.ok(file instanceof Blob);
  assert.equal(file.size, 3);
  assert.equal(file.type, "image/png");
});

test("rejects bodies on GET and manual multipart content types", () => {
  assert.throws(
    () => encodeTuneWeaveRequestBody({ method: "GET", path: "/v1/test", body: {} }),
    /cannot contain a body/,
  );
  assert.throws(
    () =>
      encodeTuneWeaveRequestBody({
        method: "POST",
        path: "/v1/media/files",
        bodyType: "multipart",
        headers: { "Content-Type": "multipart/form-data" },
        body: {},
      }),
    /generated automatically/,
  );
});
