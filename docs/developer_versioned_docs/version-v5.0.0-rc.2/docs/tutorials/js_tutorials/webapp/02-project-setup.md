---
title: "2. Project Setup"
sidebar_position: 2
description: "Understand the webapp project structure, Vite configuration, and environment setup"
---

# Project Setup

## Overview

This section walks through the project structure and key configuration files. Since you [cloned the example](./index.md#clone-the-example) in the introduction, everything is already in place — this page explains what each piece does.

## Project structure

```text
webapp-tutorial/
├── contracts/           # Noir smart contract source
│   ├── Nargo.toml
│   └── src/
│       ├── main.nr
│       ├── game_round_note.nr
│       └── race.nr
├── scripts/             # Standalone scripts (deploy-and-interact)
├── src/
│   ├── artifacts/       # Generated contract bindings (from yarn prep)
│   ├── components/      # React components (GameBoard, GameLobby, etc.)
│   ├── App.tsx          # Main app component
│   ├── config.ts        # Network configuration
│   ├── contract.ts      # Contract deploy/call helpers
│   ├── embedded-wallet.ts  # Embedded wallet for local dev
│   ├── fees.ts          # SponsoredFPC fee payment utilities
│   ├── game-constants.ts   # Shared game constants
│   ├── main.tsx         # React entry point
│   └── wallet-connection.ts  # Wallet SDK connection logic
├── test-extension/      # Tutorial wallet extension (browser wallet)
├── index.html           # HTML entry point
├── vite.config.ts       # Vite configuration
├── tsconfig.json        # TypeScript configuration
├── .env.example         # Environment variables to override
└── package.json
```

## Vite configuration

Aztec uses WASM modules that require `SharedArrayBuffer`, which needs specific HTTP headers. Open `vite.config.ts`:

```typescript title="vite-config" showLineNumbers 
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import {
  type PolyfillOptions,
  nodePolyfills,
} from "vite-plugin-node-polyfills";

// Unfortunate, but needed due to https://github.com/davidmyersdev/vite-plugin-node-polyfills/issues/81
const nodePolyfillsFix = (options?: PolyfillOptions): Plugin => ({
  ...nodePolyfills(options),
  resolveId(source: string) {
    const m =
      /^vite-plugin-node-polyfills\/shims\/(buffer|global|process)$/.exec(
        source,
      );
    if (m) {
      return `./node_modules/vite-plugin-node-polyfills/shims/${m[1]}/dist/index.cjs`;
    }
  },
});

export default defineConfig({
  plugins: [
    react(),
    nodePolyfillsFix({
      globals: {
        process: true,
        Buffer: true,
      },
    }),
  ],
  server: {
    // Headers required for SharedArrayBuffer (needed by bb WASM)
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  // Exclude WASM-containing packages from pre-bundling
  optimizeDeps: {
    include: ["pino", "pino/browser"],
    exclude: [
      "@aztec/noir-noirc_abi",
      "@aztec/noir-acvm_js",
      "@aztec/bb.js",
      "@aztec/noir-noir_js",
    ],
  },
});
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.2/docs/examples/webapp-tutorial/vite.config.ts#L1-L51" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/vite.config.ts#L1-L51</a></sub></sup>


Why each piece is needed:
- **COOP/COEP headers**: Enable `SharedArrayBuffer` for multithreaded WASM (barretenberg proving)
- **Node polyfills**: Aztec libraries use Node.js APIs that need polyfilling in the browser
- **optimizeDeps.exclude**: Prevents Vite from pre-bundling WASM-containing packages (`@aztec/bb.js`, `@aztec/noir-noirc_abi`, etc.) which would corrupt the WASM modules

## TypeScript configuration

The project uses a standard Vite + React TypeScript setup. `tsconfig.json` references `tsconfig.app.json`, which targets `ES2020` with `"jsx": "react-jsx"` and `"moduleResolution": "Bundler"`. No special configuration is needed for Aztec.

## Environment variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

and paste the below into the file.

```text
AZTEC_NODE_URL=http://localhost:8080
```

This tells the app where to find the Aztec node. For local development, this points to the default local network port. When using the wallet extension, it manages the node connection.

## Compiling the contract

If you haven't already compiled the contract from the [previous section](./01-the-contract.md#compile-the-contract):

```bash
yarn prep
```

This produces `src/artifacts/PodRacing.ts` and `src/artifacts/PodRacing.json`. The webapp imports the typed contract class from `PodRacing.ts`.

## Next steps

With the project structure understood, continue to [network and wallet setup](./03-network-and-wallet.md).
