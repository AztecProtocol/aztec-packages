import { compactArray } from '@aztec/foundation/collection';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { BlockProposal } from '@aztec/stdlib/p2p';
import type { Tx, TxHash } from '@aztec/stdlib/tx';

import type { P2PClient } from '../client/p2p_client.js';

export class TxCollector {
  constructor(
    private p2pClient: Pick<
      P2PClient,
      'getTxsByHashFromPool' | 'hasTxsInPool' | 'getTxsByHash' | 'validate' | 'requestTxsByHash' | 'addTxsToPool'
    >,
    private log: Logger = createLogger('p2p:tx-collector'),
  ) {}

  // Checks the proposal for transactions we don't already have, validates them and adds them to our pool
  async collectFromProposal(proposal: BlockProposal): Promise<void> {
    // Does this proposal have any transactions?
    if (!proposal.txs || proposal.txs.length === 0) {
      return;
    }
    const txsFromProposal = compactArray(
      await Promise.all(
        proposal.txs.map(tx =>
          tx === undefined
            ? Promise.resolve(undefined)
            : tx.getTxHash().then(hash => ({
                txHash: hash,
                tx,
              })),
        ),
      ),
    );
    const txsToValidate = [];
    const txsWeAlreadyHave = await this.p2pClient.getTxsByHashFromPool(txsFromProposal.map(tx => tx.txHash));

    // Txs we already have will have holes where there transactions not present in our pool
    for (let i = 0; i < txsWeAlreadyHave.length; i++) {
      if (txsWeAlreadyHave[i] === undefined) {
        txsToValidate.push(txsFromProposal[i].tx);
      }
    }

    // Now validate all the transactions from the proposal that we don't have
    // This will throw if any of the transactions are invalid, this is probably correct, if someone sends us a proposal with invalid
    // transactions we probably shouldn't spend any more effort on it
    try {
      await this.p2pClient.validate(txsToValidate);
    } catch (err) {
      this.log.error(`Received proposal with invalid transactions, skipping`);
      throw err;
    }

    // Now store these transactions in our pool, provided these are the txs in proposal.payload.txHashes they will be pinned already
    await this.p2pClient.addTxsToPool(txsToValidate);

    this.log.info(
      `Received proposal with ${proposal.txs.length} transactions, ${txsToValidate.length} of which were new to us`,
    );
  }

  async collectForBlockProposal(
    proposal: BlockProposal,
    peerWhoSentTheProposal: any,
  ): Promise<{ txs: Tx[]; missing?: TxHash[] }> {
    if (proposal.payload.txHashes.length === 0) {
      this.log.verbose(`Received block proposal with no transactions, skipping transaction availability check`);
      return { txs: [] };
    }

    // Take txs from the proposal if there are any
    await this.collectFromProposal(proposal);

    // Now get the txs we need, either from the pool or the p2p network
    const txHashes: TxHash[] = proposal.payload.txHashes;

    // This will request from the network any txs that are missing
    // NOTE: this could still return missing txs so we need to (1) be careful to handle undefined and (2) keep the txs in the correct order for re-execution
    const maybeRetrievedTxs = await this.p2pClient.getTxsByHash(txHashes, peerWhoSentTheProposal);
    const missingTxs = compactArray(
      maybeRetrievedTxs.map((tx, index) => (tx === undefined ? txHashes[index] : undefined)),
    );
    // if we found all txs, this is a noop. If we didn't find all txs then tell the validator to skip attestations because missingTxs.length > 0
    const retrievedTxs = compactArray(maybeRetrievedTxs);
    return { txs: retrievedTxs, missing: missingTxs };
  }
}
