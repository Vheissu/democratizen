// TV-local client for the subscription protocol used by openai/codex.
// Endpoint behaviour is not a public third-party API contract. See docs/frame-chat.md.
const AUTH = "https://auth.openai.com";
const CODEX = "https://chatgpt.com/backend-api/codex";
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"; // Public OAuth application identifier, not a secret.
const VERSION = "0.163.0";
const STATE_KEY = "frame-chat-direct-v1";
const AUTH_KEY = "frame-chat-auth-v1";
const MAX_STORED = 3_000_000,
  MAX_REPLY = 200_000,
  MAX_CONTEXT = 350_000;
const copy = (value) => JSON.parse(JSON.stringify(value));
const uid = () =>
  crypto.randomUUID?.() ||
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
function claims(token) {
  try {
    return JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(
          atob(token.split(".")[1].replaceAll("-", "+").replaceAll("_", "/")),
          (c) => c.charCodeAt(0),
        ),
      ),
    );
  } catch {
    return {};
  }
}
function identity(tokens) {
  if (!tokens?.access_token) return null;
  const access = claims(tokens.access_token),
    id = claims(tokens.id_token || tokens.access_token);
  const auth =
    id["https://api.openai.com/auth"] ||
    access["https://api.openai.com/auth"] ||
    {};
  const accountId = auth.chatgpt_account_id || tokens.account_id;
  const email =
    id.email || access["https://api.openai.com/profile"]?.email || "";
  if (!accountId) return null;
  const user = auth.chatgpt_user_id || id.sub || access.sub || email;
  if (!user) return null;
  return {
    id: accountId,
    owner: `${accountId}:${user}`,
    type: "chatgpt",
    email,
    plan: auth.chatgpt_plan_type || "",
  };
}
function aborted(signal) {
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
}
function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    aborted(signal);
    const cancel = () => {
      clearTimeout(timer);
      reject(new DOMException("Cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, ms);
    signal.addEventListener("abort", cancel, { once: true });
  });
}
export function modelList(payload) {
  return (payload.models || [])
    .filter((m) => m.visibility === "list" || m.visibility === "visible")
    .sort((a, b) => a.priority - b.priority)
    .map((m, i) => ({
      id: m.slug,
      name: m.display_name || m.slug,
      isDefault: i === 0,
      effort: m.default_reasoning_level || "medium",
      efforts: (m.supported_reasoning_levels || []).map((e) => e.effort),
    }));
}
// Handles fragmented UTF-8 and CRLF frames, including a final frame without a blank line.
export async function readEvents(body, onEvent, signal) {
  if (!body?.getReader)
    throw new Error("This TV does not support streaming responses.");
  const reader = body.getReader(),
    decoder = new TextDecoder();
  let buffer = "",
    eventLines = [],
    eventSize = 0,
    idle;
  const cancel = () => reader.cancel().catch(() => {});
  signal.addEventListener("abort", cancel, { once: true });
  const dispatch = () => {
    const data = eventLines
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    eventLines = [];
    eventSize = 0;
    if (data && data !== "[DONE]") onEvent(JSON.parse(data));
  };
  try {
    while (true) {
      aborted(signal);
      const part = await Promise.race([
        reader.read(),
        new Promise((_, reject) => {
          idle = setTimeout(
            () =>
              reject(
                new Error(
                  "The reply stopped arriving. Your partial reply has been saved.",
                ),
              ),
            90000,
          );
        }),
      ]);
      clearTimeout(idle);
      aborted(signal);
      buffer += decoder.decode(part.value, { stream: !part.done });
      if (buffer.length > 1_500_000)
        throw new Error("The response exceeded the TV’s streaming limit.");
      let end;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end).replace(/\r$/, "");
        buffer = buffer.slice(end + 1);
        if (line) {
          eventSize += line.length;
          if (eventSize > 1_500_000)
            throw new Error("The response exceeded the TV’s streaming limit.");
          eventLines.push(line);
        } else dispatch();
      }
      if (part.done) {
        if (buffer) eventLines.push(buffer);
        dispatch();
        break;
      }
    }
  } finally {
    clearTimeout(idle);
    signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export class DirectChatClient {
  constructor({
    storage = globalThis.localStorage,
    fetch: fetcher = globalThis.fetch,
    emit = () => {},
    now = Date.now,
    sleep = delay,
  } = {}) {
    this.storage = storage;
    // Tizen Chromium requires the native fetch receiver to remain Window.
    this.fetch = fetcher.bind(globalThis);
    this.emit = emit;
    this.now = now;
    this.sleep = sleep;
    this.tasks = new Map();
    this.login = null;
    this.refreshing = null;
    this.tokens = JSON.parse(storage.getItem(AUTH_KEY) || "null");
    this.state = JSON.parse(
      storage.getItem(STATE_KEY) || '{"chats":[],"models":[]}',
    );
    if (!Array.isArray(this.state.chats) || !Array.isArray(this.state.models))
      throw new Error("The TV’s saved chat data could not be read.");
    for (const chat of this.state.chats)
      if (chat.status === "thinking") {
        chat.status = "interrupted";
        chat.error =
          "The app closed during this reply. You can continue below.";
      }
    this.save();
  }
  account() {
    return identity(this.tokens);
  }
  save() {
    const json = JSON.stringify(this.state);
    if (json.length > MAX_STORED)
      throw new Error(
        "The TV’s chat storage is full. Export and remove older chats in Settings.",
      );
    try {
      this.storage.setItem(STATE_KEY, json);
    } catch {
      throw new Error(
        "The TV could not save this chat. Free some app storage before continuing.",
      );
    }
  }
  setTokens(tokens) {
    if (!identity(tokens))
      throw new Error(
        "OpenAI did not return a subscription account. Try signing in again.",
      );
    // Persist a rotated refresh token before starting any other request.
    this.storage.setItem(AUTH_KEY, JSON.stringify(tokens));
    this.tokens = tokens;
  }
  list(archived = false) {
    return this.state.chats
      .filter(
        (c) => c.owner === this.account()?.owner && !!c.archived === archived,
      )
      .sort((a, b) => b.updated - a.updated)
      .map((c) => ({
        id: c.id,
        title: c.title,
        model: c.model,
        status: c.status,
      }));
  }
  status() {
    return {
      account: this.account(),
      models: this.state.models,
      chats: this.list(),
      mode: "standalone",
    };
  }
  publish() {
    this.emit({ type: "status", ...this.status() });
  }
  changed(chat) {
    chat.updated = this.now();
    this.save();
    this.emit({ type: "chat", chat: copy(chat) });
    this.emit({ type: "chats", chats: this.list() });
  }
  get(id) {
    const chat = this.state.chats.find(
      (c) => c.id === id && c.owner === this.account()?.owner,
    );
    if (!this.account() || !chat)
      throw new Error("This chat is not available for this account.");
    return chat;
  }
  async start() {
    this.emit({ type: "ready", ...this.status() });
    if (this.account()) {
      try {
        await this.loadModels();
      } catch (error) {
        this.emit({ type: "fatal", message: error.message });
      }
    }
  }
  async json(url, options = {}) {
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 30000);
    const cancel = () => controller.abort();
    options.signal?.addEventListener("abort", cancel, { once: true });
    if (options.signal?.aborted) controller.abort();
    try {
      const response = await this.fetch(url, {
        ...options,
        signal: controller.signal,
        credentials: "omit",
        redirect: "error",
      });
      const text = await response.text();
      if (text.length > 2_000_000)
        throw new Error("OpenAI returned an oversized response.");
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(
          `OpenAI returned an unreadable response (${response.status}). Try again shortly.`,
        );
      }
      return { ok: response.ok, status: response.status, data };
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", cancel);
    }
  }
  async refresh() {
    if (this.refreshing) return this.refreshing;
    if (!this.tokens?.refresh_token)
      throw new Error("Please sign in with ChatGPT again.");
    this.refreshing = (async () => {
      const r = await this.json(`${AUTH}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: CLIENT_ID,
          grant_type: "refresh_token",
          refresh_token: this.tokens.refresh_token,
        }),
      });
      if (!r.ok) {
        if ([400, 401, 403].includes(r.status)) {
          this.storage.removeItem(AUTH_KEY);
          this.tokens = null;
          this.publish();
        }
        throw new Error(
          `Your ChatGPT sign-in could not be refreshed (${r.status}). ${this.account() ? "Try again shortly." : "Please sign in again."}`,
        );
      }
      this.setTokens({ ...this.tokens, ...r.data });
    })().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }
  async headers(forceRefresh = false) {
    if (!this.account()) throw new Error("Sign in with ChatGPT first.");
    if (
      forceRefresh ||
      (claims(this.tokens.access_token).exp || 0) * 1000 < this.now() + 60000
    )
      await this.refresh();
    return {
      Authorization: `Bearer ${this.tokens.access_token}`,
      "ChatGPT-Account-Id": this.account().id,
      "Content-Type": "application/json",
      originator: "codex_cli_rs",
      version: VERSION,
    };
  }
  async loadModels() {
    let r = await this.json(`${CODEX}/models?client_version=${VERSION}`, {
      headers: await this.headers(),
    });
    if (r.status === 401)
      r = await this.json(`${CODEX}/models?client_version=${VERSION}`, {
        headers: await this.headers(true),
      });
    if (!r.ok)
      throw new Error(
        `OpenAI could not load your models (${r.status}). Check your subscription and try again.`,
      );
    const models = modelList(r.data);
    if (!models.length)
      throw new Error("No models are available for this subscription.");
    this.state.models = models;
    this.save();
    this.publish();
  }
  async signIn() {
    if (this.account()) throw new Error("Sign out before changing accounts.");
    if (this.login) return this.login.public;
    const controller = new AbortController();
    const attempt = { controller, public: { pending: true } };
    this.login = attempt;
    try {
      const r = await this.json(`${AUTH}/api/accounts/deviceauth/usercode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: CLIENT_ID }),
        signal: controller.signal,
      });
      aborted(controller.signal);
      if (
        !r.ok ||
        !r.data.device_auth_id ||
        !(r.data.user_code || r.data.usercode)
      )
        throw new Error(
          `OpenAI could not start sign-in (${r.status}). Try again shortly.`,
        );
      attempt.public = {
        verificationUrl: `${AUTH}/codex/device`,
        userCode: r.data.user_code || r.data.usercode,
        expiresAt: this.now() + 15 * 60 * 1000,
      };
      attempt.task = this.pollLogin(attempt, r.data)
        .catch((error) => {
          if (error.name !== "AbortError")
            this.emit({
              type: "loginComplete",
              success: false,
              error: error.message,
            });
        })
        .finally(() => {
          if (this.login === attempt) this.login = null;
        });
      return attempt.public;
    } catch (error) {
      if (this.login === attempt) this.login = null;
      throw error;
    }
  }
  async pollLogin(attempt, device) {
    const signal = attempt.controller.signal,
      interval = Math.max(5, Math.min(30, Number(device.interval) || 5)) * 1000;
    while (this.now() < attempt.public.expiresAt) {
      await this.sleep(interval, signal);
      const r = await this.json(`${AUTH}/api/accounts/deviceauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_auth_id: device.device_auth_id,
          user_code: attempt.public.userCode,
        }),
        signal,
      });
      if ([403, 404].includes(r.status)) continue;
      if (!r.ok || !r.data.authorization_code || !r.data.code_verifier)
        throw new Error(
          `OpenAI could not finish sign-in (${r.status}). Start a new sign-in.`,
        );
      const token = await this.json(`${AUTH}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: CLIENT_ID,
          code: r.data.authorization_code,
          code_verifier: r.data.code_verifier,
          redirect_uri: `${AUTH}/deviceauth/callback`,
        }).toString(),
        signal,
      });
      aborted(signal);
      if (!token.ok)
        throw new Error(
          `OpenAI rejected the sign-in exchange (${token.status}). Start a new sign-in.`,
        );
      this.setTokens(token.data);
      this.publish();
      try {
        await this.loadModels();
      } catch (error) {
        this.emit({ type: "fatal", message: error.message });
      }
      this.emit({ type: "loginComplete", success: true });
      return;
    }
    throw new Error("The sign-in code expired. Start a new sign-in.");
  }
  chooseModel(modelId, effort) {
    const model = this.state.models.find((m) => m.id === modelId);
    if (!model) throw new Error("Choose an available model.");
    return {
      model: model.id,
      effort: model.efforts.includes(effort) ? effort : model.effort,
    };
  }
  async request(type, payload = {}) {
    if (type === "status") return this.status();
    if (type === "login.start") return this.signIn();
    if (type === "login.cancel") {
      this.login?.controller.abort();
      this.login = null;
      return {};
    }
    if (type === "logout") {
      if (this.tasks.size)
        throw new Error("Stop active replies before signing out.");
      this.login?.controller.abort();
      this.login = null;
      this.storage.removeItem(AUTH_KEY);
      this.tokens = null;
      this.publish();
      return {};
    }
    if (type === "models.refresh") {
      await this.loadModels();
      return {};
    }
    if (!this.account()) throw new Error("Sign in with ChatGPT first.");
    if (type === "chat.create") {
      if (this.state.chats.length >= 50)
        throw new Error(
          "The TV has reached its 50-chat limit. Export and remove older chats in Settings.",
        );
      const chat = {
        id: uid(),
        owner: this.account().owner,
        title: "New chat",
        ...this.chooseModel(payload.model, payload.effort),
        messages: [],
        updated: this.now(),
        status: "idle",
        error: "",
        requests: [],
      };
      this.state.chats.push(chat);
      try {
        this.changed(chat);
      } catch (e) {
        this.state.chats.pop();
        throw e;
      }
      return copy(chat);
    }
    if (type === "chat.archived") return this.list(true);
    if (type === "chat.export")
      return JSON.stringify(
        {
          version: 1,
          chats: this.state.chats.filter((c) => c.owner === this.account().id),
        },
        null,
        2,
      );
    const chat = this.get(payload.chatId);
    if (type === "chat.read") return copy(chat);
    if (type === "chat.stop") {
      this.tasks.get(chat.id)?.controller.abort();
      return {};
    }
    if (type === "chat.send" && chat.requests.includes(payload.requestId))
      return copy(chat);
    if (chat.status === "thinking")
      throw new Error("Stop the current reply before changing this chat.");
    if (type === "chat.send")
      return this.send(chat, payload.text, payload.requestId);
    if (type === "chat.rename") {
      const title = String(payload.title || "")
        .trim()
        .slice(0, 100);
      if (!title) throw new Error("Enter a chat name.");
      chat.title = title;
    } else if (type === "chat.remove") chat.archived = true;
    else if (type === "chat.restore") chat.archived = false;
    else if (type === "chat.delete") {
      this.state.chats = this.state.chats.filter((c) => c !== chat);
    } else if (type === "chat.model")
      Object.assign(chat, this.chooseModel(payload.model, payload.effort));
    else throw new Error("Unknown request.");
    this.changed(chat);
    return copy(chat);
  }
  async send(chat, text, requestId) {
    if (
      typeof requestId !== "string" ||
      requestId.length > 100 ||
      requestId.length < 8
    )
      throw new Error("Invalid message request.");
    if (chat.requests.includes(requestId)) return copy(chat);
    if (typeof text !== "string" || !text.trim() || text.length > 16000)
      throw new Error("Enter a message of 1 to 16,000 characters.");
    if (
      chat.messages.length >= 198 ||
      chat.messages.reduce((n, m) => n + m.text.length, text.length) >
        MAX_CONTEXT
    )
      throw new Error(
        "This chat is too long for the TV. Start a new chat to continue.",
      );
    if (this.tasks.size >= 3)
      throw new Error(
        "Wait for an active reply to finish before starting another.",
      );
    if (
      JSON.stringify(this.state).length + text.length + MAX_REPLY * 6 >
      MAX_STORED
    )
      throw new Error(
        "The TV needs more room to save a reply. Export and remove older chats in Settings.",
      );
    const before = copy(chat),
      controller = new AbortController();
    const input = [
      ...chat.messages.filter((m) => m.text),
      { role: "user", text: text.trim() },
    ].map((m) => ({
      role: m.role,
      content: [
        {
          type: m.role === "assistant" ? "output_text" : "input_text",
          text: m.text,
        },
      ],
    }));
    chat.messages.push({ id: uid(), role: "user", text: text.trim() });
    const reply = { id: uid(), role: "assistant", text: "" };
    chat.messages.push(reply);
    chat.requests = [...chat.requests.slice(-99), requestId];
    chat.status = "thinking";
    chat.error = "";
    chat.archived = false;
    if (chat.title === "New chat")
      chat.title = text.trim().replace(/\s+/g, " ").slice(0, 70);
    try {
      this.changed(chat);
    } catch (error) {
      Object.assign(chat, before);
      throw error;
    }
    const task = { controller };
    this.tasks.set(chat.id, task);
    task.promise = this.runTurn(chat, reply, input, controller).finally(() =>
      this.tasks.delete(chat.id),
    );
    return copy(chat);
  }
  async runTurn(chat, reply, input, controller) {
    let saveAt = this.now(),
      finished = false,
      connectTimer;
    try {
      const body = JSON.stringify({
        model: chat.model,
        instructions:
          "You are a helpful conversational assistant in Frame Chat, an unofficial TV client. Answer clearly and naturally. Use Markdown when useful. You have no computer control or tools. Do not claim to perform actions outside the conversation.",
        input,
        tools: [],
        tool_choice: "none",
        parallel_tool_calls: false,
        reasoning: { effort: chat.effort },
        store: false,
        stream: true,
      });
      let response;
      for (let attempt = 0; attempt < 2; attempt++) {
        const headers = {
          ...(await this.headers(attempt === 1)),
          Accept: "text/event-stream",
        };
        aborted(controller.signal);
        connectTimer = setTimeout(() => controller.abort(), 45000);
        response = await this.fetch(`${CODEX}/responses`, {
          method: "POST",
          headers,
          body,
          signal: controller.signal,
          credentials: "omit",
          redirect: "error",
        });
        clearTimeout(connectTimer);
        if (response.status !== 401 || attempt) break;
        await response.body?.cancel();
      }
      if (!response.ok) {
        await response.body?.cancel();
        const hint =
          response.status === 429
            ? "Your subscription has reached a usage limit. Try again later."
            : response.status === 401
              ? "Please sign out and sign in again."
              : response.status === 403
                ? "This model is not available to your account. Choose another model."
                : "Try another model or try again shortly.";
        throw new Error(`OpenAI returned ${response.status}. ${hint}`);
      }
      await readEvents(
        response.body,
        (event) => {
          if (event.type === "response.output_text.delta") {
            const text = typeof event.delta === "string" ? event.delta : "";
            if (reply.text.length + text.length > MAX_REPLY)
              throw new Error(
                "The reply reached the TV’s length limit. Ask the assistant to continue.",
              );
            reply.text += text;
            this.emit({
              type: "delta",
              chatId: chat.id,
              itemId: reply.id,
              text,
            });
            if (this.now() - saveAt > 750) {
              this.save();
              saveAt = this.now();
            }
          }
          if (event.type === "response.completed") finished = true;
          if (
            ["error", "response.failed", "response.incomplete"].includes(
              event.type,
            )
          )
            throw new Error(
              "OpenAI could not finish this reply. Your partial reply has been saved; you can continue below.",
            );
        },
        controller.signal,
      );
      if (!finished)
        throw new Error(
          "The connection ended before the reply finished. Your partial reply has been saved.",
        );
      chat.status = "idle";
    } catch (error) {
      chat.status = controller.signal.aborted ? "interrupted" : "error";
      chat.error = controller.signal.aborted
        ? "Reply stopped. You can continue below."
        : error.message;
    } finally {
      clearTimeout(connectTimer);
      try {
        this.changed(chat);
      } catch (error) {
        this.emit({ type: "fatal", message: error.message });
      }
    }
  }
  close() {
    this.login?.controller.abort();
    for (const [id, task] of this.tasks) {
      task.controller.abort();
      const chat = this.state.chats.find((c) => c.id === id);
      if (chat?.status === "thinking") {
        chat.status = "interrupted";
        chat.error =
          "The app closed during this reply. You can continue below.";
      }
    }
    // A page may disappear before an aborted fetch's promise gets another turn.
    // Commit the in-memory checkpoint synchronously while storage is available.
    try {
      this.save();
    } catch (error) {
      this.emit({ type: "fatal", message: error.message });
    }
  }
}
