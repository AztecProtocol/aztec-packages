---
title: AI Tooling
description: Set up AI coding tools like Claude Code, Cursor, and Codex for Aztec and Noir development.
sidebar_position: 2
tags: [ai, tooling, getting_started]
---

Aztec is new, rapidly evolving, and spans novel concepts like private state, notes, and nullifiers. AI coding tools can accelerate your learning and development, but they need up-to-date context to be useful. This page shows you how to set that up.

:::caution
LLMs have limited training data for zero-knowledge circuit development. Noir and Aztec.nr are newer languages with smaller codebases than mainstream languages, so AI tools will make more mistakes than you might be used to. The tools on this page help by providing up-to-date context, but you should always verify generated code and test thoroughly.
:::

## Project-level instructions (CLAUDE.md / AGENTS.md files)

MCP servers and skills provide context on demand, but AI tools don't always invoke them at the right time. The most reliable way to prevent common mistakes is to add **project-level instruction files** that your AI tool reads automatically at the start of every conversation. You can add to these files over time as you discover new gotchas or best practices. They ensure your AI tool always has the critical context it needs, without relying on you to remember to invoke the right skills or MCP servers.

For Claude Code, create a `CLAUDE.md` file in your project root. For Codex, create an `AGENTS.md` file in your project root. For other tools, check their documentation for equivalent configuration.

### Recommended CLAUDE.md / AGENTS.md

```markdown
# Aztec Project

## Critical: Use `aztec` CLI, not `nargo` directly

This is an Aztec smart contract project. Always use the `aztec` CLI wrapper instead of calling `nargo` directly:

- **Compile**: `aztec compile` (NOT `nargo compile`). Using `nargo compile` alone produces incomplete artifacts.
- **Test**: `aztec test` (NOT `nargo test`).
- **Other nargo commands** like `nargo fmt` and `nargo doc` are fine to use directly.
```

This prevents the most common AI mistake: using `nargo compile` and `nargo test` instead of their Aztec wrappers.

### Why this matters

LLMs have extensive training data for `nargo` (the standalone Noir compiler) but limited exposure to the `aztec` CLI wrapper. Without explicit instructions, they default to `nargo compile`, which produces artifacts missing the AVM transpilation step.

## MCP servers

The highest-leverage tools are the Aztec and Noir MCP servers. They clone reference repositories locally and give your AI tool code search, documentation search, and example discovery across the Aztec and Noir ecosystems. They work with any AI coding tool that supports MCP (Claude Code, Cursor, Windsurf, Codex, and others).

The MCP servers help manage the problem of focusing LLMs on the correct Aztec versions for your project. Aztec is under active development and there may be multiple versions in use at any given time (e.g. mainnet, devnet and testnet may be on different versions). They make it easy to switch between versions if needed, and to keep your context up to date as the repos evolve.

Start here if you're unsure what to set up.

### Claude Code

Install the Aztec and Noir plugins from the marketplace. These include the MCP servers plus additional skills, commands, and agents:

```bash
/plugin marketplace add critesjosh/aztec-claude-plugin
/plugin install aztec@aztec-plugins
```

Or add the MCP servers directly:

```bash
claude mcp add aztec -- npx @aztec/mcp-server@latest
claude mcp add noir -- npx noir-mcp-server@latest
```

### Cursor / Windsurf / other MCP clients

Add the servers to your MCP configuration JSON:

```json
{
  "mcpServers": {
    "aztec": {
      "command": "npx",
      "args": ["-y", "@aztec/mcp-server@latest"]
    },
    "noir": {
      "command": "npx",
      "args": ["-y", "noir-mcp-server@latest"]
    }
  }
}
```

### OpenAI Codex

Use the same MCP configuration format, pointing at `@aztec/mcp-server` and `noir-mcp-server`.

## For learning and exploration

These resources help you understand Aztec concepts, read docs, or provide additional context to your AI tool.

- **API reference docs** - The docs site publishes auto-generated API references that are useful to feed to AI tools:
  - [Aztec.nr API reference](./docs/aztec-nr/api.mdx) - generated from aztec-nr source with `nargo doc`
  - [TypeScript API reference](./docs/aztec-js/typescript_api_reference.mdx) - generated from yarn-project packages with TypeDoc

  These are especially useful as context for code generation since they reflect the current API surface.

- **llms.txt** - The docs site publishes `llms.txt` and `llms-full.txt` at [docs.aztec.network/llms.txt](https://docs.aztec.network/llms.txt) for automatic LLM discovery. Many AI tools can consume these files directly to index documentation.
- **Reference repositories** - Point your AI tool at these repos for additional context:
  - [AztecProtocol/aztec-packages](https://github.com/AztecProtocol/aztec-packages) - main monorepo, best general reference
  - [AztecProtocol/aztec-starter](https://github.com/AztecProtocol/aztec-starter) - smaller starter project, easier for onboarding
  - [AztecProtocol/aztec-examples](https://github.com/AztecProtocol/aztec-examples) - official contract examples
  - [noir-lang/noir](https://github.com/noir-lang/noir) - Noir language source of truth
  - [noir-lang/noir-examples](https://github.com/noir-lang/noir-examples) - common Noir patterns
  - [awesome-noir](https://github.com/noir-lang/awesome-noir) - community Noir resources
  - [awesome-aztec](https://github.com/AztecProtocol/awesome-aztec) - community Aztec resources
- **Copy docs into context** - Copy docs pages directly into your AI tool's context or conversation using the "Copy page" button at the top of each page.
- **Context7** - [Context7](https://context7.com) is a generic MCP server with Aztec docs available at [context7.com/aztecprotocol/aztec-packages](https://context7.com/aztecprotocol/aztec-packages). Note that it may be less current than the MCP servers above.

## Aztec and Noir tool reference

| Tool                                                                        | Works with                                            | Description                                                                            |
| --------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [aztec-claude-plugin](https://github.com/critesjosh/aztec-claude-plugin)    | Claude Code                                           | Skills, commands, agents, and MCP server for Aztec contract and TypeScript development |
| [@aztec/mcp-server](https://github.com/AztecProtocol/mcp-server)            | Any MCP client (Claude Code, Cursor, Windsurf, Codex) | Clones Aztec repos locally, provides code search, doc search, and example discovery    |
| [noir-claude-plugin](https://github.com/critesjosh/noir-claude-plugin)      | Claude Code                                           | Skills and commands for Noir circuit development                                       |
| [noir-mcp-server](https://github.com/critesjosh/noir-mcp-server)            | Any MCP client                                        | Clones Noir repos, stdlib, and community libraries; provides search and examples       |
| [aztec-skills](https://github.com/NethermindEth/aztec-skills)               | Claude Code, Codex                                    | Installable skills for Aztec contracts, deployment, Aztec.js, and testing              |
| [noir skills](https://github.com/noir-lang/noir/tree/master/.claude/skills) | Claude Code, Codex                                    | Skills for Noir compiler development, SSA debugging, fuzzing, and ACIR optimization    |
