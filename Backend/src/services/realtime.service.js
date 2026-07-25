const messageClients = new Map();
const notificationClients = new Map();

function writeEvent(response, event, payload) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function addClient(userId, client) {
  const key = String(userId || "");
  if (!key) return;

  const clients = messageClients.get(key) || new Set();
  clients.add(client);
  messageClients.set(key, clients);
}

function addNotificationClient(userId, client) {
  const key = String(userId || "");
  if (!key) return;

  const clients = notificationClients.get(key) || new Set();
  clients.add(client);
  notificationClients.set(key, clients);
}

function removeClient(userId, client) {
  const key = String(userId || "");
  const clients = messageClients.get(key);

  if (!clients) return;

  clients.delete(client);

  if (clients.size === 0) {
    messageClients.delete(key);
  }
}

function removeNotificationClient(userId, client) {
  const key = String(userId || "");
  const clients = notificationClients.get(key);

  if (!clients) return;

  clients.delete(client);

  if (clients.size === 0) {
    notificationClients.delete(key);
  }
}

export function subscribeMessageStream(userId, req, res) {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const client = {
    id: `${userId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    res,
  };

  addClient(userId, client);

  writeEvent(res, "connected", {
    ok: true,
    userId,
    timestamp: new Date().toISOString(),
  });

  const heartbeat = setInterval(() => {
    try {
      writeEvent(res, "ping", {
        timestamp: new Date().toISOString(),
      });
    } catch {
      clearInterval(heartbeat);
      removeClient(userId, client);
    }
  }, 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    removeClient(userId, client);
  });
}

export function publishMessageEvent(userIds, event, payload) {
  const targets = [...new Set(userIds.map(String).filter(Boolean))];

  for (const userId of targets) {
    const clients = messageClients.get(userId);
    if (!clients?.size) continue;

    for (const client of [...clients]) {
      try {
        writeEvent(client.res, event, payload);
      } catch {
        removeClient(userId, client);
      }
    }
  }
}

export function subscribeNotificationStream(userId, req, res) {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const client = {
    id: `${userId}-notification-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    res,
  };

  addNotificationClient(userId, client);

  writeEvent(res, "connected", {
    ok: true,
    userId,
    timestamp: new Date().toISOString(),
  });

  const heartbeat = setInterval(() => {
    try {
      writeEvent(res, "ping", {
        timestamp: new Date().toISOString(),
      });
    } catch {
      clearInterval(heartbeat);
      removeNotificationClient(userId, client);
    }
  }, 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    removeNotificationClient(userId, client);
  });
}

export function publishNotificationEvent(userIds, event, payload) {
  const targets = [...new Set(userIds.map(String).filter(Boolean))];

  for (const userId of targets) {
    const clients = notificationClients.get(userId);
    if (!clients?.size) continue;

    for (const client of [...clients]) {
      try {
        writeEvent(client.res, event, payload);
      } catch {
        removeNotificationClient(userId, client);
      }
    }
  }
}
