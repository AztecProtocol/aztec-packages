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

## Critical: Use the `aztec` CLI, not `nargo` or `bb` directly

This is an Aztec smart contract project. Always use the `aztec` CLI wrapper instead of calling `nargo` or `bb` (the Barretenberg prover) directly:

- **Compile**: `aztec compile` (NOT `nargo compile`). Using `nargo compile` alone produces incomplete artifacts.
- **Test**: `aztec test` (NOT `nargo test`).
- **Prove**: NEVER call `bb` directly. Proof generation is handled for you by the PXE through the `aztec` CLI and `aztec.js`. There is no contract-development workflow that runs `bb` by hand.
- **Other nargo commands** like `aztec-nargo fmt` and `aztec-nargo doc` are fine to use directly. The Aztec installer exposes the bundled `nargo` as `aztec-nargo`; bare `nargo` resolves to your own install (if any), not the bundled one.

## Error Handling

- NEVER silently swallow errors or fall back to default values. If a value is required, throw if it's missing.
- NEVER use fallback values like `AztecAddress.ZERO`, `"unknown"`, `0`, or `null` to mask missing data. These hide bugs and cause failures elsewhere that are harder to trace.
- NEVER add retry/polling logic unless explicitly asked. Retry loops with long timeouts may brick application loops and mask the real error.
- NEVER wrap calls in try/catch that returns null or a default. Let errors propagate.
- If a precondition isn't met, throw immediately with a descriptive message — don't try to "work around" it.
- Prefer `T` return types over `T | null` when null would indicate a bug rather than a valid state.
- Do not add `.catch(() => defaultValue)` to promises. If something fails, the caller needs to know.

## Version Compatibility

The Aztec developer SDK/aztec-nr version (used for writing and compiling contracts) may differ from the node version (used by operators to run the network). Check the [Networks page](https://docs.aztec.network/networks) for current network versions. When in doubt, use the version from the developer docs you are reading, it is the correct SDK version for contract development on that network.

## Hashing: Default to Poseidon2

When writing Aztec.nr contract code that requires hashing, **always use Poseidon2** unless a specific protocol or interoperability requirement calls for a different hash.

- **Default**: `use aztec::protocol::hash::poseidon2_hash;`
- **Do NOT** default to Pedersen (`pedersen_hash`). Pedersen is available but Poseidon2 is cheaper in circuits and is the standard across Aztec.
- If you are unsure which hash to use, use Poseidon2.
```

This prevents the two most common AI mistakes: using `nargo compile`/`nargo test` instead of their Aztec wrappers, and defaulting to Pedersen hashes instead of Poseidon2.

### Why this matters

LLMs have extensive training data for `nargo` (the standalone Noir compiler) and `bb` (the Barretenberg prover CLI) but limited exposure to the `aztec` CLI wrapper. Without explicit instructions, they default to `nargo compile` (which produces artifacts missing the AVM transpilation step) or reach for `bb` to generate proofs. In an Aztec project, compilation and proving both go through the `aztec` tooling.

## MCP servers

The highest-leverage tools are the Aztec and Noir MCP servers. They clone reference repositories locally and give your AI tool code search, documentation search, and example discovery across the Aztec and Noir ecosystems. They work with any AI coding tool that supports MCP (Claude Code, Cursor, Windsurf, Codex, and others).

The MCP servers help manage the problem of focusing LLMs on the correct Aztec versions for your project. Aztec is under active development and there may be multiple versions in use at any given time (e.g. mainnet, devnet and testnet may be on different versions). They make it easy to switch between versions if needed, and to keep your context up to date as the repos evolve.

Start here if you're unsure what to set up.

### Claude Code

Add the MCP servers directly:

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
- **Context7** - [Context7](https://context7.com) is a generic MCP server. The Aztec index at [context7.com/aztecprotocol/aztec-packages](https://context7.com/aztecprotocol/aztec-packages) is scoped by [`context7.json`](https://github.com/AztecProtocol/aztec-packages/blob/next/context7.json) to the developer docs, `aztec-nr`, and `aztec.js`, and excludes the monorepo's internal deployment and CI infrastructure (`spartan/`, `iac/`, `ci3/`), which is not relevant to building on Aztec. Note that it may be less current than the MCP servers above.

## Aztec and Noir tool reference

| Tool                                                                        | Works with                                            | Description                                                                         |
| --------------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [@aztec/mcp-server](https://github.com/AztecProtocol/mcp-server)            | Any MCP client (Claude Code, Cursor, Windsurf, Codex) | Clones Aztec repos locally, provides code search, doc search, and example discovery |
| [noir-claude-plugin](https://github.com/critesjosh/noir-claude-plugin)      | Claude Code                                           | Skills and commands for Noir circuit development                                    |
| [noir-mcp-server](https://github.com/critesjosh/noir-mcp-server)            | Any MCP client                                        | Clones Noir repos, stdlib, and community libraries; provides search and examples    |
| [aztec-skills](https://github.com/NethermindEth/aztec-skills)               | Claude Code, Codex                                    | Installable skills for Aztec contracts, deployment, Aztec.js, and testing           |
| [aztec-private-escrow-skills](https://github.com/AztecProtocol/aztec-private-escrow-skills) | Claude Code, Codex                   | Skills that scaffold private escrow projects; see the [Private Escrow Kit](./docs/tutorials/private-escrow-kit/index.md) guide |
| [noir skills](https://github.com/noir-lang/noir/tree/master/.claude/skills) | Claude Code, Codex                                    | Skills for Noir compiler development, SSA debugging, fuzzing, and ACIR optimization |
