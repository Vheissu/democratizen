import test from "node:test";
import assert from "node:assert/strict";
import {
  DirectChatClient,
  readEvents,
  modelList,
} from "../chat-app/direct-client.mjs";
const jwt = (data) =>
  `header.${Buffer.from(JSON.stringify(data)).toString("base64url")}.signature`;
const tokens = (id = "account-one", extra = {}) => ({
  access_token: jwt({
    exp: Math.floor(Date.now() / 1000) + 3600,
    "https://api.openai.com/auth": {
      chatgpt_account_id: id,
      chatgpt_plan_type: "plus",
    },
  }),
  id_token: jwt({
    email: `${id}@example.test`,
    "https://api.openai.com/auth": {
      chatgpt_account_id: id,
      chatgpt_plan_type: "plus",
    },
  }),
  refresh_token: "test-refresh",
  ...extra,
});
const models = {
  models: [
    {
      slug: "test-model",
      display_name: "Test model",
      priority: 1,
      visibility: "list",
      default_reasoning_level: "low",
      supported_reasoning_levels: [{ effort: "low" }, { effort: "high" }],
    },
  ],
};
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const sse = (events) =>
  new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""), {
    headers: { "Content-Type": "text/event-stream" },
  });
const success = (text) =>
  sse([
    { type: "response.output_text.delta", delta: text },
    { type: "response.completed" },
  ]);
function harness(options = {}) {
  const map = new Map(),
    events = [],
    calls = [];
  const storage = {
    getItem: (k) => map.get(k) || null,
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
  const client = new DirectChatClient({
    storage,
    emit: (e) => events.push(e),
    fetch: async (url, init) => {
      calls.push({ url, init });
      return options.fetch
        ? options.fetch(url, init)
        : url.includes("/models?")
          ? json(models)
          : success("Hello");
    },
    ...options.client,
  });
  client.setTokens(tokens());
  client.state.models = modelList(models);
  client.save();
  return { client, storage, map, events, calls };
}
async function create(client) {
  return client.request("chat.create", { model: "test-model", effort: "low" });
}
async function turn(client, chat, text, id) {
  await client.request("chat.send", { chatId: chat.id, text, requestId: id });
  await client.tasks.get(chat.id)?.promise;
  return client.get(chat.id);
}

test("direct SSE handles split UTF-8, CRLF, comments and final unterminated frame", async () => {
  const bytes = new TextEncoder().encode(
    ': keepalive\r\ndata: {"text":"café 🫖"}\r\n\r\ndata: {"done":true}',
  );
  const events = [],
    body = new ReadableStream({
      start(c) {
        for (const byte of bytes) c.enqueue(new Uint8Array([byte]));
        c.close();
      },
    });
  await readEvents(body, (e) => events.push(e), new AbortController().signal);
  assert.deepEqual(events, [{ text: "café 🫖" }, { done: true }]);
});

test("direct client streams, preserves follow-up context and offers no executable tools", async () => {
  const { client, calls, events } = harness();
  const chat = await create(client);
  await turn(client, chat, "Remember tea.", "message-first");
  const result = await turn(client, chat, "What did I say?", "message-second");
  assert.equal(result.status, "idle");
  assert.equal(result.messages.at(-1).text, "Hello");
  const body = JSON.parse(calls.at(-1).init.body);
  assert.deepEqual(
    body.input.map((m) => m.content[0].text),
    ["Remember tea.", "Hello", "What did I say?"],
  );
  assert.deepEqual(body.tools, []);
  assert.equal(body.tool_choice, "none");
  assert.equal(body.store, false);
  assert.ok(events.some((e) => e.type === "delta"));
  assert.equal(calls.at(-1).init.credentials, "omit");
  assert.equal(calls.at(-1).init.redirect, "error");
  client.close();
});

test("duplicate sends never generate another turn, including while a reply is active", async () => {
  let controller;
  const { client, calls } = harness({
    fetch: async () =>
      new Response(
        new ReadableStream({
          start(c) {
            controller = c;
          },
        }),
      ),
  });
  const chat = await create(client);
  await client.request("chat.send", {
    chatId: chat.id,
    text: "Hello",
    requestId: "same-message-id",
  });
  await client.request("chat.send", {
    chatId: chat.id,
    text: "Hello",
    requestId: "same-message-id",
  });
  await assert.rejects(
    client.request("chat.send", {
      chatId: chat.id,
      text: "Again",
      requestId: "new-message-id",
    }),
    /Stop the current reply/,
  );
  await new Promise((r) => setImmediate(r));
  controller.enqueue(
    new TextEncoder().encode('data: {"type":"response.completed"}\n\n'),
  );
  controller.close();
  await client.tasks.get(chat.id).promise;
  assert.equal(calls.length, 1);
  assert.equal(client.get(chat.id).messages.length, 2);
});

test("stop cancels the stream and keeps partial text after restarting the app", async () => {
  const { client, storage } = harness({
    fetch: async () =>
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(
              new TextEncoder().encode(
                'data: {"type":"response.output_text.delta","delta":"Partial"}\n\n',
              ),
            );
          },
        }),
      ),
  });
  const chat = await create(client);
  await client.request("chat.send", {
    chatId: chat.id,
    text: "Hello",
    requestId: "interrupt-turn",
  });
  await new Promise((r) => setImmediate(r));
  const done = client.tasks.get(chat.id).promise;
  await client.request("chat.stop", { chatId: chat.id });
  await done;
  assert.equal(client.get(chat.id).status, "interrupted");
  const restarted = new DirectChatClient({ storage });
  assert.equal(restarted.get(chat.id).messages.at(-1).text, "Partial");
  assert.equal(restarted.get(chat.id).status, "interrupted");
});

