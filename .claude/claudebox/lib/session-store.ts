import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync, statSync, rmSync } from "fs";
import { join, basename, dirname } from "path";
import { execSync, exec } from "child_process";
import type { SessionMeta, WorktreeInfo } from "./types.ts";
import { SESSIONS_DIR, CLAUDEBOX_WORKTREES_DIR, CLAUDEBOX_DIR } from "./config.ts";
import type { DockerService } from "./docker.ts";

export class SessionStore {
  sessionsDir: string;
  worktreesDir: string;

  constructor(sessionsDir?: string, worktreesDir?: string) {
    this.sessionsDir = sessionsDir ?? SESSIONS_DIR;
    this.worktreesDir = worktreesDir ?? CLAUDEBOX_WORKTREES_DIR;
  }

  /** Validate an ID to prevent path traversal — only hex, word chars, and hyphens. */
  private validateId(id: string, label: string): void {
    if (!/^[a-f0-9][\w-]{0,63}$/.test(id)) throw new Error(`Invalid ${label}: ${id}`);
  }

  // ── Session CRUD ──────────────────────────────────────────────

  get(logId: string): SessionMeta | null {
    this.validateId(logId, "logId");
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
    this.validateId(logId, "logId");
    const path = join(this.sessionsDir, `${logId}.json`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(meta, null, 2));
  }

