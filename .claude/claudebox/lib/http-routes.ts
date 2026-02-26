import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { API_SECRET, SESSION_PAGE_USER, SESSION_PAGE_PASS, MAX_CONCURRENT, getActiveSessions } from "./config.ts";
import type { SessionStore } from "./session-store.ts";
import type { DockerService } from "./docker.ts";
import type { InteractiveSessionManager } from "./interactive.ts";
import { interactiveSessionHTML, cancelConfirmHTML, cancelResultHTML } from "./html-templates.ts";
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

  // GET /session/:id — session status
  {
    method: "GET", pattern: /^\/session\/([a-f0-9]+)$/, auth: "api",
    handler: async (_req, res, params, { store }) => {
      const session = store.findByHash(params[0]);
      if (!session) { json(res, 404, { error: "not found" }); return; }
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

  // GET /s/<hash> — interactive session HTML page
  {
    method: "GET", pattern: /^\/s\/([a-f0-9]{32})$/, auth: "basic",
    handler: async (_req, res, params, { store }) => {
      const session = store.findByHash(params[0]);
      if (!session) { res.writeHead(404, { "Content-Type": "text/plain" }); res.end("Session not found"); return; }
      html(res, 200, interactiveSessionHTML(params[0], session));
    },
  },

  // POST /s/<hash>/keepalive
  {
    method: "POST", pattern: /^\/s\/([a-f0-9]{32})\/keepalive$/, auth: "none",
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

  // GET /s/<hash>/cancel — confirmation page
  {
    method: "GET", pattern: /^\/s\/([a-f0-9]{32})\/cancel$/, auth: "basic",
    handler: async (_req, res, params, { store }) => {
      const session = store.findByHash(params[0]);
      if (!session) { res.writeHead(404, { "Content-Type": "text/plain" }); res.end("Session not found"); return; }
      html(res, 200, cancelConfirmHTML(params[0], session));
    },
  },

  // POST /s/<hash>/cancel
  {
    method: "POST", pattern: /^\/s\/([a-f0-9]{32})\/cancel$/, auth: "basic",
    handler: async (_req, res, params, { store, interactive }) => {
      const session = store.findByHash(params[0]);
      if (!session) { json(res, 404, { error: "not found" }); return; }
      const cancelled = interactive.cancelSession(params[0], session);
      html(res, 200, cancelResultHTML(params[0], cancelled));
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
    for (const route of routes) {
      if (req.method !== route.method) continue;
      const m = req.url?.match(route.pattern);
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
