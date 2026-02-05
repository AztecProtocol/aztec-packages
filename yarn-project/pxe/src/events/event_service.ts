import type { Fr } from '@aztec/foundation/curves/bn254';
import type { EventSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { siloNullifier } from '@aztec/stdlib/hash';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import type { BlockHeader, TxHash } from '@aztec/stdlib/tx';

import { PrivateEventStore } from '../storage/private_event_store/private_event_store.js';

export class EventService {
  constructor(
    private readonly anchorBlockHeader: BlockHeader,
    private readonly aztecNode: AztecNode,
    private readonly privateEventStore: PrivateEventStore,
    private readonly jobId: string,
  ) {}

  public async validateAndStoreEvent(
    contractAddress: AztecAddress,
    selector: EventSelector,
    randomness: Fr,
    content: Fr[],
    eventCommitment: Fr,
    txHash: TxHash,
    scope: AztecAddress,
  ): Promise<void> {
    // While using 'latest' block number would be fine for private events since they cannot be accessed from Aztec.nr
    // (and thus we're less concerned about being ahead of the synced block), we use the synced block number to
    // maintain consistent behavior in the PXE. Additionally, events should never be ahead of the synced block here
    // since `fetchTaggedLogs` only processes logs up to the synced block.
    const [siloedEventCommitment, txEffect] = await Promise.all([
      siloNullifier(contractAddress, eventCommitment),
      this.aztecNode.getTxEffect(txHash),
    ]);

    const anchorBlockNumber = this.anchorBlockHeader.getBlockNumber();

    if (!txEffect) {
      throw new Error(`Could not find tx effect for tx hash ${txHash}`);
    }

    if (txEffect.l2BlockNumber > anchorBlockNumber) {
      throw new Error(`Could not find tx effect for tx hash ${txHash} as of block number ${anchorBlockNumber}`);
    }

    // Find the index of the event commitment in the nullifiers array to determine event ordering within the tx
    const eventIndexInTx = txEffect.data.nullifiers.findIndex(n => n.equals(siloedEventCommitment));
    if (eventIndexInTx === -1) {
      throw new Error(
        `Event commitment ${eventCommitment} (siloed as ${siloedEventCommitment}) is not present in tx ${txHash}`,
      );
    }

    return this.privateEventStore.storePrivateEventLog(
      selector,
      randomness,
      content,
      siloedEventCommitment,
      {
        contractAddress,
        scope,
        txHash,
        l2BlockNumber: txEffect.l2BlockNumber,
        l2BlockHash: txEffect.l2BlockHash,
        txIndexInBlock: txEffect.txIndexInBlock,
        eventIndexInTx,
      },
      this.jobId,
    );
  }
}
