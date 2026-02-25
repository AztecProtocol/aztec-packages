#!/usr/bin/env -S node --experimental-strip-types --no-warnings
/**
 * stream-session.ts - Parse and pretty-print Claude session JSONL for CI output
 *
 * Usage: ./stream-session.ts <worktree-name>
 *
 * Finds the session file for the given worktree in ~/.claude/projects/,
 * parses JSONL line-by-line, and pretty-prints to stdout.
 * Polls for new session files and switches to them automatically.
 * Runs until killed by the parent process.
 */

import { readdirSync, statSync, readFileSync, existsSync } from "fs";
import { join, basename } from "path";
import { homedir } from "os";

// ── Args ──────────────────────────────────────────────────────────
const worktreeName = process.argv[2];
if (!worktreeName) {
  console.error("Usage: stream-session.ts <worktree-name>");
  process.exit(1);
}

const repoDir = process.env.CLAUDE_REPO_DIR ?? join(homedir(), "aztec-packages");
const worktreePath = join(repoDir, ".claude", "worktrees", worktreeName);
const encodedPath = worktreePath.replace(/[/.]/g, "-");
const projectDir = join(homedir(), ".claude", "projects", encodedPath);

// ── ANSI colors ───────────────────────────────────────────────────
const C = "\x1b[0;36m"; // cyan
const G = "\x1b[0;32m"; // green
const Y = "\x1b[0;33m"; // yellow
const R = "\x1b[0;31m"; // red
const GR = "\x1b[0;90m"; // gray
const B = "\x1b[1m"; // bold
const D = "\x1b[2m"; // dim
const X = "\x1b[0m"; // reset

function logInfo(msg: string) {
  console.log(`${C}[stream]${X} ${msg}`);
}

function trunc(s: string, n = 500): string {
  return s.length <= n ? s : s.slice(0, n) + ` ...(${s.length - n} more)`;
}

function formatTimestamp(t: string): string {
  if (!t) return "";
  try {
    const d = new Date(t);
    return d.toTimeString().slice(0, 8);
  } catch {
    return "";
  }
}

function prefix(timestamp: string): string {
  const stamp = formatTimestamp(timestamp);
  return stamp ? `${GR}[${stamp}]${X} ` : "";
}

