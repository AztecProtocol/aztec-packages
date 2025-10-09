import { createLogger } from '@aztec/foundation/log';
import type { DataStoreConfig } from '@aztec/kv-store/config';
import { createStore } from '@aztec/kv-store/lmdb-v2';
import { protocolContractNames } from '@aztec/protocol-contracts';
import { BundledProtocolContractsProvider } from '@aztec/protocol-contracts/providers/bundle';
import { FunctionType, decodeFunctionSignature } from '@aztec/stdlib/abi';
import type { L2BlockSourceEventEmitter } from '@aztec/stdlib/block';
import { type ContractClassPublic, computePublicBytecodeCommitment } from '@aztec/stdlib/contract';
import type { ArchiverApi, Service } from '@aztec/stdlib/interfaces/server';

import { Archiver, type ArchiverDeps } from './archiver/archiver.js';
import type { ArchiverDataStore } from './archiver/archiver_store.js';
import type { ArchiverConfig } from './archiver/config.js';
import type { ContractDataStore } from './archiver/kv_archiver_store/contract_data_store.js';
import { ARCHIVER_DB_VERSION, KVArchiverDataStore } from './archiver/kv_archiver_store/kv_archiver_store.js';
import { KVContractDataStore } from './archiver/kv_archiver_store/kv_contract_data_store.js';

export const ARCHIVER_STORE_NAME = 'archiver';

/** Creates an archiver store. */
export async function createArchiverStore(
  userConfig: Pick<ArchiverConfig, 'archiverStoreMapSizeKb' | 'maxLogs'> & DataStoreConfig,
) {
  const config = {
    ...userConfig,
    dataStoreMapSizeKB: userConfig.archiverStoreMapSizeKb ?? userConfig.dataStoreMapSizeKB,
  };
  const db = await createStore(ARCHIVER_STORE_NAME, ARCHIVER_DB_VERSION, config, createLogger('archiver:lmdb'));

  // Create both stores using the same DB (for now - Phase 3 will split them)
  const contractStore = new KVContractDataStore(db);
  const archiverStore = new KVArchiverDataStore(db, config.maxLogs);

  // Return both stores
  return { archiverStore, contractStore };
}

/**
 * Creates a local archiver.
 * @param config - The archiver configuration.
 * @param blobSinkClient - The blob sink client.
 * @param opts - The options.
 * @param telemetry - The telemetry client.
 * @returns The local archiver.
 */
export async function createArchiver(
  config: ArchiverConfig & DataStoreConfig,
  deps: ArchiverDeps,
  opts: { blockUntilSync: boolean } = { blockUntilSync: true },
): Promise<ArchiverApi & Service & L2BlockSourceEventEmitter> {
  const { archiverStore, contractStore } = await createArchiverStore(config);
  await registerProtocolContracts(archiverStore, contractStore);
  return Archiver.createAndSync(config, archiverStore, contractStore, deps, opts.blockUntilSync);
}

async function registerProtocolContracts(archiverStore: ArchiverDataStore, contractStore: ContractDataStore) {
  const blockNumber = 0;
  for (const name of protocolContractNames) {
    const provider = new BundledProtocolContractsProvider();
    const contract = await provider.getProtocolContractArtifact(name);
    const contractClassPublic: ContractClassPublic = {
      ...contract.contractClass,
      privateFunctions: [],
      utilityFunctions: [],
    };

    const publicFunctionSignatures = contract.artifact.functions
      .filter(fn => fn.functionType === FunctionType.PUBLIC)
      .map(fn => decodeFunctionSignature(fn.name, fn.parameters));

    await archiverStore.registerContractFunctionSignatures(publicFunctionSignatures);
    const bytecodeCommitment = await computePublicBytecodeCommitment(contractClassPublic.packedBytecode);
    await contractStore.addContractClasses([contractClassPublic], [bytecodeCommitment], blockNumber);
    await contractStore.addContractInstances([contract.instance], blockNumber);
  }
}
