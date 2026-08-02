import { describe, expect, it } from "vitest";
import { TUNEWEAVE_ROUTES, TUNEWEAVE_ROUTE_SOURCE_RELEASE } from "./index";

describe("TuneWeave route catalog", () => {
  it("matches the pinned release manifest", () => {
    expect(TUNEWEAVE_ROUTE_SOURCE_RELEASE).toBe("v0.1.0-alpha.3");
    expect(TUNEWEAVE_ROUTES).toHaveLength(259);
  });

  it("contains unique method and path pairs", () => {
    const keys = TUNEWEAVE_ROUTES.map(({ method, path }) => `${method} ${path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("uses supported HTTP methods and absolute relative paths", () => {
    const methods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]);
    for (const route of TUNEWEAVE_ROUTES) {
      expect(methods.has(route.method)).toBe(true);
      expect(route.path.startsWith("/")).toBe(true);
      expect(route.path.startsWith("//")).toBe(false);
    }
  });
});
