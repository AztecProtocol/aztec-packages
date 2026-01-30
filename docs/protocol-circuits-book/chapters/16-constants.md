# Chapter 16: Protocol Constants and Limits

## Overview

This chapter documents the key constants and limits defined in the Aztec protocol. These values are critical for understanding system capacity and constraints.

## Tree Parameters

### Tree Heights

| Tree | Height | Capacity |
|------|--------|----------|
| Note Hash Tree | 42 | ~4.4 trillion |
| Nullifier Tree | 42 | ~4.4 trillion |
| Public Data Tree | 40 | ~1.1 trillion |
| L1-to-L2 Message Tree | 36 | ~68 billion |
| Archive Tree | 30 | ~1 billion |
| Out Hash Tree | 6 | 64 |

### Subtree Heights

| Tree | Subtree Height | Batch Size |
|------|----------------|------------|
| Note Hash | 6 | 64 per TX |
| Nullifier | 6 | 64 per TX |
| Public Data | 6 | 64 per TX |
| L1-to-L2 Message | 10 | 1024 per checkpoint |

## Transaction Limits

### Per-Transaction Limits

| Limit | Value | Notes |
|-------|-------|-------|
| `MAX_NOTE_HASHES_PER_TX` | 64 | 2^6 |
| `MAX_NULLIFIERS_PER_TX` | 64 | 2^6 |
| `MAX_L2_TO_L1_MSGS_PER_TX` | 8 | Cross-chain messages |
| `MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX` | 63 | 64 - 1 (protocol slot) |
| `MAX_PRIVATE_LOGS_PER_TX` | 32 | Encrypted logs |
| `MAX_PUBLIC_LOGS_PER_TX` | 32 | Public logs |
| `MAX_CONTRACT_CLASS_LOGS_PER_TX` | 1 | Contract deployments |

### Per-Call Limits

| Limit | Value | Notes |
|-------|-------|-------|
| `MAX_NOTE_HASHES_PER_CALL` | 16 | Per function call |
| `MAX_NULLIFIERS_PER_CALL` | 16 | Per function call |
| `MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL` | 8 | Nested calls |
| `MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL` | 8 | Queued public calls |
| `MAX_L2_TO_L1_MSGS_PER_CALL` | 2 | Per function call |

## Block and Epoch Limits

### Block Limits

| Limit | Value | Notes |
|-------|-------|-------|
| `MAX_TXS_PER_BLOCK` | Variable | Limited by blob space |
| `MAX_L2_GAS_PER_BLOCK` | Configured | Gas limit |
| `MAX_DA_GAS_PER_BLOCK` | Configured | DA cost limit |

### Checkpoint Limits

| Limit | Value | Notes |
|-------|-------|-------|
| `BLOBS_PER_CHECKPOINT` | 6 | EIP-4844 limit |
| `FIELDS_PER_BLOB` | 4096 | ~128 KB |
| `MAX_FIELDS_PER_CHECKPOINT` | 24,576 | 6 x 4096 |
| `MAX_L1_TO_L2_MSGS_PER_CHECKPOINT` | 1024 | Subtree size |

### Epoch Limits

| Limit | Value | Notes |
|-------|-------|-------|
| `MAX_CHECKPOINTS_PER_EPOCH` | Configured | Epoch boundary |
| `MAX_BLOCKS_PER_EPOCH` | Configured | Multiple checkpoints |

## Hash and Cryptographic Constants

### Domain Separators

Domain separators are computed as `poseidon2_hash('az_name') as u32`
for "nothing up my sleeve" guarantees.

| Separator | Usage |
|-----------|-------|
| `DOM_SEP__NOTE_HASH` | Base note hash |
| `DOM_SEP__UNIQUE_NOTE_HASH` | Uniquified hash |
| `DOM_SEP__SILOED_NOTE_HASH` | Siloed hash |
| `DOM_SEP__SILOED_NULLIFIER` | Siloed nullifier |
| `DOM_SEP__MESSAGE_NULLIFIER` | L1-to-L2 message nullifier |
| `DOM_SEP__NOTE_NULLIFIER` | Note nullifier |
| `DOM_SEP__BLOCK_HEADER_HASH` | Block header hash |
| `DOM_SEP__PRIVATE_FUNCTION_LEAF` | Private function leaf |
| `DOM_SEP__INITIALIZER` | Contract initializer |
| `DOM_SEP__PUBLIC_LEAF_SLOT` | Public storage slot |
| `DOM_SEP__PUBLIC_STORAGE_MAP_SLOT` | Map storage slot |
| `DOM_SEP__PRIVATE_LOG_FIRST_FIELD` | Private log header |

