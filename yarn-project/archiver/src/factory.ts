import { type BlobSinkClientInterface } from '@aztec/blob-sink/client';
import { type ArchiverApi, type Service } from '@aztec/circuit-types';
import {
  type ContractClassPublic,
  computePublicBytecodeCommitment,
  getContractClassFromArtifact,
} from '@aztec/circuits.js';
import { FunctionType, decodeFunctionSignature } from '@aztec/foundation/abi';
import { createLogger } from '@aztec/foundation/log';
import { type Maybe } from '@aztec/foundation/types';
import { type DataStoreConfig } from '@aztec/kv-store/config';
import { createStore } from '@aztec/kv-store/lmdb';
import { TokenContractArtifact } from '@aztec/noir-contracts.js/Token';
import { TokenBridgeContractArtifact } from '@aztec/noir-contracts.js/TokenBridge';
import { protocolContractNames } from '@aztec/protocol-contracts';
import { getCanonicalProtocolContract } from '@aztec/protocol-contracts/bundle';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import { Archiver } from './archiver/archiver.js';
import { type ArchiverConfig } from './archiver/config.js';
import { KVArchiverDataStore } from './archiver/index.js';
import { createArchiverClient } from './rpc/index.js';

export async function createArchiver(
  config: ArchiverConfig & DataStoreConfig,
  blobSinkClient: BlobSinkClientInterface,
  opts: { blockUntilSync: boolean } = { blockUntilSync: true },
  telemetry: TelemetryClient = getTelemetryClient(),
): Promise<ArchiverApi & Maybe<Service>> {
  if (!config.archiverUrl) {
    const store = await createStore('archiver', config, createLogger('archiver:lmdb'));
    const archiverStore = new KVArchiverDataStore(store, config.maxLogs);
    await registerProtocolContracts(archiverStore);
    await registerCommonContracts(archiverStore);
    return Archiver.createAndSync(config, archiverStore, { telemetry, blobSinkClient }, opts.blockUntilSync);
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

    const publicFunctionSignatures = contract.artifact.functions
      .filter(fn => fn.functionType === FunctionType.PUBLIC)
      .map(fn => decodeFunctionSignature(fn.name, fn.parameters));

    await store.registerContractFunctionSignatures(contract.address, publicFunctionSignatures);
    const bytecodeCommitment = computePublicBytecodeCommitment(contractClassPublic.packedBytecode);
    await store.addContractClasses([contractClassPublic], [bytecodeCommitment], blockNumber);
    await store.addContractInstances([contract.instance], blockNumber);
  }
}

// TODO(#10007): Remove this method. We are explicitly registering these contracts
// here to ensure they are available to all nodes and all prover nodes, since the PXE
// was tweaked to automatically push contract classes to the node it is registered,
// but other nodes in the network may require the contract classes to be registered as well.
// TODO(#10007): Remove the dependency on noir-contracts.js from this package once we remove this.
async function registerCommonContracts(store: KVArchiverDataStore) {
  const blockNumber = 0;
  const artifacts = [TokenBridgeContractArtifact, TokenContractArtifact];
  const classes = artifacts.map(artifact => ({
    ...getContractClassFromArtifact(artifact),
    privateFunctions: [],
    unconstrainedFunctions: [],
  }));
  const bytecodeCommitments = classes.map(x => computePublicBytecodeCommitment(x.packedBytecode));
  await store.addContractClasses(classes, bytecodeCommitments, blockNumber);
}
