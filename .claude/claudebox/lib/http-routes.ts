import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { API_SECRET, SESSION_PAGE_USER, SESSION_PAGE_PASS, MAX_CONCURRENT, getActiveSessions, SLACK_BOT_TOKEN, CHANNEL_BASE_BRANCHES, DEFAULT_BASE_BRANCH, GH_TOKEN } from "./config.ts";
import { existsSync, readFileSync, watch } from "fs";
import { join } from "path";
import type { SessionStore } from "./session-store.ts";
import type { DockerService } from "./docker.ts";
import type { InteractiveSessionManager } from "./interactive.ts";
import type { SessionMeta, Artifact, EnrichedWorkspace, ThreadGroup, ChannelGroup } from "./types.ts";
import { workspacePageHTML, dashboardHTML, auditDashboardHTML, personalDashboardHTML, type WorkspaceCard } from "./html-templates.ts";
import { parseMessage, parseKeywords, validateResumeSession, truncate, prKeyFromUrl } from "./util.ts";
import { QuestionStore } from "./question-store.ts";
import { generateTags } from "./tagger.ts";

// ── Helpers ─────────────────────────────────────────────────────

const MAX_BODY_BYTES = 1 * 1024 * 1024; // 1 MB

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (c: Buffer) => {
      total += c.length;
      if (total > MAX_BODY_BYTES) { req.destroy(); reject(new Error("body too large")); return; }
      chunks.push(c);
    });
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
  const idx = decoded.indexOf(":");
  if (idx < 0) return false;
  const u = decoded.slice(0, idx);
  const p = decoded.slice(idx + 1);
  return u === SESSION_PAGE_USER && p === SESSION_PAGE_PASS;
}

