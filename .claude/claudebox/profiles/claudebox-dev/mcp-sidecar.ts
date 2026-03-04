#!/usr/bin/env -S node --experimental-strip-types --no-warnings
/**
 * ClaudeBox Dev Profile Sidecar
 *
 * For working on ClaudeBox infrastructure itself.
 * Repo: AztecProtocol/aztec-packages (public)
 * Clone strategy: local reference repo (/reference-repo/.git)
 * Key differences from default:
 *   - .claude/ files are never blocked
 *   - push_branch tool for direct pushes to claudebox-workflow
 *   - create_pr defaults base to claudebox-workflow
 */

import {
  z, McpServer,
  GH_TOKEN, SESSION_META,
  buildCommonGhWhitelist, sanitizeError,
  git, logActivity, pushToRemote,
  registerCommonTools, registerCloneRepo, registerPRTools,
  startMcpHttpServer,
} from "../../mcp-base.ts";

// ── Profile config ──────────────────────────────────────────────
const REPO = "AztecProtocol/aztec-packages";
const WORKSPACE = process.env.WORKSPACE || "/workspace/aztec-packages";
const R = `repos/${REPO}`;
const DEV_BRANCH = "claudebox-workflow";

SESSION_META.repo = REPO;

const GH_WHITELIST = buildCommonGhWhitelist(R);

const TOOL_LIST = "clone_repo, respond_to_user, get_context, session_status, github_api, slack_api, create_pr, update_pr, push_branch, create_gist, create_skill, ci_failures, linear_get_issue, linear_create_issue, record_stat";

// ── MCP Server factory ──────────────────────────────────────────

function createServer(): McpServer {
  const server = new McpServer({ name: "claudebox-dev", version: "1.0.0" });

  registerCommonTools(server, { repo: REPO, workspace: WORKSPACE, tools: TOOL_LIST, ghWhitelist: GH_WHITELIST });

  registerCloneRepo(server, {
    repo: REPO, workspace: WORKSPACE,
    strategy: "local-reference",
    remoteUrl: "https://github.com/AztecProtocol/aztec-packages.git",
    refHint: `'origin/${DEV_BRANCH}', 'abc123'`,
  });

  registerPRTools(server, {
    repo: REPO, workspace: WORKSPACE,
    branchPrefix: "claudebox/", defaultBase: DEV_BRANCH,
    blockedBases: /^(master|main)$/,
    blockGithubFiles: true,
    label: "claudebox",
    createDescription: `Push workspace commits and create a draft PR. Base branch defaults to '${DEV_BRANCH}'. .claude/ files are always included (this is the ClaudeBox dev profile).`,
    updateDescription: "Push workspace commits and/or update an existing PR. Only works on PRs with the 'claudebox' label. .claude/ files always included.",
  });

  // ── push_branch — direct push to dev branch ───────────────────
  server.tool("push_branch",
    `Push current commits directly to a branch (defaults to '${DEV_BRANCH}'). No PR created.`,
    {
      branch: z.string().optional().describe(`Target branch (default: '${DEV_BRANCH}')`),
      force_push: z.boolean().optional().describe("Force-push"),
    },
    async ({ branch, force_push }) => {
      if (!GH_TOKEN) return { content: [{ type: "text", text: "No GH_TOKEN" }], isError: true };
      const targetBranch = branch || DEV_BRANCH;
      if (!/^[\w./-]+$/.test(targetBranch))
        return { content: [{ type: "text", text: `Invalid branch name: ${targetBranch}` }], isError: true };
      if (/^(master|main|next)$/.test(targetBranch))
        return { content: [{ type: "text", text: `Blocked: never push directly to '${targetBranch}'. Use create_pr instead.` }], isError: true };

      try {
        try {
          git(WORKSPACE, "add", "-A");
          git(WORKSPACE, "diff", "--cached", "--quiet");
        } catch {
          git(WORKSPACE, "commit", "-m", `claudebox-dev: update`);
        }

        pushToRemote(WORKSPACE, REPO, targetBranch, force_push);
        logActivity("push", `Pushed to ${targetBranch}`);
        return { content: [{ type: "text", text: `Pushed to ${targetBranch}\nhttps://github.com/${REPO}/tree/${targetBranch}` }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `push_branch: ${sanitizeError(e.message)}` }], isError: true };
      }
    });

  return server;
}

// ── Start server ────────────────────────────────────────────────

startMcpHttpServer(createServer);
