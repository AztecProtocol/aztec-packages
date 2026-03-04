import Docker from "dockerode";
import { execFileSync, execSync, spawn, type ChildProcess } from "child_process";
import { existsSync, writeFileSync, realpathSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { randomUUID } from "crypto";
import type { ContainerSessionOpts, WorktreeInfo, SessionMeta } from "./types.ts";
import type { SessionStore } from "./session-store.ts";
import {
  REPO_DIR, DOCKER_IMAGE, CLAUDEBOX_CODE_DIR, CLAUDE_BINARY,
  BASTION_SSH_KEY, GH_TOKEN, SLACK_BOT_TOKEN, HTTP_PORT,
  CLAUDEBOX_HOST, CLAUDEBOX_STATS_DIR,
  incrActiveSessions, decrActiveSessions,
} from "./config.ts";

export class DockerService {
  docker: Docker;

  constructor(socketPath = "/var/run/docker.sock") {
    this.docker = new Docker({ socketPath });
  }

  // ── Sync helpers (for reconcile, cleanup — must be non-async) ──

  inspectContainerSync(name: string): { running: boolean; exitCode: number } {
    try {
      const out = execFileSync("docker", ["inspect", "-f", "{{.State.Running}} {{.State.ExitCode}}", name], {
        encoding: "utf-8", timeout: 5_000,
      }).trim().split(" ");
      return { running: out[0] === "true", exitCode: parseInt(out[1], 10) || 1 };
    } catch {
      return { running: false, exitCode: 1 };
    }
  }

  forceRemoveSync(name: string): void {
    try { execFileSync("docker", ["rm", "-f", name], { timeout: 10_000 }); } catch {}
  }

  stopAndRemoveSync(name: string, timeout = 5): void {
    try { execFileSync("docker", ["stop", "-t", String(timeout), name], { timeout: 30_000 }); } catch {}
    try { execFileSync("docker", ["rm", "-f", name], { timeout: 10_000 }); } catch {}
  }

  removeNetworkSync(name: string): void {
    try { execFileSync("docker", ["network", "rm", name], { timeout: 10_000 }); } catch {}
  }

  // ── Async helpers ─────────────────────────────────────────────

  async createNetwork(name: string): Promise<void> {
    await this.docker.createNetwork({ Name: name });
  }

  async removeNetwork(name: string): Promise<void> {
    try { await this.docker.getNetwork(name).remove(); } catch {}
  }

  async stopAndRemove(name: string, timeout = 5): Promise<void> {
    try {
      const c = this.docker.getContainer(name);
      await c.stop({ t: timeout });
    } catch {}
    try { await this.docker.getContainer(name).remove({ force: true }); } catch {}
  }

  async waitForHealth(containerName: string, timeoutMs = 15_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const exec = await this.docker.getContainer(containerName).exec({
          Cmd: ["curl", "-sf", "http://127.0.0.1:9801/health"],
          AttachStdout: true,
        });
        const stream = await exec.start({});
        const out = await new Promise<string>((resolve) => {
          let data = "";
          stream.on("data", (d: Buffer) => data += d.toString());
          stream.on("end", () => resolve(data));
          setTimeout(() => resolve(data), 3000);
        });
        if (out.includes("ok")) return;
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`Sidecar health check timed out after ${timeoutMs}ms`);
  }

  async waitForEntrypoint(containerName: string, timeoutMs = 15_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const exec = await this.docker.getContainer(containerName).exec({
          Cmd: ["test", "-f", "/home/aztec-dev/bin/keepalive"],
          AttachStdout: true,
        });
        const stream = await exec.start({});
        const inspectResult = await exec.inspect();
        // exec.inspect() may not have ExitCode immediately; just check if no error thrown
        await new Promise<void>((resolve) => {
          stream.on("end", resolve);
          stream.resume(); // drain
          setTimeout(resolve, 3000);
        });
        return;
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
    console.warn(`[INTERACTIVE] Entrypoint wait timed out for ${containerName}, proceeding anyway`);
  }

  // ── TTY Exec Bridge ───────────────────────────────────────────

  /**
   * Create an exec session inside the container via Docker API.
   * Allocates a PTY for interactive shell use.
   */
  async createExecSession(containerName: string): Promise<{
    stream: NodeJS.ReadWriteStream;
    resize: (cols: number, rows: number) => Promise<void>;
  }> {
    const container = this.docker.getContainer(containerName);
    const exec = await container.exec({
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      Cmd: ["bash", "--login"],
      WorkingDir: "/workspace",
    });
    const stream = await exec.start({ hijack: true, stdin: true, Tty: true });
    return {
      stream,
      resize: async (cols: number, rows: number) => {
        try { await exec.resize({ w: cols, h: rows }); } catch {}
      },
    };
  }

  // ── Full session runner ───────────────────────────────────────

  async runContainerSession(
    opts: ContainerSessionOpts,
    store: SessionStore,
    onOutput?: (data: string) => void,
    onStart?: (logUrl: string, worktreeId: string) => void,
  ): Promise<number> {
    incrActiveSessions();

    // Resolve worktree first (needed for logId)
    const wt = store.getOrCreateWorktree(opts.worktreeId);
    const { worktreeId, workspaceDir, claudeProjectsDir } = wt;

    const logId = store.nextSessionLogId(worktreeId);
    const sessionUuid = randomUUID();
    const networkName = `claudebox-net-${logId}`;
    const sidecarName = `claudebox-sidecar-${logId}`;
    const claudeName = `claudebox-${logId}`;
    const logUrl = `http://ci.aztec-labs.com/${logId}`;
    const mcpUrl = `http://${sidecarName}:9801/mcp`;

    onStart?.(logUrl, worktreeId);
    const parentLogId = opts.worktreeId ? store.getWorktreeParentLogId(worktreeId) : "";

    // Fix ownership
    try { execSync(`chown -R ${process.getuid!()}:${process.getgid!()} "${workspaceDir}"`, { timeout: 10_000 }); } catch {}

    // Profile-aware paths
    const profileDir = opts.profile || "default";
    const sidecarEntrypoint = `/opt/claudebox/profiles/${profileDir}/mcp-sidecar.ts`;
    const claudeMdPath = `/opt/claudebox/profiles/${profileDir}/container-claude.md`;

    console.log(`[DOCKER] Starting session ${logId} (worktree=${worktreeId} profile=${profileDir})`);
    console.log(`[DOCKER]   Sidecar:   ${sidecarName}`);
    console.log(`[DOCKER]   Claude:    ${claudeName}`);
    console.log(`[DOCKER]   Network:   ${networkName}`);
    console.log(`[DOCKER]   Worktree:  ${worktreeId}`);
    console.log(`[DOCKER]   Workspace: ${workspaceDir}`);
    console.log(`[DOCKER]   Profile:   ${profileDir}`);
    console.log(`[DOCKER]   Log URL:   ${logUrl}`);

    // Write prompt file
    const baseBranch = opts.targetRef?.replace("origin/", "") || "next";
    let fullPrompt = opts.prompt;
    fullPrompt += `\n\nLog URL: ${logUrl}`;
    fullPrompt += `\nBase branch: ${baseBranch}`;
    fullPrompt += `\nTarget ref: ${opts.targetRef || "origin/next"}`;
    if (opts.runUrl) fullPrompt += `\nRun URL: ${opts.runUrl}`;
    if (opts.link) fullPrompt += `\nLink: ${opts.link}`;
    writeFileSync(join(workspaceDir, "prompt.txt"), fullPrompt);

    // Write session metadata
    const metadata: any = {
      prompt: opts.prompt,
      user: opts.userName || "unknown",
      container: claudeName,
      sidecar: sidecarName,
      log_url: logUrl,
      link: opts.link || opts.runUrl || "",
      slack_channel: opts.slackChannel || "",
      slack_channel_name: opts.slackChannelName || "",
      slack_thread_ts: opts.slackThreadTs || "",
      slack_message_ts: opts.slackMessageTs || "",
      claude_session_id: sessionUuid,
      worktree_id: worktreeId,
      base_branch: baseBranch,
      profile: opts.profile || "",
      started: new Date().toISOString(),
      status: "running",
    };
    store.save(logId, metadata);
    store.updateWorktreeMeta(worktreeId, logId);

    // Create network
    try {
      await this.createNetwork(networkName);
      console.log(`[DOCKER] Network created: ${networkName}`);
    } catch (e: any) {
      decrActiveSessions();
      throw new Error(`Failed to create Docker network: ${e.message}`);
    }

    const cleanup = () => {
      this.stopAndRemoveSync(sidecarName, 5);
      this.forceRemoveSync(claudeName);
      this.removeNetworkSync(networkName);
    };

    try {
      // Start sidecar
      const uid = `${process.getuid!()}:${process.getgid!()}`;
      // Build sidecar binds — audit profile skips reference repo
      const sidecarBinds = [
        `${workspaceDir}:/workspace:rw`,
        `${claudeProjectsDir}:/home/aztec-dev/.claude/projects/-workspace:ro`,
        `${CLAUDEBOX_CODE_DIR}:/opt/claudebox:ro`,
        `${BASTION_SSH_KEY}:/home/aztec-dev/.ssh/build_instance_key:ro`,
        `${CLAUDEBOX_STATS_DIR}:/stats:rw`,
      ];
      if (profileDir !== "barretenberg-audit") {
        sidecarBinds.push(`${join(REPO_DIR, ".git")}:/reference-repo/.git:ro`);
      }

      await this.docker.createContainer({
        name: sidecarName,
        Image: DOCKER_IMAGE,
        Entrypoint: [sidecarEntrypoint],
        User: uid,
        Env: [
          `HOME=/home/aztec-dev`,
          `MCP_PORT=9801`,
          `GH_TOKEN=${GH_TOKEN}`,
          `SLACK_BOT_TOKEN=${SLACK_BOT_TOKEN}`,
          `LINEAR_API_KEY=${process.env.LINEAR_API_KEY || ""}`,
          `CI_PASSWORD=${process.env.CI_PASSWORD || ""}`,
          `CLAUDEBOX_LOG_ID=${logId}`,
          `CLAUDEBOX_LOG_URL=${logUrl}`,
          `CLAUDEBOX_WORKTREE_ID=${worktreeId}`,
          `CLAUDEBOX_USER=${opts.userName || ""}`,
          `CLAUDEBOX_COMMENT_ID=${opts.commentId || ""}`,
          `CLAUDEBOX_RUN_COMMENT_ID=${opts.runCommentId || ""}`,
          `CLAUDEBOX_RUN_URL=${opts.runUrl || ""}`,
          `CLAUDEBOX_LINK=${opts.link || ""}`,
          `CLAUDEBOX_SLACK_CHANNEL=${opts.slackChannel || ""}`,
          `CLAUDEBOX_SLACK_THREAD_TS=${opts.slackThreadTs || ""}`,
          `CLAUDEBOX_SLACK_MESSAGE_TS=${opts.slackMessageTs || ""}`,
          `CLAUDEBOX_HOST=${CLAUDEBOX_HOST}`,
          `CLAUDEBOX_BASE_BRANCH=${baseBranch}`,
          `CLAUDEBOX_QUIET=${opts.quiet ? "1" : "0"}`,
          `CLAUDEBOX_CI_ALLOW=${opts.ciAllow ? "1" : "0"}`,
          `CLAUDEBOX_PROFILE=${profileDir}`,
        ],
        HostConfig: {
          NetworkMode: networkName,
          Binds: sidecarBinds,
        },
      }).then(c => c.start());
      console.log(`[DOCKER] Sidecar started: ${sidecarName} (profile=${profileDir} quiet=${opts.quiet ? "yes" : "no"})`);

      await this.waitForHealth(sidecarName);
      console.log(`[DOCKER] Sidecar healthy`);

      // Build Claude container args (use spawn for streaming output)
      const claudeArgs: string[] = [
        "run",
        "--name", claudeName,
        "--network", networkName,
        "--user", uid,
        "-e", `HOME=/home/aztec-dev`,
        "-v", `${workspaceDir}:/workspace:rw`,
        // Mount session JSONL dir to both project keys: -workspace (initial cwd)
        // and -workspace-aztec-packages (cwd after clone_repo). Without both,
        // Claude can't find prior sessions when the cwd changes after clone.
        "-v", `${join(homedir(), ".claude")}:/home/aztec-dev/.claude:rw`,
        "-v", `${claudeProjectsDir}:/home/aztec-dev/.claude/projects/-workspace:rw`,
        "-v", `${claudeProjectsDir}:/home/aztec-dev/.claude/projects/-workspace-aztec-packages:rw`,
        "-v", `${realpathSync(CLAUDE_BINARY)}:/usr/local/bin/claude:ro`,
        "-v", `${join(homedir(), ".claude.json")}:/home/aztec-dev/.claude.json:rw`,
        "-v", `${CLAUDEBOX_CODE_DIR}:/opt/claudebox:ro`,
        "-e", `CLAUDEBOX_MCP_URL=${mcpUrl}`,
        "-e", `SESSION_UUID=${sessionUuid}`,
        "-e", `AZTEC_CREDS_PROXY=http://${sidecarName}:9801/creds`,
        "-e", `CLAUDEBOX_SIDECAR_HOST=${sidecarName}`,
        "-e", `CLAUDEBOX_SIDECAR_PORT=9801`,
        "-e", `CLAUDEBOX_CONTAINER_CLAUDE_MD=${claudeMdPath}`,
        "-e", `PARENT_LOG_ID=${logId}`,
      ];
      // Mount reference repo for profiles that use local clone (not barretenberg-audit)
      if (profileDir !== "barretenberg-audit") {
        claudeArgs.push("-v", `${join(REPO_DIR, ".git")}:/reference-repo/.git:ro`);
      }

      // Auto-detect resume
      if (opts.worktreeId) {
        const resumeId = store.findLatestClaudeSessionId(claudeProjectsDir);
        if (resumeId) {
          claudeArgs.push("-e", `CLAUDEBOX_RESUME_ID=${resumeId}`);
          console.log(`[DOCKER] Resume ID from worktree JSONL: ${resumeId}`);
        }
      }

      claudeArgs.push("--entrypoint", "bash", DOCKER_IMAGE, "/opt/claudebox/container-entrypoint.sh");
      console.log(`[DOCKER] Starting Claude container: ${claudeName}`);

      // Run Claude container (blocking, stream output)
      return await new Promise<number>((resolve) => {
        const container = spawn("docker", claudeArgs, {
          stdio: ["ignore", "pipe", "pipe"],
        });

        // Set up cache_log streaming
        let cacheLogProc: ChildProcess | null = null;
        let streamSessionProc: ChildProcess | null = null;
        try {
          const cacheLogBin = join(REPO_DIR, "ci3", "cache_log");
          const streamSessionBin = join(CLAUDEBOX_CODE_DIR, "stream-session.ts");
          if (existsSync(cacheLogBin) && existsSync(streamSessionBin)) {
            const slackLink = opts.slackChannel && opts.slackThreadTs
              ? `https://aztecprotocol.slack.com/archives/${opts.slackChannel}/p${(opts.slackMessageTs || opts.slackThreadTs).replace(".", "")}?thread_ts=${opts.slackThreadTs}&cid=${opts.slackChannel}`
              : "";
            const headerLines: string[] = [];
            if (slackLink) headerLines.push(`Slack: ${slackLink}`);
            if (opts.runUrl) headerLines.push(`GitHub: ${opts.runUrl}`);
            if (opts.link && opts.link !== opts.runUrl && opts.link !== slackLink) headerLines.push(`Link: ${opts.link}`);
            headerLines.push(`User: ${opts.userName || "unknown"}`);
            headerLines.push(`Container: ${claudeName}`);
            headerLines.push("");

            cacheLogProc = spawn(cacheLogBin, ["claudebox", logId], {
              stdio: ["pipe", "inherit", "inherit"],
              env: { ...process.env, DUP: "1", PARENT_LOG_ID: parentLogId },
            });
            cacheLogProc.stdin?.write(headerLines.join("\n"));

            streamSessionProc = spawn(streamSessionBin, ["--dir", claudeProjectsDir], {
              stdio: ["ignore", "pipe", "inherit"],
              env: { ...process.env, PARENT_LOG_ID: logId },
            });
            streamSessionProc.stdout?.on("data", (d: Buffer) => {
              cacheLogProc?.stdin?.write(d);
            });
          }
        } catch (e) {
          console.warn(`[DOCKER] cache_log setup failed: ${e}`);
        }

        container.stdout?.on("data", (d: Buffer) => {
          const s = d.toString();
          process.stdout.write(s);
          onOutput?.(s);
          cacheLogProc?.stdin?.write(s);
        });
        container.stderr?.on("data", (d: Buffer) => {
          const s = d.toString();
          process.stderr.write(s);
          onOutput?.(s);
          cacheLogProc?.stdin?.write(s);
        });

        container.on("close", (code) => {
          decrActiveSessions();
          const exitCode = code ?? 1;
          console.log(`[DOCKER] Claude container ${claudeName} exited: ${exitCode}`);

          // Drain stream-session
          if (streamSessionProc) {
            streamSessionProc.kill("SIGTERM");
            streamSessionProc.on("close", () => {
              setTimeout(() => { cacheLogProc?.stdin?.end(); }, 500);
            });
            setTimeout(() => {
              streamSessionProc?.kill("SIGKILL");
              setTimeout(() => { cacheLogProc?.stdin?.end(); }, 500);
            }, 15_000);
          } else {
            setTimeout(() => { cacheLogProc?.stdin?.end(); }, 500);
          }

          cleanup();

          // Update metadata
          store.update(logId, {
            status: "completed",
            finished: new Date().toISOString(),
            exit_code: exitCode,
          });

          // Record activity line count so status page doesn't replay old entries on resume
          try {
            const actLines = store.readActivity(worktreeId).length;
            const metaPath = join(store.worktreesDir, worktreeId, "meta.json");
            const m = store.getWorktreeMeta(worktreeId);
            m.activity_synced_lines = actLines;
            writeFileSync(metaPath, JSON.stringify(m, null, 2));
          } catch {}


          resolve(exitCode);
        });
      });
    } catch (e: any) {
      decrActiveSessions();
      console.error(`[DOCKER] Session ${logId} failed: ${e.message}`);
      cleanup();
      store.update(logId, { status: "error", error: e.message, finished: new Date().toISOString() });
      return 1;
    }
  }

  // ── Interactive container ─────────────────────────────────────

  async startInteractiveContainer(
    hash: string, session: SessionMeta,
    store: SessionStore,
  ): Promise<{ container: string; sidecar: string; network: string }> {
    const networkName = `claudebox-int-${hash.slice(0, 12)}`;
    const sidecarName = `claudebox-int-sidecar-${hash.slice(0, 12)}`;
    const containerName = `claudebox-int-${hash.slice(0, 12)}`;

    const worktreeId = session.worktree_id;
    let workspaceDir: string;
    let claudeProjectsDir: string;
    if (worktreeId) {
      const wt = store.getOrCreateWorktree(worktreeId);
      workspaceDir = wt.workspaceDir;
      claudeProjectsDir = wt.claudeProjectsDir;
    } else {
      const { CLAUDEBOX_SESSIONS_DIR } = await import("./config.ts");
      const logId = session._log_id || hash;
      workspaceDir = join(CLAUDEBOX_SESSIONS_DIR, logId, "workspace");
      mkdirSync(workspaceDir, { recursive: true });
      claudeProjectsDir = join(CLAUDEBOX_SESSIONS_DIR, logId, "claude-projects");
      mkdirSync(claudeProjectsDir, { recursive: true });
    }

    const resumeId = store.findLatestClaudeSessionId(claudeProjectsDir) || "";
    const logId = session._log_id || hash;
    const mcpUrl = `http://${sidecarName}:9801/mcp`;
    const keepaliveUrl = `http://host.docker.internal:${HTTP_PORT}/s/${worktreeId || hash}/keepalive`;
    const uid = `${process.getuid!()}:${process.getgid!()}`;
    const profileDir = session.profile || "default";
    const sidecarEntrypoint = `/opt/claudebox/profiles/${profileDir}/mcp-sidecar.ts`;
    const claudeMdPath = `/opt/claudebox/profiles/${profileDir}/container-claude.md`;

    console.log(`[INTERACTIVE] Network: ${networkName}`);
    console.log(`[INTERACTIVE] Sidecar: ${sidecarName}`);
    console.log(`[INTERACTIVE] Container: ${containerName}`);
    console.log(`[INTERACTIVE] Workspace: ${workspaceDir}`);
    console.log(`[INTERACTIVE] Profile: ${profileDir}`);

    // Clean up any stale resources from previous sessions with the same hash
    this.forceRemoveSync(containerName);
    this.forceRemoveSync(sidecarName);
    this.removeNetworkSync(networkName);

    await this.createNetwork(networkName);

    try {
      // Sidecar
      const sidecarBinds = [
        `${workspaceDir}:/workspace:rw`,
        `${claudeProjectsDir}:/home/aztec-dev/.claude/projects/-workspace:ro`,
        `${CLAUDEBOX_CODE_DIR}:/opt/claudebox:ro`,
        `${BASTION_SSH_KEY}:/home/aztec-dev/.ssh/build_instance_key:ro`,
        `${CLAUDEBOX_STATS_DIR}:/stats:rw`,
      ];
      if (profileDir !== "barretenberg-audit") {
        sidecarBinds.push(`${join(REPO_DIR, ".git")}:/reference-repo/.git:ro`);
      }
      await this.docker.createContainer({
        name: sidecarName,
        Image: DOCKER_IMAGE,
        Entrypoint: [sidecarEntrypoint],
        User: uid,
        Env: [
          `HOME=/home/aztec-dev`,
          `MCP_PORT=9801`,
          `GH_TOKEN=${GH_TOKEN}`,
          `SLACK_BOT_TOKEN=${SLACK_BOT_TOKEN}`,
          `LINEAR_API_KEY=${process.env.LINEAR_API_KEY || ""}`,
          `CI_PASSWORD=${process.env.CI_PASSWORD || ""}`,
          `CLAUDEBOX_LOG_ID=${logId}`,
          `CLAUDEBOX_LOG_URL=${session.log_url || ""}`,
          `CLAUDEBOX_WORKTREE_ID=${worktreeId || ""}`,
          `CLAUDEBOX_USER=${session.user || ""}`,
          `CLAUDEBOX_SLACK_CHANNEL=${session.slack_channel || ""}`,
          `CLAUDEBOX_SLACK_THREAD_TS=${session.slack_thread_ts || ""}`,
          `CLAUDEBOX_HOST=${CLAUDEBOX_HOST}`,
          `CLAUDEBOX_BASE_BRANCH=${session.base_branch || "next"}`,
          `CLAUDEBOX_QUIET=${!(session.slack_channel || "").startsWith("D") ? "1" : "0"}`,
          `CLAUDEBOX_PROFILE=${profileDir}`,
        ],
        HostConfig: {
          NetworkMode: networkName,
          Binds: sidecarBinds,
        },
      }).then(c => c.start());
      await this.waitForHealth(sidecarName);

      // Interactive container
      const intBinds = [
        `${workspaceDir}:/workspace:rw`,
        `${join(homedir(), ".claude")}:/home/aztec-dev/.claude:rw`,
        `${claudeProjectsDir}:/home/aztec-dev/.claude/projects/-workspace:rw`,
        `${claudeProjectsDir}:/home/aztec-dev/.claude/projects/-workspace-aztec-packages:rw`,
        `${realpathSync(CLAUDE_BINARY)}:/usr/local/bin/claude:ro`,
        `${join(homedir(), ".claude.json")}:/home/aztec-dev/.claude.json:rw`,
        `${CLAUDEBOX_CODE_DIR}:/opt/claudebox:ro`,
        `${CLAUDEBOX_STATS_DIR}:/stats:rw`,
      ];
      if (profileDir !== "barretenberg-audit") {
        intBinds.push(`${join(REPO_DIR, ".git")}:/reference-repo/.git:ro`);
      }
      await this.docker.createContainer({
        name: containerName,
        Image: DOCKER_IMAGE,
        Entrypoint: ["bash", "/opt/claudebox/container-interactive.sh"],
        User: uid,
        Env: [
          `HOME=/home/aztec-dev`,
          `CLAUDEBOX_MCP_URL=${mcpUrl}`,
          `CLAUDEBOX_SESSION_HASH=${hash}`,
          `CLAUDEBOX_LOG_ID=${logId}`,
          `CLAUDEBOX_LOG_URL=${session.log_url || ""}`,
          `CLAUDEBOX_WORKTREE_ID=${worktreeId || ""}`,
          `CLAUDEBOX_USER=${session.user || ""}`,
          `CLAUDEBOX_RESUME_ID=${resumeId}`,
          `CLAUDEBOX_KEEPALIVE_URL=${keepaliveUrl}`,
          `AZTEC_CREDS_PROXY=http://${sidecarName}:9801/creds`,
          `CLAUDEBOX_SIDECAR_HOST=${sidecarName}`,
          `CLAUDEBOX_SIDECAR_PORT=9801`,
          `CLAUDEBOX_HOST=${CLAUDEBOX_HOST}`,
          `CLAUDEBOX_BASE_BRANCH=${session.base_branch || "next"}`,
          `CLAUDEBOX_SLACK_CHANNEL=${session.slack_channel || ""}`,
          `CLAUDEBOX_SLACK_THREAD_TS=${session.slack_thread_ts || ""}`,
          `CLAUDEBOX_CONTAINER_CLAUDE_MD=${claudeMdPath}`,
        ],
        HostConfig: {
          NetworkMode: networkName,
          ExtraHosts: ["host.docker.internal:host-gateway"],
          Binds: intBinds,
        },
      }).then(c => c.start());
      console.log(`[INTERACTIVE] Container started: ${containerName}`);

      return { container: containerName, sidecar: sidecarName, network: networkName };
    } catch (e: any) {
      await this.stopAndRemove(containerName);
      await this.stopAndRemove(sidecarName);
      await this.removeNetwork(networkName);
      throw e;
    }
  }
}
