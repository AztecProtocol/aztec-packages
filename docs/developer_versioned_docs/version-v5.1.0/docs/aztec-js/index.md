---
title: Aztec.js
sidebar_position: 0
tags: [aztec.js, javascript, typescript]
description: Complete guide to Aztec.js library for managing accounts and interacting with contracts on the Aztec network, including installation, importing, and core workflow functions.
---

import DocCardList from "@theme/DocCardList";

Aztec.js is a library that provides APIs for managing accounts and interacting with contracts on the Aztec network. It communicates with the [Private eXecution Environment (PXE)](../foundational-topics/pxe/index.md) through a `PXE` implementation, allowing developers to easily register new accounts, deploy contracts, view functions, and send transactions.

## Installing

```bash
npm install @aztec/aztec.js@5.1.0
```

## Common Dependencies

Most applications will need additional packages alongside `@aztec/aztec.js`, e.g.:

```bash
npm install @aztec/aztec.js@5.1.0 \
  @aztec/accounts@5.1.0 \
  @aztec/wallets@5.1.0 \
  @aztec/noir-contracts.js@5.1.0
```

| Package                    | Description                                                   |
| -------------------------- | ------------------------------------------------------------- |
| `@aztec/aztec.js`          | Core SDK for contracts, transactions, and network interaction |
| `@aztec/accounts`          | Account contract implementations (Schnorr, ECDSA)             |
| `@aztec/wallets`           | Simplified wallets for local development and scripting        |
| `@aztec/noir-contracts.js` | Pre-compiled contract interfaces (Token, NFT, etc.)           |

## Package Structure

`@aztec/aztec.js` uses subpath exports. You must import from specific subpaths rather than the package root:

```typescript
import { createAztecNodeClient, waitForNode } from "@aztec/aztec.js/node";
import { Fr } from "@aztec/aztec.js/fields";
import { AztecAddress } from "@aztec/aztec.js/addresses";
```

## AI-Friendly Reference

The [TypeScript API reference](./typescript_api_reference.mdx) links to markdown interface files for common packages for easy use with AI coding assistants. Copy relevant sections to give your AI tool accurate context about Aztec.js APIs.

## Guides

<DocCardList />
