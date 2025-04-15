import type { ENR, P2P, P2PConfig, P2PSyncState } from '@aztec/p2p';
import type { L2BlockStreamEvent, L2Tips } from '@aztec/stdlib/block';
import type { PeerInfo } from '@aztec/stdlib/interfaces/server';
import type { BlockAttestation, BlockProposal } from '@aztec/stdlib/p2p';
import type { Tx, TxHash } from '@aztec/stdlib/tx';

export class DummyP2P implements P2P {
  /**
   * Returns all pending transactions in the transaction pool.
   * @returns An array of Txs.
   */
  getPendingTxs(): Promise<Tx[]> {
    throw new Error('Dummy P2P methods not implemented');
  }

  /**
   * Returns the ENR for this node, if any.
   */
  getEncodedEnr(): Promise<string | undefined> {
    throw new Error('Dummy P2P methods not implemented');
  }

  /**
   * Returns info for all connected, dialing, and cached peers.
   */
  getPeers(_includePending?: boolean): Promise<PeerInfo[]> {
    throw new Error('Dummy P2P methods not implemented');
  }
  /**
   * Broadcasts a block proposal to other peers.
   *
   * @param proposal - the block proposal
   */
  public broadcastProposal(_proposal: BlockProposal): void {
    throw new Error('Dummy P2P methods not implemented');
  }

  /**
   * Registers a callback from the validator client that determines how to behave when
   * foreign block proposals are received
   *
   * @param handler - A function taking a received block proposal and producing an attestation
   */
  // REVIEW: https://github.com/AztecProtocol/aztec-packages/issues/7963
  // ^ This pattern is not my favorite (md)
  registerBlockProposalHandler(_handler: (block: BlockProposal) => Promise<BlockAttestation | undefined>): void {
    throw new Error('Dummy P2P methods not implemented');
  }

  /**
   * Request a list of transactions from another peer by their tx hashes.
   * @param txHashes - Hashes of the txs to query.
   * @returns A list of transactions or undefined if the transactions are not found.
   */
  requestTxs(_txHashes: TxHash[]): Promise<(Tx | undefined)[]> {
    throw new Error('Dummy P2P methods not implemented');
  }

  /**
   * Request a transaction from another peer by its tx hash.
   * @param txHash - Hash of the tx to query.
   */
  requestTxByHash(_txHash: TxHash): Promise<Tx | undefined> {
    throw new Error('Dummy P2P methods not implemented');
  }

  /**
   * Verifies the 'tx' and, if valid, adds it to local tx pool and forwards it to other peers.
   * @param tx - The transaction.
   **/
  sendTx(_tx: Tx): Promise<void> {
    throw new Error('Dummy P2P methods not implemented');
  }

  /**
   * Deletes 'txs' from the pool, given hashes.
   * NOT used if we use sendTx as reconcileTxPool will handle this.
   * @param txHashes - Hashes to check.
   **/
  deleteTxs(_txHashes: TxHash[]): Promise<void> {
    throw new Error('Dummy P2P methods not implemented');
  }

  /**
   * Returns a transaction in the transaction pool by its hash.
   * @param txHash  - Hash of tx to return.
   * @returns A single tx or undefined.
   */
  getTxByHashFromPool(_txHash: TxHash): Promise<Tx | undefined> {
    throw new Error('Dummy P2P methods not implemented');
  }

  /**
   * Returns a transaction in the transaction pool by its hash, requesting it from the network if it is not found.
   * @param txHash  - Hash of tx to return.
   * @returns A single tx or undefined.
   */
  getTxByHash(_txHash: TxHash): Promise<Tx | undefined> {
    throw new Error('Dummy P2P methods not implemented');
  }

  /**
   * Returns an archived transaction from the transaction pool by its hash.
   * @param txHash  - Hash of tx to return.
   * @returns A single tx or undefined.
   */
  getArchivedTxByHash(_txHash: TxHash): Promise<Tx | undefined> {
    throw new Error('Dummy P2P methods not implemented');
  }

  /**
   * Returns whether the given tx hash is flagged as pending or mined.
   * @param txHash - Hash of the tx to query.
   * @returns Pending or mined depending on its status, or undefined if not found.
   */
  getTxStatus(_txHash: TxHash): Promise<'pending' | 'mined' | undefined> {
    throw new Error('Dummy P2P methods not implemented');
  }

  /** Returns an iterator over pending txs on the mempool. */
  iteratePendingTxs(): AsyncIterableIterator<Tx> {
    throw new Error('Dummy P2P methods not implemented');
  }

