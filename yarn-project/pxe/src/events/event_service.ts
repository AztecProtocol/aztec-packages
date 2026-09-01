import type { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { allToCompletion } from '@aztec/foundation/promise';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { InBlock } from '@aztec/stdlib/block';
import { computePrivateEventCommitment, siloNullifier } from '@aztec/stdlib/hash';
import type { BlockHeader } from '@aztec/stdlib/tx';

import type { EventValidationRequest } from '../contract_function_simulator/noir-structs/event_validation_request.js';
import { PrivateEventStore } from '../storage/private_event_store/private_event_store.js';
import type { ChangeSetId } from '../storage/staged_write_coordinator.js';

export class EventService {
  constructor(
    private readonly anchorBlockHeader: BlockHeader,
    private readonly privateEventStore: PrivateEventStore,
    private readonly changeSetId: ChangeSetId,
    private readonly log = createLogger('pxe:event_service'),
  ) {}

  /**
   * Validates and stores a batch of private events against the pre-fetched onchain context of their txs.
   *
   * @param requests - The events to validate and store.
   * @param scope - The scope under which the events are being stored.
   * @param validationTxData - The onchain context of each request's tx, keyed by `TxHash.toString()`. Must contain
   * entries for every request's txHash; missing entries are treated as a node bug and cause an error.
   */
  public async validateAndStoreEvents(
    requests: EventValidationRequest[],
    scope: AztecAddress,
    validationTxData: ReadonlyMap<string, EventValidationTxData>,
  ): Promise<void> {
    if (requests.length === 0) {
      return;
    }

    const anchorBlockNumber = this.anchorBlockHeader.getBlockNumber();

    await allToCompletion(
      requests.map(req => this.#validateAndStoreEvent(req, scope, validationTxData, anchorBlockNumber)),
    );
  }

  async #validateAndStoreEvent(
    request: EventValidationRequest,
    scope: AztecAddress,
    validationTxData: ReadonlyMap<string, EventValidationTxData>,
    anchorBlockNumber: number,
  ): Promise<void> {
    const {
      contractAddress,
      eventTypeId: selector,
      randomness,
      serializedEvent: content,
      eventCommitment,
      txHash,
    } = request;

    // Defense-in-depth: the built-in private-event path derives this commitment from content before enqueueing, but
    // unconstrained PXE-side code (e.g. a custom message handler) can reach this oracle with arbitrary
    // (content, commitment) pairs. Without this check it could bind arbitrary content to a legitimate tx nullifier,
    // causing PXE to surface fabricated event data.
    const recomputedCommitment = await computePrivateEventCommitment(randomness, selector.toField(), content);
    if (!recomputedCommitment.equals(eventCommitment)) {
      this.log.warn(
        `Skipping event whose content does not hash to the provided commitment. contract=${contractAddress}, selector=${selector}, eventCommitment=${eventCommitment}, txHash=${txHash}, recomputedCommitment=${recomputedCommitment}`,
      );
      return;
    }

    // While using 'latest' block number would be fine for private events since they cannot be accessed from Aztec.nr
    // (and thus we're less concerned about being ahead of the synced block), we use the synced block number to
    // maintain consistent behavior in the PXE. Additionally, events should never be ahead of the synced block here
    // since `fetchTaggedLogs` only processes logs up to the synced block.
    const siloedEventCommitment = await siloNullifier(contractAddress, eventCommitment);

    const txData = validationTxData.get(txHash.toString());
    if (!txData) {
      // We error out instead of just logging a warning and skipping the event because this would indicate a bug. This
      // is because the node has already served info about this tx either when obtaining the log (LogResult carries
      // the tx info) or when getting metadata for the offchain message (before the message got passed to `process_log`).
      throw new Error(`Could not find tx effect for tx hash ${txHash} when processing an event.`);
    }

    if (txData.l2BlockNumber > anchorBlockNumber) {
      // We should never process a message from a tx past the anchor block. If we got here, a preprocessing step made
      // a mistake.
      throw new Error(
        `Obtained a newer tx effect for ${txHash} for an event validation request than the anchor block ${anchorBlockNumber}. This is a bug as smart contracts should not issue event validation requests for events from blocks newer than the anchor block.`,
      );
    }

    // Find the index of the event commitment in the nullifiers array to determine event ordering within the tx
    const eventIndexInTx = txData.nullifiers.findIndex(n => n.equals(siloedEventCommitment));
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
        l2BlockNumber: txData.l2BlockNumber,
        l2BlockHash: txData.l2BlockHash,
        txIndexInBlock: txData.txIndexInBlock,
        eventIndexInTx,
      },
      this.changeSetId,
    );
  }
}

/** The onchain context of the tx an event validation request points at: where it was mined and its nullifiers. */
export type EventValidationTxData = InBlock & {
  nullifiers: Fr[];
  txIndexInBlock: number;
};
