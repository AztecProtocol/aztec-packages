# Archiver

Archiver is a service which is used to fetch data onchain data and present them in a nice-to-consume form.

The onchain data specifically are the following events:

1. `L2BlockProposed` event emitted on Rollup contract,
2. `MessageAdded` event emitted on Inbox contract,

The interfaces defining how the data can be consumed from the archiver are `L2BlockSource`, `L2LogsSource` and `ContractDataSource`.

## Sync process

The archiver sync process periodically checks its current state against the Rollup contract on L1 and updates its local state.

### Handling invalid blocks

After the implementation of [delayed attestation verification](https://github.com/AztecProtocol/engineering-designs/pull/69), the Rollup contract on L1 no longer validates committee attestations. Instead, these are posted in calldata, and L2 nodes are expected to verify them as they download blocks. The archiver handles this validation during its sync process.

Whenever the archiver detects a block with invalid attestations, it skips it. These blocks are not meant to be part of the chain, so the archiver ignores them and continues processing the next blocks. It is expected that an honest proposer will eventually invalidate these blocks, removing them from the chain on L1, and then resume the sequence of valid blocks.

> [!WARNING]
> If the committee for the epoch is also malicious and attests to a descendant of an invalid block, nodes should also ignore these descendants, unless they become proven. This is currently not implemented. Nodes assume that the majority of the committee is honest.

When the current node is elected as proposer, the `sequencer` needs to know whether there is an invalid block in L1 that needs to be purged before posting their own block. To support this, the archiver exposes a `pendingChainValidationStatus`, which is the state of the tip of the pending chain. This status can be valid in the happy path, or invalid if the tip of the pending chain has invalid attestations. If invalid, this status also contains all the data needed for purging the block from L1 via an `invalidate` call to the Rollup contract. Note that, if the head of the chain has more than one invalid consecutive block, this status will reference the earliest one that needs to be purged, since a call to purge an invalid block will automatically purge all descendants. Refer to the [InvalidateLib.sol](`l1-contracts/src/core/libraries/rollup/InvalidateLib.sol`) for more info.

> [!TIP]
> The archiver can be configured to `skipValidateBlockAttestations`, which will make it skip this validation. This cannot be set via environment variables, only via a call to `nodeAdmin_setConfig`. This setting is only meant for testing purposes.

As an example, let's say the chain has been progressing normally up until block 10, and then:
1. Block 11 is posted with invalid attestations. The archiver will report 10 as the latest block, but the `pendingChainValidationStatus` will point to block 11.
2. Block 11 is purged, but another block 11 with invalid attestations is posted in its place. The archiver will still report 10 as latest, and the `pendingChainValidationStatus` will point to the new block 11 that needs to be purged.
3. Block 12 with invalid attestations is posted. No changes in the archiver.
4. Block 13 is posted with valid attestations, due to a malicious committee. The archiver will try to sync it and fail, since 13 does not follow 10. This scenario is not gracefully handled yet.
5. Blocks 11 to 13 are purged. The archiver status will not yet be changed: 10 will still be the latest block, and the `pendingChainValidationStatus` will point to 11. This is because the archiver does **not** follow `BlockInvalidated` events.
6. Block 11 with valid attestations is posted. The archiver pending chain now reports 11 as latest, and its status is valid.