test("closing mid-reply recovers saved history and does not mark an incomplete stream successful", async () => {
  const { client, storage } = harness({
    fetch: async () =>
      sse([{ type: "response.output_text.delta", delta: "Unfinished" }]),
  });
  const chat = await create(client);
  await turn(client, chat, "Hello", "unfinished-turn");
  assert.equal(client.get(chat.id).status, "error");
  assert.match(client.get(chat.id).error, /ended before/);
  client.get(chat.id).status = "thinking";
  client.save();
  const restored = new DirectChatClient({ storage });
  assert.equal(restored.get(chat.id).status, "interrupted");
  assert.equal(restored.get(chat.id).messages.at(-1).text, "Unfinished");
});

test("device login polls, exchanges PKCE code and persists the TV account without API keys", async () => {
  let poll = 0;
  const { client, calls, events } = harness({
    client: { sleep: async () => {} },
    fetch: async (url, init) => {
      const body = init.body?.startsWith("{") ? JSON.parse(init.body) : null;
      if (url.endsWith("/usercode")) {
        assert.equal(body.client_id, "app_EMoamEEZ73f0CkXaXp7hrann");
        return json({
          device_auth_id: "device-test",
          user_code: "ABCD-EFGH",
          interval: "5",
        });
      }
      if (url.endsWith("/deviceauth/token"))
        return ++poll === 1
          ? json({}, 403)
          : json({
              authorization_code: "code-test",
              code_verifier: "verifier-test",
            });
      if (url.endsWith("/oauth/token")) {
        const form = new URLSearchParams(init.body);
        assert.equal(form.get("code_verifier"), "verifier-test");
        assert.equal(
          form.get("redirect_uri"),
          "https://auth.openai.com/deviceauth/callback",
        );
        return json(tokens("account-two"));
      }
      return json(models);
    },
  });
  await client.request("logout");
  const login = await client.request("login.start");
  assert.equal(login.verificationUrl, "https://auth.openai.com/codex/device");
  const pending = client.login?.task;
  await pending;
  assert.equal(client.account().id, "account-two");
  assert.ok(events.some((e) => e.type === "loginComplete" && e.success));
  assert.ok(
    calls.every((c) =>
      /^https:\/\/(auth\.openai\.com|chatgpt\.com)\//.test(c.url),
    ),
  );
});

