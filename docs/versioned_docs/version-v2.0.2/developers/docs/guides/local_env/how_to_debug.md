---
title: How to Debug
sidebar_position: 5
tags: [debugging, errors, logging, sandbox, aztec.nr]
description: This guide shows you how to debug issues in your Aztec contracts.
---

This guide shows you how to debug issues in your Aztec development environment.

**Prerequisites:**

- Aztec sandbox running
- Aztec.nr contract or aztec.js application
- Basic understanding of Aztec architecture

## How to Enable Logging

### In Aztec.nr Contracts

```rust
// Import debug logging
use dep::aztec::oracle::debug_log::{ debug_log, debug_log_format, debug_log_field, debug_log_array };

// Log simple messages
debug_log("checkpoint reached");

// Log field values with context
debug_log_format("slot:{0}, hash:{1}", [storage_slot, note_hash]);

// Log single field
debug_log_field(my_field);

// Log arrays
debug_log_array(my_array);
```

### In Sandbox

```bash
# Set log level (options: fatal, error, warn, info, verbose, debug, trace)
LOG_LEVEL=debug aztec start --sandbox

# Different levels for different services
LOG_LEVEL="verbose;info:sequencer" aztec start --sandbox
```

## How to Debug Common Errors

### Contract Errors

| Error                                                    | Solution                                                                                                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Aztec dependency not found`                             | Add to Nargo.toml: `aztec = { git="https://github.com/AztecProtocol/aztec-packages/", tag="v2.0.2", directory="noir-projects/aztec-nr/aztec" }` |
| `Public state writes only supported in public functions` | Move state writes to public functions                                                                                                                           |
| `Unknown contract 0x0`                                   | Call `pxe.addContracts(...)` to register contract                                                                                                               |
| `No public key registered for address`                   | Call `pxe.registerRecipient(...)` or `pxe.registerAccount(...)`                                                                                                 |
| `Failed to solve brillig function`                       | Check function parameters and note validity                                                                                                                     |

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
# Archiver sync issues - force progress with dummy transactions
aztec-wallet send transfer --from test0 --to test0 --amount 0
aztec-wallet send transfer --from test0 --to test0 --amount 0

# L1 to L2 message pending - wait for inclusion
# Messages need 2 blocks to be processed
```

## How to Debug WASM Errors

### Enable Debug WASM

```javascript
// In vite.config.ts or similar
export default {
  define: {
    "process.env.BB_WASM_PATH": JSON.stringify("https://debug.wasm.url"),
  },
};
```

### Profile Transactions

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

## How to Interpret Error Messages

### Kernel Circuit Errors (2xxx)

- **Private kernel errors (2xxx)**: Issues with private function execution
- **Public kernel errors (3xxx)**: Issues with public function execution
- **Rollup errors (4xxx)**: Block production issues
- **Generic errors (7xxx)**: Resource limits or state validation

### Transaction Limits

Current limits that trigger `7009 - ARRAY_OVERFLOW`:

- Max new notes per tx: Check `MAX_NOTE_HASHES_PER_TX`
- Max nullifiers per tx: Check `MAX_NULLIFIERS_PER_TX`
- Max function calls: Check call stack size limits
- Max L2→L1 messages: Check message limits

## How to Debug Sequencer Issues

### Common Sequencer Errors

| Error                                | Cause                 | Solution                                   |
| ------------------------------------ | --------------------- | ------------------------------------------ |
| `tree root mismatch`                 | State inconsistency   | Restart sandbox or check state transitions |
| `next available leaf index mismatch` | Tree corruption       | Verify tree updates are sequential         |
| `Public call stack size exceeded`    | Too many public calls | Reduce public function calls               |
| `Failed to publish block`            | L1 submission failed  | Check L1 connection and gas                |

## How to Report Issues

When debugging fails:

1. Collect error messages and codes
2. Generate transaction profile (if applicable)
3. Note your environment setup
4. Create issue at [aztec-packages](https://github.com/AztecProtocol/aztec-packages/issues/new)

## Quick Reference

### Enable Verbose Logging

```bash
LOG_LEVEL=verbose aztec start --sandbox
```

### Common Debug Imports

```rust
use dep::aztec::oracle::debug_log::{ debug_log, debug_log_format };
```

### Check Contract Registration

```javascript
await pxe.getContracts();
await pxe.getRegisteredAccounts();
```

### Decode L1 Errors

Check hex errors against [Errors.sol](https://github.com/AztecProtocol/aztec-packages/blob/master/l1-contracts/src/core/libraries/Errors.sol)

## Tips

- Always check logs before diving into circuit errors
- State-related errors often indicate timing issues
- Array overflow errors mean you hit transaction limits
- Use debug WASM for detailed stack traces
- Profile transactions when errors are unclear

## Related Resources

- [Circuit Architecture](../../concepts/advanced/circuits/index.md)
- [Private-Public Execution](../../concepts/smart_contracts/functions/public_private_calls.md)
- [Aztec.nr Dependencies](../../reference/smart_contract_reference/dependencies.md)
