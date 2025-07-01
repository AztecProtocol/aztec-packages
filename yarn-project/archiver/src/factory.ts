import type { BlobSinkClientInterface } from '@aztec/blob-sink/client';
import { createLogger } from '@aztec/foundation/log';
import type { DataStoreConfig } from '@aztec/kv-store/config';
import { createStore } from '@aztec/kv-store/lmdb-v2';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractNames, protocolContractTreeRoot } from '@aztec/protocol-contracts';
import { BundledProtocolContractsProvider } from '@aztec/protocol-contracts/providers/bundle';
import { FunctionType, decodeFunctionSignature } from '@aztec/stdlib/abi';
import type { L2BlockSourceEventEmitter } from '@aztec/stdlib/block';
import { type ContractClassPublic, computePublicBytecodeCommitment } from '@aztec/stdlib/contract';
import type { ArchiverApi, Service } from '@aztec/stdlib/interfaces/server';
import { getComponentsVersionsFromConfig } from '@aztec/stdlib/versioning';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import { Archiver } from './archiver/archiver.js';
import type { ArchiverConfig } from './archiver/config.js';
import { ARCHIVER_DB_VERSION, KVArchiverDataStore } from './archiver/kv_archiver_store/kv_archiver_store.js';
import { createArchiverClient } from './rpc/index.js';

export const ARCHIVER_STORE_NAME = 'archiver';

/** Creates an archiver store. */
export async function createArchiverStore(
  userConfig: Pick<ArchiverConfig, 'archiverStoreMapSizeKb' | 'maxLogs'> & DataStoreConfig,
) {
  const config = {
    ...userConfig,
    dataStoreMapSizeKB: userConfig.archiverStoreMapSizeKb ?? userConfig.dataStoreMapSizeKB,
  };
  const store = await createStore(ARCHIVER_STORE_NAME, ARCHIVER_DB_VERSION, config, createLogger('archiver:lmdb'));
  return new KVArchiverDataStore(store, config.maxLogs);
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
  blobSinkClient: BlobSinkClientInterface,
  opts: { blockUntilSync: boolean } = { blockUntilSync: true },
  telemetry: TelemetryClient = getTelemetryClient(),
): Promise<ArchiverApi & Service & L2BlockSourceEventEmitter> {
  const archiverStore = await createArchiverStore(config);
  await registerProtocolContracts(archiverStore);
  return Archiver.createAndSync(config, archiverStore, { telemetry, blobSinkClient }, opts.blockUntilSync);
}

/**
 * Creates a remote archiver client.
 * @param config - The archiver configuration.
 * @returns The remote archiver client.
 */
export function createRemoteArchiver(config: ArchiverConfig): ArchiverApi {
  if (!config.archiverUrl) {
    throw new Error('Archiver URL is required');
  }

  return createArchiverClient(
    config.archiverUrl,
    getComponentsVersionsFromConfig(config, protocolContractTreeRoot, getVKTreeRoot()),
  );
}

async function registerProtocolContracts(store: KVArchiverDataStore) {
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

    await store.registerContractFunctionSignatures(publicFunctionSignatures);
    const bytecodeCommitment = await computePublicBytecodeCommitment(contractClassPublic.packedBytecode);
    await store.addContractClasses([contractClassPublic], [bytecodeCommitment], blockNumber);
    await store.addContractInstances([contract.instance], blockNumber);
  }
}
