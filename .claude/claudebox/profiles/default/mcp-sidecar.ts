#!/usr/bin/env -S node --experimental-strip-types --no-warnings
/**
 * ClaudeBox Default Profile Sidecar
 *
 * Repo: AztecProtocol/aztec-packages (public)
 * Clone strategy: local reference repo (/reference-repo/.git)
 */

import {
  McpServer,
  SESSION_META,
  buildCommonGhWhitelist,
  registerCommonTools, registerCloneRepo, registerPRTools,
  startMcpHttpServer,
} from "../../mcp-base.ts";

// ── Profile config ──────────────────────────────────────────────
const REPO = "AztecProtocol/aztec-packages";
const WORKSPACE = process.env.WORKSPACE || "/workspace/aztec-packages";
const R = `repos/${REPO}`;

SESSION_META.repo = REPO;

const GH_WHITELIST = buildCommonGhWhitelist(R);

const TOOL_LIST = "clone_repo, respond_to_user, get_context, session_status, github_api, slack_api, create_pr, update_pr, create_gist, create_skill, ci_failures, linear_get_issue, linear_create_issue, record_stat";

// ── MCP Server factory ──────────────────────────────────────────

function createServer(): McpServer {
  const server = new McpServer({ name: "claudebox-default", version: "1.0.0" });

  registerCommonTools(server, { repo: REPO, workspace: WORKSPACE, tools: TOOL_LIST, ghWhitelist: GH_WHITELIST });

  registerCloneRepo(server, {
    repo: REPO, workspace: WORKSPACE,
    strategy: "local-reference",
    remoteUrl: "https://github.com/AztecProtocol/aztec-packages.git",
    refHint: "'origin/next', 'abc123'",
  });

  registerPRTools(server, {
    repo: REPO, workspace: WORKSPACE,
    branchPrefix: "claudebox/", defaultBase: "next",
    blockedBases: /^(master|main)$/,
    blockClaudeFiles: true, blockGithubFiles: true, checkNoirSubmodule: true,
    label: "claudebox",
    createDescription: "Push workspace commits and create a draft PR. WARNING: .claude/ files are blocked by default — pass include_claude_files=true ONLY if your PR intentionally modifies ClaudeBox infrastructure. .github/ workflow files are also blocked unless the session was started with 'ci-allow'.",
    updateDescription: "Push workspace commits and/or update an existing PR. Only works on PRs with the 'claudebox' label.",
  });

  return server;
}

// ── Start server ────────────────────────────────────────────────

startMcpHttpServer(createServer);
