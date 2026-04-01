# Local devnet recipes

This document provides a few practical “recipes” for running a local Aztec
development network using the tools and packages in this monorepo.

It is meant to complement the main README, CI documentation, and the official
docs at https://docs.aztec.network.

---

## 1. Quickstart with aztec-up

The `aztec` package is designed to give you a simple local development
environment for Aztec, including:

- a local rollup node,
- an Ethereum L1 dev chain,
- deployed contracts and execution environment.

A typical quickstart looks like this:

1. Install Node using the version from `.nvmrc` at the repository root.
2. Install dependencies:

   ```bash
   pnpm install
