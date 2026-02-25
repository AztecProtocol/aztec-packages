#!/usr/bin/env -S node --experimental-strip-types --no-warnings
/**
 * test-mcp-client.ts — Runs INSIDE a test container on the same Docker network
 * as the sidecar. Connects via MCP client SDK and validates tool behavior.
 *
 * Env: MCP_URL (required), GH_TOKEN (optional, enables create_pr test)
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { execFileSync } from "child_process";

const MCP_URL = process.env.MCP_URL;
if (!MCP_URL) {
  console.error("MCP_URL is required");
  process.exit(1);
}

const GH_TOKEN = process.env.GH_TOKEN || "";
const WORKSPACE = "/workspace/aztec-packages";

let passed = 0;
let failed = 0;

function ok(name: string, detail?: string) {
  passed++;
  console.log(`  \u2713 ${name}${detail ? ` (${detail})` : ""}`);
}
function fail(name: string, err: string) {
  failed++;
  console.error(`  \u2717 ${name}: ${err}`);
}

/** Extract text content from an MCP tool result. */
function resultText(result: any): string {
  return (result?.content ?? [])
    .filter((c: any) => c.type === "text")
    .map((c: any) => c.text)
    .join("\n");
}

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: WORKSPACE, encoding: "utf-8", timeout: 30000 }).trim();
}

async function main() {
  console.log(`\nConnecting to ${MCP_URL.replace(/\/mcp\/.*/, "/mcp/<token>")}`);

  const client = new Client({ name: "test-runner", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
  await client.connect(transport);
  console.log("Connected.\n");

  // ── Test: list tools ───────────────────────────────────────────
  console.log("Tools:");
  try {
    const tools = await client.listTools();
    const names = tools.tools.map((t: any) => t.name).sort();
    console.log(`  Found: ${names.join(", ")}`);
    const expected = ["create_pr", "get_context", "github_api", "session_status", "slack_api"];
    for (const e of expected) {
      if (names.includes(e)) ok(`tool ${e} exists`);
      else fail(`tool ${e} exists`, "missing");
    }
  } catch (e: any) {
    fail("list tools", e.message);
  }

  // ── Test: get_context ──────────────────────────────────────────
  console.log("\nget_context:");
  try {
    const result = await client.callTool({ name: "get_context", arguments: {} });
    const text = resultText(result);
    const ctx = JSON.parse(text);
    if (ctx.user === "test-runner") ok("user field correct");
    else fail("user field", `expected test-runner, got ${ctx.user}`);
    if (ctx.repo === "AztecProtocol/aztec-packages") ok("repo field hardcoded");
    else fail("repo field", `expected AztecProtocol/aztec-packages, got ${ctx.repo}`);
    if (ctx.log_id) ok("log_id present", ctx.log_id);
    else fail("log_id present", "empty");
  } catch (e: any) {
    fail("get_context", e.message);
  }

  // ── Test: github_api — whitelisted GET ─────────────────────────
  console.log("\ngithub_api (whitelisted):");
  if (GH_TOKEN) {
    try {
      const result = await client.callTool({
        name: "github_api",
        arguments: {
          method: "GET",
          path: "repos/AztecProtocol/aztec-packages/branches/next",
        },
      });
      const text = resultText(result);
      if (text.includes("next")) ok("GET branches/next");
      else fail("GET branches/next", "unexpected response");
    } catch (e: any) {
      fail("GET branches/next", e.message);
    }
  } else {
    console.log("  (skipped — no GH_TOKEN)");
  }

  // ── Test: github_api — blocked path ────────────────────────────
  console.log("\ngithub_api (blocked paths):");
  const blockedPaths = [
    { method: "GET", path: "repos/OTHER/REPO/pulls", desc: "wrong repo" },
    { method: "DELETE", path: "repos/AztecProtocol/aztec-packages/pulls/1", desc: "DELETE method" },
    { method: "PATCH", path: "repos/AztecProtocol/aztec-packages/pulls/1", desc: "PATCH pulls (undraft)" },
    { method: "PUT", path: "repos/AztecProtocol/aztec-packages/issues/1/labels", desc: "PUT labels" },
  ];
  for (const { method, path, desc } of blockedPaths) {
    try {
      const result = await client.callTool({
        name: "github_api",
        arguments: { method, path },
      });
      const text = resultText(result);
      if (text.includes("Blocked") || text.includes("not whitelisted")) ok(`blocked: ${desc}`);
      else fail(`blocked: ${desc}`, `expected Blocked, got: ${text.slice(0, 100)}`);
    } catch (e: any) {
      fail(`blocked: ${desc}`, e.message);
    }
  }

  // ── Test: github_api — bad auth token ──────────────────────────
  console.log("\nMCP auth:");
  try {
    const badUrl = MCP_URL.replace(/\/mcp\/.*/, "/mcp/bad-token");
    const badClient = new Client({ name: "bad", version: "1.0.0" });
    const badTransport = new StreamableHTTPClientTransport(new URL(badUrl));
    await badClient.connect(badTransport);
    fail("reject bad auth token", "connection succeeded with bad token");
    await badClient.close();
  } catch {
    ok("reject bad auth token");
  }

  // ── Test: create_pr ────────────────────────────────────────────
  console.log("\ncreate_pr:");
  if (GH_TOKEN) {
    try {
      // Create a test commit in the workspace
      const testFile = `test-claudebox-${Date.now()}.txt`;
      execFileSync("bash", ["-c", `echo "claudebox test" > "${WORKSPACE}/${testFile}"`]);
      git("add", testFile);
      git("commit", "-m", "test: claudebox e2e test commit");

      const result = await client.callTool({
        name: "create_pr",
        arguments: {
          title: "test: claudebox e2e sidecar test (auto-close)",
          body: "Automated test PR from ClaudeBox sidecar test suite. Safe to close.",
          base: "next",
        },
      });
      const text = resultText(result);
      if (text.includes("github.com") && text.includes("#")) {
        ok("draft PR created", text.split("\n")[0]);

        // Verify it's actually a draft by fetching the PR
        const prNum = text.match(/#(\d+)/)?.[1];
        if (prNum) {
          const prResult = await client.callTool({
            name: "github_api",
            arguments: {
              method: "GET",
              path: `repos/AztecProtocol/aztec-packages/pulls/${prNum}`,
            },
          });
          const prData = JSON.parse(resultText(prResult));
          if (prData.draft === true) ok("PR is draft");
          else fail("PR is draft", `draft=${prData.draft}`);
        }
      } else {
        fail("create_pr", text);
      }
    } catch (e: any) {
      fail("create_pr", e.message);
    }
  } else {
    // Without GH_TOKEN, verify it fails gracefully
    try {
      const result = await client.callTool({
        name: "create_pr",
        arguments: { title: "test", body: "test", base: "next" },
      });
      const text = resultText(result);
      if (text.includes("No GH_TOKEN")) ok("graceful fail without GH_TOKEN");
      else fail("graceful fail without GH_TOKEN", text);
    } catch (e: any) {
      fail("graceful fail without GH_TOKEN", e.message);
    }
  }

  // ── Summary ────────────────────────────────────────────────────
  console.log(`\n━━━ ${passed} passed, ${failed} failed ━━━`);
  await client.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(`Fatal: ${e.message}`);
  process.exit(1);
});