test("cancelled device login cannot store late-returning tokens", async () => {
  let release;
  const { client } = harness({
    client: { sleep: async () => {} },
    fetch: async (url) => {
      if (url.endsWith("/usercode"))
        return json({
          device_auth_id: "device-test",
          user_code: "TEST",
          interval: 5,
        });
      if (url.endsWith("/deviceauth/token"))
        return json({ authorization_code: "code", code_verifier: "verifier" });
      return new Promise((resolve) => {
        release = () => resolve(json(tokens("wrong-account")));
      });
    },
  });
  await client.request("logout");
  await client.request("login.start");
  const pending = client.login.task;
  await new Promise((r) => setImmediate(r));
  await client.request("login.cancel");
  release();
  await pending;
  assert.equal(client.account(), null);
});

test("concurrent expiry refreshes once and saves the rotated refresh token before use", async () => {
  const { client, calls, storage } = harness({
    fetch: async (url) =>
      url.endsWith("/oauth/token")
        ? json(tokens("account-one", { refresh_token: "rotated-test" }))
        : json(models),
  });
  client.setTokens(
    tokens("account-one", {
      access_token: jwt({ exp: 1 }),
      refresh_token: "old-test",
    }),
  );
  await Promise.all([client.headers(), client.headers()]);
  assert.equal(calls.length, 1);
  assert.equal(
    JSON.parse(storage.getItem("frame-chat-auth-v1")).refresh_token,
    "rotated-test",
  );
});

test("failed refresh removes invalid credentials; transient failures retain them", async () => {
  for (const status of [401, 503]) {
    const { client, storage } = harness({
      fetch: async () => json({ error: "do not echo credentials" }, status),
    });
    await assert.rejects(client.refresh(), /sign-in could not be refreshed/);
    assert.equal(!!storage.getItem("frame-chat-auth-v1"), status === 503);
  }
});

test("accounts cannot read or export each other’s chats; archive and restore survive restart", async () => {
  const { client, storage } = harness();
  const chat = await create(client);
  await turn(client, chat, "Private conversation", "private-turn");
  await client.request("chat.remove", { chatId: chat.id });
  assert.equal(client.list().length, 0);
  assert.equal((await client.request("chat.archived")).length, 1);
  client.setTokens(tokens("account-two"));
  await assert.rejects(
    client.request("chat.read", { chatId: chat.id }),
    /not available/,
  );
  assert.equal(JSON.parse(await client.request("chat.export")).chats.length, 0);
  client.setTokens(tokens());
  const restarted = new DirectChatClient({ storage });
  await restarted.request("chat.restore", { chatId: chat.id });
  assert.equal(restarted.list().length, 1);
  await restarted.request("chat.delete", { chatId: chat.id });
  assert.equal(restarted.list().length, 0);
});

test("storage failure refuses a new turn before transmitting its contents", async () => {
  const { client, storage, calls } = harness();
  const chat = await create(client);
  storage.setItem = () => {
    throw new Error("quota");
  };
  await assert.rejects(
    client.request("chat.send", {
      chatId: chat.id,
      text: "Never transmit",
      requestId: "storage-failure",
    }),
    /could not save/,
  );
  assert.equal(calls.length, 0);
  assert.equal(client.get(chat.id).messages.length, 0);
  assert.equal(client.get(chat.id).status, "idle");
});

