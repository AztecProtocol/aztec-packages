import { join, dirname } from "path";
import { homedir } from "os";

// ── Environment ─────────────────────────────────────────────────
export const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN!;
export const SLACK_APP_TOKEN = process.env.SLACK_APP_TOKEN!;
export const GH_TOKEN = process.env.GH_TOKEN || "";
export const API_SECRET = process.env.CLAUDEBOX_API_SECRET || "";
export const HTTP_PORT = parseInt(process.env.CLAUDEBOX_PORT || "3000", 10);
export const MAX_CONCURRENT = 10;

// ── Paths ───────────────────────────────────────────────────────
export const REPO_DIR = process.env.CLAUDE_REPO_DIR ?? join(homedir(), "aztec-packages");
export const SESSIONS_DIR = join(REPO_DIR, ".claude", "claudebox", "sessions");
export const DOCKER_IMAGE = process.env.CLAUDEBOX_DOCKER_IMAGE || "claudebox:latest";
export const CLAUDEBOX_DIR = join(homedir(), ".claudebox");
export const CLAUDEBOX_SESSIONS_DIR = join(CLAUDEBOX_DIR, "sessions"); // legacy
export const CLAUDEBOX_WORKTREES_DIR = join(CLAUDEBOX_DIR, "worktrees");
export const CLAUDEBOX_STATS_DIR = join(CLAUDEBOX_DIR, "stats");
// Parent of lib/ — the actual claudebox directory containing entrypoints, mcp-sidecar, etc.
export const CLAUDEBOX_CODE_DIR = join(dirname(import.meta.url.replace("file://", "")), "..");
export const CLAUDE_BINARY = process.env.CLAUDE_BINARY ?? join(homedir(), ".local", "bin", "claude");
export const BASTION_SSH_KEY = join(homedir(), ".ssh", "build_instance_key");

// ── Interactive session config ──────────────────────────────────
export const CLAUDEBOX_HOST = process.env.CLAUDEBOX_HOST || "claudebox.work";
export const SESSION_PAGE_USER = process.env.CLAUDEBOX_SESSION_USER || "aztec";
export const SESSION_PAGE_PASS = (() => {
  const v = process.env.CLAUDEBOX_SESSION_PASS;
  if (!v) {
    console.error("[FATAL] CLAUDEBOX_SESSION_PASS must be set");
    process.exit(1);
  }
  return v;
})();

// ── Base branch defaults (channel name → branch) ────────────────
export const CHANNEL_BASE_BRANCHES: Record<string, string> = {
  "honk-team": "merge-train/barretenberg",
  "team-crypto": "merge-train/barretenberg",
  "team-alpha": "merge-train/spartan",
};
export const DEFAULT_BASE_BRANCH = "next";

// ── Default profiles (channel ID → profile) ─────────────────────
export const CHANNEL_PROFILES: Record<string, string> = {
  "C0AJCUKUNGP": "barretenberg-audit",
};

// ── Mutable session counter ─────────────────────────────────────
let _activeSessions = 0;
export function getActiveSessions(): number { return _activeSessions; }
export function incrActiveSessions(): void { _activeSessions++; }
export function decrActiveSessions(): void { _activeSessions--; }
