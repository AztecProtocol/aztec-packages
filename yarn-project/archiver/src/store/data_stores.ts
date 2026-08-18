import type { L1BlockId } from '@aztec/ethereum/l1-types';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import type { BlockHash } from '@aztec/stdlib/block';
import type { ContractDataSource } from '@aztec/stdlib/contract';

import { join } from 'path';

import { ArchiverContractDataSourceAdapter } from '../modules/contract_data_source_adapter.js';
import { BlockStore } from './block_store.js';
import { ContractClassStore } from './contract_class_store.js';
import { ContractInstanceStore } from './contract_instance_store.js';
import { FunctionNamesCache } from './function_names_cache.js';
import { LogStore } from './log_store.js';
import { MessageStore } from './message_store.js';

export const ARCHIVER_DB_VERSION = 9;

/**
 * Represents the latest L1 block processed by the archiver for various objects in L2.
 */
export type ArchiverL1SynchPoint = {
  /** Number of the last L1 block that added a new L2 checkpoint metadata.  */
  blocksSynchedTo?: bigint;
  /** Last L1 block checked for L1 to L2 messages. */
  messagesSynchedTo?: L1BlockId;
};

/**
 * Bundle of archiver-owned LMDB substores plus the in-memory caches that span them.
 *
 * Replaces the former `KVArchiverDataStore` pass-through wrapper. Callers reach into
 * the relevant substore directly (e.g. `stores.blocks.getBlock`) and use
 * {@link createArchiverDataStores} to wire them up against a shared KV store.
 */
export type ArchiverDataStores = {
  /** The underlying key-value store. Use {@link AztecAsyncKVStore.transactionAsync} to compose updates atomically. */
  db: AztecAsyncKVStore;
  /** Blocks, checkpoints, tx effects, proven/finalized state. */
  blocks: BlockStore;
  /** Public, private and contract class logs. */
  logs: LogStore;
  /** L1 to L2 messages and message sync state. */
  messages: MessageStore;
  /** Contract classes (with bytecode commitments). */
  contractClasses: ContractClassStore;
  /** Contract instances and contract instance updates. */
  contractInstances: ContractInstanceStore;
  /** In-memory cache of public function selectors -> names. */
  functionNames: FunctionNamesCache;
};

/**
 * Wires up the archiver substores against a shared KV store and returns the
 * {@link ArchiverDataStores} bundle.
 *
 * @param genesisBlockHash - Hash of the synthetic genesis block, forwarded to the {@link LogStore} so it
 *   can resolve a genesis `referenceBlock` (used by the PXE during early sync) instead of treating it as a
 *   reorg.
 */
export function createArchiverDataStores(db: AztecAsyncKVStore, genesisBlockHash: BlockHash): ArchiverDataStores {
  const blocks = new BlockStore(db);
  return {
    db,
    blocks,
    logs: new LogStore(db, blocks, genesisBlockHash),
    messages: new MessageStore(db),
    contractClasses: new ContractClassStore(db),
    contractInstances: new ContractInstanceStore(db),
    functionNames: new FunctionNamesCache(),
  };
}

/**
 * Returns the L1 sync point of the archiver, combining the block sync point from {@link BlockStore}
 * and the message sync point from {@link MessageStore}.
 */
export async function getArchiverSynchPoint(stores: ArchiverDataStores): Promise<ArchiverL1SynchPoint> {
  const [blocksSynchedTo, messagesSynchedTo] = await Promise.all([
    stores.blocks.getSynchedL1BlockNumber(),
    stores.messages.getSynchedL1Block(),
  ]);
  return { blocksSynchedTo, messagesSynchedTo };
}

/**
 * Backs up the underlying KV store to the given folder. Returns the path to the resulting db file.
 */
export async function backupArchiverDataStores(
  stores: ArchiverDataStores,
  path: string,
  compress = true,
): Promise<string> {
  await stores.db.backupTo(path, compress);
  return join(path, 'data.mdb');
}

/**
 * Returns a {@link ContractDataSource} adapter over {@link ArchiverDataStores}.
 * Used by contexts (e.g. offline epoch re-prover tools) that need a ContractDataSource
 * but do not need a full archiver instance.
 */
export function createContractDataSource(stores: ArchiverDataStores): ContractDataSource {
  return new ArchiverContractDataSourceAdapter(stores);
}
