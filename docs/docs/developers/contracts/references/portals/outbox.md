---
title: Outbox
---

The `Outbox` is a contract deployed on L1 that handles message passing from the rollup and to L1.

**Links**: [Interface](https://github.com/AztecProtocol/aztec-packages/blob/master/l1-contracts/src/core/interfaces/messagebridge/IOutbox.sol), [Implementation](https://github.com/AztecProtocol/aztec-packages/blob/master/l1-contracts/src/core/messagebridge/Outbox.sol).

## `insert()`

Inserts multiple messages from the `Rollup`.

#include_code outbox_insert l1-contracts/src/core/interfaces/messagebridge/IOutbox.sol solidity

| Name           | Type    | Description |
| -------------- | ------- | ----------- |
| `_entryKeys`         | `bytes32[]` | A list of message hashes to insert into the outbox for later consumption |

#### Edge cases

- Will revert with `Registry__RollupNotRegistered(address rollup)` if `msg.sender` is not registered as a rollup on the [`Registry`](./registry.md)
- Will revert `Outbox__IncompatibleEntryArguments(bytes32 entryKey, uint64 storedFee, uint64 feePassed, uint32 storedVersion, uint32 versionPassed, uint32 storedDeadline, uint32 deadlinePassed)` if insertion is not possible due to invalid entry arguments.

## `consume()`

Allows a recipient to consume a message from the `Outbox`.

#include_code outbox_consume l1-contracts/src/core/interfaces/messagebridge/IOutbox.sol solidity


| Name           | Type        | Description |
| -------------- | -------     | ----------- |
| `_message`     | `L2ToL1Msg` | The message to consume |
| ReturnValue    | `bytes32`   | The hash of the message | 

#### Edge cases

- Will revert with `Outbox__Unauthorized()` if `msg.sender != _message.recipient.actor`. 
- Will revert with `Outbox__InvalidChainId()` if `block.chainid != _message.recipient.chainId`.
- Will revert with `Outbox__NothingToConsume(bytes32 entryKey)` if the message does not exist.
- Will revert with `Outbox__InvalidVersion(uint256 entry, uint256 message)` if the version of the entry and message sender don't match (wrong rollup).

#### Edge cases
- Will revert with `Outbox__NothingToConsume(bytes32 entryKey)` if the message does not exist.

## `hasMessageBeenConsumedAtBlockAndIndex()`

Allows a recipient to consume a message from the `Outbox`.

#include_code outbox_has_message_been_consumed_at_block_and_index l1-contracts/src/core/interfaces/messagebridge/IOutbox.sol solidity


| Name           | Type        | Description |
| -------------- | -------     | ----------- |
| `_message`     | `L2ToL1Msg` | The message to consume |
| ReturnValue    | `bytes32`   | The hash of the message | 

#### Edge cases
- Will revert with `Outbox__NothingToConsume(bytes32 entryKey)` if the message does not exist.
