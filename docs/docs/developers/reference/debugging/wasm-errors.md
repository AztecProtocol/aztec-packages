---
title: WASM Errors
tags: [bb.js, wasm, errors, applications, wallets]
---

Developers have limited visibility on bb.js errors due to the WASM having the debug symbols stripped out.

We have several tools available to help make it easier to debug and report issues.

### Specify WASM

The environment variable `BB_WASM_PATH` allows you to replace the WASM that gets loaded into `bb.js`. You can provide an URL that will "hot swap" the wasm to the debug version in order to get stacktraces. You can see an example of how this is done in the playground here:

#include_code bb-wasm-path playground/vite.config.ts javascript

### Transaction Profiling

Transaction profiling combined with `serializePrivateExecutionSteps` allows devs to generate a `msgpack` file that can be shared to reproduce issues.

:::warning

This file may contain private information. This is intended for development and debugging only and should not be exposed to end users. Anyone you share this information with may have access to your secrets, so it is recommended that you do not use sensitive data when developing.

:::

To do this, start by [profiling your transaction](../../guides/smart_contracts/profiling_transactions.md#profiling-in-aztecjs), getting the `execution-steps` from the resulting `TxProfileResult`.

Pass the `execution-steps` to `serializePrivateExecutionSteps` from the `@aztec/stdlib` to get the `ivcMessagePack`, and download this.

For example:

```ts
const profileTx = await contractInstance.methods
            .claim(jwt as any, emailRegistryAddress)
            .profile({ profileMode: "execution-steps" });

const ivcMessagePack = serializePrivateExecutionSteps(profileTx.executionSteps)
const url = window.URL.createObjectURL(new Blob([ivcMessagePack]))

const link = document.createElement("a")
link.href = url
link.download = "ivc-inputs.msgpack"

document.body.appendChild(link)

link.click()
```
