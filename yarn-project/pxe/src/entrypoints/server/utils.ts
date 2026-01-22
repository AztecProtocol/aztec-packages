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

export async function createPXE(aztecNode: AztecNode, config: PXEConfigWithoutDefaults, options: PXECreationOptions) {
  const { loggers } = options;
  const storeLogger = loggers?.store ?? createLogger('pxe:store');
  const simulatorLogger = loggers?.simulator ?? createLogger('pxe:simulator');
  const proverLogger = loggers?.prover ?? createLogger('pxe:prover');
  const recorderLogger = loggers?.recorder ?? createLogger('pxe:recorder');
  const pxeLogger = loggers?.pxe ?? createLogger('pxe');

  const recorder = process.env.CIRCUIT_RECORD_DIR
    ? new FileCircuitRecorder(recorderLogger, process.env.CIRCUIT_RECORD_DIR)
    : new MemoryCircuitRecorder(recorderLogger);
  const simulator = new SimulatorRecorderWrapper(new WASMSimulator(simulatorLogger), recorder);

  const { l1ChainId, l1ContractAddresses: l1Contracts, rollupVersion } = await aztecNode.getNodeInfo();
  const configWithContracts: PXEConfig = {
    ...config,
    l1Contracts,
    l1ChainId,
    rollupVersion,
    l2BlockBatchSize: 50,
  };

  const store =
    options.store ?? (await createStore('pxe_data', PXE_DATA_SCHEMA_VERSION, configWithContracts, storeLogger));

  let prover;
  if (options.proverOrOptions instanceof BBPrivateKernelProver) {
    prover = options.proverOrOptions;
  } else {
    prover = new BBBundlePrivateKernelProver(simulator, { ...options.proverOrOptions, logger: proverLogger });
  }

  const protocolContractsProvider = new BundledProtocolContractsProvider();

  const pxe = await PXE.create(
    aztecNode,
    store,
    prover,
    simulator,
    protocolContractsProvider,
    configWithContracts,
    pxeLogger,
  );
  return pxe;
}