function sendUnauthorized(res: ServerResponse, _type: "api" | "basic"): void {
  // Never send WWW-Authenticate — all dashboards use custom JS auth overlays.
  // The browser's native basic auth popup leaks credentials in the URL bar.
  json(res, 401, { error: "unauthorized" });
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

async function buildDashboardData(store: SessionStore, profileFilter?: string): Promise<WorkspaceCard[]> {
  const all = store.listAll();

  // Group sessions by worktree_id (or by _log_id for sessions without a worktree)
  const worktreeMap = new Map<string, { sessions: any[]; worktreeId: string }>();
  for (const s of all) {
    // Profile filtering: when profileFilter is set, only include matching sessions;
    // when unset (default dashboard), exclude audit sessions
    const sessionProfile = s.profile || "";
    if (profileFilter) {
      if (sessionProfile !== profileFilter) continue;
    } else {
      if (sessionProfile) continue; // exclude profiled sessions from default dashboard
    }
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

  // Build flat workspace list
  const workspaces: WorkspaceCard[] = [];
  for (const [_key, { sessions, worktreeId }] of worktreeMap) {
    const latest = sessions[0]; // already sorted newest first
    const channelId = latest.slack_channel || "";

    const info = channelInfoMap.get(channelId);
    const meta = worktreeId ? store.getWorktreeMeta(worktreeId) : {};
    const channelName = (info?.isDm ? "DM" : info?.name) || latest.slack_channel_name || "";

    workspaces.push({
      worktreeId: worktreeId || latest._log_id || "?",
      name: meta.name || null,
      resolved: !!meta.resolved,
      alive: worktreeId ? store.isWorktreeAlive(worktreeId) : false,
      status: latest.status || "unknown",
      exitCode: latest.exit_code ?? null,
      user: latest.user || "unknown",
      prompt: (latest.prompt || "").slice(0, 120),
      started: latest.started || null,
      baseBranch: latest.base_branch || "next",
      channelName,
      runCount: sessions.length,
      profile: latest.profile || "",
    });
  }

  // Sort: running first, then by start time newest first
  workspaces.sort((a, b) => {
    const aRunning = a.status === "running" || a.status === "interactive" ? 1 : 0;
    const bRunning = b.status === "running" || b.status === "interactive" ? 1 : 0;
    if (aRunning !== bRunning) return bRunning - aRunning;
    return (b.started || "").localeCompare(a.started || "");
  });

  return workspaces;
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

      let prompt: string = body.prompt ?? "";
      if (!prompt) { json(res, 400, { error: "prompt required" }); return; }

      // Parse keywords (ci-allow, profile, etc.) from prompt text
      const keywords = parseKeywords({ type: "fresh", prompt });
      const ciAllow = keywords.ciAllow;
      const runProfile = body.profile || keywords.profile || "";
      prompt = keywords.prompt;

      let worktreeId = body.worktree_id || "";
      const parsed = worktreeId ? null : parseMessage(prompt, (h) => store.findByHash(h));

      if (!worktreeId && parsed?.type === "reply-hash") {
        const prevSession = store.findByHash(parsed.hash);
        const err = validateResumeSession(prevSession, parsed.hash);
        if (err) { json(res, 400, { error: err }); return; }
        worktreeId = prevSession!.worktree_id || "";
      }

      // PR binding: reuse the worktree already associated with this PR
      const prKey = body.link ? prKeyFromUrl(body.link) : null;
      if (!worktreeId && prKey) {
        const bound = store.getPrBinding(prKey);
        if (bound) {
          const prev = store.findByWorktreeId(bound);
          if (prev?.status === "running") { json(res, 409, { error: "Session already running for this PR" }); return; }
          if (prev?.worktree_id && store.isWorktreeAlive(prev.worktree_id)) {
            worktreeId = prev.worktree_id;
            console.log(`[HTTP] PR binding ${prKey} → worktree ${worktreeId}`);
          }
        }
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
        ciAllow,
        profile: runProfile || undefined,
      }, store, undefined, (logUrl, newWorktreeId) => {
        if (prKey) store.bindPr(prKey, newWorktreeId);
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
    method: "GET", pattern: /^\/dashboard$/, auth: "none",
    handler: async (_req, res) => {
      html(res, 200, dashboardHTML());
    },
  },

  // GET /audit — audit dashboard (barretenberg-audit profile)
  {
    method: "GET", pattern: /^\/audit$/, auth: "none",
    handler: async (_req, res) => {
      html(res, 200, auditDashboardHTML());
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

  // GET /s/<id>/activity — JSON activity feed (initial load + polling fallback)
  {
    method: "GET", pattern: /^\/s\/([a-f0-9][\w-]+)\/activity$/, auth: "none",
    handler: async (req, res, params, { store }) => {
      const resolved = resolveSession(params[0], store);
      if (!resolved) { json(res, 404, { error: "not found" }); return; }
      const { worktreeId, session } = resolved;
      const activity = worktreeId ? store.readActivity(worktreeId).reverse() : []; // oldest first
      const sessions = worktreeId ? store.listByWorktree(worktreeId) : [];
      json(res, 200, {
        activity,
        status: session.status || "unknown",
        exit_code: session.exit_code ?? null,
        user: session.user || "unknown",
        sessions: sessions.map(s => ({
          log_id: s._log_id, status: s.status, exit_code: s.exit_code,
          started: s.started, prompt: s.prompt, user: s.user, log_url: s.log_url,
        })),
      });
    },
  },

  // GET /s/<id>/events — SSE stream of new activity entries
  {
    method: "GET", pattern: /^\/s\/([a-f0-9][\w-]+)\/events$/, auth: "none",
    handler: async (_req, res, params, { store }) => {
      const resolved = resolveSession(params[0], store);
      if (!resolved) { json(res, 404, { error: "not found" }); return; }
      const { worktreeId, session } = resolved;
      if (!worktreeId) { json(res, 400, { error: "no worktree" }); return; }

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      });

      // Send current state as initial event
      const activity = store.readActivity(worktreeId).reverse(); // oldest first
      const currentSession = store.findByWorktreeId(worktreeId);
      res.write(`data: ${JSON.stringify({ type: "init", activity, status: currentSession?.status || "unknown", exit_code: currentSession?.exit_code ?? null })}\n\n`);

      let lineCount = activity.length;
      const activityPath = join(store.worktreesDir, worktreeId, "workspace", "activity.jsonl");

      // Poll for new lines (fs.watch is unreliable in Docker bind mounts)
      const poll = setInterval(() => {
        try {
          if (!existsSync(activityPath)) return;
          const lines = readFileSync(activityPath, "utf-8").split("\n").filter(l => l.trim());
          if (lines.length > lineCount) {
            const newEntries = lines.slice(lineCount).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
            for (const entry of newEntries) {
              res.write(`data: ${JSON.stringify({ type: "activity", entry })}\n\n`);
              // Auto-set workspace name from Claude's set_workspace_name tool
              if (entry.type === "name" && entry.text && worktreeId) {
                store.setWorktreeName(worktreeId, entry.text);
              }
            }
            lineCount = lines.length;
          }
          // Also check for status changes
          const latest = store.findByWorktreeId(worktreeId);
          if (latest) {
            res.write(`data: ${JSON.stringify({ type: "status", status: latest.status || "unknown", exit_code: latest.exit_code ?? null })}\n\n`);
          }
        } catch {}
      }, 1500);

      // Keepalive
      const keepalive = setInterval(() => { res.write(": keepalive\n\n"); }, 15000);

      res.on("close", () => { clearInterval(poll); clearInterval(keepalive); });
    },
  },

  // GET /api/users — list known user identities
  {
    method: "GET", pattern: /^\/api\/users$/, auth: "basic",
    handler: async (_req, res, _params, { store }) => {
      json(res, 200, { users: store.knownUsers() });
    },
  },

  // GET /api/dashboard — workspace data as JSON (supports ?profile=X filter)
  {
    method: "GET", pattern: /^\/api\/dashboard$/, auth: "basic",
    handler: async (req, res, _params, { store }) => {
      const url = new URL(req.url || "/", "http://localhost");
      const profileFilter = url.searchParams.get("profile") || undefined;
      const workspaces = await buildDashboardData(store, profileFilter);
      json(res, 200, { workspaces, activeCount: getActiveSessions(), maxConcurrent: MAX_CONCURRENT });
    },
  },

  // GET /api/branches — available base branches
  {
    method: "GET", pattern: /^\/api\/branches$/, auth: "basic",
    handler: async (_req, res) => {
      const branches = [DEFAULT_BASE_BRANCH, ...Object.values(CHANNEL_BASE_BRANCHES)];
      json(res, 200, { branches: [...new Set(branches)] });
    },
  },

  // POST /api/sessions — start a new session from the dashboard
  {
    method: "POST", pattern: /^\/api\/sessions$/, auth: "basic",
    handler: async (req, res, _params, { store, docker }) => {
      if (getActiveSessions() >= MAX_CONCURRENT) {
        json(res, 503, { ok: false, message: "At capacity" });
        return;
      }
      let body: any;
      try { body = JSON.parse(await readBody(req)); }
      catch { json(res, 400, { error: "invalid JSON" }); return; }

      const prompt = (body.prompt || "").trim();
      if (!prompt) { json(res, 400, { error: "prompt required" }); return; }

      const user = body.user || "web";
      const baseBranch = body.base_branch || DEFAULT_BASE_BRANCH;
      const name = (body.name || "").trim();
      const profile = (body.profile || "").trim();

      console.log(`[HTTP] POST /api/sessions user=${user} branch=${baseBranch}${profile ? ` profile=${profile}` : ""} prompt=${truncate(prompt, 80)}`);

      let responded = false;
      docker.runContainerSession({
        prompt,
        userName: user,
        targetRef: `origin/${baseBranch}`,
        profile: profile || undefined,
      }, store, undefined, (logUrl, worktreeId) => {
        if (name) store.setWorktreeName(worktreeId, name);
        if (!responded) {
          responded = true;
          json(res, 202, { ok: true, log_url: logUrl, worktree_id: worktreeId });
        }
      }).catch((e) => {
        console.error(`[HTTP] Session error: ${e}`);
        if (!responded) {
          responded = true;
          json(res, 500, { ok: false, message: e.message });
        }
      });
    },
  },

  // POST /s/<id>/name — rename a workspace
  {
    method: "POST", pattern: /^\/s\/([a-f0-9][\w-]+)\/name$/, auth: "basic",
    handler: async (req, res, params, { store }) => {
      const resolved = resolveSession(params[0], store);
      if (!resolved) { json(res, 404, { ok: false, message: "Not found" }); return; }
      let body: any;
      try { body = JSON.parse(await readBody(req)); } catch { json(res, 400, { error: "invalid JSON" }); return; }
      const name = (body.name || "").trim();
      if (!name) { json(res, 400, { ok: false, message: "name required" }); return; }
      store.setWorktreeName(resolved.worktreeId, name);
      json(res, 200, { ok: true });
    },
  },

  // POST /s/<id>/resolve — mark workspace as resolved/unresolved
  {
    method: "POST", pattern: /^\/s\/([a-f0-9][\w-]+)\/resolve$/, auth: "basic",
    handler: async (req, res, params, { store }) => {
      const resolved = resolveSession(params[0], store);
      if (!resolved) { json(res, 404, { ok: false, message: "Not found" }); return; }
      let body: any;
      try { body = JSON.parse(await readBody(req)); } catch { json(res, 400, { error: "invalid JSON" }); return; }
      store.setWorktreeResolved(resolved.worktreeId, !!body.resolved);
      json(res, 200, { ok: true });
    },
  },

  // DELETE /s/<id> — delete a workspace to free disk space
  {
    method: "DELETE", pattern: /^\/s\/([a-f0-9][\w-]+)$/, auth: "basic",
    handler: async (_req, res, params, { store }) => {
      const resolved = resolveSession(params[0], store);
      if (!resolved) { json(res, 404, { ok: false, message: "Not found" }); return; }
      // Don't delete if running
      if (resolved.session.status === "running" || resolved.session.status === "interactive") {
        json(res, 409, { ok: false, message: "Cannot delete while session is running" });
        return;
      }
      store.deleteWorktree(resolved.worktreeId);
      json(res, 200, { ok: true });
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

  // GET /api/audit/questions — list questions from local question store
  {
    method: "GET", pattern: /^\/api\/audit\/questions$/, auth: "basic",
    handler: async (req, res) => {
      const url = new URL(req.url || "/", "http://localhost");
      const status = url.searchParams.get("state") || url.searchParams.get("status") || undefined;
      const worktreeId = url.searchParams.get("worktree_id") || undefined;
      const questionStore = new QuestionStore();
      if (worktreeId) {
        json(res, 200, questionStore.getQuestions(worktreeId, status === "all" ? undefined : status));
      } else {
        json(res, 200, questionStore.getAll(status === "all" ? undefined : status));
      }
    },
  },

  // GET /api/audit/findings — proxy to GitHub issues API for audit-finding issues
  {
    method: "GET", pattern: /^\/api\/audit\/findings$/, auth: "basic",
    handler: async (req, res) => {
      if (!GH_TOKEN) { json(res, 500, { error: "No GH_TOKEN configured" }); return; }
      const url = new URL(req.url || "/", "http://localhost");
      const state = url.searchParams.get("state") || "all";
      const ghRes = await fetch(
        `https://api.github.com/repos/AztecProtocol/barretenberg-claude/issues?labels=audit-finding&state=${state}&per_page=50&sort=updated`,
        { headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: "application/vnd.github.v3+json" } },
      );
      const data = await ghRes.json();
      json(res, ghRes.status, data);
    },
  },

  // GET /api/audit/assessments — read audit_assessment.jsonl stats
  {
    method: "GET", pattern: /^\/api\/audit\/assessments$/, auth: "basic",
    handler: async (_req, res) => {
      const statsDir = process.env.CLAUDEBOX_STATS_DIR || `${process.env.HOME}/.claudebox/stats`;
      const file = join(statsDir, "audit_assessment.jsonl");
      if (!existsSync(file)) { json(res, 200, []); return; }
      const entries = readFileSync(file, "utf-8")
        .split("\n").filter(l => l.trim())
        .map(l => { try { return JSON.parse(l); } catch { return null; } })
        .filter(Boolean);
      json(res, 200, entries);
    },
  },

  // POST /api/audit/questions/:id/answer — answer a single question from the local store
  {
    method: "POST", pattern: /^\/api\/audit\/questions\/([a-f0-9-]+)\/answer$/, auth: "basic",
    handler: async (req, res, params, { store, docker }) => {
      let body: any;
      try { body = JSON.parse(await readBody(req)); }
      catch { json(res, 400, { error: "invalid JSON" }); return; }

      const questionId = params[0];
      const selectedOption = body.selected_option;
      const freeformAnswer = body.freeform_answer || "";
      const answeredBy = body.answered_by || "web";

      if (!selectedOption) { json(res, 400, { error: "selected_option required" }); return; }

      const questionStore = new QuestionStore();

      // Find which worktree this question belongs to
      const allQuestions = questionStore.getAll();
      const target = allQuestions.find(q => q.id === questionId);
      if (!target) { json(res, 404, { error: `Question ${questionId} not found` }); return; }

      const ok = questionStore.answerQuestion(target.worktree_id, questionId, selectedOption, freeformAnswer, answeredBy);
      if (!ok) { json(res, 409, { error: "Question already answered or expired" }); return; }

      // Check if all questions for this worktree are now resolved
      const allResolved = questionStore.allResolved(target.worktree_id);
      let resumed = false;

      if (allResolved) {
        // Auto-resume the session (fire-and-forget — don't block the HTTP response)
        const session = store.findByWorktreeId(target.worktree_id);
        if (session && session.status !== "running" && store.isWorktreeAlive(target.worktree_id) && getActiveSessions() < MAX_CONCURRENT) {
          const resumePrompt = questionStore.buildResumePrompt(target.worktree_id);
          resumed = true;
          docker.runContainerSession({
            prompt: resumePrompt,
            userName: session.user || "auto-resume",
            worktreeId: target.worktree_id,
            targetRef: session.base_branch ? `origin/${session.base_branch}` : undefined,
            profile: session.profile || undefined,
          }, store).then(() => {
            console.log(`[QUESTIONS] Auto-resumed session completed for worktree ${target.worktree_id}`);
          }).catch(e => {
            console.error(`[QUESTIONS] Auto-resume failed for ${target.worktree_id}: ${e.message}`);
          });
        }
      }

      // Push updated question files to questions branch (fire-and-forget)
      if (GH_TOKEN) {
        questionStore.pushToQuestionsBranch(target.worktree_id, "AztecProtocol/barretenberg-claude", GH_TOKEN).catch(e => {
          console.error(`[QUESTIONS] Failed to push to questions branch: ${e.message}`);
        });
      }

      json(res, 200, { ok: true, all_resolved: allResolved, resumed, worktree_id: target.worktree_id });
    },
  },

  // POST /api/audit/questions/direction — set freeform direction for a worktree's question batch
  {
    method: "POST", pattern: /^\/api\/audit\/questions\/direction$/, auth: "basic",
    handler: async (req, res) => {
      let body: any;
      try { body = JSON.parse(await readBody(req)); }
      catch { json(res, 400, { error: "invalid JSON" }); return; }

      const { worktree_id, text, author } = body;
      if (!worktree_id || !text) { json(res, 400, { error: "worktree_id and text required" }); return; }

      const questionStore = new QuestionStore();
      questionStore.setDirection(worktree_id, text, author || "web");
      json(res, 200, { ok: true });
    },
  },

  // GET /me — personal dashboard
  {
    method: "GET", pattern: /^\/me$/, auth: "none",
    handler: async (_req, res) => {
      html(res, 200, personalDashboardHTML());
    },
  },

  // GET /api/me/sessions — sessions for a specific user, grouped by channel/thread
  {
    method: "GET", pattern: /^\/api\/me\/sessions$/, auth: "basic",
    handler: async (_req, res, _params, { store }) => {
      const all = store.listAll();

      // Collect unique channel IDs and resolve names
      const channelIds = new Set<string>();
      for (const s of all) {
        if (s.slack_channel) channelIds.add(s.slack_channel);
      }
      const channelNameMap = new Map<string, SlackChannelInfo>();
      await Promise.all([...channelIds].map(async (id) => {
        channelNameMap.set(id, await getSlackChannelInfo(id));
      }));

      // Group by worktree first (like buildDashboardData), then enrich
      const worktreeMap = new Map<string, SessionMeta[]>();
      for (const s of all) {
        const key = s.worktree_id || `_single_${s._log_id}`;
        if (!worktreeMap.has(key)) worktreeMap.set(key, []);
        worktreeMap.get(key)!.push(s);
      }

      const enriched: EnrichedWorkspace[] = [];
      for (const [_key, sessions] of worktreeMap) {
        const latest = sessions[0]; // newest run
        const oldest = sessions[sessions.length - 1]; // original session
        const worktreeId = latest.worktree_id || latest._log_id || "";
        const channelId = (oldest || latest).slack_channel || "";
        const info = channelNameMap.get(channelId);
        const channelName = (info?.isDm ? "DM" : info?.name) || (oldest || latest).slack_channel_name || "";
        const meta = worktreeId && latest.worktree_id ? store.getWorktreeMeta(worktreeId) : {};

        // Extract artifacts and latest response from activity
        let latestResponse = "";
        const artifactMap = new Map<string, Artifact>(); // dedup by URL
        if (latest.worktree_id) {
          const activity = store.readActivity(latest.worktree_id); // newest first
          for (const a of activity) {
            if (a.type === "response" && !latestResponse) {
              latestResponse = a.text.length > 200 ? a.text.slice(0, 200) + "..." : a.text;
            }
            if (a.type === "artifact") {
              const urlMatch = a.text.match(/(https?:\/\/[^\s)>\]]+)/);
              if (urlMatch) {
                const url = urlMatch[1];
                if (!artifactMap.has(url)) {
                  const prMatch = url.match(/\/pull\/(\d+)/);
                  const issueMatch = url.match(/\/issues\/(\d+)/);
                  const type = url.includes("gist.github") ? "gist" : prMatch ? "pr" : issueMatch ? "issue" : "link";
                  const label = prMatch ? `#${prMatch[1]}` : issueMatch ? `#${issueMatch[1]}` : type === "gist" ? "gist" : "link";
                  artifactMap.set(url, { type, text: label, url });
                }
              }
            }
          }
        }
        const artifacts = [...artifactMap.values()];

        const tags = latest.worktree_id ? store.getWorktreeTags(latest.worktree_id) : [];

        enriched.push({
          worktreeId,
          name: meta.name || null,
          resolved: !!meta.resolved,
          alive: latest.worktree_id ? store.isWorktreeAlive(latest.worktree_id) : false,
          status: latest.status || "unknown",
          exitCode: latest.exit_code ?? null,
          user: latest.user || "unknown",
          prompt: (oldest.prompt || latest.prompt || "").slice(0, 200),
          started: oldest.started || latest.started || null,
          baseBranch: latest.base_branch || "next",
          channelName,
          runCount: sessions.length,
          profile: latest.profile || "",
          latestResponse,
          artifacts,
          tags,
          threadTs: latest.slack_thread_ts || "",
          channelId,
        });
      }

      // Group by channel, then by thread
      const channelMap = new Map<string, { info: SlackChannelInfo; threads: Map<string, EnrichedWorkspace[]> }>();
      // Also collect ungrouped (no channel)
      const ungrouped: EnrichedWorkspace[] = [];

      for (const ws of enriched) {
        if (!ws.channelId) { ungrouped.push(ws); continue; }
        if (!channelMap.has(ws.channelId)) {
          channelMap.set(ws.channelId, {
            info: channelNameMap.get(ws.channelId) || { name: ws.channelId, isDm: false },
            threads: new Map(),
          });
        }
        const threadKey = ws.threadTs || `_no_thread_${ws.worktreeId}`;
        const ch = channelMap.get(ws.channelId)!;
        if (!ch.threads.has(threadKey)) ch.threads.set(threadKey, []);
        ch.threads.get(threadKey)!.push(ws);
      }

      const groups: ChannelGroup[] = [];
      for (const [channelId, { info, threads }] of channelMap) {
        const threadGroups: ThreadGroup[] = [];
        for (const [threadTs, workspaces] of threads) {
          threadGroups.push({
            threadTs,
            firstPrompt: workspaces[workspaces.length - 1]?.prompt || "",
            workspaces,
          });
        }
        // Sort threads: most recently active first
        threadGroups.sort((a, b) => {
          const aTs = a.workspaces[0]?.started || "";
          const bTs = b.workspaces[0]?.started || "";
          return bTs.localeCompare(aTs);
        });
        groups.push({
          channel: info.isDm ? "DM" : info.name,
          channelId,
          threads: threadGroups,
        });
      }

      // Sort channels: most recently active first
      groups.sort((a, b) => {
        const aTs = a.threads[0]?.workspaces[0]?.started || "";
        const bTs = b.threads[0]?.workspaces[0]?.started || "";
        return bTs.localeCompare(aTs);
      });

      // Add ungrouped as a pseudo-channel
      if (ungrouped.length) {
        groups.push({
          channel: "Other",
          channelId: "",
          threads: [{ threadTs: "", firstPrompt: "", workspaces: ungrouped }],
        });
      }

      json(res, 200, { groups, flat: enriched });
    },
  },

  // POST /api/me/tag — generate tags for a worktree using Haiku
  {
    method: "POST", pattern: /^\/api\/me\/tag$/, auth: "basic",
    handler: async (req, res, _params, { store }) => {
      let body: any;
      try { body = JSON.parse(await readBody(req)); }
      catch { json(res, 400, { error: "invalid JSON" }); return; }

      const worktreeId = body.worktree_id;
      if (!worktreeId) { json(res, 400, { error: "worktree_id required" }); return; }

      // Check if already tagged
      const existing = store.getWorktreeTags(worktreeId);
      if (existing.length && !existing.includes("untagged") && !body.force) {
        json(res, 200, { tags: existing, cached: true });
        return;
      }

      // Build context for tagging
      const session = store.findByWorktreeId(worktreeId);
      const prompt = session?.prompt || "";
      const activity = store.readActivity(worktreeId);
      const activitySummary = activity
        .filter(a => a.type === "response" || a.type === "artifact")
        .slice(0, 5)
        .map(a => `[${a.type}] ${a.text.slice(0, 200)}`)
        .join("\n");

      const tags = await generateTags(prompt, activitySummary);
      store.setWorktreeTags(worktreeId, tags);
      json(res, 200, { tags, cached: false });
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
        userName: body.user || session.user || "web",
        worktreeId: session.worktree_id,
        targetRef: session.base_branch ? `origin/${session.base_branch}` : undefined,
        profile: session.profile || undefined,
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
