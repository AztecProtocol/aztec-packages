---
title: Data Structures
description: Learn about the data structures used in Aztec portals for L1-L2 communication.
---

This page documents the Solidity structs used for L1-L2 message passing in the Aztec protocol.

**Source**: [DataStructures.sol](https://github.com/AztecProtocol/aztec-packages/blob/v3.0.0-nightly.20260105/l1-contracts/src/core/libraries/DataStructures.sol)

## `L1Actor`

An entity on L1, specifying the address and the chainId. Used when specifying a sender or recipient on L1.

```solidity title="l1_actor" showLineNumbers 
/**
 * @notice Actor on L1.
 * @param actor - The address of the actor
 * @param chainId - The chainId of the actor
 */
struct L1Actor {
  address actor;
  uint256 chainId;
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v3.0.0-nightly.20260105/l1-contracts/src/core/libraries/DataStructures.sol#L11-L22" target="_blank" rel="noopener noreferrer">Source code: l1-contracts/src/core/libraries/DataStructures.sol#L11-L22</a></sub></sup>


## `L2Actor`

An entity on L2, specifying the Aztec address and the protocol version. Used when specifying a sender or recipient on L2.

```solidity title="l2_actor" showLineNumbers 
/**
 * @notice Actor on L2.
 * @param actor - The aztec address of the actor
 * @param version - Ahe Aztec instance the actor is on
 */
struct L2Actor {
  bytes32 actor;
  uint256 version;
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v3.0.0-nightly.20260105/l1-contracts/src/core/libraries/DataStructures.sol#L24-L35" target="_blank" rel="noopener noreferrer">Source code: l1-contracts/src/core/libraries/DataStructures.sol#L24-L35</a></sub></sup>


## `L1ToL2Msg`

A message sent from L1 to L2. The `secretHash` field contains the hash of a secret pre-image that must be known to consume the message on L2. Use [`computeSecretHash`](https://github.com/AztecProtocol/aztec-packages/blob/v3.0.0-nightly.20260105/yarn-project/stdlib/src/hash/hash.ts) to compute it from a secret.

```solidity title="l1_to_l2_msg" showLineNumbers 
/**
 * @notice Struct containing a message from L1 to L2
 * @param sender - The sender of the message
 * @param recipient - The recipient of the message
 * @param content - The content of the message (application specific) padded to bytes32 or hashed if larger.
 * @param secretHash - The secret hash of the message (make it possible to hide when a specific message is consumed on
 * L2).
 * @param index - Global leaf index on the L1 to L2 messages tree.
 */
struct L1ToL2Msg {
  L1Actor sender;
  L2Actor recipient;
  bytes32 content;
  bytes32 secretHash;
  uint256 index;
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v3.0.0-nightly.20260105/l1-contracts/src/core/libraries/DataStructures.sol#L37-L55" target="_blank" rel="noopener noreferrer">Source code: l1-contracts/src/core/libraries/DataStructures.sol#L37-L55</a></sub></sup>


## `L2ToL1Msg`

A message sent from L2 to L1.

```solidity title="l2_to_l1_msg" showLineNumbers 
/**
 * @notice Struct containing a message from L2 to L1
 * @param sender - The sender of the message
 * @param recipient - The recipient of the message
 * @param content - The content of the message (application specific) padded to bytes32 or hashed if larger.
 * @dev Not to be confused with L2ToL1Message in Noir circuits
 */
struct L2ToL1Msg {
  DataStructures.L2Actor sender;
  DataStructures.L1Actor recipient;
  bytes32 content;
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v3.0.0-nightly.20260105/l1-contracts/src/core/libraries/DataStructures.sol#L57-L70" target="_blank" rel="noopener noreferrer">Source code: l1-contracts/src/core/libraries/DataStructures.sol#L57-L70</a></sub></sup>


## See also

- [Inbox](./inbox.md) - L1 contract for sending messages to L2
- [Outbox](./outbox.md) - L1 contract for consuming messages from L2
- [Portal messaging overview](./index.md) - How L1-L2 messaging works
