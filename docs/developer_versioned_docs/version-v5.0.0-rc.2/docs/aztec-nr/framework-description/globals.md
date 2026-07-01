---
title: Global Variables
description: Access chain ID, block number, timestamps, and gas information in your Aztec contracts
sidebar_position: 10
references: ["noir-projects/noir-protocol-circuits/crates/types/src/abis/*"]
---

# Global Variables

Similar to Solidity's global `block` variable, Aztec exposes contextual values within each function via the `context` object.

Aztec has two execution environments—Private and Public—each with different available globals.

## Private Global Variables

Private functions access transaction context via `TxContext`:

```rust title="tx-context" showLineNumbers 
#[derive(Deserialize, Eq, Serialize)]
pub struct TxContext {
    // The chain ID on which this transaction is executed.
    pub chain_id: Field,
    // The version of the L1 Rollup contract.
    pub version: Field,
    // The gas settings for the transaction.
    pub gas_settings: GasSettings,
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.2/noir-projects/noir-protocol-circuits/crates/types/src/abis/transaction/tx_context.nr#L8-L18" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-protocol-circuits/crates/types/src/abis/transaction/tx_context.nr#L8-L18</a></sub></sup>


The following fields are accessible via `context` methods:

### Chain Id

The unique identifier for the Aztec network instance (not the Ethereum chain the rollup settles to).

```rust
self.context.chain_id();
```

### Version

The Aztec protocol version number. The genesis block has version 1.

```rust
self.context.version();
```

### Gas Settings

The gas limits, max fees per gas, and inclusion fee set by the user for the transaction.

```rust
self.context.gas_settings();
```

## Public Global Variables

Public functions access block-level context via `GlobalVariables`:

```rust title="global-variables" showLineNumbers 
#[derive(Deserialize, Eq, Serialize)]
pub struct GlobalVariables {
    pub chain_id: Field,
    pub version: Field,
    pub block_number: u32,
    pub slot_number: Field,
    pub timestamp: u64,
    pub coinbase: EthAddress,
    pub fee_recipient: AztecAddress,
    pub gas_fees: GasFees,
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.2/noir-projects/noir-protocol-circuits/crates/types/src/abis/global_variables.nr#L7-L19" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-protocol-circuits/crates/types/src/abis/global_variables.nr#L7-L19</a></sub></sup>


:::note
Not all fields in `GlobalVariables` are exposed via context methods. The `coinbase`, `fee_recipient`, and `slot_number` fields are used internally by the protocol.
:::

Public functions have access to `chain_id()` and `version()` (same syntax as private), plus the following block-level values:

### Timestamp

The unix timestamp when the block is executed. Provided by the block proposer, so it may have slight variance. Always increases monotonically.

```rust
self.context.timestamp();
```

### Block Number

The sequential block identifier. Genesis block is 1, incrementing by 1 for each subsequent block.

```rust
self.context.block_number();
```

### Gas Fees

The current L2 and DA gas prices for the block. You can access gas-related information via:

```rust
self.context.l2_gas_left();       // Remaining L2 gas
self.context.da_gas_left();       // Remaining DA gas
self.context.min_fee_per_l2_gas(); // L2 gas price
self.context.min_fee_per_da_gas(); // DA gas price
self.context.transaction_fee();   // Final tx fee (only available in teardown phase)
```

:::info Why do available globals differ between environments?
Private functions execute on the user's device before the transaction is submitted, so they cannot know which block will include the transaction. Therefore, `timestamp` and `block_number` are unavailable in private context.

Public functions execute on a sequencer who knows the current block's timestamp and number, making these values accessible.
:::