  /** Returns the number of pending txs in the mempool. */
  getPendingTxCount(): Promise<number> {
    throw new Error('Dummy P2P methods not implemented');
  }

  /**
   * Starts the p2p client.
   * @returns A promise signalling the completion of the block sync.
   */
  start(): Promise<void> {
    throw new Error('Dummy P2P methods not implemented');
  }

  /**
   * Stops the p2p client.
   * @returns A promise signalling the completion of the stop process.
   */
  stop(): Promise<void> {
    throw new Error('Dummy P2P methods not implemented');
  }

  /**
   * Indicates if the p2p client is ready for transaction submission.
   * @returns A boolean flag indicating readiness.
   */
  isReady(): boolean {
    throw new Error('Dummy P2P methods not implemented');
  }

  /**
   * Returns the current status of the p2p client.
   */
  getStatus(): Promise<P2PSyncState> {
    throw new Error('Dummy P2P methods not implemented');
  }

  /**
   * Returns the ENR of this node, if any.
   */
  getEnr(): ENR | undefined {
    throw new Error('Dummy P2P methods not implemented');
  }

  /** Identifies a p2p client. */
  isP2PClient(): true {
    throw new Error('Dummy P2P methods not implemented');
  }

  /**
   * Returns transactions in the transaction pool by hash.
   * If a transaction is not in the pool, it will be requested from the network.
   * @param txHashes - Hashes of the transactions to look for.
   * @returns The txs found, not necessarily on the same order as the hashes.
   */
  getTxsByHash(_txHashes: TxHash[]): Promise<Tx[]> {
    throw new Error('Dummy P2P methods not implemented');
  }

  getAttestationsForSlot(_slot: bigint, _proposalId?: string): Promise<BlockAttestation[]> {
    throw new Error('Dummy P2P methods not implemented');
  }

  addAttestation(_attestation: BlockAttestation): Promise<void> {
    throw new Error('Dummy P2P methods not implemented');
  }

  public getL2BlockHash(_number: number): Promise<string | undefined> {
    throw new Error('Dummy P2P methods not implemented');
  }

  public updateP2PConfig(_config: Partial<P2PConfig>): Promise<void> {
    throw new Error('Dummy P2P methods not implemented');
  }

  public getL2Tips(): Promise<L2Tips> {
    throw new Error('Dummy P2P methods not implemented');
  }

  public handleBlockStreamEvent(_event: L2BlockStreamEvent): Promise<void> {
    throw new Error('Dummy P2P methods not implemented');
  }

  /** Triggers a sync to the archiver. Used for testing. */
  public sync() {
    throw new Error('Dummy P2P methods not implemented');
  }

  /**
   * Uses the batched Request Response protocol to request a set of transactions from the network.
   */
  public requestTxsByHash(_txHashes: TxHash[]): Promise<(Tx | undefined)[]> {
    throw new Error('Dummy P2P methods not implemented');
  }

  /**
   * Returns all transactions in the transaction pool.
   * @returns An array of Txs.
   */
  public getTxs(_filter: 'all' | 'pending' | 'mined'): Promise<Tx[]> {
    throw new Error('Dummy P2P methods not implemented');
  }

  /**
   * Returns transactions in the transaction pool by hash.
   * @param txHashes - Hashes of the transactions to look for.
   * @returns The txs found, not necessarily on the same order as the hashes.
   */
  getTxsByHashFromPool(_txHashes: TxHash[]): Promise<(Tx | undefined)[]> {
    throw new Error('Dummy P2P methods not implemented');
  }

  hasTxsInPool(_txHashes: TxHash[]): Promise<boolean[]> {
    throw new Error('Dummy P2P methods not implemented');
  }

  /**
   * Adds transactions to the pool. Does not send to peers or validate the txs.
   * @param txs - The transactions.
   **/
  public addTxs(_txs: Tx[]): Promise<void> {
    throw new Error('Dummy P2P methods not implemented');
  }

  /**
   * Public function to check the latest block number that the P2P client is synced to.
   * @returns Block number of latest L2 Block we've synced with.
   */
  public getSyncedLatestBlockNum(): Promise<number> {
    throw new Error('Dummy P2P methods not implemented');
  }

  /**
   * Public function to check the latest proven block number that the P2P client is synced to.
   * @returns Block number of latest proven L2 Block we've synced with.
   */
  public getSyncedProvenBlockNum(): Promise<number> {
    throw new Error('Dummy P2P methods not implemented');
  }

  /** Returns latest L2 slot for which we have seen an L2 block. */
  public getSyncedLatestSlot(): Promise<bigint> {
    throw new Error('Dummy P2P methods not implemented');
  }
}
