---
title: Aztec.js
sidebar_position: 0
tags: [aztec.js, javascript, typescript]
description: Complete guide to Aztec.js library for managing accounts and interacting with contracts on the Aztec network, including installation, importing, and core workflow functions.
references: ["yarn-project/aztec.js/src/*", "yarn-project/wallets/src/*", "yarn-project/accounts/src/*"]
---

import DocCardList from "@theme/DocCardList";

Aztec.js is a library that provides APIs for managing accounts and interacting with contracts on the Aztec network. It communicates with the [Private eXecution Environment (PXE)](../foundational-topics/pxe/index.md) through a `PXE` implementation, allowing developers to easily register new accounts, deploy contracts, view functions, and send transactions.

## Installing

```bash
npm install @aztec-labs/aztec.js@6.0.0-rc.1
```

## Common Dependencies

Most applications will need additional packages alongside `@aztec-labs/aztec.js`, e.g.:

```bash
npm install @aztec-labs/aztec.js@6.0.0-rc.1 \
  @aztec-labs/accounts@6.0.0-rc.1 \
  @aztec-labs/wallets@6.0.0-rc.1 \
  @aztec-labs/noir-contracts.js@6.0.0-rc.1
```

| Package                    | Description                                                   |
| -------------------------- | ------------------------------------------------------------- |
| `@aztec-labs/aztec.js`          | Core SDK for contracts, transactions, and network interaction |
| `@aztec-labs/accounts`          | Account contract implementations (Schnorr, ECDSA)             |
| `@aztec-labs/wallets`           | Simplified wallets for local development and scripting        |
| `@aztec-labs/noir-contracts.js` | Pre-compiled contract interfaces (Token, NFT, etc.)           |

## Package Structure

`@aztec-labs/aztec.js` uses subpath exports. You must import from specific subpaths rather than the package root:

```typescript
import { createAztecNodeClient, waitForNode } from "@aztec-labs/aztec.js/node";
import { Fr } from "@aztec-labs/aztec.js/fields";
import { AztecAddress } from "@aztec-labs/aztec.js/addresses";
```

## AI-Friendly Reference

The [TypeScript API reference](./typescript_api_reference.mdx) links to markdown interface files for common packages for easy use with AI coding assistants. Copy relevant sections to give your AI tool accurate context about Aztec.js APIs.

## Guides

<DocCardList />
