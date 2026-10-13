/** Shared browser/Expo transport. Supply SecureStore callbacks on native; browsers use HttpOnly cookies. */
export class GleencApiError extends Error {
  constructor(status, message, requestId) {
    super(message);
    this.name = "GleencApiError";
    this.status = status;
    this.requestId = requestId;
  }
}
export function createGleencApi({
  baseUrl,
  platform = "web",
  fetchImpl = globalThis.fetch,
  getSession,
  saveSession,
  clearSession,
  allowLocalHttp = false,
}) {
  const url = new URL(baseUrl);
  if (
    url.protocol !== "https:" &&
    !(
      allowLocalHttp &&
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    )
  )
    throw new Error("Use an HTTPS API URL.");
  if (url.search || url.hash || url.username || url.password)
    throw new Error("Use an API URL without query, fragment or credentials.");
  function resolveAssets(value) {
    if (Array.isArray(value)) return value.map(resolveAssets);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          typeof item === "string" &&
          (key === "url" || key.endsWith("Url") || key.endsWith("_url")) &&
          (/^\/api\/v2\/media\//.test(item) || item.startsWith("/uploads/"))
            ? new URL(item, url.origin).toString()
            : resolveAssets(item),
        ]),
      );
    return value;
  }
  async function timedFetch(target, options) {
    const controller = new AbortController();
    const abort = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      return await fetchImpl(target, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
    }
  }
  const base = baseUrl.replace(/\/+$/, "");
  let refreshing;
  let sessionGeneration = 0;
  const endpoint = (value) => {
    if (
      !value.startsWith("/") ||
      value.startsWith("//") ||
      value.split("/").includes("..")
    )
      throw new Error("Invalid API path.");
    return base + value;
  };
  const segment = (value) => {
    const text = String(value);
    if (text === "." || text === "..") throw new Error("Invalid identifier.");
    return encodeURIComponent(text);
  };
  async function refresh() {
    if (platform === "web") return false;
    if (!refreshing) {
      const generation = sessionGeneration;
      refreshing = (async () => {
        const session = await getSession?.();
        if (!session?.refreshToken) return false;
        const response = await timedFetch(endpoint("/auth/refresh"), {
          method: "POST",
          credentials: "omit",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: session.refreshToken }),
          signal: undefined,
        });
        if (!response.ok) {
          if (response.status === 401 && generation === sessionGeneration) {
            sessionGeneration++;
            await clearSession?.();
          }
          return false;
        }
        const rotated = (await response.json()).data;
        if (generation !== sessionGeneration) return false;
        await saveSession?.(rotated);
        return true;
      })().finally(() => {
        refreshing = undefined;
      });
    }
    return refreshing;
  }
  async function request(
    path,
    {
      method = "GET",
      body,
      idempotencyKey,
      binary = false,
      signal,
      retry = true,
    } = {},
  ) {
    const generation = sessionGeneration;
    const session = platform === "web" ? null : await getSession?.();
    const headers = {
      Accept: binary ? "application/octet-stream" : "application/json",
    };
    if (session?.accessToken)
      headers.Authorization = "Bearer " + session.accessToken;
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    const multipart =
      typeof FormData !== "undefined" && body instanceof FormData;
    if (body !== undefined && !multipart)
      headers["Content-Type"] = "application/json";
    const response = await timedFetch(endpoint(path), {
      method,
      headers,
      credentials: platform === "web" ? "include" : "omit",
      ...(body !== undefined
        ? { body: multipart ? body : JSON.stringify(body) }
        : {}),
      signal,
    });
    if (generation !== sessionGeneration)
      throw new GleencApiError(409, "The account changed. Please try again.", null);
    if (
      response.status === 401 &&
      retry &&
      !path.startsWith("/auth/") &&
      (await refresh())
    )
      return request(path, {
        method,
        body,
        idempotencyKey,
        binary,
        signal,
        retry: false,
      });
    if (!response.ok) {
      let details;
      try {
        details = await response.json();
      } catch {}
      throw new GleencApiError(
        response.status,
        details?.message || "The request could not be completed.",
        response.headers.get("x-request-id"),
      );
    }
    if (response.status === 204) return null;
    if (binary) return response.blob();
    return resolveAssets((await response.json()).data);
  }
  async function watchActivity({ onChange, signal, intervalMs = 5000 }) {
    let previous = "";
    while (!signal?.aborted) {
      const counts = await request("/activity/counts", { signal });
      const current = JSON.stringify(counts);
      if (current !== previous) {
        previous = current;
        onChange(counts);
      }
      await new Promise((resolve) => {
        const timer = setTimeout(done, Math.max(3000, intervalMs));
        function done() {
          clearTimeout(timer);
          signal?.removeEventListener("abort", done);
          resolve();
        }
        signal?.addEventListener("abort", done, { once: true });
      });
    }
  }
  const query = (params) => {
    const values = Object.entries(params || {}).filter(
      ([, v]) => v !== undefined && v !== null,
    );
    return values.length ? "?" + new URLSearchParams(values).toString() : "";
  };
  const post = (path, body, key) =>
    request(path, { method: "POST", body, idempotencyKey: key });
  async function authenticate(action, body) {
    const generation = ++sessionGeneration;
    const result = await post("/auth/" + action, {
      ...body,
      client: platform === "web" ? "web" : "mobile",
    });
    if (generation !== sessionGeneration)
      throw new GleencApiError(409, "The account changed. Please try again.", null);
    if (platform !== "web" && result.session) await saveSession?.(result.session);
    return result;
  }
  return {
    request,
    refresh,
    watchActivity,
    activityCounts: () => request("/activity/counts"),
    capabilities: () => request("/capabilities"),
    auth: {
      login: (body) => authenticate("login", body),
      register: (body) => authenticate("register", body),
      challenge: () => post("/auth/challenge", {}),
      identity: (body) => authenticate("identity", body),
      logout: async () => {
        const generation = ++sessionGeneration;
        try {
          return await post("/auth/logout", {});
        } finally {
          if (generation === sessionGeneration) await clearSession?.();
        }
      },
    },
    account: {
      get: () => request("/me"),
      acceptTerms: (version) => post("/me/terms", { version }),
      editProfile: (body) => request("/me/profile", { method: "PATCH", body }),
      settings: (body) => request("/me/settings", { method: "PUT", body }),
      selling: (body) => request("/me/selling", { method: "PUT", body }),
      addresses: () => request("/me/addresses"),
      saveAddress: (body, key) =>
        key
          ? request("/me/addresses/" + segment(key), { method: "PUT", body })
          : post("/me/addresses", body),
      deleteAddress: (key) =>
        request("/me/addresses/" + segment(key), { method: "DELETE" }),
      delete: (body) => post("/me/deletion", body),
      devices: () => request("/me/devices"),
      revokeDevice: (key) =>
        request("/me/devices/" + segment(key), { method: "DELETE" }),
      presence: () => post("/me/presence", {}),
      registerPush: (body) => post("/me/push-devices", body),
      block: (key, blocked = true) =>
        request("/me/blocks/" + segment(key), {
          method: blocked ? "PUT" : "DELETE",
        }),
    },
    feed: (params) => request("/feed" + query(params)),
    search: (params) => request("/search" + query(params)),
    categories: () => request("/categories"),
    products: {
      archive: (key) => request('/products/' + segment(key), { method: 'DELETE' }),
      editable: (key) => request("/me/products/" + segment(key)),
      get: (key) => request("/products/" + segment(key)),
      mine: (params) => request("/me/products" + query(params)),
      save: (body, key) =>
        key
          ? request("/products/" + segment(key), { method: "PUT", body })
          : post("/products", body),
      availability: (key, active) =>
        request("/products/" + segment(key) + "/availability", {
          method: "PUT",
          body: { active },
        }),
      like: (key, liked = true) =>
        request("/products/" + segment(key) + "/like", {
          method: liked ? "POST" : "DELETE",
          ...(liked ? { body: {} } : {}),
        }),
      comments: (key) => request("/products/" + segment(key) + "/comments"),
      comment: (key, body) =>
        post("/products/" + segment(key) + "/comments", body),
      reviews: (key) => request("/products/" + segment(key) + "/reviews"),
    },
    catalogue: {
      get: (key) => request("/people/" + segment(key) + "/catalogue"),
      save: (body, key) =>
        key
          ? request("/catalogue/" + segment(key), { method: "PUT", body })
          : post("/catalogue", body),
    },
    people: {
      get: (key) => request("/people/" + segment(key)),
      connections: (key, params) =>
        request("/people/" + segment(key) + "/connections" + query(params)),
      follow: (key, active = true) =>
        request("/people/" + segment(key) + "/follow", {
          method: active ? "POST" : "DELETE",
          ...(active ? { body: {} } : {}),
        }),
    },
    media: {
      upload: (formData) => post("/media", formData),
      private: (key) =>
        request("/media/" + segment(key) + "/private", { binary: true }),
    },
    posts: {
      archive: (key) => request('/posts/' + segment(key), { method: 'DELETE' }),
      reshare: (key, body) => post("/posts/" + segment(key) + "/reshare", body),
      event: (key, kind) =>
        post("/posts/" + segment(key) + "/events", { kind }),
      analytics: () => request("/me/reshare-analytics"),
    },
    offers: {
      create: (body) => post("/offers", body),
      list: (params) => request("/offers" + query(params)),
      answer: (key, decision) =>
        post("/offers/" + segment(key) + "/answer", { decision }),
    },
    quote: (body) => post("/quote", body),
    cart: {
      list: () => request("/cart"),
      add: (body) => post("/cart", body),
      update: (key, body) =>
        request("/cart/" + segment(key), { method: "PUT", body }),
      remove: (key) => request("/cart/" + segment(key), { method: "DELETE" }),
    },
    checkout: {
      create: (body, key) =>
        post("/checkouts", { ...body, clientPlatform: platform }, key),
      get: (key) => request("/checkouts/" + segment(key)),
      cancel: (key) => post("/checkouts/" + segment(key) + "/cancel", {}),
      payWallet: (key) => post("/checkouts/" + segment(key) + "/pay", {}),
      initialize: (key) =>
        post("/checkouts/" + segment(key) + "/initialize", {}),
      verify: (key) => post("/checkouts/" + segment(key) + "/verify", {}),
    },
    orders: {
      list: (params) => request("/orders" + query(params)),
      get: (key) => request("/orders/" + segment(key)),
      prepare: (key) => post("/orders/" + segment(key) + "/prepare", {}),
      dispatch: (order, pkg, body) =>
        post(
          "/orders/" +
            segment(order) +
            "/packages/" +
            segment(pkg) +
            "/dispatch",
          body,
        ),
      confirm: (order, pkg, code) =>
        post(
          "/orders/" +
            segment(order) +
            "/packages/" +
            segment(pkg) +
            "/confirm",
          { code, confirmReceived: true },
        ),
      receipt: (key) => request("/orders/" + segment(key) + "/receipt"),
      issue: (line, body) => post("/lines/" + segment(line) + "/issues", body),
      review: (line, body) => post("/lines/" + segment(line) + "/review", body),
    },
    wallet: {
      banks: () => request("/wallet/banks"),
      recipient: () => request("/wallet/recipient"),
      saveRecipient: (body) =>
        request("/wallet/recipient", { method: "PUT", body }),
      get: () => request("/wallet"),
      topup: (amountKobo, key) => post("/wallet/topups", { amountKobo }, key),
      verifyTopup: (key) =>
        post("/wallet/topups/" + segment(key) + "/verify", {}),
      withdraw: (amountKobo, key) =>
        post("/wallet/withdrawals", { amountKobo }, key),
      verifyWithdrawal: (key) =>
        post("/wallet/withdrawals/" + segment(key) + "/verify", {}),
    },
    notifications: {
      list: (params) => request("/notifications" + query(params)),
      read: (ids) => post("/notifications/read", { ids }),
      readAll: () => post("/notifications/read", { all: true }),
    },
    chat: {
      list: (params) => request("/conversations" + query(params)),
      open: (userId) => post("/conversations", { userId }),
      messages: (key, params) =>
        request("/conversations/" + segment(key) + "/messages" + query(params)),
      send: (key, body, requestKey) =>
        post("/conversations/" + segment(key) + "/messages", body, requestKey),
      ack: (key, messageIds, status) =>
        post("/conversations/" + segment(key) + "/ack", { messageIds, status }),
      messageAction: (key, message, body) =>
        request(
          "/conversations/" + segment(key) + "/messages/" + segment(message),
          { method: "PATCH", body },
        ),
      settings: (key, body) =>
        request("/conversations/" + segment(key) + "/settings", {
          method: "PUT",
          body,
        }),
    },
    library: {
      list: () => request("/library"),
      grant: (key, mediaId) =>
        post("/library/" + segment(key) + "/download-token", { mediaId }),
      download: (token) =>
        request("/library/download", {
          method: "POST",
          body: { token },
          binary: true,
        }),
    },
    saved: {
      list: () => request("/saved"),
      set: (key, active) =>
        request("/saved/" + segment(key), {
          method: active ? "PUT" : "DELETE",
        }),
    },
    report: (body) => post("/reports", body),
  };
}
