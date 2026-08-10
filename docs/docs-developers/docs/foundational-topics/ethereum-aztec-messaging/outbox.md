---
title: Outbox
description: Learn about the outbox mechanism in Aztec portals for sending messages to L1.
tags: [portals, contracts]
---

The `Outbox` is a contract deployed on L1 that handles message passing from L2 to L1. Portal contracts call `consume()` to receive and process messages that were sent from L2 contracts. The Rollup contract inserts message roots via `insert()` as proofs land. A proof can cover a prefix of an epoch's checkpoints (a partial proof), so an epoch can have several roots, one per number of checkpoints covered.

**Links**: [Interface](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/l1-contracts/src/core/interfaces/messagebridge/IOutbox.sol), [Implementation](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/l1-contracts/src/core/messagebridge/Outbox.sol).

## `insert()`

Inserts the root of a merkle tree containing all of the L2 to L1 messages in an epoch, after a proof covering the first `_numCheckpointsInEpoch` checkpoints of that epoch lands. This function is only callable by the Rollup contract.

#include_code outbox_insert docs/node_modules/@aztec/l1-artifacts/l1-contracts/src/core/interfaces/messagebridge/IOutbox.sol solidity

| Name                     | Type      | Description                                                                                                  |
| ------------------------ | --------- | ------------------------------------------------------------------------------------------------------------ |
| `_epoch`                 | `Epoch`   | The epoch in which the L2 to L1 messages reside                                                              |
| `_numCheckpointsInEpoch` | `uint256` | The number of checkpoints the inserting proof covered in this epoch (in `[1, MAX_CHECKPOINTS_PER_EPOCH]`)    |
| `_root`                  | `bytes32` | The merkle root of the tree where all the L2 to L1 messages are leaves                                       |

### Edge cases

- Will revert with `Outbox__Unauthorized()` if `msg.sender != ROLLUP_CONTRACT`.

## `consume()`

Allows a recipient to consume a message from the `Outbox`.

#include_code outbox_consume docs/node_modules/@aztec/l1-artifacts/l1-contracts/src/core/interfaces/messagebridge/IOutbox.sol solidity

| Name                     | Type        | Description                                                                                          |
| ------------------------ | ----------- | ---------------------------------------------------------------------------------------------------- |
| `_message`                | `L2ToL1Msg` | The L2 to L1 message to consume                                                                      |
| `_epoch`                  | `Epoch`     | The epoch that contains the message to consume                                                       |
| `_numCheckpointsInEpoch`  | `uint256`   | The number of checkpoints in the partial proof whose root this consume verifies against              |
| `_leafIndex`              | `uint256`   | The index inside the merkle tree where the message is located                                        |
| `_path`                   | `bytes32[]` | The sibling path used to prove inclusion of the message (built against the tree for that proof depth) |

### Edge cases

- Will revert with `Outbox__PathTooLong()` if the path length is >= 256.
- Will revert with `Outbox__LeafIndexOutOfBounds(uint256 leafIndex, uint256 pathLength)` if the leaf index exceeds the tree capacity for the given path length.
- Will revert with `Outbox__VersionMismatch(uint256 expected, uint256 actual)` if the message version does not match the Outbox version.
- Will revert with `Outbox__InvalidRecipient(address expected, address actual)` if `msg.sender != _message.recipient.actor`.
- Will revert with `Outbox__InvalidChainId()` if `block.chainid != _message.recipient.chainId`.
- Will revert with `Outbox__NothingToConsumeAtEpoch(Epoch epoch)` if the root for the epoch has not been set.
- Will revert with `Outbox__AlreadyNullified(Epoch epoch, uint256 leafIndex)` if the message has already been consumed.
- Will revert with `MerkleLib__InvalidIndexForPathLength()` if the leaf index has bits set beyond the tree height.
- Will revert with `MerkleLib__InvalidRoot(bytes32 expected, bytes32 actual, bytes32 leaf, uint256 leafIndex)` if the merkle proof verification fails.

## `hasMessageBeenConsumedAtEpoch()`

Checks if an L2 to L1 message in a specific epoch has been consumed.

#include_code outbox_has_message_been_consumed_at_epoch_and_index docs/node_modules/@aztec/l1-artifacts/l1-contracts/src/core/interfaces/messagebridge/IOutbox.sol solidity

| Name      | Type      | Description                                                  |
| --------- | --------- | ------------------------------------------------------------ |
| `_epoch`  | `Epoch`   | The epoch that contains the message to check                 |
| `_leafId` | `uint256` | The unique id of the message leaf                            |

### Edge cases

- This function does not throw. Out-of-bounds access is considered valid, but will always return false.

## `getRootData()`

Returns the merkle root for a given epoch and partial-proof depth. Returns `bytes32(0)` if no proof covering that number of checkpoints has been inserted.

```solidity
function getRootData(Epoch _epoch, uint256 _numCheckpointsInEpoch) external view returns (bytes32);
```

| Name                     | Type      | Description                                                          |
| ------------------------ | --------- | -------------------------------------------------------------------- |
| `_epoch`                 | `Epoch`   | The epoch to fetch the root data for                                 |
| `_numCheckpointsInEpoch` | `uint256` | The number of checkpoints in the partial proof whose root to fetch   |

**Returns**: The merkle root of the L2 to L1 message tree for that epoch and proof depth, or `bytes32(0)` if not proven.

There is also `getRoots(Epoch _epoch)`, which returns every root stored for an epoch: slot `i` of the returned array holds the root for `numCheckpointsInEpoch = i + 1`.

## Related pages

- [Inbox](./inbox.md) - L1 to L2 message passing
- [Data Structures](./data_structures.md) - Message struct definitions
- [L1-L2 Communication (Portals)](./index.md) - Overview of cross-chain messaging
