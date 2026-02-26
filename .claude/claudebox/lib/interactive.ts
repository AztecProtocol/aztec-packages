import { WebSocket } from "ws";
import type { InteractiveSession, SessionMeta } from "./types.ts";
import type { DockerService } from "./docker.ts";
import type { SessionStore } from "./session-store.ts";

export class InteractiveSessionManager {
  sessions = new Map<string, InteractiveSession>();
  docker: DockerService;
  store: SessionStore;

  constructor(docker: DockerService, store: SessionStore) {
    this.docker = docker;
    this.store = store;
  }

  has(hash: string): boolean { return this.sessions.has(hash); }
  get(hash: string): InteractiveSession | undefined { return this.sessions.get(hash); }

  resetKeepalive(hash: string, minutes: number): void {
    const s = this.sessions.get(hash);
    if (!s) return;
    clearTimeout(s.timer);
    s.deadline = Date.now() + minutes * 60_000;
    s.timer = setTimeout(() => {
      console.log(`[INTERACTIVE] Session ${hash} expired`);
      if (s.ws && s.ws.readyState === WebSocket.OPEN) {
        s.ws.send("\r\n\x1b[1;33m\u23f0 Session expired. Cleaning up...\x1b[0m\r\n");
        setTimeout(() => this.cleanup(hash), 3_000);
      } else {
        this.cleanup(hash);
      }
    }, minutes * 60_000);
  }

  cleanup(hash: string): void {
    const s = this.sessions.get(hash);
    if (!s) return;
    this.sessions.delete(hash);
    clearTimeout(s.timer);
    this.docker.stopAndRemoveSync(s.container, 3);
    this.docker.stopAndRemoveSync(s.sidecar, 3);
    this.docker.removeNetworkSync(s.network);
    this.store.update(hash, { status: "completed", finished: new Date().toISOString() });
    console.log(`[INTERACTIVE] Cleaned up session ${hash}`);
  }

  async handleWs(hash: string, ws: WebSocket): Promise<void> {
    const session = this.store.findByHash(hash);
    if (!session) {
      ws.close(1008, "Session not found");
      return;
    }
    if (session.status === "running") {
      ws.close(1008, "Still running");
      return;
    }
    if (this.sessions.has(hash)) {
      const existing = this.sessions.get(hash)!;
      if (existing.ws && existing.ws.readyState === WebSocket.OPEN) {
        ws.close(1008, "Already connected");
        return;
      }
      existing.ws = ws;
    }

    console.log(`[INTERACTIVE] Starting interactive session for ${hash}`);
    this.store.update(hash, { status: "interactive" });

    const wsSend = (text: string) => { if (ws.readyState === WebSocket.OPEN) ws.send(text); };

    if (!this.sessions.has(hash)) {
      wsSend("\x1b[1;33mStarting container...\x1b[0m\r\n");
      const { container, sidecar, network } = await this.docker.startInteractiveContainer(hash, session, this.store);
      wsSend("\x1b[1;33mWaiting for environment setup...\x1b[0m\r\n");
      await this.docker.waitForEntrypoint(container);
      wsSend("\x1b[1;33mConnecting to shell...\x1b[0m\r\n");
      const isess: InteractiveSession = {
        timer: setTimeout(() => {}, 0),
        container, sidecar, network,
        ws, hash,
        deadline: 0,
      };
      this.sessions.set(hash, isess);
      this.resetKeepalive(hash, 5);
    }

    const isess = this.sessions.get(hash)!;
    isess.ws = ws;

    await this.bridgeExec(isess, ws);
  }

  async bridgeExec(isess: InteractiveSession, ws: WebSocket): Promise<void> {
    const { stream, resize } = await this.docker.createExecSession(isess.container);

    console.log(`[INTERACTIVE] PTY bridge established for ${isess.hash}`);

    stream.on("data", (data: Buffer) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    });

    ws.on("message", (data: Buffer | string, isBinary: boolean) => {
      const str = isBinary ? null : (typeof data === "string" ? data : data.toString("utf-8"));
      if (str) {
        try {
          const msg = JSON.parse(str);
          if (msg.type === "resize" && msg.cols && msg.rows) {
            resize(msg.cols, msg.rows);
            return;
          }
        } catch {}
        stream.write(str);
      } else {
        stream.write(data);
      }
      this.resetKeepalive(isess.hash, 5);
    });

    stream.on("end", () => {
      console.log(`[INTERACTIVE] Docker socket closed for ${isess.hash}`);
      if (ws.readyState === WebSocket.OPEN) ws.close(1000, "Container exited");
      this.cleanup(isess.hash);
    });

    stream.on("error", (err: Error) => {
      console.error(`[INTERACTIVE] Docker socket error: ${err.message}`);
      if (ws.readyState === WebSocket.OPEN) ws.close(1011, "Docker error");
      this.cleanup(isess.hash);
    });

    ws.on("close", () => {
      console.log(`[INTERACTIVE] WebSocket closed for ${isess.hash}`);
      stream.end();
      const s = this.sessions.get(isess.hash);
      if (s) s.ws = null;
    });

    ws.on("error", (err: Error) => {
      console.error(`[INTERACTIVE] WebSocket error: ${err.message}`);
      stream.end();
    });
  }

  /** Cancel a running or interactive session. */
  cancelSession(hash: string, session: SessionMeta): boolean {
    let cancelled = false;

    if (this.sessions.has(hash)) {
      this.cleanup(hash);
      cancelled = true;
    }

    if (session.status === "running" && session.container) {
      this.docker.stopAndRemoveSync(session.container, 5);
      const logId = session._log_id || hash;
      const sidecarName = session.sidecar || `claudebox-sidecar-${logId}`;
      const networkName = `claudebox-net-${logId}`;
      this.docker.stopAndRemoveSync(sidecarName, 3);
      this.docker.removeNetworkSync(networkName);
      cancelled = true;
    }

    // Update metadata
    const current = this.store.findByHash(hash);
    if (current && (current.status === "running" || current.status === "interactive")) {
      this.store.update(hash, { status: "cancelled", finished: new Date().toISOString() });
      cancelled = true;
    }

    if (cancelled) console.log(`[CANCEL] Session ${hash} cancelled via web UI`);
    return cancelled;
  }
}
