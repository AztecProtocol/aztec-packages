import { BBPrivateKernelProver } from '@aztec/bb-prover/client';
import { BBBundlePrivateKernelProver } from '@aztec/bb-prover/client/bundle';
import { createLogger } from '@aztec/foundation/log';
import { createStore } from '@aztec/kv-store/lmdb-v2';
import { BundledProtocolContractsProvider } from '@aztec/protocol-contracts/providers/bundle';
import { MemoryCircuitRecorder, SimulatorRecorderWrapper, WASMSimulator } from '@aztec/simulator/client';
import { FileCircuitRecorder } from '@aztec/simulator/testing';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';

import type { PXEConfig } from '../../config/index.js';
import { PXE } from '../../pxe.js';
import { PXE_DATA_SCHEMA_VERSION } from '../../storage/index.js';
import type { PXECreationOptions } from '../pxe_creation_options.js';

type PXEConfigWithoutDefaults = Omit<PXEConfig, 'l1Contracts' | 'l1ChainId' | 'l2BlockBatchSize' | 'rollupVersion'>;

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

  const { l1ChainId, l1ContractAddresses: l1Contracts, rollupVersion } = await aztecNode.getNodeInfo();
  const configWithContracts: PXEConfig = {
    ...config,
    l1Contracts,
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
  if (options.proverOrOptions instanceof BBPrivateKernelProver) {
    prover = options.proverOrOptions;
  } else {
    prover = new BBBundlePrivateKernelProver(simulator, { ...options.proverOrOptions, logger: proverLogger });
  }

  const protocolContractsProvider = new BundledProtocolContractsProvider();

  const pxeLogger = loggers.pxe ?? createLogger('pxe:service', { actor });
  const pxe = await PXE.create({
    node: aztecNode,
    store: options.store,
    proofCreator: prover,
    simulator,
    protocolContractsProvider,
    config: configWithContracts,
    loggerOrSuffix: pxeLogger,
  });
  return pxe;
}
