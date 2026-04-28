import type { L1BlockId } from '@aztec/ethereum/l1-types';
import type { BlockNumber } from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractDataSource, ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import type { UInt64 } from '@aztec/stdlib/types';

import { join } from 'path';

import { BlockStore } from './block_store.js';
import { ContractClassStore } from './contract_class_store.js';
import { ContractInstanceStore } from './contract_instance_store.js';
import { LogStore } from './log_store.js';
import { MessageStore } from './message_store.js';

export const ARCHIVER_DB_VERSION = 6;
export const MAX_FUNCTION_SIGNATURES = 1000;
export const MAX_FUNCTION_NAME_LEN = 256;

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
  /** In-memory cache of public function selectors -> names, populated by `registerContractFunctionSignatures`. */
  functionNames: Map<string, string>;
};

/** Options used by {@link createArchiverDataStores}. */
export type CreateArchiverDataStoresOptions = {
  /** Maximum number of logs returned per page when paginating tagged log queries. */
  logsMaxPageSize?: number;
};

/**
 * Wires up the archiver substores against a shared KV store and returns the
 * {@link ArchiverDataStores} bundle.
 */
export function createArchiverDataStores(
  db: AztecAsyncKVStore,
  opts: CreateArchiverDataStoresOptions = {},
): ArchiverDataStores {
  const blocks = new BlockStore(db);
  return {
    db,
    blocks,
    logs: new LogStore(db, blocks, opts.logsMaxPageSize ?? 1000),
    messages: new MessageStore(db),
    contractClasses: new ContractClassStore(db),
    contractInstances: new ContractInstanceStore(db),
    functionNames: new Map(),
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

const registerSignaturesLog = createLogger('archiver:data-stores');

/**
 * Adds the given public function signatures to the in-memory selector -> name cache held by `stores`.
 * Used so that contract debug names can be resolved when displaying logs/traces.
 */
export async function registerContractFunctionSignatures(
  stores: ArchiverDataStores,
  signatures: string[],
): Promise<void> {
  for (const sig of signatures) {
    if (stores.functionNames.size > MAX_FUNCTION_SIGNATURES) {
      return;
    }
    try {
      const selector = await FunctionSelector.fromSignature(sig);
      stores.functionNames.set(selector.toString(), sig.slice(0, sig.indexOf('(')).slice(0, MAX_FUNCTION_NAME_LEN));
    } catch {
      registerSignaturesLog.warn(`Failed to parse signature: ${sig}. Ignoring`);
    }
  }
}

/** Looks up a public function name from the in-memory cache held by `stores`. */
export function getDebugFunctionName(
  stores: ArchiverDataStores,
  _address: AztecAddress,
  selector: FunctionSelector,
): Promise<string | undefined> {
  return Promise.resolve(stores.functionNames.get(selector.toString()));
}

/**
 * Returns a thin {@link ContractDataSource} adapter over {@link ArchiverDataStores}.
 * Used by contexts (e.g. offline epoch re-prover tools) that need a ContractDataSource
 * but do not need a full archiver instance.
 */
export function createContractDataSource(stores: ArchiverDataStores): ContractDataSource {
  return {
    getBlockNumber: () => stores.blocks.getLatestL2BlockNumber(),
    getContractClass: (id: Fr) => stores.contractClasses.getContractClass(id),
    getBytecodeCommitment: (id: Fr) => stores.contractClasses.getBytecodeCommitment(id),
    getContract: async (
      address: AztecAddress,
      maybeTimestamp?: UInt64,
    ): Promise<ContractInstanceWithAddress | undefined> => {
      let timestamp = maybeTimestamp;
      if (timestamp === undefined) {
        const latest = await stores.blocks.getLatestL2BlockNumber();
        if ((latest as BlockNumber) === 0) {
          timestamp = 0n;
        } else {
          const [header] = await stores.blocks.getBlockHeaders(latest, 1);
          timestamp = header ? header.globalVariables.timestamp : 0n;
        }
      }
      return stores.contractInstances.getContractInstance(address, timestamp);
    },
    getContractClassIds: () => stores.contractClasses.getContractClassIds(),
    getDebugFunctionName: (address: AztecAddress, selector: FunctionSelector) =>
      getDebugFunctionName(stores, address, selector),
    registerContractFunctionSignatures: (signatures: string[]) =>
      registerContractFunctionSignatures(stores, signatures),
  };
}
