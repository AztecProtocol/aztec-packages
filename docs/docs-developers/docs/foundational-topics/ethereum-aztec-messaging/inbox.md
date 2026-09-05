---
title: Inbox
description: Learn about the inbox mechanism in Aztec portals for receiving messages from L1, and how L2 blocks consume them.
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
| ReturnValue | `(bytes32, uint256)` | The message hash (used as an identifier) and the message's leaf index in the L1-to-L2 message tree.                                                                                                                                                                                                                                                                                                                                             |

The leaf index is the Inbox's cumulative message count at insertion: the first message ever sent gets index 0, the next one index 1, and so on, with no padding between checkpoints. The same index is emitted in the `MessageSent` event as `message.index`, and is what you pass to `consume_l1_to_l2_message` on L2 together with the secret.

#### Edge cases

- Will revert with `Inbox__ActorTooLarge(bytes32 actor)` if the recipient actor is larger than the field size (~254 bits).
- Will revert with `Inbox__VersionMismatch(uint256 expected, uint256 actual)` if the recipient version doesn't match the inbox version.
- Will revert with `Inbox__ContentTooLarge(bytes32 content)` if the content is larger than the field size (~254 bits).
- Will revert with `Inbox__SecretHashTooLarge(bytes32 secretHash)` if the secret hash is larger than the field size (~254 bits).
- Will revert with `Inbox__WouldOverwriteUnconsumedBucket(uint64 evictedBucketSeq)` if accepting the message would open a bucket whose ring slot still holds a bucket the proven chain has not consumed (see [ring headroom](#ring-headroom-and-back-pressure)). Sends resume once an epoch proof advances the proven consumption.

## `MessageSent` event

Every accepted message emits:

```solidity
event MessageSent(bytes32 indexed hash, bytes32 inboxRollingHash, uint256 bucketSeq, DataStructures.L1ToL2Msg message);
```

- `hash` is the message hash (the L1-to-L2 tree leaf), the value the return of `sendL2Message` also gives you.
- `inboxRollingHash` is the Inbox's consensus rolling hash after absorbing this message (see below).
- `bucketSeq` is the sequence number of the L1 bucket the message was absorbed into.
- `message` is the full [`L1ToL2Msg`](./data_structures.md#l1tol2msg), including `message.index`, the leaf index. The event carries the whole message so that a portal sending through internal calls can still recover every field from the receipt.

## How messages reach L2

The Inbox does not batch messages into per-checkpoint trees. It keeps a single **rolling hash** over every message it has ever accepted, `rollingHash' = sha256ToField(DOM_SEP__INBOX_ROLLING_HASH ‖ rollingHash ‖ leaf)`, starting from zero. Messages arriving in the same L1 block are grouped into a **bucket**: a snapshot of the rolling hash, the cumulative message count and the L1 timestamp at the end of that block. A bucket holds at most `MAX_L1_TO_L2_MSGS_PER_BLOCK` (256) messages; further messages in the same L1 block open a new bucket. Buckets are numbered by a dense sequence and stored in a ring of 4096 slots.

An L2 proposer consumes messages as soon as its node observes them in a mined L1 block:

- **Every ordinary L2 block consumes the messages the node has observed so far**, up to 256 per block and `MAX_L1_TO_L2_MSGS_PER_CHECKPOINT` (1024) per checkpoint. There is no waiting for a confirmation depth, no minimum message age, and no requirement that a block ends exactly at a bucket boundary: an intermediate block may end at any prefix of the message sequence, including in the middle of an L1 bucket. Near the end of a checkpoint, or once its consumption approaches the cap, the proposer instead consumes up to a chosen bucket end and stops there; messages past that end wait for the next checkpoint.
- **Only the checkpoint's final message position must coincide with a live bucket end.** The checkpoint header commits to the rolling hash at that position (`inboxRollingHash`), and `Rollup.propose` checks it against the bucket the proposer names in the unsigned `bucketHint` calldata argument. The proposer resolves that endpoint with one `getBucketAtOrBeforeTotal` call and simulates the Rollup's header and Inbox checks (`Rollup.validateCheckpointHeaderAndInbox`, with the attestation-signature and data-availability checks skipped) at the last L1 slot of the target L2 slot, once before gossiping the checkpoint against the parent it expects to build on and again before publishing it against the real L1 state.
- **Mandatory consumption.** A checkpoint may not leave unconsumed any bucket opened at or before the cutoff for its slot (one L1 slot before the previous L2 slot started), unless consuming it would exceed the 1024-message cap. This is what stops a committee from censoring L1-to-L2 messages.
- **Validators check content, not L1 bucket layout.** A block proposal carries a signed reference to the message prefix it consumed through (its rolling hash; the count is in the block header). Validators compare it against their own view of the Inbox and read the consumed messages by count. A validator whose view is behind or disagrees retries after a bounded L1 sync; a disagreement that persists is treated as a local-view problem, never as proposer misconduct.

A message is therefore eligible for the next block the proposer builds after its node observes the L1 block carrying it, and normally enters it, rather than waiting one to two checkpoints. Inclusion can still be deferred: by a backlog larger than the per-block and per-checkpoint caps, by a checkpoint that has already fixed the bucket end it completes at, or by a checkpoint that fails to be built or published.

### Public and private consumption

A block's public (AVM) functions can read the messages inserted in that same block: the block's L1-to-L2 tree snapshot already includes them. Private functions prove message membership against a historical block header the wallet has synced, so a private `consume_l1_to_l2_message` has to wait until a block containing the message is available to the wallet. Both paths use the same leaf index and secret.

### Accepted limitations

Consuming messages immediately couples the proposed L2 chain to the L1 head. The design accepts the following consequences rather than adding a confirmation delay:

- An L1 reorg that re-mines the same messages under different bucket boundaries changes nothing for intermediate blocks. If it removes the bucket end a **completed** checkpoint relied on, that checkpoint cannot be published: the node abandons it instead of re-signing a different one for the same slot. A reorg that changes message content prunes the not-yet-checkpointed blocks that consumed the changed messages.
- Committee attestations prove that the checkpoint's message content matches the committee's view of L1, not that the checkpoint is publishable at that moment. The proposer's preflight and `Rollup.propose` are the authority on settlement, cap and censorship rules.
- An L1 reorg that becomes visible only after the `propose` transaction was submitted can revert it, spending L1 gas even though the preflight passed.
- Node-side reorg recovery inherits a shortcut that trusts a locally stored message as final once its recorded L1 height is at or below the finalized block the node last recorded. Recorded heights are refreshed only when the node re-fetches and reinserts a matching message (during forward ingestion or a recovery replay); a same-content reorg that leaves the Inbox position at the head unchanged is taken as agreement without re-fetching, so the message keeps its old height and the shortcut can later trust an unfinalized replacement. This is a known, deliberately deferred limitation of the node's recovery, not of the protocol.

### Ring headroom and back pressure

The ring of 4096 buckets is a fixed deployment parameter. When the ring would wrap onto a bucket the **proven** chain has not consumed yet, `sendL2Message` reverts rather than overwriting it, so no message is ever lost and `propose` can always resolve the bucket it needs. In exchange, a long proving stall halts L1-to-L2 sends for every portal until the next epoch proof advances the proven consumption. `getRingHeadroom()` reports how many buckets can still be opened; at the natural cadence of one bucket per message-bearing L1 block, the ring covers roughly 4096 L1 blocks, or about 13.6 hours, of consumption stall.

## View functions

These functions allow you to query the current state of the Inbox.

| Function                                 | Returns                       | Description                                                                                                                                                                                                                                                             |
| ---------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getState()`                             | `InboxState`                  | The live position of the Inbox in one read: `rollingHash`, `totalMessagesInserted` and `currentBucketSeq`.                                                                                                                                                              |
| `getTotalMessagesInserted()`             | `uint64`                      | The total number of messages inserted into the inbox, which is also the leaf index the next message will get.                                                                                                                                                           |
| `getCurrentBucketSeq()`                  | `uint64`                      | The sequence number of the bucket currently accumulating messages.                                                                                                                                                                                                       |
| `getBucket(uint256 seq)`                 | `InboxBucket`                 | The bucket with the given sequence number: `rollingHash`, cumulative `totalMsgCount`, opening `timestamp` and `msgCount`. Reverts with `Inbox__BucketOutOfWindow(seq, current)` if `seq` is ahead of the current bucket or has been evicted from the ring.               |
| `getBucketAtOrBeforeTotal(uint64 total)` | `(uint64 seq, InboxBucket)`   | The live bucket with the greatest cumulative message total at or below `total`, and its sequence number. Proposers use it to resolve a checkpoint's final message count to a bucket end. Reverts with `Inbox__NoBucketAtOrBeforeTotal(upperBound, oldestLiveTotal)` when even the oldest retained bucket ends past `total`. |
| `getProvenConsumedBucketSeq()`           | `uint64`                      | The newest bucket the proven chain has consumed; buckets at or below it may be evicted when the ring wraps.                                                                                                                                                             |
| `getRingHeadroom()`                      | `uint256`                     | How many buckets can still be opened before `sendL2Message` reverts to protect an unconsumed bucket. Counts bucket openings, not messages.                                                                                                                              |
| `getFeeAssetPortal()`                    | `address`                     | The address of the Fee Juice portal.                                                                                                                                                                                                                                    |

## Related pages

- [Outbox](./outbox.md) - L2 to L1 message passing
- [Data Structures](./data_structures.md) - Message and actor type definitions
