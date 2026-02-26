import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { API_SECRET, SESSION_PAGE_USER, SESSION_PAGE_PASS, MAX_CONCURRENT, getActiveSessions, SLACK_BOT_TOKEN } from "./config.ts";
import type { SessionStore } from "./session-store.ts";
import type { DockerService } from "./docker.ts";
import type { InteractiveSessionManager } from "./interactive.ts";
import { workspacePageHTML, dashboardHTML, type ChannelGroup, type WorkspaceGroup } from "./html-templates.ts";
import { parseMessage, validateResumeSession, truncate } from "./util.ts";

// ── Helpers ─────────────────────────────────────────────────────

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, data: any): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function html(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(body);
}

// ── Auth ────────────────────────────────────────────────────────

function checkApiAuth(req: IncomingMessage): boolean {
  if (!API_SECRET) return true;
  return (req.headers.authorization ?? "") === `Bearer ${API_SECRET}`;
}

function checkBasicAuth(req: IncomingMessage): boolean {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Basic ")) return false;
  const decoded = Buffer.from(authHeader.slice(6), "base64").toString();
  const [u, p] = decoded.split(":");
  return u === SESSION_PAGE_USER && p === SESSION_PAGE_PASS;
}

function sendUnauthorized(res: ServerResponse, type: "api" | "basic"): void {
  if (type === "basic") {
    res.writeHead(401, {
      "Content-Type": "text/plain",
      "WWW-Authenticate": 'Basic realm="ClaudeBox Session"',
    });
    res.end("Unauthorized");
  } else {
    json(res, 401, { error: "unauthorized" });
  }
}

// ── Channel info resolution ─────────────────────────────────────

interface SlackChannelInfo {
  name: string;
  isDm: boolean;  // DM or MPIM (group DM)
}
const channelInfoCache = new Map<string, SlackChannelInfo>();

async function getSlackChannelInfo(channelId: string): Promise<SlackChannelInfo> {
  if (channelInfoCache.has(channelId)) return channelInfoCache.get(channelId)!;

  // D-prefix channels are always DMs
  if (channelId.startsWith("D")) {
    const info = { name: "", isDm: true };
    channelInfoCache.set(channelId, info);
    return info;
  }

  if (!SLACK_BOT_TOKEN) {
    return { name: channelId, isDm: false };
  }

  try {
    const r = await fetch(`https://slack.com/api/conversations.info?channel=${channelId}`, {
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
    });
    const d = await r.json() as any;
    if (d.ok && d.channel) {
      const info: SlackChannelInfo = {
        name: d.channel.name || channelId,
        isDm: !!(d.channel.is_im || d.channel.is_mpim),
      };
      channelInfoCache.set(channelId, info);
      return info;
    }
  } catch {}

  return { name: channelId, isDm: false };
}

// ── Dashboard builder ──────────────────────────────────────────

