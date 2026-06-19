---
title: Debugging Aztec Code
sidebar_position: 5
tags: [debugging, errors, local_network, aztec.nr]
description: This guide shows you how to debug issues in your Aztec contracts.
---

This guide shows you how to debug issues in your Aztec development environment.

## Prerequisites

- Running Aztec local network
- Aztec.nr contract or aztec.js application
- Basic understanding of Aztec architecture

## Enable logging

For adding log statements to your contracts, controlling log verbosity, and understanding the `LOG_LEVEL` syntax, see the [Logging from Contracts](./logging.md) guide.

To enable verbose system-level logging on a local network:

```bash
LOG_LEVEL=verbose aztec start --local-network
```

## Debugging common errors

### Contract Errors

| Error                                                    | Solution                                                                                                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Aztec dependency not found`                             | Add to Nargo.toml: `aztec = { git="https://github.com/AztecProtocol/aztec-packages/", tag="v5.0.0-rc.1", directory="noir-projects/aztec-nr/aztec" }` |
| `Public state writes only supported in public functions` | Move state writes to public functions                                                                                                                           |
| `Unknown contract 0x0`                                   | Call `wallet.registerContract(...)` to register contract                                                                                                        |
| `No public key registered for address`                   | Call `wallet.registerSender(...)`                                                                                                                               |
| `Direct invocation of ... functions is not supported`    | Use `self.call()`, `self.view()`, or `self.enqueue()` to [call contract functions](framework-description/calling_contracts.md) |
| `Failed to solve brillig function`                       | Check function parameters and note validity                                                                                                                     |
| `Cross-contract utility call denied`                     | Configure an `authorizeUtilityCall` [execution hook](#cross-contract-utility-call-denied) on your PXE                                                           |

#### Cross-contract utility call denied

Utility functions execute on the user's device and have access to private state. A cross-contract utility call made by
a malicious or compromised contract could leak private information to an untrusted contract. PXE therefore denies cross-
contract utility calls by default and requires explicit authorization via an execution hook. Calls to standard contracts
(such as the HandshakeRegistry, which is queried during every contract's sync) are always automatically authorized.

When a contract executes a utility function that calls into a different contract, PXE asks an **execution hook** whether the call should be allowed. If no hook is configured, or the hook denies the request, you will see:

```
Cross-contract utility call denied: <reason>. <caller> attempted to call <target>:<selector> (<name>).
```

##### In production

Pass an `authorizeUtilityCall` hook when creating your PXE:

```typescript
import { PXE } from "@aztec/pxe/server";

const pxe = await PXE.create({
  // ...other options
  hooks: {
    authorizeUtilityCall: async (request) => {
      // Inspect request.caller, request.target, request.functionSelector, etc.
      return { authorized: true };
    },
  },
});
```

The hook receives a `UtilityCallAuthorizationRequest` with the caller and target addresses, their contract class IDs, function selector, function name, arguments, and caller context (`'private'`, `'private view'`, or `'utility'`). Return `{ authorized: true }` to allow or `{ authorized: false, reason: '...' }` to deny with a message.

##### In Noir tests

When testing cross-contract utility calls in the Noir test environment (TXE), use `with_authorized_utility_call_targets` on your call options:

```rust
// For private calls:
env.call_private_opts(
    account,
    CallPrivateOptions::new().with_authorized_utility_call_targets([target_address]),
    MyContract::at(caller).some_private_fn(),
);

// For private view calls:
env.view_private_opts(
    account,
    ViewPrivateOptions::new().with_authorized_utility_call_targets([target_address]),
    MyContract::at(caller).some_view_fn(),
);

