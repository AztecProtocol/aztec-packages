import { compactArray } from '@aztec/foundation/collection';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { BlockProposal } from '@aztec/stdlib/p2p';
import type { Tx, TxHash } from '@aztec/stdlib/tx';

import type { P2PClient } from '../client/p2p_client.js';

export class TxCollector {
  constructor(
    private p2pClient: Pick<
      P2PClient,
      'getTxsByHashFromPool' | 'hasTxsInPool' | 'getTxsByHash' | 'validate' | 'requestTxsByHash'
    >,
    private log: Logger = createLogger('p2p:tx-collector'),
  ) {}

  async collectForBlockProposal(
    proposal: BlockProposal,
    peerWhoSentTheProposal: any,
  ): Promise<{ txs: Tx[]; missing?: TxHash[] }> {
    if (proposal.payload.txHashes.length === 0) {
      this.log.verbose(`Received block proposal with no transactions, skipping transaction availability check`);
      return { txs: [] };
    }
    // Is this a new style proposal?
    if (proposal.txs && proposal.txs.length > 0 && proposal.txs.length === proposal.payload.txHashes.length) {
      // Yes, any txs that we already have we should use
      this.log.info(`Using new style proposal with ${proposal.txs.length} transactions`);

      // Request from the pool based on the signed hashes in the payload
      const hashesFromPayload = proposal.payload.txHashes;
      const txsToUse = await this.p2pClient.getTxsByHashFromPool(hashesFromPayload);

      const missingTxs = txsToUse.filter(tx => tx === undefined).length;
      if (missingTxs > 0) {
        this.log.verbose(
          `Missing ${missingTxs}/${hashesFromPayload.length} transactions in the tx pool, will attempt to take from the proposal`,
        );
      }

      let usedFromProposal = 0;
      const txsToValidate = [];

      // Fill any holes with txs in the proposal, provided their hash matches the hash in the payload
      for (let i = 0; i < txsToUse.length; i++) {
        if (txsToUse[i] === undefined) {
          // We don't have the transaction, take from the proposal, provided the hash is the same
          const hashOfTxInProposal = await proposal.txs[i].getTxHash();
          if (hashOfTxInProposal.equals(hashesFromPayload[i])) {
            // Hash is equal, we can use the tx from the proposal
            txsToUse[i] = proposal.txs[i];
            txsToValidate.push(proposal.txs[i]);
            usedFromProposal++;
          } else {
            this.log.warn(
              `Unable to take tx: ${hashOfTxInProposal.toString()} from the proposal, it does not match payload hash: ${hashesFromPayload[
                i
              ].toString()}`,
            );
          }
        }
      }

      // See if we still have any holes, if there are then we were not successful and will try the old method
      if (txsToUse.some(tx => tx === undefined)) {
        this.log.warn(`Failed to use transactions from proposal. Falling back to old proposal logic`);
      } else {
        await this.p2pClient.validate(txsToValidate);
        this.log.info(
          `Successfully used ${usedFromProposal}/${hashesFromPayload.length} transactions from the proposal`,
        );
        return { txs: txsToUse as Tx[] };
      }
    }

    this.log.info(`Using old style proposal with ${proposal.payload.txHashes.length} transactions`);

    // Old style proposal, we will perform a request by hash from pool
    // This will request from network any txs that are missing
    const txHashes: TxHash[] = proposal.payload.txHashes;

    // This part is just for logging that we are requesting from the network
    const availability = await this.p2pClient.hasTxsInPool(txHashes);
    const notAvailable = availability.filter(availability => availability === false);
    if (notAvailable.length) {
      this.log.verbose(
        `Missing ${notAvailable.length} transactions in the tx pool, will need to request from the network`,
      );
    }

    // This will request from the network any txs that are missing
    // NOTE: this could still return missing txs so we need to (1) be careful to handle undefined and (2) keep the txs in the correct order for re-execution
    const maybeRetrievedTxs = await this.p2pClient.getTxsByHash(txHashes, peerWhoSentTheProposal);
    const missingTxs = compactArray(
      maybeRetrievedTxs.map((tx, index) => (tx === undefined ? txHashes[index] : undefined)),
    );
    // if we found all txs, this is a noop. If we didn't find all txs then validate the ones we did find and tell the validator to skip attestations because missingTxs.length > 0
    const retrievedTxs = compactArray(maybeRetrievedTxs);
    return { txs: retrievedTxs, missing: missingTxs };
  }
}
