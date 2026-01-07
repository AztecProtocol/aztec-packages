import type { Fr } from '@aztec/foundation/curves/bn254';
import type { EventSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { siloNullifier } from '@aztec/stdlib/hash';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import type { TxHash } from '@aztec/stdlib/tx';

import { AnchorBlockStore } from '../storage/anchor_block_store/anchor_block_store.js';
import { PrivateEventStore } from '../storage/private_event_store/private_event_store.js';

export class EventService {
  constructor(
    private readonly anchorBlockStore: AnchorBlockStore,
    private readonly aztecNode: AztecNode,
    private readonly privateEventStore: PrivateEventStore,
  ) {}

  public async deliverEvent(
    contractAddress: AztecAddress,
    selector: EventSelector,
    content: Fr[],
    eventCommitment: Fr,
    txHash: TxHash,
    scope: AztecAddress,
  ): Promise<void> {
    // While using 'latest' block number would be fine for private events since they cannot be accessed from Aztec.nr
    // (and thus we're less concerned about being ahead of the synced block), we use the synced block number to
    // maintain consistent behavior in the PXE. Additionally, events should never be ahead of the synced block here
    // since `fetchTaggedLogs` only processes logs up to the synced block.
    const [syncedBlockHeader, siloedEventCommitment, txEffect] = await Promise.all([
      this.anchorBlockStore.getBlockHeader(),
      siloNullifier(contractAddress, eventCommitment),
      this.aztecNode.getTxEffect(txHash),
    ]);

    const syncedBlockNumber = syncedBlockHeader.getBlockNumber();

    if (!txEffect) {
      throw new Error(`Could not find tx effect for tx hash ${txHash}`);
    }

    if (txEffect.l2BlockNumber > syncedBlockNumber) {
      throw new Error(`Could not find tx effect for tx hash ${txHash} as of block number ${syncedBlockNumber}`);
    }

    const eventInTx = txEffect.data.nullifiers.some(n => n.equals(siloedEventCommitment));
    if (!eventInTx) {
      throw new Error(
        `Event commitment ${eventCommitment} (siloed as ${siloedEventCommitment}) is not present in tx ${txHash}`,
      );
    }

    const [nullifierIndex] = await this.aztecNode.findLeavesIndexes(syncedBlockNumber, MerkleTreeId.NULLIFIER_TREE, [
      siloedEventCommitment,
    ]);

    if (nullifierIndex === undefined) {
      throw new Error(
        `Event commitment ${eventCommitment} (siloed as ${siloedEventCommitment}) is not present on the nullifier tree at block ${syncedBlockNumber} (from tx ${txHash})`,
      );
    }

    return this.privateEventStore.storePrivateEventLog(
      selector,
      content,
      Number(nullifierIndex.data), // Index of the event commitment in the nullifier tree
      {
        contractAddress,
        scope,
        txHash,
        l2BlockNumber: nullifierIndex.l2BlockNumber, // Block number in which the event was emitted
        l2BlockHash: nullifierIndex.l2BlockHash, // Block hash in which the event was emitted
      },
    );
  }
}