async function buildDashboardData(store: SessionStore): Promise<ChannelGroup[]> {
  const all = store.listAll();

  // Group sessions by worktree_id (or by _log_id for sessions without a worktree)
  const worktreeMap = new Map<string, { sessions: any[]; worktreeId: string }>();
  for (const s of all) {
    const key = s.worktree_id || `_single_${s._log_id}`;
    if (!worktreeMap.has(key)) worktreeMap.set(key, { sessions: [], worktreeId: s.worktree_id || "" });
    worktreeMap.get(key)!.sessions.push(s);
  }

  // Collect unique channel IDs and resolve names in parallel
  const channelIds = new Set<string>();
  for (const [, { sessions }] of worktreeMap) {
    const channelId = sessions[0]?.slack_channel || "";
    if (channelId) channelIds.add(channelId);
  }
  const channelInfoMap = new Map<string, SlackChannelInfo>();
  await Promise.all([...channelIds].map(async (id) => {
    channelInfoMap.set(id, await getSlackChannelInfo(id));
  }));

  // Build workspace groups, grouped by channel
  const channelMap = new Map<string, { channelName: string; workspaces: WorkspaceGroup[] }>();
  for (const [_key, { sessions, worktreeId }] of worktreeMap) {
    const latest = sessions[0]; // already sorted newest first
    const channelId = latest.slack_channel || "";

    // Skip DMs and group DMs (MPIMs)
    const info = channelInfoMap.get(channelId);
    if (!channelId || info?.isDm) continue;

    const ws: WorkspaceGroup = {
      worktreeId: worktreeId || latest._log_id || "?",
      sessions,
      latestSession: latest,
      alive: worktreeId ? store.isWorktreeAlive(worktreeId) : false,
    };

    if (!channelMap.has(channelId)) {
      // Prefer API-resolved name, fall back to stored name, then channel ID
      const name = info?.name || latest.slack_channel_name || channelId;
      channelMap.set(channelId, { channelName: name, workspaces: [] });
    }
    channelMap.get(channelId)!.workspaces.push(ws);
  }

  // Sort channels by name, workspaces by most recent
  const channels: ChannelGroup[] = [];
  for (const [channelId, data] of channelMap) {
    data.workspaces.sort((a, b) =>
      (b.latestSession.started || "").localeCompare(a.latestSession.started || "")
    );
    channels.push({ channelId, channelName: data.channelName, workspaces: data.workspaces });
  }
  channels.sort((a, b) => a.channelName.localeCompare(b.channelName));

  return channels;
}

// ── Session resolution ──────────────────────────────────────────

/** Resolve a URL param to a worktree ID and session. Handles:
 *  - 16-hex worktree ID (primary)
 *  - <worktreeId>-<seq> session log ID
 *  - 32-hex legacy session hash
 */
function resolveSession(param: string, store: SessionStore): { worktreeId: string; session: SessionMeta } | null {
  // Try as worktree ID (16 hex) — returns latest session
  if (/^[a-f0-9]{16}$/.test(param)) {
    const session = store.findByWorktreeId(param);
    if (session) return { worktreeId: param, session };
  }
  // Try as new-format log ID: <worktreeId>-<seq>
  if (/^[a-f0-9]{16}-\d+$/.test(param)) {
    const session = store.findByHash(param);
    if (session) return { worktreeId: session.worktree_id || param.slice(0, 16), session };
  }
  // Try as legacy 32-hex hash
  if (/^[a-f0-9]{32}$/.test(param)) {
    const session = store.findByHash(param);
    if (session) return { worktreeId: session.worktree_id || "", session };
  }
  return null;
}

// ── Route definitions ───────────────────────────────────────────

type RouteHandler = (
  req: IncomingMessage, res: ServerResponse, params: Record<string, string>,
  ctx: { store: SessionStore; docker: DockerService; interactive: InteractiveSessionManager },
) => Promise<void>;

interface Route {
  method: string;
  pattern: RegExp;
  auth: "api" | "basic" | "none";
  handler: RouteHandler;
}

