---
title: Outbox
description: Learn about the outbox mechanism in Aztec portals for sending messages to L1.
tags: [portals, contracts]
---

The `Outbox` is a contract deployed on L1 that handles message passing from L2 to L1. Portal contracts call `consume()` to receive and process messages that were sent from L2 contracts. The Rollup contract inserts message roots via `insert()` when epochs are proven.

**Links**: [Interface](https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260118/l1-contracts/src/core/interfaces/messagebridge/IOutbox.sol), [Implementation](https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260118/l1-contracts/src/core/messagebridge/Outbox.sol).

## `insert()`

Inserts the root of a merkle tree containing all of the L2 to L1 messages in an epoch. This function is only callable by the Rollup contract.

```solidity title="outbox_insert" showLineNumbers 
/**
 * @notice Inserts the root of a merkle tree containing all of the L2 to L1 messages in an epoch specified by _epoch.
 * @dev Only callable by the rollup contract
 * @dev Emits `RootAdded` upon inserting the root successfully
 * @param _epoch - The epoch in which the L2 to L1 messages reside
 * @param _root - The merkle root of the tree where all the L2 to L1 messages are leaves
 */
function insert(Epoch _epoch, bytes32 _root) external;
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260118/l1-contracts/src/core/interfaces/messagebridge/IOutbox.sol#L18-L27" target="_blank" rel="noopener noreferrer">Source code: l1-contracts/src/core/interfaces/messagebridge/IOutbox.sol#L18-L27</a></sub></sup>


| Name           | Type      | Description                                                            |
| -------------- | --------- | ---------------------------------------------------------------------- |
| `_epochNumber` | `uint256` | The epoch number in which the L2 to L1 messages reside                 |
| `_root`        | `bytes32` | The merkle root of the tree where all the L2 to L1 messages are leaves |

### Edge cases

- Will revert with `Outbox__Unauthorized()` if `msg.sender != ROLLUP_CONTRACT`.

## `consume()`

Allows a recipient to consume a message from the `Outbox`.

```solidity title="outbox_consume" showLineNumbers 
/**
 * @notice Consumes an entry from the Outbox
 * @dev Only useable by portals / recipients of messages
 * @dev Emits `MessageConsumed` when consuming messages
 * @param _message - The L2 to L1 message
 * @param _epoch - The epoch that contains the message we want to consume
 * @param _leafIndex - The index at the level in the epoch message tree where the message is located
 * @param _path - The sibling path used to prove inclusion of the message, the _path length depends
 * on the location of the L2 to L1 message in the epoch message tree.
 */
function consume(
  DataStructures.L2ToL1Msg calldata _message,
  Epoch _epoch,
  uint256 _leafIndex,
  bytes32[] calldata _path
) external;
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260118/l1-contracts/src/core/interfaces/messagebridge/IOutbox.sol#L29-L46" target="_blank" rel="noopener noreferrer">Source code: l1-contracts/src/core/interfaces/messagebridge/IOutbox.sol#L29-L46</a></sub></sup>


| Name           | Type        | Description                                                                |
| -------------- | ----------- | -------------------------------------------------------------------------- |
| `_message`     | `L2ToL1Msg` | The L2 to L1 message to consume                                            |
| `_epochNumber` | `uint256`   | The epoch number specifying the epoch that contains the message to consume |
| `_leafIndex`   | `uint256`   | The index inside the merkle tree where the message is located              |
| `_path`        | `bytes32[]` | The sibling path used to prove inclusion of the message                    |

### Edge cases

- Will revert with `Outbox__PathTooLong()` if the path length is >= 256.
- Will revert with `Outbox__LeafIndexOutOfBounds(uint256 leafIndex, uint256 pathLength)` if the leaf index exceeds the tree capacity for the given path length.
- Will revert with `Outbox__VersionMismatch(uint256 expected, uint256 actual)` if the message version does not match the Outbox version.
- Will revert with `Outbox__InvalidRecipient(address expected, address actual)` if `msg.sender != _message.recipient.actor`.
- Will revert with `Outbox__InvalidChainId()` if `block.chainid != _message.recipient.chainId`.
- Will revert with `Outbox__NothingToConsumeAtEpoch(uint256 epochNumber)` if the root for the epoch has not been set.
- Will revert with `Outbox__AlreadyNullified(uint256 epochNumber, uint256 leafIndex)` if the message has already been consumed.
- Will revert with `MerkleLib__InvalidIndexForPathLength()` if the leaf index has bits set beyond the tree height.
- Will revert with `MerkleLib__InvalidRoot(bytes32 expected, bytes32 actual, bytes32 leaf, uint256 leafIndex)` if the merkle proof verification fails.

## `hasMessageBeenConsumedAtEpoch()`

Checks if an L2 to L1 message in a specific epoch has been consumed.

```solidity title="outbox_has_message_been_consumed_at_epoch_and_index" showLineNumbers 
/**
 * @notice Checks to see if an L2 to L1 message in a specific epoch has been consumed
 * @dev - This function does not throw. Out-of-bounds access is considered valid, but will always return false
 * @param _epoch - The epoch that contains the message we want to check
 * @param _leafId - The unique id of the message leaf
 */
function hasMessageBeenConsumedAtEpoch(Epoch _epoch, uint256 _leafId) external view returns (bool);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260118/l1-contracts/src/core/interfaces/messagebridge/IOutbox.sol#L48-L56" target="_blank" rel="noopener noreferrer">Source code: l1-contracts/src/core/interfaces/messagebridge/IOutbox.sol#L48-L56</a></sub></sup>


| Name           | Type      | Description                                                              |
| -------------- | --------- | ------------------------------------------------------------------------ |
| `_epochNumber` | `uint256` | The epoch number specifying the epoch that contains the message to check |
| `_leafId`      | `uint256` | The unique id of the message leaf                                        |

### Edge cases

- This function does not throw. Out-of-bounds access is considered valid, but will always return false.

## `getRootData()`

Returns the merkle root for a given epoch number. Returns `bytes32(0)` if the epoch has not been proven.

```solidity
function getRootData(uint256 _epochNumber) external view returns (bytes32);
```

| Name           | Type      | Description                                 |
| -------------- | --------- | ------------------------------------------- |
| `_epochNumber` | `uint256` | The epoch number to fetch the root data for |

**Returns**: The merkle root of the L2 to L1 message tree for the epoch, or `bytes32(0)` if not proven.

## Related pages

- [Inbox](./inbox.md) - L1 to L2 message passing
- [Data Structures](./data_structures.md) - Message struct definitions
- [L1-L2 Communication (Portals)](./index.md) - Overview of cross-chain messaging
