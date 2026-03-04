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
  slackChannelName?: string;
  slackThreadTs?: string;
  slackMessageTs?: string;
  worktreeId?: string;
  targetRef?: string;
  quiet?: boolean;
  ciAllow?: boolean;
  profile?: string;
}

export interface InteractiveSession {
  timer: ReturnType<typeof setTimeout>;
  container: string;
  sidecar: string;
  network: string;
  ws: WebSocket | null;
  hash: string;     // key (worktree ID or legacy hash)
  logId: string;    // actual session log_id for store updates
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

// ── Personal Dashboard types ──────────────────────────────────────

export interface Artifact {
  type: string;  // "pr" | "gist" | "link"
  text: string;
  url: string;
}

/** Standalone base for EnrichedWorkspace — mirrors WorkspaceCard from html-templates.ts */
export interface EnrichedWorkspace {
  worktreeId: string;
  name: string | null;
  resolved: boolean;
  alive: boolean;
  status: string;
  exitCode: number | null;
  user: string;
  prompt: string;
  started: string | null;
  baseBranch: string;
  channelName: string;
  runCount: number;
  profile?: string;
  // Enriched fields
  latestResponse: string;
  artifacts: Artifact[];
  tags: string[];
  threadTs: string;
  channelId: string;
}

export interface ThreadGroup {
  threadTs: string;
  firstPrompt: string;
  workspaces: EnrichedWorkspace[];
}

export interface ChannelGroup {
  channel: string;
  channelId: string;
  threads: ThreadGroup[];
}
