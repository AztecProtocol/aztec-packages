---
title: Inbox
tags: [portals, contracts]
---

The `Inbox` is a contract deployed on L1 that handles message passing from L1 to the rollup (L2)

**Links**: [Interface (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/master/l1-contracts/src/core/interfaces/messagebridge/IInbox.sol), [Implementation (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/master/l1-contracts/src/core/messagebridge/Inbox.sol).

## `sendL2Message()`

Sends a message from L1 to L2.

```solidity title="send_l1_to_l2_message" showLineNumbers 
/**
 * @notice Inserts a new message into the Inbox
 * @dev Emits `MessageSent` with data for easy access by the sequencer
 * @param _recipient - The recipient of the message
 * @param _content - The content of the message (application specific)
 * @param _secretHash - The secret hash of the message (make it possible to hide when a specific message is consumed on L2)
 * @return The key of the message in the set and its leaf index in the tree
 */
function sendL2Message(
  DataStructures.L2Actor memory _recipient,
  bytes32 _content,
  bytes32 _secretHash
) external returns (bytes32, uint256);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/l1-contracts/src/core/interfaces/messagebridge/IInbox.sol#L35-L49" target="_blank" rel="noopener noreferrer">Source code: l1-contracts/src/core/interfaces/messagebridge/IInbox.sol#L35-L49</a></sub></sup>



| Name           | Type    | Description |
| -------------- | ------- | ----------- |
| Recipient      | `L2Actor` | The recipient of the message. This **MUST** match the rollup version and an Aztec contract that is **attached** to the contract making this call. If the recipient is not attached to the caller, the message cannot be consumed by it. |
| Content        | `field` (~254 bits) | The content of the message. This is the data that will be passed to the recipient. The content is limited to be a single field for rollup purposes. If the content is small enough it can just be passed along, otherwise it should be hashed and the hash passed along (you can use our [`Hash` (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/master/l1-contracts/src/core/libraries/Hash.sol) utilities with `sha256ToField` functions)  |
| Secret Hash    | `field` (~254 bits)  | A hash of a secret that is used when consuming the message on L2. Keep this preimage a secret to make the consumption private. To consume the message the caller must know the pre-image (the value that was hashed) - so make sure your app keeps track of the pre-images! Use [`computeSecretHash` (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/master/yarn-project/aztec.js/src/utils/secrets.ts) to compute it from a secret. |
| ReturnValue         | `bytes32` | The message hash, used as an identifier |

#### Edge cases

- Will revert with `Inbox__ActorTooLarge(bytes32 actor)` if the recipient is larger than the field size (~254 bits).
- Will revert with `Inbox__ContentTooLarge(bytes32 content)` if the content is larger than the field size (~254 bits).
- Will revert with `Inbox__SecretHashTooLarge(bytes32 secretHash)` if the secret hash is larger than the field size (~254 bits).

## `consume()`

Allows the `Rollup` to consume multiple messages in a single transaction.

```solidity title="consume" showLineNumbers 
/**
 * @notice Consumes the current tree, and starts a new one if needed
 * @dev Only callable by the rollup contract
 * @dev In the first iteration we return empty tree root because first block's messages tree is always
 * empty because there has to be a 1 block lag to prevent sequencer DOS attacks
 *
 * @param _toConsume - The block number to consume
 *
 * @return The root of the consumed tree
 */
function consume(uint256 _toConsume) external returns (bytes32);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/l1-contracts/src/core/interfaces/messagebridge/IInbox.sol#L51-L63" target="_blank" rel="noopener noreferrer">Source code: l1-contracts/src/core/interfaces/messagebridge/IInbox.sol#L51-L63</a></sub></sup>


| Name           | Type        | Description                |
| -------------- | ----------- | -------------------------- |
| ReturnValue    | `bytes32`   | Root of the consumed tree. | 

#### Edge cases

- Will revert with `Inbox__Unauthorized()` if `msg.sender != ROLLUP` (rollup contract is sometimes referred to as state transitioner in the docs). 
