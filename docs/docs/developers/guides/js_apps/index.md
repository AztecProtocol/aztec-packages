---
title: Aztec.js
tags: [aztec.js, javascript, typescript]
---

import DocCardList from "@theme/DocCardList";

Aztec.js is a library that provides APIs for managing accounts and interacting with contracts on the Aztec network. It communicates with the [Private eXecution Environment (PXE)](../../../aztec/concepts/pxe/index.md) through a `PXE` implementation, allowing developers to easily register new accounts, deploy contracts, view functions, and send transactions.

## Installing

```
npm install @aztec/aztec.js
```

## Importing

At the top of your JavaScript file, you can import what you need, eg:

#include_code import_aztecjs yarn-project/end-to-end/src/e2e_2_pxes.test.ts typescript

## Flow

These are some of the important functions you'll need to use in your Aztec.js:

- [Create an account with `@aztec/accounts`](./create_account.md)
- [Deploy a contract](./deploy_contract.md)
- [Simulate a function call](./call_view_function.md)
- [Send a transaction](./send_transaction.md)
