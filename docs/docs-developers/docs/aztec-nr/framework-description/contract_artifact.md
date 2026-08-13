---
title: Contract Artifacts
description: Understand the structure and contents of Aztec smart contract artifacts.
tags: [contracts]
sidebar_position: 13
references: ["noir-projects/labs/noir-contracts/contracts/test/test_contract/src/main.nr", "yarn-project/stdlib/src/abi/contract_artifact.ts", "yarn-project/builder/src/contract-interface-gen/typescript.ts"]
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

## Exported globals

Add `#[abi(tag)]` to a public Noir global to export its name and value in the contract artifact. A tag groups related globals, and you can apply the same tag to multiple globals:

```noir
use aztec::macros::aztec;

#[aztec]
pub contract Globals {
    #[abi(constants)]
    pub global EXPORTED_FIELD_CONSTANT: Field = 1234;
    #[abi(constants)]
    pub global EXPORTED_STRING_CONSTANT: str<8> = "exported";
    #[abi(limits)]
    pub global EXPORTED_LIMIT_CONSTANT: u32 = 100;
    #[abi(constants)]
    #[abi(limits)]
    pub global EXPORTED_SHARED_CONSTANT: u32 = 7;
}
```

The example creates two groups under `outputs.globals`: `constants` and `limits`. Each group is an array of `{ name, value }` entries. Stacking attributes on `EXPORTED_SHARED_CONSTANT` exports the same global under both tags.

In TypeScript application code, run `aztec codegen` and read exported globals from the generated contract class. Codegen derives a static, read-only `globals` getter from `ContractArtifact.outputs.globals`, with decoded values grouped by tag:

```typescript
GlobalsContract.globals.constants.EXPORTED_FIELD_CONSTANT; // 1234n
GlobalsContract.globals.constants.EXPORTED_STRING_CONSTANT; // 'exported'
GlobalsContract.globals.limits.EXPORTED_LIMIT_CONSTANT; // 100n
GlobalsContract.globals.constants.EXPORTED_SHARED_CONSTANT; // 7n
GlobalsContract.globals.limits.EXPORTED_SHARED_CONSTANT; // 7n
```

The generated `globals` getter omits the `storage` tag. Aztec.nr reserves that tag for the generated storage layout, which the contract class exposes through its `storage` getter.

When building tooling that works directly with artifacts instead of generated contract classes, use `getGlobalsByTag` to return the named entries for one tag as raw `AbiValue` objects:

```typescript
import { getGlobalsByTag } from '@aztec/aztec.js/abi';

const constants = getGlobalsByTag(GlobalsContract.artifact, 'constants');
const exportedString = constants.EXPORTED_STRING_CONSTANT;
// { kind: 'string', value: 'exported' }
```

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
