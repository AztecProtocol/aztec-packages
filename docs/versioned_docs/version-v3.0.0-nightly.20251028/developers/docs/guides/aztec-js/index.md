---
title: Aztec.js
sidebar_position: 0
tags: [aztec.js, javascript, typescript]
description: Complete guide to Aztec.js library for managing accounts and interacting with contracts on the Aztec network, including installation, importing, and core workflow functions.
---

import DocCardList from "@theme/DocCardList";

Aztec.js is a library that provides APIs for managing accounts and interacting with contracts on the Aztec network. It communicates with the [Private eXecution Environment (PXE)](../../concepts/pxe/index.md) through a `PXE` implementation, allowing developers to easily register new accounts, deploy contracts, view functions, and send transactions.

## Installing

```bash
npm install @aztec/aztec.js
```

## Importing

At the top of your JavaScript file, you can import what you need, eg:

```typescript
import {
  createPXEClient,
  waitForPXE,
} from '@aztec/aztec.js';
```

## Flow

These are some of the important functions you'll need to use in your Aztec.js:

- [Create an account with `@aztec/accounts`](./how_to_create_account.md)
- [Deploy a contract](./how_to_deploy_contract.md)
- [Simulate a function call](./how_to_simulate_function.md)
- [Send a transaction](./how_to_send_transaction.md)