test("reply limits and service errors preserve history without exposing response bodies", async () => {
  const { client } = harness({
    fetch: async () =>
      sse([{ type: "response.output_text.delta", delta: "x".repeat(200001) }]),
  });
  const chat = await create(client);
  await turn(client, chat, "Long reply", "limit-reply");
  assert.equal(client.get(chat.id).status, "error");
  assert.match(client.get(chat.id).error, /length limit/);
  const rejected = harness({
    fetch: async () => json({ error: "secret-echo" }, 429),
  });
  const c = await create(rejected.client);
  await turn(rejected.client, c, "Hello", "rate-limit-turn");
  assert.match(rejected.client.get(c.id).error, /usage limit/);
  assert.doesNotMatch(rejected.client.get(c.id).error, /secret-echo/);
});

test("two users in the same workspace have separate chat ownership", async () => {
  const { client } = harness();
  const one = tokens("shared-workspace", {
    id_token: jwt({
      sub: "user-one",
      email: "one@example.test",
      "https://api.openai.com/auth": { chatgpt_account_id: "shared-workspace" },
    }),
  });
  const two = tokens("shared-workspace", {
    id_token: jwt({
      sub: "user-two",
      email: "two@example.test",
      "https://api.openai.com/auth": { chatgpt_account_id: "shared-workspace" },
    }),
  });
  client.setTokens(one);
  const chat = await create(client);
  client.setTokens(two);
  assert.equal(client.list().length, 0);
  await assert.rejects(
    client.request("chat.read", { chatId: chat.id }),
    /not available/,
  );
  client.setTokens(one);
  assert.equal(client.list().length, 1);
});

test("page close synchronously saves the latest partial reply before async cleanup", async () => {
  const { client, storage } = harness({
    fetch: async () =>
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(
              new TextEncoder().encode(
                'data: {"type":"response.output_text.delta","delta":"Latest checkpoint"}\n\n',
              ),
            );
          },
        }),
      ),
  });
  const chat = await create(client);
  await client.request("chat.send", {
    chatId: chat.id,
    text: "Hello",
    requestId: "pageclose-message",
  });
  await new Promise((r) => setImmediate(r));
  const done = client.tasks.get(chat.id).promise;
  client.close();
  const recovered = new DirectChatClient({ storage });
  assert.equal(recovered.get(chat.id).status, "interrupted");
  assert.equal(
    recovered.get(chat.id).messages.at(-1).text,
    "Latest checkpoint",
  );
  await done;
});

test('native fetch keeps its global receiver on Tizen Chromium', async () => {
  const { client, storage } = harness();
  const strictBrowser = new DirectChatClient({
    storage,
    fetch: function (url) {
      assert.equal(this, globalThis, 'native fetch receiver must be Window');
      assert.match(url, /\/models\?/);
      return Promise.resolve(json(models));
    },
  });
  await strictBrowser.loadModels();
  assert.equal(strictBrowser.state.models[0].id, 'test-model');
  client.close();
});

test('catalogue reordering never substitutes the model sent for an existing chat', async () => {
  const catalog = {
    models: [
      { ...models.models[0], slug: 'gpt-6.1-sol', priority: 2 },
      { ...models.models[0], slug: 'gpt-6-astra', priority: 1 },
    ],
  };
  const { client, calls } = harness({
    fetch: async url => url.includes('/models?') ? json(catalog) : success('Done'),
  });
  client.state.models = modelList(catalog);
  const chat = await client.request('chat.create', { model: 'gpt-6.1-sol', effort: 'low' });
  await turn(client, chat, 'First message', 'chosen-model-one');
  await client.loadModels();
  await turn(client, chat, 'Follow-up', 'chosen-model-two');
  const requests = calls.filter(call => call.url.endsWith('/responses'));
  assert.deepEqual(requests.map(call => JSON.parse(call.init.body).model), ['gpt-6.1-sol', 'gpt-6.1-sol']);
  assert.equal(client.get(chat.id).model, 'gpt-6.1-sol');
  await assert.rejects(client.request('chat.create', { model: 'missing-model', effort: 'low' }), /available model/);
});
