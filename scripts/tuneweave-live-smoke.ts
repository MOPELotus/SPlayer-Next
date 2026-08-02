import assert from "node:assert/strict";
import {
  closeTuneWeaveMediaProxy,
  configureTuneWeave,
  requestTuneWeave,
  TuneWeaveRequestError,
} from "../electron/main/apis/tuneweave/index";

const baseUrl = process.env.TUNEWEAVE_API_BASE?.trim() || "http://127.0.0.1:7832";

const assertSuccessEnvelope = (value: unknown, label: string): void => {
  assert.ok(value && typeof value === "object", `${label} did not return an object`);
  assert.equal((value as { ok?: unknown }).ok, true, `${label} did not return ok=true`);
};

const main = async (): Promise<void> => {
  configureTuneWeave({ baseUrl });

  const health = await requestTuneWeave({ path: "/healthz", includeCredentials: false });
  assert.ok(health !== null && health !== undefined, "health check returned an empty response");

  const platforms = await requestTuneWeave({
    path: "/v1/platforms",
    includeCredentials: false,
  });
  assertSuccessEnvelope(platforms, "platform catalog");

  const capabilities = await requestTuneWeave({
    path: "/v1/capabilities",
    includeCredentials: false,
  });
  assertSuccessEnvelope(capabilities, "capability catalog");

  let cloudResult = "available";
  try {
    const cloud = await requestTuneWeave({
      path: "/v1/account/cloud/tracks",
      query: {
        platform: "netease",
        account: "default",
        limit: 5,
        offset: 0,
      },
    });
    assertSuccessEnvelope(cloud, "cloud track list");
  } catch (error) {
    assert.ok(
      error instanceof TuneWeaveRequestError,
      "cloud request failed outside transport layer",
    );
    assert.ok(
      typeof error.status === "number" && error.status >= 400 && error.status < 500,
      `cloud endpoint returned unexpected HTTP status ${String(error.status)}`,
    );
    assert.ok(error.body && typeof error.body === "object", "cloud error body is not structured");
    assert.equal(
      (error.body as { ok?: unknown }).ok,
      false,
      "cloud endpoint did not return the unified error envelope",
    );
    cloudResult = `structured-auth-error-${error.status}`;
  }

  console.log(
    JSON.stringify(
      {
        baseUrl,
        health: "ok",
        platforms: "ok",
        capabilities: "ok",
        cloud: cloudResult,
      },
      null,
      2,
    ),
  );
};

try {
  await main();
} finally {
  closeTuneWeaveMediaProxy();
}
