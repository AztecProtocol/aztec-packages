import { compactArray } from '@aztec/foundation/collection';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { BlockProposal } from '@aztec/stdlib/p2p';
import type { Tx, TxHash } from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import type { PeerId } from '@libp2p/interface';

import type { P2PClient } from '../client/p2p_client.js';
import { TxCollectorInstrumentation } from './tx_collect_instrumentation.js';

export class TxCollector {
  private instrumentation: TxCollectorInstrumentation;

  constructor(
    private p2pClient: Pick<
      P2PClient,
      'getTxsByHashFromPool' | 'hasTxsInPool' | 'getTxsByHash' | 'validate' | 'requestTxsByHash' | 'addTxsToPool'
    >,
    private log: Logger = createLogger('p2p:tx-collector'),
    client: TelemetryClient = getTelemetryClient(),
  ) {
    this.instrumentation = new TxCollectorInstrumentation(client, 'TxCollector');
  }

  // Checks the proposal for transactions we don't already have, validates them and adds them to our pool
  private async collectFromProposal(proposal: BlockProposal): Promise<number> {
    // Does this proposal have any transactions?
    if (!proposal.txs || proposal.txs.length === 0) {
      return 0;
    }

    const proposalHashes = new Set<string>((proposal.payload.txHashes ?? []).map(txHash => txHash.toString()));

    // Get the transactions from the proposal and their hashes
    // also, we are only interested in txs that are part of the proposal
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
    ).filter(tx => proposalHashes.has(tx.txHash.toString()));

    // Of the transactions from the proposal, retrieve those that we have in the pool already
    const txsToValidate = [];
    const txsWeAlreadyHave = await this.p2pClient.getTxsByHashFromPool(txsFromProposal.map(tx => tx.txHash));

    // Txs we already have will have holes where we did not find them
    // Where that is the case we need to validate the tx in the proposal
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
      `Received proposal with ${proposal.txs.length} transactions, ${txsToValidate.length} of which were new`,
    );
    return txsToValidate.length;
  }

  async collectForBlockProposal(
    proposal: BlockProposal,
    peerWhoSentTheProposal: PeerId | undefined,
  ): Promise<{ txs: Tx[]; missing?: TxHash[] }> {
    if (proposal.payload.txHashes.length === 0) {
      this.log.verbose(`Received block proposal with no transactions, skipping transaction availability check`);
      return { txs: [] };
    }

    const txsInMempool = (await this.p2pClient.hasTxsInPool(proposal.payload.txHashes)).filter(Boolean).length;
    this.instrumentation.incTxsFromMempool(txsInMempool);

    // Take txs from the proposal if there are any
    const txTakenFromProposal = await this.collectFromProposal(proposal);
    this.instrumentation.incTxsFromProposals(txTakenFromProposal);

    // Now get the txs we need, either from the pool or the p2p network
    const txHashes: TxHash[] = proposal.payload.txHashes;

    // This will request from the network any txs that are missing
    // NOTE: this could still return missing txs so we need to (1) be careful to handle undefined and (2) keep the txs in the correct order for re-execution
    const maybeRetrievedTxs = await this.p2pClient.getTxsByHash(txHashes, peerWhoSentTheProposal);

    // Get the txs that we didn't get from the network, if any. This will be empty if we got them al
    const missingTxs = compactArray(
      maybeRetrievedTxs.map((tx, index) => (tx === undefined ? txHashes[index] : undefined)),
    );
    this.instrumentation.incMissingTxs(missingTxs.length);

    const txsFromP2P = txHashes.length - txTakenFromProposal - txsInMempool - missingTxs.length;
    this.instrumentation.incTxsFromP2P(txsFromP2P);

    // if we found all txs, this is a noop. If we didn't find all txs then tell the validator to skip attestations because missingTxs.length > 0
    const retrievedTxs = compactArray(maybeRetrievedTxs);
    return { txs: retrievedTxs, missing: missingTxs };
  }
}
