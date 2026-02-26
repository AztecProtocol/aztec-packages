import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync, statSync } from "fs";
import { join, basename, dirname } from "path";
import { execSync } from "child_process";
import type { SessionMeta, WorktreeInfo } from "./types.ts";
import { SESSIONS_DIR, CLAUDEBOX_WORKTREES_DIR } from "./config.ts";
import type { DockerService } from "./docker.ts";

export class SessionStore {
  sessionsDir: string;
  worktreesDir: string;

  constructor(sessionsDir?: string, worktreesDir?: string) {
    this.sessionsDir = sessionsDir ?? SESSIONS_DIR;
    this.worktreesDir = worktreesDir ?? CLAUDEBOX_WORKTREES_DIR;
  }

  // ── Session CRUD ──────────────────────────────────────────────

  get(logId: string): SessionMeta | null {
    const path = join(this.sessionsDir, `${logId}.json`);
    if (!existsSync(path)) return null;
    try {
      const s = JSON.parse(readFileSync(path, "utf-8"));
      s._log_id = logId;
      return s;
    } catch {
      return null;
    }
  }

  save(logId: string, meta: Record<string, any>): void {
    const path = join(this.sessionsDir, `${logId}.json`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(meta, null, 2));
  }

  update(logId: string, patch: Partial<SessionMeta>): void {
    const path = join(this.sessionsDir, `${logId}.json`);
    try {
      const meta = existsSync(path) ? JSON.parse(readFileSync(path, "utf-8")) : {};
      Object.assign(meta, patch);
      writeFileSync(path, JSON.stringify(meta, null, 2));
    } catch {}
  }

  // ── Lookup ────────────────────────────────────────────────────

  findByHash(hash: string): SessionMeta | null {
    return this.get(hash);
  }

  findLastInThread(channel: string, threadTs: string): SessionMeta | null {
    if (!existsSync(this.sessionsDir)) return null;
    const files = readdirSync(this.sessionsDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => ({ name: f, mtime: statSync(join(this.sessionsDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    for (const { name } of files) {
      try {
        const s: SessionMeta = JSON.parse(readFileSync(join(this.sessionsDir, name), "utf-8"));
        if (s.slack_channel === channel && s.slack_thread_ts === threadTs) {
          s._log_id = basename(name, ".json");
          return s;
        }
      } catch {}
    }
    return null;
  }

  // ── Worktree helpers ──────────────────────────────────────────

  newWorktreeId(): string {
    return execSync("head -c 8 /dev/urandom | xxd -p", { encoding: "utf-8" }).trim();
  }

  getOrCreateWorktree(worktreeId?: string): WorktreeInfo {
    const id = worktreeId || this.newWorktreeId();
    const base = join(this.worktreesDir, id);
    const workspaceDir = join(base, "workspace");
    const claudeProjectsDir = join(base, "claude-projects");
    mkdirSync(workspaceDir, { recursive: true });
    mkdirSync(claudeProjectsDir, { recursive: true });
    const metaPath = join(base, "meta.json");
    if (!existsSync(metaPath)) {
      writeFileSync(metaPath, JSON.stringify({ created: new Date().toISOString() }, null, 2));
    }
    return { worktreeId: id, workspaceDir, claudeProjectsDir };
  }

  /** Find the latest Claude session UUID from JSONL files in a worktree's claude-projects dir. */
  findLatestClaudeSessionId(claudeProjectsDir: string): string | null {
    if (!existsSync(claudeProjectsDir)) return null;
    try {
      const files = readdirSync(claudeProjectsDir)
        .filter(f => f.endsWith(".jsonl"))
        .map(f => ({ name: f, mtime: statSync(join(claudeProjectsDir, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
      return files.length > 0 ? basename(files[0].name, ".jsonl") : null;
    } catch { return null; }
  }

  updateWorktreeMeta(worktreeId: string, logId: string): void {
    const metaPath = join(this.worktreesDir, worktreeId, "meta.json");
    try {
      const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf-8")) : {};
      meta.last_session_log_id = logId;
      meta.last_session_started = new Date().toISOString();
      writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    } catch {}
  }

  getWorktreeParentLogId(worktreeId: string): string {
    try {
      const meta = JSON.parse(readFileSync(join(this.worktreesDir, worktreeId, "meta.json"), "utf-8"));
      return meta.last_session_log_id || "";
    } catch { return ""; }
  }

  // ── Reconciliation ────────────────────────────────────────────

  reconcile(docker: DockerService): void {
    if (!existsSync(this.sessionsDir)) return;
    for (const name of readdirSync(this.sessionsDir).filter((f) => f.endsWith(".json"))) {
      try {
        const path = join(this.sessionsDir, name);
        const meta = JSON.parse(readFileSync(path, "utf-8"));
        if (meta.status !== "running") continue;
        const logId = basename(name, ".json");
        const containerName = meta.container;
        if (!containerName) {
          meta.status = "cancelled";
          meta.finished = new Date().toISOString();
          writeFileSync(path, JSON.stringify(meta, null, 2));
          console.log(`[RECONCILE] ${logId}: running → cancelled (no container)`);
          continue;
        }
        const { running, exitCode } = docker.inspectContainerSync(containerName);
        if (running) continue;

        // Clean up orphaned resources
        const sidecarName = meta.sidecar || `claudebox-sidecar-${logId}`;
        const networkName = `claudebox-net-${logId}`;
        docker.forceRemoveSync(containerName);
        docker.stopAndRemoveSync(sidecarName, 3);
        docker.removeNetworkSync(networkName);

        // Check if eligible for auto-resume
        const ageMs = meta.started ? Date.now() - new Date(meta.started).getTime() : Infinity;
        const canResume = !!meta.worktree_id && !!meta.slack_channel
          && ageMs < 60 * 60_000
          && exitCode !== 0
          && !meta.auto_resumed;

        if (canResume) {
          meta.status = "restart_pending";
          meta.exit_code = exitCode;
          meta.finished = new Date().toISOString();
          writeFileSync(path, JSON.stringify(meta, null, 2));
          console.log(`[RECONCILE] ${logId}: running → restart_pending (exit=${exitCode}, age=${Math.round(ageMs / 60_000)}m)`);
        } else {
          meta.status = "cancelled";
          meta.exit_code = exitCode;
          meta.finished = new Date().toISOString();
          writeFileSync(path, JSON.stringify(meta, null, 2));
          console.log(`[RECONCILE] ${logId}: running → cancelled (exit=${exitCode})`);
        }
      } catch {}
    }
  }
}
