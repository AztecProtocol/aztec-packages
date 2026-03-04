#!/usr/bin/env -S node --experimental-strip-types --no-warnings
/**
 * ClaudeBox Server — combined Slack listener + HTTP API.
 *
 * Slack: Socket Mode (app_mention, /claudebox slash command, DM)
 * HTTP:  POST /run, GET /session/:id, interactive session pages
 *
 * Max 10 concurrent sessions.
 */

import { App } from "@slack/bolt";
import { WebSocketServer } from "ws";
import {
  SLACK_BOT_TOKEN, SLACK_APP_TOKEN, HTTP_PORT, DOCKER_IMAGE, MAX_CONCURRENT,
  SESSION_PAGE_USER, SESSION_PAGE_PASS,
} from "./lib/config.ts";
import { SessionStore } from "./lib/session-store.ts";
import { DockerService } from "./lib/docker.ts";
import { InteractiveSessionManager } from "./lib/interactive.ts";
import { registerSlackHandlers } from "./lib/slack-handlers.ts";
import { createHttpServer } from "./lib/http-routes.ts";
import { QuestionStore } from "./lib/question-store.ts";

// Prevent unhandled Slack/WebSocket rejections from crashing the process
process.on("unhandledRejection", (reason: any) => {
  const msg = reason?.message || String(reason);
  if (msg.includes("invalid_auth") || msg.includes("slack")) {
    console.warn(`[UNHANDLED] Slack error suppressed: ${msg}`);
  } else {
    console.error(`[UNHANDLED] Rejection: ${msg}`);
  }
});

async function main() {
  console.log("ClaudeBox server starting...");
  console.log(`  Image: ${DOCKER_IMAGE}`);
  console.log(`  Slack: Socket Mode`);
  console.log(`  HTTP:  port ${HTTP_PORT}`);
  console.log(`  Max concurrent: ${MAX_CONCURRENT}`);

  // ── Instantiate services ──
  const store = new SessionStore();
  const docker = new DockerService();
  const interactive = new InteractiveSessionManager(docker, store);

  // ── Reconcile stale sessions ──
  store.reconcile(docker);
  setInterval(() => store.reconcile(docker), 60_000);

  // ── Question expiry timer ──
  const questionStore = new QuestionStore();
  setInterval(() => {
    try {
      const resolved = questionStore.expireOverdue();
      for (const worktreeId of resolved) {
        console.log(`[QUESTIONS] All questions resolved for ${worktreeId} — auto-resuming`);
        const session = store.findByWorktreeId(worktreeId);
        if (session && session.status !== "running" && store.isWorktreeAlive(worktreeId)) {
          const prompt = questionStore.buildResumePrompt(worktreeId);
          docker.runContainerSession({
            prompt,
            userName: session.user || "auto-resume",
            worktreeId,
            targetRef: session.base_branch ? `origin/${session.base_branch}` : undefined,
            profile: session.profile || undefined,
          }, store).catch(e => {
            console.error(`[QUESTIONS] Auto-resume failed for ${worktreeId}: ${e.message}`);
          });
        }
      }
    } catch (e: any) {
      console.error(`[QUESTIONS] Expiry check error: ${e.message}`);
    }
  }, 60_000);

  // ── Slack app (non-fatal — HTTP server should work even without Slack) ──
  try {
    const slackApp = new App({
      token: SLACK_BOT_TOKEN,
      appToken: SLACK_APP_TOKEN,
      socketMode: true,
      port: HTTP_PORT + 1, // Bolt creates its own HTTP server; avoid conflicting with ours
    });
    registerSlackHandlers(slackApp, store, docker);
    await slackApp.start();
    console.log("  Slack connected.");
  } catch (e: any) {
    console.warn(`  Slack failed: ${e.message} (HTTP server will still run)`);
  }

  // ── HTTP server ──
  const httpServer = createHttpServer(store, docker, interactive);

  // ── WebSocket upgrade (requires basic auth) ──
  const wss = new WebSocketServer({ noServer: true });
  httpServer.on("upgrade", (req, socket, head) => {
    const m = req.url?.match(/^\/s\/([a-f0-9][\w-]+)\/ws$/);
    if (!m) { socket.destroy(); return; }
    const auth = req.headers.authorization || "";
    if (!auth.startsWith("Basic ")) { socket.destroy(); return; }
    const [u, p] = Buffer.from(auth.slice(6), "base64").toString().split(":");
    if (u !== SESSION_PAGE_USER || p !== SESSION_PAGE_PASS) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket as any, head, (ws) => {
      interactive.handleWs(m[1], ws).catch((e) => {
        console.error(`[INTERACTIVE] WS error: ${e.message}`);
        ws.close(1011, (e.message || "error").slice(0, 120));
      });
    });
  });

  httpServer.listen(HTTP_PORT, () => {
    console.log(`  HTTP listening on :${HTTP_PORT}`);
  });
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