// ── JSONL pretty-printer ──────────────────────────────────────────
function printEntry(d: any) {
  const t = d.type ?? "";
  const p = prefix(d.timestamp ?? "");

  if (["progress", "queue-operation", "file-history-snapshot"].includes(t)) return;

  if (t === "user") {
    const msg = d.message ?? {};
    const content = msg.content ?? "";
    if (typeof content === "string") {
      console.log(`\n${p}${B}${C}USER:${X} ${trunc(content, 300)}`);
    } else if (Array.isArray(content)) {
      for (const item of content) {
        if (item.type === "tool_result") {
          const tid = (item.tool_use_id ?? "").slice(0, 12);
          let res = item.content ?? "";
          const err = item.is_error ?? false;
          if (Array.isArray(res)) {
            res = res
              .filter((r: any) => r.type === "text")
              .map((r: any) => r.text ?? "")
              .join("\n");
          } else if (typeof res !== "string") {
            res = String(res);
          }
          const color = err ? R : G;
          const label = err ? "ERROR" : "RESULT";
          const disp = trunc(res, 800).replace(/\n/g, "\n    ");
          console.log(`${p}  ${color}${label}${X} ${GR}(${tid})${X}`);
          if (disp.trim()) console.log(`    ${disp}`);
        } else if (item.type === "text") {
          const txt = item.text ?? "";
          if (txt.trim()) {
            console.log(`${p}${B}${C}USER:${X} ${trunc(txt, 300)}`);
          }
        }
      }
    }
  } else if (t === "assistant") {
    const msg = d.message ?? {};
    const content = msg.content ?? [];
    const usage = msg.usage ?? {};
    const itok = usage.input_tokens ?? 0;
    const otok = usage.output_tokens ?? 0;
    if (!Array.isArray(content)) return;

    for (const item of content) {
      const it = item.type ?? "";
      if (it === "text") {
        const txt = item.text ?? "";
        if (txt.trim()) {
          console.log(`\n${p}${B}${G}CLAUDE:${X}`);
          for (const ln of txt.split("\n")) {
            console.log(`  ${ln}`);
          }
        }
      } else if (it === "tool_use") {
        const name = item.name ?? "?";
        const inp = item.input ?? {};
        if (name === "Bash") {
          const cmd = inp.command ?? "";
          const desc = inp.description ?? "";
          console.log(`\n${p}${Y}TOOL:${X} ${B}${name}${X} ${GR}${desc}${X}`);
          console.log(`  ${D}$ ${trunc(cmd, 400)}${X}`);
        } else if (name === "Edit" || name === "Write") {
          console.log(`\n${p}${Y}TOOL:${X} ${B}${name}${X} ${inp.file_path ?? ""}`);
        } else if (name === "Read" || name === "Glob" || name === "Grep") {
          const fp = inp.file_path ?? inp.path ?? inp.pattern ?? "";
          const extra = name === "Grep" ? ` pattern=${inp.pattern ?? ""}` : "";
          console.log(`\n${p}${Y}TOOL:${X} ${B}${name}${X} ${fp}${extra}`);
        } else if (name === "Task") {
          console.log(
            `\n${p}${Y}TOOL:${X} ${B}Task(${inp.subagent_type ?? ""})${X} ${inp.description ?? ""}`,
          );
        } else {
          console.log(
            `\n${p}${Y}TOOL:${X} ${B}${name}${X} ${GR}${trunc(JSON.stringify(inp), 200)}${X}`,
          );
        }
      }
    }
    if (itok || otok) {
      console.log(`  ${D}tokens: in=${itok} out=${otok}${X}`);
    }
  } else if (t === "summary") {
    console.log(`\n${p}${GR}[session summary]${X}`);
  } else {
    console.log(`\n${p}${D}[${t || "unknown"}] ${trunc(JSON.stringify(d), 400)}${X}`);
  }
}

// ── Helpers ───────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findNewestJsonl(dir: string): string | null {
  try {
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => {
        const full = join(dir, f);
        return { path: full, mtime: statSync(full).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
    return files.length > 0 ? files[0].path : null;
  } catch {
    return null;
  }
}

function readLines(file: string, fromLine: number): string[] {
  try {
    const content = readFileSync(file, "utf-8");
    const lines = content.split("\n");
    return lines.slice(fromLine);
  } catch {
    return [];
  }
}

// ── Main loop ─────────────────────────────────────────────────────
async function main() {
  // Wait for project directory
  logInfo("Waiting for session directory...");
  let waitCount = 0;
  while (!existsSync(projectDir)) {
    await sleep(1000);
    waitCount++;
    if (waitCount >= 120) {
      console.error(`${R}ERROR: Session directory never appeared after 120s${X}`);
      process.exit(1);
    }
  }
  logInfo("Session directory found.");

  let currentFile = "";
  let currentLine = 0;

  logInfo("Streaming session output...");
  console.log(`\n${B}${G}━━━ Claude Session Output ━━━${X}`);

  while (true) {
    const newestFile = findNewestJsonl(projectDir);

    if (!newestFile) {
      await sleep(1000);
      continue;
    }

    if (newestFile !== currentFile) {
      if (currentFile) logInfo("New session file detected, switching...");
      currentFile = newestFile;
      currentLine = 0;
      logInfo(`Streaming: ${basename(currentFile)}`);
    }

    const newLines = readLines(currentFile, currentLine);
    let parsed = 0;
    for (const line of newLines) {
      if (!line.trim()) continue;
      try {
        const d = JSON.parse(line);
        printEntry(d);
        parsed++;
      } catch {
        // skip malformed lines
      }
    }
    currentLine += newLines.length;

    await sleep(500);
  }
}

main();
