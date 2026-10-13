import test from "node:test";
import assert from "node:assert/strict";
import { createGleencApi, GleencApiError } from "../client/gleenc-api.js";
test("shared client uses browser cookies and never stores browser bearer tokens", async () => {
  let options;
  const api = createGleencApi({
    baseUrl: "https://api.gleenc.test/api/v2",
    platform: "web",
    fetchImpl: async (_url, request) => {
      options = request;
      return new Response(
        JSON.stringify({ success: true, data: { ok: true } }),
        { status: 200 },
      );
    },
  });
  assert.deepEqual(await api.capabilities(), { ok: true });
  assert.equal(options.credentials, "include");
  assert.equal(options.headers.Authorization, undefined);
});
test("shared client refreshes once for concurrent native requests and preserves idempotency keys", async () => {
  let session = { accessToken: "old", refreshToken: "refresh" },
    refreshes = 0;
  const keys = [];
  const api = createGleencApi({
    baseUrl: "https://api.gleenc.test/api/v2",
    platform: "android",
    getSession: async () => session,
    saveSession: async (s) => {
      session = s;
    },
    fetchImpl: async (url, options) => {
      if (url.endsWith("/auth/refresh")) {
        refreshes++;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return new Response(
          JSON.stringify({
            data: { accessToken: "new", refreshToken: "next" },
          }),
          { status: 200 },
        );
      }
      if (options.headers.Authorization === "Bearer old")
        return new Response("{}", { status: 401 });
      keys.push(options.headers["Idempotency-Key"]);
      return new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
      });
    },
  });
  await Promise.all([
    api.checkout.create({ items: [] }, "same-key-123"),
    api.wallet.topup(10000, "topup-key-123"),
  ]);
  assert.equal(refreshes, 1);
  assert.ok(keys.includes("same-key-123"));
  assert.ok(keys.includes("topup-key-123"));
});
test("shared client propagates errors and prevents unsafe path and HTTP configuration", async () => {
  assert.throws(
    () => createGleencApi({ baseUrl: "http://api.example.com/api/v2" }),
    /HTTPS/,
  );
  const api = createGleencApi({
    baseUrl: "https://api.gleenc.test/api/v2",
    fetchImpl: async () =>
      new Response(JSON.stringify({ message: "Forbidden" }), {
        status: 403,
        headers: { "x-request-id": "test-request" },
      }),
  });
  await assert.rejects(api.request("//other.example/path"), /Invalid API path/);
  await assert.rejects(
    api.wallet.get(),
    (error) =>
      error instanceof GleencApiError &&
      error.status === 403 &&
      error.requestId === "test-request",
  );
});
