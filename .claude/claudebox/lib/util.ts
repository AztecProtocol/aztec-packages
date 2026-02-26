import type { ParseResult, SessionMeta } from "./types.ts";
import { CLAUDEBOX_HOST } from "./config.ts";

export function truncate(s: string, n = 80): string {
  return s.length <= n ? s : s.slice(0, n - 3) + "...";
}

export function extractHashFromUrl(text: string): string | null {
  const m = text.match(/^<?https?:\/\/ci\.aztec-labs\.com\/([a-f0-9]+)>?/);
  return m ? m[1] : null;
}

/** Parse incoming text into either a hash-based reply or a plain prompt. */
export function parseMessage(text: string, findSession: (hash: string) => SessionMeta | null): ParseResult {
  const parts = text.split(/\s+/);
  const first = parts[0] || "";
  const rest = text.slice(first.length).trim();

  const urlHash = extractHashFromUrl(first);
  if (urlHash) return { type: "reply-hash", hash: urlHash, prompt: rest };

  if (/^[a-f0-9]{32}$/.test(first) && findSession(first)) {
    return { type: "reply-hash", hash: first, prompt: rest };
  }

  return { type: "prompt", prompt: text };
}

export interface ParsedKeywords {
  forceNew: boolean;
  quiet: boolean | null;  // null = use auto-detect
  prompt: string;
}

/** Detect keywords (new-session, quiet, loud) at start of prompt, in any order. */
export function parseKeywords(parsed: ParseResult): ParsedKeywords {
  let prompt = parsed.prompt;
  let forceNew = false;
  let quiet: boolean | null = null;

  let changed = true;
  while (changed) {
    changed = false;
    if (/^new-session\b/i.test(prompt)) {
      forceNew = true; prompt = prompt.replace(/^new-session\s*/i, ""); changed = true;
    }
    if (/^quiet\b/i.test(prompt)) {
      quiet = true; prompt = prompt.replace(/^quiet\s*/i, ""); changed = true;
    }
    if (/^loud\b/i.test(prompt)) {
      quiet = false; prompt = prompt.replace(/^loud\s*/i, ""); changed = true;
    }
  }
  return { forceNew, quiet, prompt };
}

/** Validate a session for resume. Returns error message or null if OK. */
export function validateResumeSession(session: SessionMeta | null, hash: string): string | null {
  if (!session) return `Session \`${hash}\` not found.`;
  if (session.status === "running") return "Replies to ongoing conversations are not supported currently.";
  if (!session.worktree_id) return `Session \`${hash}\` has no worktree.`;
  return null;
}

export function sessionUrl(hash: string): string {
  return `https://${CLAUDEBOX_HOST}/s/${hash}`;
}

export function cancelUrl(hash: string): string {
  return `https://${CLAUDEBOX_HOST}/s/${hash}/cancel`;
}

export function hashFromLogUrl(logUrl: string): string {
  const m = logUrl.match(/\/([a-f0-9]{32})$/);
  return m ? m[1] : "";
}
