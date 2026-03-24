import type { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
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
    private readonly log = createLogger('pxe:event_service'),
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
      // We error out instead of just logging a warning and skipping the event because this would indicate a bug. This
      // is because the node has already served info about this tx either when obtaining the log (TxScopedL2Log contain
      // tx info) or when getting metadata for the offchain message (before the message got passed to `process_log`).
      throw new Error(`Could not find tx effect for tx hash ${txHash} when processing an event.`);
    }

    if (txEffect.l2BlockNumber > anchorBlockNumber) {
      // We should never process a message from a tx past the anchor block. If we got here, a preprocessing step made
      // a mistake.
      throw new Error(
        `Obtained a newer tx effect for ${txHash} for an event validation request than the anchor block ${anchorBlockNumber}. This is a bug as smart contracts should not issue event validation requests for events from blocks newer than the anchor block.`,
      );
    }

    // Find the index of the event commitment in the nullifiers array to determine event ordering within the tx
    const eventIndexInTx = txEffect.data.nullifiers.findIndex(n => n.equals(siloedEventCommitment));
    if (eventIndexInTx === -1) {
      // Unlike in NoteService, this might not be a bug since the commitment hasn't been verified yet in the message
      // processing pipeline. A malformed or malicious message could trigger this condition. Because of this we don't
      // error out and we just show a warning.
      this.log.warn(
        `Skipping event whose commitment is not present in its tx. siloedEventCommitment=${siloedEventCommitment}, contract=${contractAddress}, selector=${selector}, eventCommitment=${eventCommitment}, txHash=${txHash}`,
      );
      return;
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
