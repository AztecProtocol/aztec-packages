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

## Buckets and the rolling hash

Every message inserted into the Inbox extends a rolling hash: a truncated sha256 chain over the message leaves, which
the rollup circuits recompute and L1 checks when a checkpoint is proposed. Messages are grouped into **buckets**: a
bucket holds the messages sent within a single L1 block (up to a per-bucket maximum, after which further messages in
the same block spill into the next bucket), and buckets are identified by a dense, monotonically increasing sequence
number. A checkpoint always consumes whole buckets.

Each link of the chain is `sha256ToField(separator || previousRollingHash || leaf)` over a 4-byte big-endian domain
separator followed by the two 32-byte values. There are two separators: `DOM_SEP__INBOX_ROLLING_HASH_BUCKET_START` is
used when the leaf is the first message of its bucket, and `DOM_SEP__INBOX_ROLLING_HASH` for every other message. The
chain therefore commits to how the messages were packed into buckets, not only to their order: the same messages
regrouped across a different set of L1 blocks produce a different rolling hash. The genesis value is zero.

## View functions

These functions allow you to query the current state of the Inbox.

| Function                   | Returns           | Description                                      |
| -------------------------- | ----------------- | ------------------------------------------------ |
| `getState()`               | `InboxState`      | Returns the current inbox state (rolling hash, total messages inserted, current bucket sequence). |
| `getTotalMessagesInserted()` | `uint64`        | Returns the total number of messages inserted into the inbox. |
| `getCurrentBucketSeq()`    | `uint64`          | Returns the sequence number of the bucket messages are currently absorbed into. |
| `getBucket(uint256 seq)`   | `InboxBucket`     | Returns the snapshot of the bucket with the given sequence number (rolling hash, cumulative and per-bucket message counts, opening timestamp). Reverts if the bucket is outside the ring the Inbox retains. |
| `getFeeAssetPortal()`      | `address`         | Returns the address of the Fee Juice portal. |

## Related pages

- [Outbox](./outbox.md) - L2 to L1 message passing
- [Data Structures](./data_structures.md) - Message and actor type definitions