// For utility calls:
env.execute_utility_opts(
    ExecuteUtilityOptions::new().with_authorized_utility_call_targets([target_address]),
    MyContract::at(caller).some_utility_fn(),
);
```

### Circuit Errors

| Error Code  | Meaning                      | Fix                                                |
| ----------- | ---------------------------- | -------------------------------------------------- |
| `2002`      | Invalid contract address     | Ensure contract is deployed and address is correct |
| `2005/2006` | Static call violations       | Remove state modifications from static calls       |
| `2017`      | User intent mismatch         | Verify transaction parameters match function call  |
| `3001`      | Unsupported operation        | Check if operation is supported in current context |
| `3005`      | Non-empty private call stack | Ensure private functions complete before public    |
| `4007/4008` | Chain ID/version mismatch    | Verify L1 chain ID and Aztec version               |
| `7008`      | Membership check failed      | Ensure using valid historical state                |
| `7009`      | Array overflow               | Reduce number of operations in transaction         |

### Quick Fixes for Common Issues

```bash
# Archiver sync issues - force progress with dummy transactions.
# Assumes you have imported the local network test accounts
# (aztec-wallet import-test-accounts) and have a deployed token
# aliased as `testtoken`.
aztec-wallet send transfer --from test0 --contract-address testtoken --args accounts:test0 0
aztec-wallet send transfer --from test0 --contract-address testtoken --args accounts:test0 0

# L1 to L2 message pending - wait for inclusion
# Messages need 2 blocks to be processed
```

## Debugging WASM errors

### Enable debug WASM

```javascript
// In vite.config.ts or similar
export default {
  define: {
    "process.env.BB_WASM_PATH": JSON.stringify("https://debug.wasm.url"),
  },
};
```

### Profile transactions

```javascript
import { serializePrivateExecutionSteps } from "@aztec/stdlib";

// Profile the transaction
const profileTx = await contract.methods
  .myMethod(param1, param2)
  .profile({ profileMode: "execution-steps" });

// Serialize for debugging
const ivcMessagePack = serializePrivateExecutionSteps(profileTx.executionSteps);

// Download debug file
const blob = new Blob([ivcMessagePack]);
const url = URL.createObjectURL(blob);
const link = document.createElement("a");
link.href = url;
link.download = "debug-steps.msgpack";
link.click();
```

⚠️ **Warning:** Debug files may contain private data. Use only in development.

## Interpret error messages

### Circuit and protocol errors

- **Private kernel errors (2xxx)**: Issues with private function execution
- **Public kernel errors (3xxx)**: Issues with public function execution
- **Rollup errors (4xxx)**: Block production issues
- **Generic errors (7xxx)**: Resource limits or state validation

### Transaction limits

Current limits that trigger `7009 - ARRAY_OVERFLOW`:

- Max new notes per tx: Check `MAX_NOTE_HASHES_PER_TX`
- Max nullifiers per tx: Check `MAX_NULLIFIERS_PER_TX`
- Max function calls: Check call stack size limits
- Max L2→L1 messages: Check message limits

## Debugging sequencer issues

### Common sequencer errors

| Error                                | Cause                 | Solution                                   |
| ------------------------------------ | --------------------- | ------------------------------------------ |
| `tree root mismatch`                 | State inconsistency   | Restart local network or check state transitions |
| `next available leaf index mismatch` | Tree corruption       | Verify tree updates are sequential         |
| `Public call stack size exceeded`    | Too many public calls | Reduce public function calls               |
| `Failed to publish block`            | L1 submission failed  | Check L1 connection and gas                |

## Reporting issues

When debugging fails:

1. Collect error messages and codes
2. Generate transaction profile (if applicable)
3. Note your environment setup
4. Create issue at [aztec-packages](https://github.com/AztecProtocol/aztec-packages/issues/new)

## Quick reference

### Enable verbose logging

```bash
LOG_LEVEL=verbose aztec start --local-network
```

### Contract logging

See the full [Logging from Contracts](./logging.md) guide for all available log functions and `LOG_LEVEL` configuration.

```rust
use aztec::oracle::logging::{debug_log, debug_log_format};
```

### Check contract registration

```javascript
await wallet.getContractMetadata(myContractInstance.address);
```

### Decode L1 errors

Check hex errors against [Errors.sol](https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/l1-contracts/src/core/libraries/Errors.sol)

## Tips

- Always check logs before diving into circuit errors
- State-related errors often indicate timing issues
- Array overflow errors mean you hit transaction limits
- Use debug WASM for detailed stack traces
- Profile transactions when errors are unclear

## Next steps

- [Circuit Architecture](../foundational-topics/advanced/circuits/index.md)
- [Call Types](../foundational-topics/call_types.md)
- [Aztec.nr Dependencies](./framework-description/dependencies.md)
