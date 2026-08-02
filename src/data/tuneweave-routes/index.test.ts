import assert from "node:assert/strict";
import test from "node:test";
import { TUNEWEAVE_ROUTES, TUNEWEAVE_ROUTE_SOURCE_RELEASE } from "./index";

test("matches the pinned TuneWeave release route count", () => {
  assert.equal(TUNEWEAVE_ROUTE_SOURCE_RELEASE, "v0.1.0-alpha.3");
  assert.equal(TUNEWEAVE_ROUTES.length, 259);
});

test("contains unique method and path pairs", () => {
  const keys = TUNEWEAVE_ROUTES.map(({ method, path }) => `${method} ${path}`);
  assert.equal(new Set(keys).size, keys.length);
});

test("uses supported HTTP methods and absolute relative paths", () => {
  const methods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]);
  for (const route of TUNEWEAVE_ROUTES) {
    assert.equal(methods.has(route.method), true);
    assert.equal(route.path.startsWith("/"), true);
    assert.equal(route.path.startsWith("//"), false);
  }
});