### Generator Indices

Generator indices are used for Pedersen/Poseidon commitments.

## VK Tree Indices

Key verification key indices:

| Index | Circuit |
|-------|---------|
| 0 | Private Kernel Init |
| 1 | Private Kernel Inner |
| 2 | Private Kernel Reset |
| 3 | Private Kernel Tail |
| 4 | Private Kernel TailToPublic |
| 5 | Hiding Kernel to Rollup |
| 6 | Hiding Kernel to Public |
| 7 | Public Chonk Verifier |
| 8 | AVM |
| 9 | TX Base Private |
| 10 | TX Base Public |
| 11 | TX Merge |
| 12 | Block Root First |
| 13 | Block Root |
| 14 | Block Root Single TX |
| 15 | Block Root First Single TX |
| 16 | Block Root First Empty TX |
| 17 | Block Merge |
| 18 | Parity Base |
| 19 | Parity Root |
| 20 | Checkpoint Root |
| 21 | Checkpoint Root Single Block |
| 22 | Checkpoint Merge |
| 23 | Checkpoint Padding |
| 24 | Root Rollup |

## Gas Constants

### Gas Limits

| Parameter | Description |
|-----------|-------------|
| `L2_GAS_LIMIT` | Max L2 gas per TX |
| `DA_GAS_LIMIT` | Max DA gas per TX |
| `TEARDOWN_GAS_LIMIT` | Gas reserved for teardown |

### Gas Prices

Gas prices are set per block by the sequencer:
- `fee_per_l2_gas`: Cost per unit of L2 gas
- `fee_per_da_gas`: Cost per unit of DA gas

## Protocol Addresses

### Protocol Contract Addresses

| Contract | Description |
|----------|-------------|
| FeeJuice | Native fee token |
| Registry | Contract registry |
| Rollup | L1 rollup contract |

### Zero and Max Values

| Constant | Value | Usage |
|----------|-------|-------|
| `EMPTY_HASH` | 0 | Empty commitment |
| `MAX_U32_VALUE` | 2^32 - 1 | Padding counters |
| `MAX_FIELD_VALUE` | p - 1 | Field maximum |

## Array Padding

### Padding Values

Arrays are padded to fixed sizes for circuit efficiency:

```
Note hashes: Padded with 0
Nullifiers: Padded with 0
Logs: Padded with empty structs
Counters: Padded with MAX_U32_VALUE
```

### Why Fixed Sizes?

Circuits require fixed-size inputs. Variable-length data is padded to maximum size, with validation ensuring padding is correct.

## Field Element Size

| Property | Value |
|----------|-------|
| Field modulus (BN254) | ~2^254 |
| Bytes per field | 32 |
| Bits per field | ~254 |

## Blob Encoding

| Property | Value |
|----------|-------|
| Fields per blob | 4096 |
| Bytes per blob | 131,072 (128 KB) |
| Max blobs per checkpoint | 6 |

## Network Parameters

### Timing

| Parameter | Description |
|-----------|-------------|
| Slot duration | Time per slot |
| Epoch duration | Slots per epoch |
| Attestation timeout | Time for attestations |

### Consensus

| Parameter | Description |
|-----------|-------------|
| Committee size | Validators per committee |
| Quorum | Required attestations |

## Summary Tables

### Capacity Summary

| Resource | Limit | Bottleneck |
|----------|-------|------------|
| Notes per TX | 64 | Tree subtree |
| Nullifiers per TX | 64 | Tree subtree |
| TXs per checkpoint | ~Variable | Blob space |
| Fields per checkpoint | 24,576 | Blob count |

### Security Parameters

| Parameter | Value | Security Level |
|-----------|-------|----------------|
| Hash function | Poseidon2 | 128-bit |
| Curve | BN254 | 128-bit |
| Proof system | Honk | 128-bit |

## Updating Constants

Constants are defined in:
- `noir-projects/noir-protocol-circuits/crates/types/src/constants.nr`
- Protocol configuration files

Changing constants may require:
- Circuit recompilation
- VK tree regeneration
- Network upgrade coordination

\newpage
