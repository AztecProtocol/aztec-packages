import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync, statSync, copyFileSync } from "fs";
import { join, basename, dirname } from "path";
import { execSync, execFileSync } from "child_process";
import type { SessionMeta, WorktreeInfo } from "./types.ts";
import { SESSIONS_DIR, CLAUDEBOX_WORKTREES_DIR, REPO_DIR } from "./config.ts";
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

  // ── Workspace preparation (host-side clone, submodules, hardlinks) ──

  /**
   * Prepare workspace on the host side before container starts.
   * - Clone with --shared from reference repo (zero-copy objects)
   * - Set up submodule .git directories (copy .git/modules, create .git files)
   * - Hardlink gitignored files from reference repo (same XFS mount)
   */
  prepareWorkspace(worktreeId: string, targetRef: string): void {
    const workspaceDir = join(this.worktreesDir, worktreeId, "workspace");
    const targetDir = join(workspaceDir, "aztec-packages");
    const isNewClone = !existsSync(join(targetDir, ".git"));

    if (isNewClone) {
      console.log(`[WORKSPACE] Cloning reference repo → ${targetDir}`);
      // Use --local (not --shared) — hardlinks objects on same filesystem
      // --shared creates an alternates file with absolute host paths that break inside containers
      execFileSync("git", ["clone", "--local", join(REPO_DIR, ".git"), targetDir], {
        timeout: 120_000, stdio: "inherit",
      });
      execFileSync("git", ["-C", targetDir, "remote", "set-url", "origin",
        "https://github.com/AztecProtocol/aztec-packages.git"], { timeout: 5_000 });
      try {
        execFileSync("git", ["-C", targetDir, "checkout", "--detach", targetRef], {
          timeout: 30_000, stdio: "inherit",
        });
      } catch {
        execFileSync("git", ["-C", targetDir, "checkout", "--detach", "origin/next"], {
          timeout: 30_000, stdio: "inherit",
        });
      }
      // Mark safe directory so git operations work inside containers
      execFileSync("git", ["config", "--global", "--add", "safe.directory", targetDir], {
        timeout: 5_000,
      });

      this.setupSubmodules(targetDir);
      this.copyGitignored(REPO_DIR, targetDir);
    } else {
      // Existing workspace — refresh hardlinks for any new gitignored files
      this.copyGitignored(REPO_DIR, targetDir);
    }
  }

  /** Copy .git/modules from reference and set up submodule .git files. */
  private setupSubmodules(targetDir: string): void {
    const refModulesDir = join(REPO_DIR, ".git", "modules");
    const targetModulesDir = join(targetDir, ".git", "modules");

    if (!existsSync(refModulesDir)) return;
    if (existsSync(targetModulesDir)) return; // already set up

    console.log(`[WORKSPACE] Copying .git/modules from reference`);
    execFileSync("cp", ["-a", refModulesDir, targetModulesDir], { timeout: 120_000 });

    // Parse .gitmodules to find submodule paths
    const gitmodulesPath = join(targetDir, ".gitmodules");
    if (!existsSync(gitmodulesPath)) return;

    const content = readFileSync(gitmodulesPath, "utf-8");
    const paths: string[] = [];
    for (const match of content.matchAll(/path\s*=\s*(.+)/g)) {
      paths.push(match[1].trim());
    }

    // Create .git files in each submodule directory
    for (const subPath of paths) {
      const subDir = join(targetDir, subPath);
      const gitFile = join(subDir, ".git");
      if (existsSync(gitFile)) continue;

      // Relative gitdir: from submodule dir up to repo root, then into .git/modules/<path>
      const depth = subPath.split("/").length;
      const relPrefix = "../".repeat(depth);
      const gitdir = `${relPrefix}.git/modules/${subPath}`;

      mkdirSync(subDir, { recursive: true });
      writeFileSync(gitFile, `gitdir: ${gitdir}\n`);
      console.log(`[WORKSPACE] Submodule .git: ${subPath}`);
    }

    // Checkout submodule working trees (git submodule update doesn't populate
    // working trees when .git/modules was pre-copied, so use explicit checkout)
    for (const subPath of paths) {
      const subDir = join(targetDir, subPath);
      try {
        execFileSync("git", ["-C", subDir, "checkout", "HEAD", "--", "."], {
          timeout: 60_000, stdio: "inherit",
        });
      } catch (e: any) {
        console.warn(`[WORKSPACE] Submodule checkout failed for ${subPath}: ${e.message}`);
      }
    }
    console.log(`[WORKSPACE] Submodules initialized (${paths.length} modules)`);
  }

  /** Copy gitignored files from reference repo into workspace clone. */
  private copyGitignored(referenceDir: string, targetDir: string): void {
    let files: string[];
    try {
      const output = execFileSync("git", ["-C", referenceDir,
        "ls-files", "--others", "--ignored", "--exclude-standard"], {
        encoding: "utf-8", timeout: 30_000, maxBuffer: 50 * 1024 * 1024,
      });
      files = output.split("\n").filter(f => f.trim());
    } catch {
      console.warn(`[WORKSPACE] Failed to list gitignored files`);
      return;
    }

    if (files.length === 0) return;

    let copied = 0, skipped = 0, failed = 0;
    for (const file of files) {
      const src = join(referenceDir, file);
      const dst = join(targetDir, file);

      try { if (!statSync(src).isFile()) { skipped++; continue; } } catch { skipped++; continue; }
      if (existsSync(dst)) { skipped++; continue; }

      try {
        mkdirSync(dirname(dst), { recursive: true });
        copyFileSync(src, dst);
        copied++;
      } catch {
        failed++;
      }
    }

    if (copied > 0 || failed > 0) {
      console.log(`[WORKSPACE] Copied gitignored: ${copied} copied, ${skipped} skipped, ${failed} failed`);
    }
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
