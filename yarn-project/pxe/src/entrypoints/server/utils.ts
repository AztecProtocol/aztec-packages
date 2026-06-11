import { BBBundlePrivateKernelProver } from '@aztec/bb-prover/client/bundle';
import type { L1ContractAddresses } from '@aztec/ethereum/l1-contract-addresses';
import { createLogger } from '@aztec/foundation/log';
import { createStore } from '@aztec/kv-store/lmdb-v2';
import { BundledProtocolContractsProvider } from '@aztec/protocol-contracts/providers/bundle';
import { MemoryCircuitRecorder, SimulatorRecorderWrapper, WASMSimulator } from '@aztec/simulator/client';
import { FileCircuitRecorder } from '@aztec/simulator/testing';
import { getStandardAuthRegistry } from '@aztec/standard-contracts/auth-registry/lazy';
import { getStandardHandshakeRegistry } from '@aztec/standard-contracts/handshake-registry/lazy';
import { getStandardMultiCallEntrypoint } from '@aztec/standard-contracts/multi-call-entrypoint/lazy';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';

import type { PXEConfig } from '../../config/index.js';
import { PXE } from '../../pxe.js';
import { PXE_DATA_SCHEMA_VERSION } from '../../storage/index.js';
import { type PXECreationOptions, isPrivateKernelProver } from '../pxe_creation_options.js';

type PXEConfigWithoutDefaults = Omit<
  PXEConfig,
  'l1ChainId' | 'l2BlockBatchSize' | 'rollupVersion' | keyof L1ContractAddresses
>;

export async function createPXE(
  aztecNode: AztecNode,
  config: PXEConfigWithoutDefaults,
  options: PXECreationOptions = { loggers: {} },
) {
  const actor = options.loggerActorLabel;
  const recorderLogger = createLogger('simulator:acvm:recording', { actor });
  const recorder = process.env.CIRCUIT_RECORD_DIR
    ? new FileCircuitRecorder(process.env.CIRCUIT_RECORD_DIR, recorderLogger)
    : new MemoryCircuitRecorder(recorderLogger);
  const simulatorLogger = createLogger('wasm-simulator', { actor });
  const simulator = new SimulatorRecorderWrapper(new WASMSimulator(simulatorLogger), recorder);
  const loggers = options.loggers ?? {};

  const { l1ChainId, l1ContractAddresses, rollupVersion } = await aztecNode.getNodeInfo();
  const configWithContracts: PXEConfig = {
    ...config,
    ...l1ContractAddresses,
    l1ChainId,
    rollupVersion,
    l2BlockBatchSize: 50,
  };

  if (!options.store) {
    const storeLogger = loggers.store ?? createLogger('pxe:data:lmdb', { actor });
    options.store = await createStore(
      'pxe_data',
      PXE_DATA_SCHEMA_VERSION,
      configWithContracts,
      storeLogger.getBindings(),
    );
  }
  const proverLogger = loggers.prover ?? createLogger('pxe:bb:native', { actor });

  let prover;
  if (isPrivateKernelProver(options.proverOrOptions)) {
    prover = options.proverOrOptions;
  } else {
    prover = new BBBundlePrivateKernelProver(simulator, { ...options.proverOrOptions, logger: proverLogger });
  }

  const protocolContractsProvider = new BundledProtocolContractsProvider();
  const preloadedContractsProvider = options.preloadedContractsProvider ?? {
    getPreloadedContracts: async () => [
      await getStandardMultiCallEntrypoint(),
      await getStandardAuthRegistry(),
      await getStandardHandshakeRegistry(),
    ],
  };

  const pxeLogger = loggers.pxe ?? createLogger('pxe:service', { actor });
  const pxe = await PXE.create({
    node: aztecNode,
    store: options.store,
    proofCreator: prover,
    simulator,
    protocolContractsProvider,
    preloadedContractsProvider,
    config: configWithContracts,
    loggerOrSuffix: pxeLogger,
    hooks: options.hooks,
  });
  return pxe;
}
