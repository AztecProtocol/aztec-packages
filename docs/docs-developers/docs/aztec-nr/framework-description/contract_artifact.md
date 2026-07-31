---
title: Contract Artifacts
description: Understand the structure and contents of Aztec smart contract artifacts.
tags: [contracts]
sidebar_position: 13
---

Compiling an Aztec contract produces a contract artifact file (`.json`) containing everything needed to interact with that contract: its name, functions, their interfaces, and compiled bytecode. Since private function bytecode is never published to the network, you need this artifact file to call private functions.

:::tip Most developers don't need this
When you [compile a contract](../compiling_contracts.md) and use [`aztec codegen`](../../aztec-js/how_to_deploy_contract.md#generate-typescript-bindings), you get type-safe TypeScript classes that handle artifacts automatically. This page is useful if you're:
- Building custom tooling around Aztec contracts
- Debugging compilation or deployment issues
- Understanding what data is available in artifacts
:::

## Where to Find Artifacts

After running `aztec compile`, artifacts are output to the `target/` directory:

```
target/
└── my_contract-MyContract.json    # Contract artifact
```

Use `aztec codegen` to generate TypeScript bindings from these artifacts for type-safe contract interaction.

## Contract Artifact Structure

A contract artifact contains:

- **`name`**: The contract name as defined in Noir
- **`functions`**: Array of function artifacts (private, public dispatch, and utility functions)
- **`nonDispatchPublicFunctions`**: Public function ABIs (excluding the dispatch function)
- **`outputs`**: Exported structs and globals from the contract
- **`storageLayout`**: Storage slot mappings for contract state
- **`fileMap`**: Source file mappings for debugging

## Function Properties

Each function in the artifact includes:

| Property | Description |
|----------|-------------|
| `name` | Function name as defined in Noir |
| `functionType` | One of `private`, `public`, or `utility` |
| `isOnlySelf` | If `true`, function can only be called from within the same contract |
| `isStatic` | If `true`, function cannot alter state |
| `isInitializer` | If `true`, function can be used as a constructor |
| `parameters` | Array of input parameters with name, type, and visibility |
| `returnType` | The type the function returns, omitted when it returns nothing. Multiple return values are expressed as a single `tuple` type |
| `errorTypes` | Custom error types the function can throw |
| `bytecode` | Compiled ACIR bytecode (base64 encoded) |
| `verificationKey` | Verification key for private functions (optional) |
| `debugSymbols` | Compressed debug information linking to source code |

### Function Types

- **`private`**: Executed and proved locally by the client. Bytecode is not published to the network.
- **`public`**: Executed and proved by the sequencer. Bytecode is published to the network.
- **`utility`**: Executed locally to compute information (e.g., view functions). Cannot be called in transactions.

## Parameter and Return Types

Parameters and return values use these type definitions:

| Type | Description |
|------|-------------|
| `field` | A field element in the BN254 curve's scalar field |
| `boolean` | True/false value |
| `integer` | Whole number with `sign` (`signed`/`unsigned`) and `width` (bits) |
| `array` | Collection of elements with `length` and element `type` |
| `string` | Character sequence with fixed `length` |
| `struct` | Composite type with named `fields` and a `path` identifier |
| `tuple` | Unnamed composite type with ordered `fields` |

Parameter visibility can be `public`, `private`, or `databus`.

## Next Steps

- [Compile contracts](../compiling_contracts.md) to generate artifacts
- [Deploy contracts](../../aztec-js/how_to_deploy_contract.md) using generated TypeScript bindings
- [Send transactions](../../aztec-js/how_to_send_transaction.md) to interact with deployed contracts
