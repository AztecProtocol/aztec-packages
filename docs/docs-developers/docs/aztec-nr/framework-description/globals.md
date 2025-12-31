---
title: Global Variables
description: Access chain ID, block number, timestamps, and gas information in your Aztec contracts
sidebar_position: 9
---

# Global Variables

Similar to Solidity's global `block` variable, Aztec exposes contextual values within each function via the `context` object.

Aztec has two execution environments—Private and Public—each with different available globals.

## Private Global Variables

Private functions access transaction context via `TxContext`:

#include_code tx-context /noir-projects/noir-protocol-circuits/crates/types/src/abis/transaction/tx_context.nr rust

The following fields are accessible via `context` methods:

### Chain Id

The unique identifier for the Aztec network instance (not the Ethereum chain the rollup settles to).

```rust
context.chain_id();
```

### Version

The Aztec protocol version number. The genesis block has version 1.

```rust
context.version();
```

### Gas Settings

The gas limits, max fees per gas, and inclusion fee set by the user for the transaction.

```rust
context.gas_settings();
```

## Public Global Variables

Public functions access block-level context via `GlobalVariables`:

#include_code global-variables /noir-projects/noir-protocol-circuits/crates/types/src/abis/global_variables.nr rust

:::note
Not all fields in `GlobalVariables` are exposed via context methods. The `coinbase`, `fee_recipient`, and `slot_number` fields are used internally by the protocol.
:::

Public functions have access to `chain_id()` and `version()` (same syntax as private), plus the following block-level values:

### Timestamp

The unix timestamp when the block is executed. Provided by the block proposer, so it may have slight variance. Always increases monotonically.

```rust
context.timestamp();
```

### Block Number

The sequential block identifier. Genesis block is 1, incrementing by 1 for each subsequent block.

```rust
context.block_number();
```

### Gas Fees

The current L2 and DA gas prices for the block. You can access gas-related information via:

```rust
context.l2_gas_left();       // Remaining L2 gas
context.da_gas_left();       // Remaining DA gas
context.base_fee_per_l2_gas(); // L2 gas price
context.base_fee_per_da_gas(); // DA gas price
context.transaction_fee();   // Final tx fee (only available in teardown phase)
```

:::info Why do available globals differ between environments?
Private functions execute on the user's device before the transaction is submitted, so they cannot know which block will include the transaction. Therefore, `timestamp` and `block_number` are unavailable in private context.

Public functions execute on a sequencer who knows the current block's timestamp and number, making these values accessible.
:::
