import { type ArchiverApi, type Service } from '@aztec/circuit-types';
import { type ContractClassPublic, computePublicBytecodeCommitment } from '@aztec/circuits.js';
import { FunctionSelector, FunctionType } from '@aztec/foundation/abi';
import { createLogger } from '@aztec/foundation/log';
import { type Maybe } from '@aztec/foundation/types';
import { type DataStoreConfig } from '@aztec/kv-store/config';
import { createStore } from '@aztec/kv-store/lmdb';
import { protocolContractNames } from '@aztec/protocol-contracts';
import { getCanonicalProtocolContract } from '@aztec/protocol-contracts/bundle';
import { type TelemetryClient } from '@aztec/telemetry-client';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

import { Archiver } from './archiver/archiver.js';
import { type ArchiverConfig } from './archiver/config.js';
import { KVArchiverDataStore } from './archiver/index.js';
import { createArchiverClient } from './rpc/index.js';

export async function createArchiver(
  config: ArchiverConfig & DataStoreConfig,
  telemetry: TelemetryClient = new NoopTelemetryClient(),
  opts: { blockUntilSync: boolean } = { blockUntilSync: true },
): Promise<ArchiverApi & Maybe<Service>> {
  if (!config.archiverUrl) {
    const store = await createStore('archiver', config, createLogger('archiver:lmdb'));
    const archiverStore = new KVArchiverDataStore(store, config.maxLogs);
    await registerProtocolContracts(archiverStore);
    return Archiver.createAndSync(config, archiverStore, telemetry, opts.blockUntilSync);
  } else {
    return createArchiverClient(config.archiverUrl);
  }
}

async function registerProtocolContracts(store: KVArchiverDataStore) {
  const blockNumber = 0;
  for (const name of protocolContractNames) {
    const contract = getCanonicalProtocolContract(name);
    const contractClassPublic: ContractClassPublic = {
      ...contract.contractClass,
      privateFunctions: [],
      unconstrainedFunctions: [],
    };

    const functionNames: Record<string, string> = {};
    for (const fn of contract.artifact.functions) {
      if (fn.functionType === FunctionType.PUBLIC) {
        functionNames[FunctionSelector.fromNameAndParameters(fn.name, fn.parameters).toString()] = fn.name;
      }
    }

    await store.registerContractFunctionName(contract.address, functionNames);
    const bytecodeCommitment = computePublicBytecodeCommitment(contractClassPublic.packedBytecode);
    await store.addContractClasses([contractClassPublic], [bytecodeCommitment], blockNumber);
    await store.addContractInstances([contract.instance], blockNumber);
  }
}