const routes: Route[] = [
  // POST /run — start a ClaudeBox session
  {
    method: "POST", pattern: /^\/run$/, auth: "api",
    handler: async (req, res, _params, { store, docker }) => {
      if (getActiveSessions() >= MAX_CONCURRENT) {
        json(res, 503, { error: "at capacity", active: getActiveSessions(), max: MAX_CONCURRENT });
        return;
      }
      let body: any;
      try { body = JSON.parse(await readBody(req)); }
      catch { json(res, 400, { error: "invalid JSON" }); return; }

      const prompt: string = body.prompt ?? "";
      if (!prompt) { json(res, 400, { error: "prompt required" }); return; }

      let worktreeId = body.worktree_id || "";
      const parsed = worktreeId ? null : parseMessage(prompt, (h) => store.findByHash(h));

      if (!worktreeId && parsed?.type === "reply-hash") {
        const prevSession = store.findByHash(parsed.hash);
        const err = validateResumeSession(prevSession, parsed.hash);
        if (err) { json(res, 400, { error: err }); return; }
        worktreeId = prevSession!.worktree_id || "";
      }

      console.log(`[HTTP] POST /run user=${body.user ?? "?"} prompt=${truncate(prompt, 120)}${worktreeId ? ` (worktree=${worktreeId})` : ""}`);

      let responded = false;
      docker.runContainerSession({
        prompt: parsed?.type === "reply-hash" ? parsed.prompt : prompt,
        userName: body.user,
        commentId: body.comment_id,
        runCommentId: body.run_comment_id,
        runUrl: body.run_url,
        link: body.link,
        worktreeId: worktreeId || undefined,
        targetRef: body.target_ref || undefined,
      }, store, undefined, (logUrl) => {
        if (!responded) {
          responded = true;
          json(res, 202, { log_url: logUrl, status: "started" });
        }
      }).catch((e) => {
        console.error(`[HTTP] Session error: ${e}`);
        if (!responded) {
          responded = true;
          json(res, 500, { error: e.message });
        }
      });
    },
  },

  // GET /session/:id — session status (JSON API)
  {
    method: "GET", pattern: /^\/session\/([a-f0-9][\w-]+)$/, auth: "api",
    handler: async (_req, res, params, { store }) => {
      const resolved = resolveSession(params[0], store);
      if (!resolved) { json(res, 404, { error: "not found" }); return; }
      const session = resolved.session;
      json(res, 200, {
        status: session.status,
        log_url: session.log_url,
        user: session.user,
        started: session.started,
        finished: session.finished,
        exit_code: session.exit_code,
        worktree_id: session.worktree_id || "",
      });
    },
  },

  // GET /dashboard — workspace dashboard
  {
    method: "GET", pattern: /^\/dashboard$/, auth: "basic",
    handler: async (_req, res, _params, { store }) => {
      const channels = await buildDashboardData(store);
      html(res, 200, dashboardHTML(channels));
    },
  },

  // GET / — redirect to dashboard
  {
    method: "GET", pattern: /^\/$/, auth: "none",
    handler: async (_req, res) => {
      res.writeHead(302, { Location: "/dashboard" });
      res.end();
    },
  },

  // POST /auth-check — validate credentials without triggering browser popup
  {
    method: "POST", pattern: /^\/auth-check$/, auth: "none",
    handler: async (req, res) => {
      if (checkBasicAuth(req)) {
        json(res, 200, { ok: true });
      } else {
        json(res, 401, { ok: false, error: "invalid credentials" });
      }
    },
  },

  // GET /s/<id> — workspace status page (public)
  {
    method: "GET", pattern: /^\/s\/([a-f0-9][\w-]+)$/, auth: "none",
    handler: async (_req, res, params, { store }) => {
      const resolved = resolveSession(params[0], store);
      if (!resolved) { res.writeHead(404, { "Content-Type": "text/plain" }); res.end("Session not found"); return; }

      const { worktreeId, session } = resolved;
      // If accessed by session log ID, redirect to canonical worktree URL
      if (worktreeId && params[0] !== worktreeId) {
        res.writeHead(302, { Location: `/s/${worktreeId}` });
        res.end();
        return;
      }

      const hash = session._log_id || params[0];
      const sessions = worktreeId ? store.listByWorktree(worktreeId) : [{ ...session, _log_id: hash }];
      const worktreeAlive = worktreeId ? store.isWorktreeAlive(worktreeId) : false;
      const activity = worktreeId ? store.readActivity(worktreeId) : [];

      html(res, 200, workspacePageHTML({ hash, session, sessions, worktreeAlive, activity }));
    },
  },

  // POST /s/<id>/keepalive
  {
    method: "POST", pattern: /^\/s\/([a-f0-9][\w-]+)\/keepalive$/, auth: "none",
    handler: async (req, res, params, { interactive }) => {
      const s = interactive.get(params[0]);
      if (!s) { json(res, 404, { error: "no active interactive session" }); return; }
      let minutes = 5;
      try {
        const body = JSON.parse(await readBody(req));
        minutes = Math.max(1, Math.min(60, body.minutes || 5));
      } catch {}
      interactive.resetKeepalive(params[0], minutes);
      json(res, 200, { ok: true, minutes, deadline: s.deadline });
    },
  },

  // POST /s/<id>/cancel — cancel session (JSON response)
  {
    method: "POST", pattern: /^\/s\/([a-f0-9][\w-]+)\/cancel$/, auth: "basic",
    handler: async (_req, res, params, { store, interactive }) => {
      const resolved = resolveSession(params[0], store);
      if (!resolved) { json(res, 404, { ok: false, message: "Session not found" }); return; }
      const cancelled = interactive.cancelSession(params[0], resolved.session);
      json(res, 200, { ok: cancelled, message: cancelled ? "Session cancelled" : "Session was already stopped" });
    },
  },

  // POST /s/<id>/resume — start a new Claude session in the same worktree
  {
    method: "POST", pattern: /^\/s\/([a-f0-9][\w-]+)\/resume$/, auth: "basic",
    handler: async (req, res, params, { store, docker }) => {
      const resolved = resolveSession(params[0], store);
      if (!resolved) { json(res, 404, { ok: false, message: "Session not found" }); return; }
      const { session } = resolved;
      if (session.status === "running") { json(res, 409, { ok: false, message: "Session is still running" }); return; }
      if (!session.worktree_id) { json(res, 400, { ok: false, message: "No worktree to resume" }); return; }
      if (!store.isWorktreeAlive(session.worktree_id)) { json(res, 400, { ok: false, message: "Workspace has been deleted" }); return; }
      if (getActiveSessions() >= MAX_CONCURRENT) { json(res, 503, { ok: false, message: "At capacity" }); return; }

      let body: any = {};
      try { body = JSON.parse(await readBody(req)); } catch {}
      const prompt = body.prompt || "Continue from where you left off.";

      console.log(`[HTTP] POST /s/${params[0]}/resume worktree=${session.worktree_id} prompt=${truncate(prompt, 80)}`);

      let responded = false;
      docker.runContainerSession({
        prompt,
        userName: session.user || "web",
        slackChannel: session.slack_channel || "",
        slackChannelName: session.slack_channel_name || "",
        slackThreadTs: session.slack_thread_ts || "",
        worktreeId: session.worktree_id,
        targetRef: session.base_branch ? `origin/${session.base_branch}` : undefined,
      }, store, undefined, (logUrl) => {
        if (!responded) {
          responded = true;
          json(res, 202, { ok: true, log_url: logUrl, status: "started" });
        }
      }).catch((e) => {
        console.error(`[HTTP] Resume error: ${e}`);
        if (!responded) {
          responded = true;
          json(res, 500, { ok: false, message: e.message });
        }
      });
    },
  },
];

// ── Server factory ──────────────────────────────────────────────

export function createHttpServer(
  store: SessionStore,
  docker: DockerService,
  interactive: InteractiveSessionManager,
) {
  const ctx = { store, docker, interactive };

  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // Strip query string so route patterns don't need to account for ?key=val
    const pathname = (req.url || "/").split("?")[0];
    for (const route of routes) {
      if (req.method !== route.method) continue;
      const m = pathname.match(route.pattern);
      if (!m) continue;

      // Auth check
      if (route.auth === "api" && !checkApiAuth(req)) { sendUnauthorized(res, "api"); return; }
      if (route.auth === "basic" && !checkBasicAuth(req)) { sendUnauthorized(res, "basic"); return; }

      // Extract regex groups as params
      const params: Record<string, string> = {};
      for (let i = 1; i < m.length; i++) params[i - 1] = m[i];

      try {
        await route.handler(req, res, params, ctx);
      } catch (e: any) {
        console.error(`[HTTP] Route error: ${e.message}`);
        if (!res.headersSent) json(res, 500, { error: "internal error" });
      }
      return;
    }

    json(res, 404, { error: "not found" });
  });
}