  update(logId: string, patch: Partial<SessionMeta>): void {
    this.validateId(logId, "logId");
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

  /** Find the session for a thread. Checks the explicit binding first, then falls back to a file scan. */
  findLastInThread(channel: string, threadTs: string): SessionMeta | null {
    // Fast path: explicit binding
    const bound = this.loadBindings().threads[SessionStore.threadKey(channel, threadTs)];
    if (bound) {
      const s = this.findByWorktreeId(bound);
      if (s) return s;
    }
    // Slow path: scan session files (covers sessions created before bindings existed)
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
          // Backfill the binding for next time
          if (s.worktree_id) this.bindThread(channel, threadTs, s.worktree_id);
          return s;
        }
      } catch {}
    }
    return null;
  }

  // ── Listing ─────────────────────────────────────────────────

  /** List all sessions, newest first. */
  listAll(): SessionMeta[] {
    if (!existsSync(this.sessionsDir)) return [];
    return readdirSync(this.sessionsDir)
      .filter(f => f.endsWith(".json"))
      .map(f => {
        try {
          const s: SessionMeta = JSON.parse(readFileSync(join(this.sessionsDir, f), "utf-8"));
          s._log_id = basename(f, ".json");
          return s;
        } catch { return null; }
      })
      .filter((s): s is SessionMeta => s !== null)
      .sort((a, b) => (b.started || "").localeCompare(a.started || ""));
  }

  /** List all sessions for a given worktree_id, newest first. */
  listByWorktree(worktreeId: string): SessionMeta[] {
    return this.listAll().filter(s => s.worktree_id === worktreeId);
  }

  /** Check if a worktree directory still exists on disk. */
  isWorktreeAlive(worktreeId: string): boolean {
    this.validateId(worktreeId, "worktreeId");
    return existsSync(join(this.worktreesDir, worktreeId, "workspace"));
  }

  /** Find the latest session for a worktree ID (returns newest). */
  findByWorktreeId(worktreeId: string): SessionMeta | null {
    const sessions = this.listByWorktree(worktreeId);
    return sessions.length > 0 ? sessions[0] : null;
  }

  /** Generate next session log ID for a worktree: <worktreeId>-<seq>. */
  nextSessionLogId(worktreeId: string): string {
    const existing = this.listByWorktree(worktreeId);
    return `${worktreeId}-${existing.length + 1}`;
  }

  /** Read activity.jsonl entries from a worktree's workspace directory. */
  readActivity(worktreeId: string): { ts: string; type: string; text: string }[] {
    this.validateId(worktreeId, "worktreeId");
    const activityPath = join(this.worktreesDir, worktreeId, "workspace", "activity.jsonl");
    if (!existsSync(activityPath)) return [];
    try {
      return readFileSync(activityPath, "utf-8")
        .split("\n")
        .filter(line => line.trim())
        .map(line => JSON.parse(line))
        .reverse(); // newest first
    } catch { return []; }
  }

  // ── Worktree helpers ──────────────────────────────────────────

  newWorktreeId(): string {
    return execSync("head -c 8 /dev/urandom | xxd -p", { encoding: "utf-8" }).trim();
  }

  getOrCreateWorktree(worktreeId?: string): WorktreeInfo {
    const id = worktreeId || this.newWorktreeId();
    this.validateId(id, "worktreeId");
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
    this.validateId(worktreeId, "worktreeId");
    const metaPath = join(this.worktreesDir, worktreeId, "meta.json");
    try {
      const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf-8")) : {};
      meta.last_session_log_id = logId;
      meta.last_session_started = new Date().toISOString();
      writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    } catch {}
  }

  getWorktreeParentLogId(worktreeId: string): string {
    this.validateId(worktreeId, "worktreeId");
    try {
      const meta = JSON.parse(readFileSync(join(this.worktreesDir, worktreeId, "meta.json"), "utf-8"));
      return meta.last_session_log_id || "";
    } catch { return ""; }
  }

  // ── Workspace management ─────────────────────────────────────

  /** Return distinct user names from session history, sorted by frequency. */
  knownUsers(): string[] {
    if (!existsSync(this.sessionsDir)) return [];
    const counts = new Map<string, number>();
    for (const f of readdirSync(this.sessionsDir).filter(f => f.endsWith(".json"))) {
      try {
        const s = JSON.parse(readFileSync(join(this.sessionsDir, f), "utf-8"));
        const u = s.user;
        if (u && u !== "unknown" && u !== "web") counts.set(u, (counts.get(u) || 0) + 1);
      } catch {}
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }

  /** Read full worktree meta.json (name, resolved, created, etc.). */
  getWorktreeMeta(worktreeId: string): Record<string, any> {
    this.validateId(worktreeId, "worktreeId");
    const metaPath = join(this.worktreesDir, worktreeId, "meta.json");
    if (!existsSync(metaPath)) return {};
    try { return JSON.parse(readFileSync(metaPath, "utf-8")); } catch { return {}; }
  }

  /** Set workspace display name. */
  setWorktreeName(worktreeId: string, name: string): void {
    this.validateId(worktreeId, "worktreeId");
    const metaPath = join(this.worktreesDir, worktreeId, "meta.json");
    const meta = this.getWorktreeMeta(worktreeId);
    meta.name = name;
    writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  }

  /** Mark workspace as resolved/unresolved. */
  setWorktreeResolved(worktreeId: string, resolved: boolean): void {
    this.validateId(worktreeId, "worktreeId");
    const metaPath = join(this.worktreesDir, worktreeId, "meta.json");
    const meta = this.getWorktreeMeta(worktreeId);
    meta.resolved = resolved;
    meta.resolved_at = resolved ? new Date().toISOString() : undefined;
    writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  }

  /** Get tags stored in worktree meta.json. */
  getWorktreeTags(worktreeId: string): string[] {
    const meta = this.getWorktreeMeta(worktreeId);
    return Array.isArray(meta.tags) ? meta.tags : [];
  }

  /** Set tags in worktree meta.json. */
  setWorktreeTags(worktreeId: string, tags: string[]): void {
    this.validateId(worktreeId, "worktreeId");
    const metaPath = join(this.worktreesDir, worktreeId, "meta.json");
    const meta = this.getWorktreeMeta(worktreeId);
    meta.tags = tags;
    writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  }

  /** Delete a worktree directory to free disk space. Does NOT delete session JSON records. */
  deleteWorktree(worktreeId: string): void {
    this.validateId(worktreeId, "worktreeId");
    const base = join(this.worktreesDir, worktreeId);
    if (existsSync(base)) {
      rmSync(base, { recursive: true, force: true });
    }
  }

  /**
   * Garbage-collect worktrees to stay within a disk budget.
   * Deletes workspace/ (git clone) for oldest worktrees first until total size
   * is under maxSizeGB. Never deletes worktrees younger than minAgeDays.
   * Keeps meta.json and claude-projects/ (session JSONL logs) always.
   * Skips worktrees with running sessions.
   */
  gcWorktrees(maxSizeGB: number = 100, minAgeDays: number = 1): string[] {
    if (!existsSync(this.worktreesDir)) return [];
    const minAgeCutoff = Date.now() - minAgeDays * 24 * 60 * 60 * 1000;

    // Get all workspace sizes in one du call (much faster than per-worktree)
    const sizeMap = new Map<string, number>();
    try {
      const duOutput = execSync(
        `du -sb ${this.worktreesDir}/*/workspace 2>/dev/null || true`,
        { encoding: "utf-8", timeout: 120_000 }
      );
      for (const line of duOutput.trim().split("\n")) {
        if (!line) continue;
        const [sizeStr, path] = line.split("\t");
        // Extract worktree ID from path: .../worktrees/<id>/workspace
        const parts = path?.split("/");
        const wsIdx = parts?.indexOf("workspace");
        if (wsIdx && wsIdx > 0) {
          const id = parts[wsIdx - 1];
          sizeMap.set(id, parseInt(sizeStr) || 0);
        }
      }
    } catch {}

    // Build candidate list
    const candidates: Array<{ id: string; wsDir: string; lastActivity: number; sizeBytes: number }> = [];
    let totalSize = 0;

    for (const id of readdirSync(this.worktreesDir)) {
      const sizeBytes = sizeMap.get(id);
      if (sizeBytes === undefined) continue; // no workspace dir

      const meta = this.getWorktreeMeta(id);
      const lastActivity = new Date(meta.last_session_started || meta.created || 0).getTime();

      totalSize += sizeBytes;
      candidates.push({ id, wsDir: join(this.worktreesDir, id, "workspace"), lastActivity, sizeBytes });
    }

    console.log(`[GC] Total workspace size: ${(totalSize / 1024 / 1024 / 1024).toFixed(1)} GB across ${candidates.length} worktrees (budget: ${maxSizeGB} GB)`);

    const maxSizeBytes = maxSizeGB * 1024 * 1024 * 1024;
    if (totalSize <= maxSizeBytes) return [];

    // Sort oldest first
    candidates.sort((a, b) => a.lastActivity - b.lastActivity);

    const cleaned: string[] = [];
    for (const c of candidates) {
      if (totalSize <= maxSizeBytes) break;

      // Never clean recent worktrees
      if (c.lastActivity > minAgeCutoff) continue;

      // Skip running sessions
      const sessions = this.listByWorktree(c.id);
      if (sessions.some(s => s.status === "running")) continue;

      try {
        rmSync(c.wsDir, { recursive: true, force: true });
        totalSize -= c.sizeBytes;
        cleaned.push(c.id);
      } catch (e: any) {
        console.error(`[GC] Failed to clean worktree ${c.id}: ${e.message}`);
      }
    }

    return cleaned;
  }

  /** Async version of gcWorktrees — doesn't block the event loop during du. */
  async gcWorktreesAsync(maxSizeGB: number = 100, minAgeDays: number = 1): Promise<string[]> {
    if (!existsSync(this.worktreesDir)) return [];
    const minAgeCutoff = Date.now() - minAgeDays * 24 * 60 * 60 * 1000;

    // Async du call — doesn't block the event loop
    const sizeMap = new Map<string, number>();
    try {
      const duOutput = await new Promise<string>((resolve, reject) => {
        exec(`du -sb ${this.worktreesDir}/*/workspace 2>/dev/null || true`,
          { encoding: "utf-8", timeout: 120_000 },
          (err, stdout) => err ? reject(err) : resolve(stdout));
      });
      for (const line of duOutput.trim().split("\n")) {
        if (!line) continue;
        const [sizeStr, path] = line.split("\t");
        const parts = path?.split("/");
        const wsIdx = parts?.indexOf("workspace");
        if (wsIdx && wsIdx > 0) {
          const id = parts[wsIdx - 1];
          sizeMap.set(id, parseInt(sizeStr) || 0);
        }
      }
    } catch {}

    // Build candidate list
    const candidates: Array<{ id: string; wsDir: string; lastActivity: number; sizeBytes: number }> = [];
    let totalSize = 0;

    for (const id of readdirSync(this.worktreesDir)) {
      const sizeBytes = sizeMap.get(id);
      if (sizeBytes === undefined) continue;
      const meta = this.getWorktreeMeta(id);
      const lastActivity = new Date(meta.last_session_started || meta.created || 0).getTime();
      totalSize += sizeBytes;
      candidates.push({ id, wsDir: join(this.worktreesDir, id, "workspace"), lastActivity, sizeBytes });
    }

    console.log(`[GC] Total workspace size: ${(totalSize / 1024 / 1024 / 1024).toFixed(1)} GB across ${candidates.length} worktrees (budget: ${maxSizeGB} GB)`);

    const maxSizeBytes = maxSizeGB * 1024 * 1024 * 1024;
    if (totalSize <= maxSizeBytes) return [];

    candidates.sort((a, b) => a.lastActivity - b.lastActivity);

    const cleaned: string[] = [];
    for (const c of candidates) {
      if (totalSize <= maxSizeBytes) break;
      if (c.lastActivity > minAgeCutoff) continue;
      const sessions = this.listByWorktree(c.id);
      if (sessions.some(s => s.status === "running")) continue;
      try {
        rmSync(c.wsDir, { recursive: true, force: true });
        totalSize -= c.sizeBytes;
        cleaned.push(c.id);
      } catch (e: any) {
        console.error(`[GC] Failed to clean worktree ${c.id}: ${e.message}`);
      }
    }

    return cleaned;
  }

  // ── Bindings (thread/PR → worktree) ─────────────────────────
  //
  // Each Slack thread and each GitHub PR is bound to at most one worktree.
  // Replying in a bound thread automatically resumes that worktree.
  // `new-session` clears the binding so a fresh worktree is created;
  // the old worktree remains accessible via the status page.

  private loadBindings(): { threads: Record<string, string>; prs: Record<string, string> } {
    const p = join(CLAUDEBOX_DIR, "bindings.json");
    try { return JSON.parse(readFileSync(p, "utf-8")); }
    catch { return { threads: {}, prs: {} }; }
  }

  private saveBindings(b: { threads: Record<string, string>; prs: Record<string, string> }): void {
    const p = join(CLAUDEBOX_DIR, "bindings.json");
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(b, null, 2));
  }

  private static threadKey(channel: string, threadTs: string): string {
    return `${channel}:${threadTs}`;
  }

  /** Bind a Slack thread to a worktree (idempotent). */
  bindThread(channel: string, threadTs: string, worktreeId: string): void {
    const b = this.loadBindings();
    b.threads[SessionStore.threadKey(channel, threadTs)] = worktreeId;
    this.saveBindings(b);
  }

  /** Clear the thread → worktree binding (used by new-session). */
  clearThreadBinding(channel: string, threadTs: string): void {
    const b = this.loadBindings();
    const k = SessionStore.threadKey(channel, threadTs);
    if (!(k in b.threads)) return;
    delete b.threads[k];
    this.saveBindings(b);
  }

  /** Bind a GitHub PR (e.g. "AztecProtocol/aztec-packages#1234") to a worktree. */
  bindPr(prKey: string, worktreeId: string): void {
    const b = this.loadBindings();
    b.prs[prKey] = worktreeId;
    this.saveBindings(b);
  }

  /** Look up the worktree bound to a PR key. */
  getPrBinding(prKey: string): string | null {
    return this.loadBindings().prs[prKey] || null;
  }

  /** Clear the PR → worktree binding. */
  clearPrBinding(prKey: string): void {
    const b = this.loadBindings();
    if (!(prKey in b.prs)) return;
    delete b.prs[prKey];
    this.saveBindings(b);
  }

  // ── Message queue (Slack replies to running sessions) ────────

  /** Append a message to a running session's queue. */
  queueMessage(logId: string, msg: { text: string; user: string; ts: string }): void {
    this.validateId(logId, "logId");
    const path = join(this.sessionsDir, `${logId}.json`);
    try {
      const meta = existsSync(path) ? JSON.parse(readFileSync(path, "utf-8")) : {};
      if (!Array.isArray(meta.queued_messages)) meta.queued_messages = [];
      meta.queued_messages.push(msg);
      writeFileSync(path, JSON.stringify(meta, null, 2));
    } catch {}
  }

  /** Pop all queued messages and return them (clears the queue). */
  drainQueue(logId: string): { text: string; user: string; ts: string }[] {
    this.validateId(logId, "logId");
    const path = join(this.sessionsDir, `${logId}.json`);
    try {
      const meta = existsSync(path) ? JSON.parse(readFileSync(path, "utf-8")) : {};
      const msgs = meta.queued_messages || [];
      if (msgs.length) {
        meta.queued_messages = [];
        writeFileSync(path, JSON.stringify(meta, null, 2));
      }
      return msgs;
    } catch { return []; }
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

        // Don't reconcile sessions that just started — give containers time to spin up
        const startedMs = meta.started ? new Date(meta.started).getTime() : 0;
        if (startedMs && Date.now() - startedMs < 2 * 60_000) continue;

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
          meta.status = "interrupted";
          meta.exit_code = exitCode;
          meta.finished = new Date().toISOString();
          writeFileSync(path, JSON.stringify(meta, null, 2));
          console.log(`[RECONCILE] ${logId}: running → interrupted (exit=${exitCode}, age=${Math.round(ageMs / 60_000)}m)`);
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
