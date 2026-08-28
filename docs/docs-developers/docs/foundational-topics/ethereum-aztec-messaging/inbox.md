---
title: Inbox
description: Learn about the inbox mechanism in Aztec portals for receiving messages from L1.
tags: [portals, contracts]
references: ["l1-contracts/src/core/interfaces/messagebridge/IInbox.sol"]
---

The `Inbox` is a contract deployed on L1 that handles message passing from L1 to L2.

**Links**: [Interface](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/l1-contracts/src/core/interfaces/messagebridge/IInbox.sol), [Implementation](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/l1-contracts/src/core/messagebridge/Inbox.sol).

## `sendL2Message()`

Sends a message from L1 to L2.

#include_code send_l1_to_l2_message l1-contracts/src/core/interfaces/messagebridge/IInbox.sol solidity

| Name        | Type                 | Description                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recipient   | [`L2Actor`](./data_structures.md#l2actor) | The recipient of the message. The recipient's version **MUST** match the inbox version and the actor must be an Aztec contract that is **attached** to the contract making this call. If the recipient is not attached to the caller, the message cannot be consumed by it.                                                                                             |
| Content     | `field` (~254 bits)  | The content of the message. This is the data that will be passed to the recipient. The content is limited to a single field for rollup purposes. If the content is small enough it can be passed directly, otherwise it should be hashed and the hash passed along (you can use our [`Hash`](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/l1-contracts/src/core/libraries/crypto/Hash.sol) utilities with `sha256ToField` functions). |
| Secret Hash | `field` (~254 bits)  | A hash of a secret used when consuming the message on L2. Keep this preimage secret to make the consumption private. To consume the message the caller must know the pre-image (the value that was hashed). Use [`computeSecretHash`](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/yarn-project/stdlib/src/hash/hash.ts) to compute it from a secret.                                                   |
| ReturnValue | `(bytes32, uint256)` | The message hash (used as an identifier) and the leaf index in the tree.                                                                                                                                                                                                                                                                                                                                                                       |

#### Edge cases

- Will revert with `Inbox__ActorTooLarge(bytes32 actor)` if the recipient actor is larger than the field size (~254 bits).
- Will revert with `Inbox__VersionMismatch(uint256 expected, uint256 actual)` if the recipient version doesn't match the inbox version.
- Will revert with `Inbox__ContentTooLarge(bytes32 content)` if the content is larger than the field size (~254 bits).
- Will revert with `Inbox__SecretHashTooLarge(bytes32 secretHash)` if the secret hash is larger than the field size (~254 bits).

## View functions

These functions allow you to query the current state of the Inbox.

| Function                   | Returns           | Description                                      |
| -------------------------- | ----------------- | ------------------------------------------------ |
| `getState()`               | `InboxState`      | Returns the current inbox state (rolling hash, total messages inserted). |
| `getTotalMessagesInserted()` | `uint64`        | Returns the total number of messages inserted into the inbox. |
| `getFeeAssetPortal()`      | `address`         | Returns the address of the Fee Juice portal. |

## Message consumption timing

A message is available to L2 as soon as the L1 transaction that sent it is mined, but the block proposer decides
when to consume it. That choice is a node setting, `SEQ_INBOX_L1_CONFIRMATIONS`, not a protocol rule:

- **`0` (the default): consume immediately.** The message reaches L2 in the next block the proposer builds. If the
  L1 block carrying it is then reorged out, the proposer's own view of the Inbox changes under it and it loses that
  slot. At ten one-block L1 reorgs per day and messages in 30% of L1 blocks, this costs about 0.07% of slots
  (roughly one or two per day) and nothing else — the chain is unaffected, and the next proposer consumes the
  message.
- **`1`: wait for one L1 confirmation.** The proposer consumes a message only once another L1 block has built on
  top of the one carrying it, which makes it immune to the one-block reorgs above at the cost of roughly one
  Ethereum slot (~12s) of extra latency per message.

Validators do not check how recently a message arrived: they accept whatever L1 accepts, so a network can run both
settings side by side. The sandbox mines on demand and always consumes immediately, whatever the setting says.

## Related pages

- [Outbox](./outbox.md) - L2 to L1 message passing
- [Data Structures](./data_structures.md) - Message and actor type definitions
