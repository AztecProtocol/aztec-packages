import type { L2BlockId } from '@aztec/stdlib/block';
import type { P2PApiFull } from '@aztec/stdlib/interfaces/server';
import type { BlockProposal, P2PClientType } from '@aztec/stdlib/p2p';
import type { Tx, TxHash } from '@aztec/stdlib/tx';

import type { ENR } from '@chainsafe/enr';
import type { PeerId } from '@libp2p/interface';

import type { P2PConfig } from '../config.js';
import type {
  ReqRespSubProtocol,
  ReqRespSubProtocolHandler,
  ReqRespSubProtocolValidators,
} from '../services/reqresp/interface.js';
import type { P2PBlockReceivedCallback } from '../services/service.js';

/**
 * Enum defining the possible states of the p2p client.
 */
export enum P2PClientState {
  IDLE,
  SYNCHING,
  RUNNING,
  STOPPED,
}

/**
 * The synchronization status of the P2P client.
 */
export interface P2PSyncState {
  /**
   * The current state of the p2p client.
   */
  state: P2PClientState;
  /**
   * The block number that the p2p client is synced to.
   */
  syncedToL2Block: L2BlockId;
}

/**
 * Interface of a P2P client.
 **/
export type P2P<T extends P2PClientType = P2PClientType.Full> = P2PApiFull<T> & {
  /**
   * Broadcasts a block proposal to other peers.
   *
   * @param proposal - the block proposal
   */
  broadcastProposal(proposal: BlockProposal): Promise<void>;

  /**
   * Registers a callback from the validator client that determines how to behave when
   * foreign block proposals are received
   *
   * @param handler - A function taking a received block proposal and producing an attestation
   */
  // REVIEW: https://github.com/AztecProtocol/aztec-packages/issues/7963
  // ^ This pattern is not my favorite (md)
  registerBlockProposalHandler(callback: P2PBlockReceivedCallback): void;

  /**
   * Request a list of transactions from another peer by their tx hashes.
   * @param txHashes - Hashes of the txs to query.
   * @param pinnedPeerId - An optional peer id that will be used to request the tx from (in addition to other random peers).
   * @returns A list of transactions or undefined if the transactions are not found.
   */
  requestTxsByHash(txHashes: TxHash[], pinnedPeerId: PeerId): Promise<Tx[]>;

  /**
   * Verifies the 'tx' and, if valid, adds it to local tx pool and forwards it to other peers.
   * @param tx - The transaction.
   **/
  sendTx(tx: Tx): Promise<void>;

  /**
   * Adds transactions to the pool. Does not send to peers or validate the tx.
   * @param txs - The transactions.
   * @returns The number of txs added to the pool. Note if the transaction already exists, it will not be added again.
   **/
  addTxsToPool(txs: Tx[]): Promise<number>;

  /**
   * Deletes 'txs' from the pool, given hashes.
   * NOT used if we use sendTx as reconcileTxPool will handle this.
   * @param txHashes - Hashes to check.
   **/
  deleteTxs(txHashes: TxHash[]): Promise<void>;

  /**
   * Returns a transaction in the transaction pool by its hash.
   * @param txHash  - Hash of tx to return.
   * @returns A single tx or undefined.
   */
  getTxByHashFromPool(txHash: TxHash): Promise<Tx | undefined>;

  /**
   * Returns transactions in the transaction pool by hash.
   * @param txHashes  - Hashes of txs to return.
   * @returns An array of txs or undefined.
   */
  getTxsByHashFromPool(txHashes: TxHash[]): Promise<(Tx | undefined)[]>;

  /**
   * Checks if transactions exist in the pool
   * @param txHashes - The hashes of the transactions to check for
   * @returns True or False for each hash
   */
  hasTxsInPool(txHashes: TxHash[]): Promise<boolean[]>;

  /**
   * Returns transactions in the transaction pool by hash, requesting from the network if not found.
   * @param txHashes  - Hashes of tx to return.
   * @param pinnedPeerId - An optional peer id that will be used to request the tx from (in addition to other random peers).
   * @returns An array of tx or undefined.
   */
  getTxsByHash(txHashes: TxHash[], pinnedPeerId: PeerId | undefined): Promise<(Tx | undefined)[]>;

  /**
   * Returns an archived transaction from the transaction pool by its hash.
   * @param txHash  - Hash of tx to return.
   * @returns A single tx or undefined.
   */
  getArchivedTxByHash(txHash: TxHash): Promise<Tx | undefined>;

  /**
   * Returns whether the given tx hash is flagged as pending or mined.
   * @param txHash - Hash of the tx to query.
   * @returns Pending or mined depending on its status, or undefined if not found.
   */
  getTxStatus(txHash: TxHash): Promise<'pending' | 'mined' | undefined>;

  /** Returns an iterator over pending txs on the mempool. */
  iteratePendingTxs(): AsyncIterableIterator<Tx>;

  /** Returns the number of pending txs in the mempool. */
  getPendingTxCount(): Promise<number>;

  /**
   * Marks transactions as non-evictable in the pool.
   * @param txHashes - Hashes of the transactions to mark as non-evictable.
   */
  markTxsAsNonEvictable(txHashes: TxHash[]): Promise<void>;

  /**
   * Starts the p2p client.
   * @returns A promise signalling the completion of the block sync.
   */
  start(): Promise<void>;

  /**
   * Stops the p2p client.
   * @returns A promise signalling the completion of the stop process.
   */
  stop(): Promise<void>;

  /**
   * Indicates if the p2p client is ready for transaction submission.
   * @returns A boolean flag indicating readiness.
   */
  isReady(): boolean;

  /**
   * Returns the current status of the p2p client.
   */
  getStatus(): Promise<P2PSyncState>;

  /**
   * Returns the ENR of this node, if any.
   */
  getEnr(): ENR | undefined;

  /** Identifies a p2p client. */
  isP2PClient(): true;

  updateP2PConfig(config: Partial<P2PConfig>): Promise<void>;

  /** Validates a set of txs. */
  validate(txs: Tx[]): Promise<void>;

  /** Clears the db. */
  clear(): Promise<void>;

  addReqRespSubProtocol(
    subProtocol: ReqRespSubProtocol,
    handler: ReqRespSubProtocolHandler,
    validator?: ReqRespSubProtocolValidators[ReqRespSubProtocol],
  ): Promise<void>;
};
