import type { WebSocket } from "ws";

export interface SessionMeta {
  claude_session_id?: string;
  log_url?: string;
  slack_channel?: string;
  slack_thread_ts?: string;
  started?: string;
  finished?: string;
  worktree_id?: string;
  _log_id?: string;
  [key: string]: any;
}

export interface ContainerSessionOpts {
  prompt: string;
  userName?: string;
  commentId?: string;
  runCommentId?: string;
  runUrl?: string;
  link?: string;
  slackChannel?: string;
  slackThreadTs?: string;
  slackMessageTs?: string;
  worktreeId?: string;
  targetRef?: string;
}

export interface InteractiveSession {
  timer: ReturnType<typeof setTimeout>;
  container: string;
  sidecar: string;
  network: string;
  ws: WebSocket | null;
  hash: string;
  deadline: number;
}

export type ParseResult =
  | { type: "reply-hash"; hash: string; prompt: string }
  | { type: "prompt"; prompt: string };

export interface WorktreeInfo {
  worktreeId: string;
  workspaceDir: string;
  claudeProjectsDir: string;
}
