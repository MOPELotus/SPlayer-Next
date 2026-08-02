import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTuneWeaveUrl,
  normalizeTuneWeaveBaseUrl,
  sanitizeTuneWeaveCredentials,
  sanitizeTuneWeaveResponse,
} from "./index";

test("normalizes TuneWeave base URLs", () => {
  assert.equal(normalizeTuneWeaveBaseUrl("http://127.0.0.1:7832/"), "http://127.0.0.1:7832");
  assert.equal(
    normalizeTuneWeaveBaseUrl("https://example.test/api///?ignored=1#fragment"),
    "https://example.test/api",
  );
  assert.throws(() => normalizeTuneWeaveBaseUrl("file:///tmp/tuneweave"), /http or https/);
});

test("builds strict relative URLs with repeated query values", () => {
  const url = buildTuneWeaveUrl("http://127.0.0.1:7832", "/v1/search", {
    q: "DAMIDAMI",
    type: "track",
    platform: ["qq", "netease"],
    fallback: true,
    omitted: undefined,
  });
  assert.equal(url.pathname, "/v1/search");
  assert.equal(url.searchParams.get("q"), "DAMIDAMI");
  assert.deepEqual(url.searchParams.getAll("platform"), ["qq", "netease"]);
  assert.equal(url.searchParams.get("fallback"), "true");
  assert.equal(url.searchParams.has("omitted"), false);
  assert.throws(
    () => buildTuneWeaveUrl("http://127.0.0.1:7832", "https://evil.test/v1/search"),
    /relative path/,
  );
});

test("sanitizes and limits caller credentials", () => {
  assert.deepEqual(
    sanitizeTuneWeaveCredentials([" twc1_a ", "", "twc1_a", "twc1_b"]),
    ["twc1_a", "twc1_b"],
  );
  assert.throws(
    () => sanitizeTuneWeaveCredentials(Array.from({ length: 9 }, (_, index) => `twc1_${index}`)),
    /at most 8/,
  );
});

test("captures caller credentials without exposing the bearer secret", () => {
  const sanitized = sanitizeTuneWeaveResponse({
    ok: true,
    data: {
      status: "confirmed",
      caller_credential: {
        format: "tuneweave_credential_v1",
        platform: "qq",
        value: "twc1_secret",
        expires_at: null,
      },
    },
  }) as {
    data: { caller_credential: Record<string, unknown> };
  };
  assert.equal(sanitized.data.caller_credential.value, undefined);
  assert.equal(sanitized.data.caller_credential.platform, "qq");
  assert.equal(sanitized.data.caller_credential.stored, true);
});
