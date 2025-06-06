---
title: Data Structures
---

The `DataStructures` are structs that we are using throughout the message infrastructure and registry.

**Links**: [Implementation (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/master/l1-contracts/src/core/libraries/DataStructures.sol).

## `L1Actor`

An entity on L1, specifying the address and the chainId for the entity. Used when specifying sender/recipient with an entity that is on L1.

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
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.88.0/l1-contracts/src/core/libraries/DataStructures.sol#L11-L21" target="_blank" rel="noopener noreferrer">Source code: l1-contracts/src/core/libraries/DataStructures.sol#L11-L21</a></sub></sup>


| Name           | Type    | Description |
| -------------- | ------- | ----------- |
| `actor`          | `address` | The L1 address of the actor |
| `chainId`        | `uint256` | The chainId of the actor. Defines the blockchain that the actor lives on. |


## `L2Actor`

An entity on L2, specifying the address and the version for the entity. Used when specifying sender/recipient with an entity that is on L2.

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
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.88.0/l1-contracts/src/core/libraries/DataStructures.sol#L23-L33" target="_blank" rel="noopener noreferrer">Source code: l1-contracts/src/core/libraries/DataStructures.sol#L23-L33</a></sub></sup>


| Name           | Type    | Description |
| -------------- | ------- | ----------- |
| `actor`          | `bytes32` | The aztec address of the actor. |
| `version`        | `uint256` | The version of Aztec that the actor lives on. |

## `L1ToL2Message`

A message that is sent from L1 to L2.

```solidity title="l1_to_l2_msg" showLineNumbers 
/**
 * @notice Struct containing a message from L1 to L2
 * @param sender - The sender of the message
 * @param recipient - The recipient of the message
 * @param content - The content of the message (application specific) padded to bytes32 or hashed if larger.
 * @param secretHash - The secret hash of the message (make it possible to hide when a specific message is consumed on L2).
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
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.88.0/l1-contracts/src/core/libraries/DataStructures.sol#L35-L51" target="_blank" rel="noopener noreferrer">Source code: l1-contracts/src/core/libraries/DataStructures.sol#L35-L51</a></sub></sup>


| Name           | Type    | Description |
| -------------- | ------- | ----------- |
| `sender`          | `L1Actor` | The actor on L1 that is sending the message. |
| `recipient`        | `L2Actor` | The actor on L2 that is to receive the message. |
| `content`        | `field (~254 bits)` | The field element containing the content to be sent to L2. |
| `secretHash`        | `field (~254 bits)` | The hash of a secret pre-image that must be known to consume the message on L2. Use [`computeSecretHash` (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/master/yarn-project/aztec.js/src/utils/secrets.ts) to compute it from a secret. |

## `L2ToL1Message`

A message that is sent from L2 to L1.

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
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.88.0/l1-contracts/src/core/libraries/DataStructures.sol#L53-L66" target="_blank" rel="noopener noreferrer">Source code: l1-contracts/src/core/libraries/DataStructures.sol#L53-L66</a></sub></sup>


| Name           | Type    | Description |
| -------------- | ------- | ----------- |
| `sender`          | `L2Actor` | The actor on L2 that is sending the message. |
| `recipient`        | `L1Actor` | The actor on L1 that is to receive the message. |
| `content`        | `field (~254 bits)` | The field element containing the content to be consumed by the portal on L1. |


