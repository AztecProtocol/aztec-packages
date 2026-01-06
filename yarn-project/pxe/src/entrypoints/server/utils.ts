import { BBPrivateKernelProver } from '@aztec/bb-prover/client';
import { BBBundlePrivateKernelProver } from '@aztec/bb-prover/client/bundle';
import { randomBytes } from '@aztec/foundation/crypto/random';
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
  const recorder = process.env.CIRCUIT_RECORD_DIR
    ? new FileCircuitRecorder(process.env.CIRCUIT_RECORD_DIR)
    : new MemoryCircuitRecorder();
  const simulator = new SimulatorRecorderWrapper(new WASMSimulator(), recorder);

  const logSuffix =
    typeof options.useLogSuffix === 'boolean'
      ? options.useLogSuffix
        ? randomBytes(3).toString('hex')
        : undefined
      : options.useLogSuffix;
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
    const storeLogger = loggers.store
      ? loggers.store
      : createLogger('pxe:data:lmdb' + (logSuffix ? `:${logSuffix}` : ''));
    options.store = await createStore('pxe_data', PXE_DATA_SCHEMA_VERSION, configWithContracts, storeLogger);
  }
  const proverLogger = loggers.prover
    ? loggers.prover
    : createLogger('pxe:bb:native' + (logSuffix ? `:${logSuffix}` : ''));

  let prover;
  if (options.proverOrOptions instanceof BBPrivateKernelProver) {
    prover = options.proverOrOptions;
  } else {
    prover = new BBBundlePrivateKernelProver(simulator, { ...options.proverOrOptions, logger: proverLogger });
  }

  const protocolContractsProvider = new BundledProtocolContractsProvider();

  const pxeLogger = loggers.pxe ? loggers.pxe : createLogger('pxe:service' + (logSuffix ? `:${logSuffix}` : ''));
  const pxe = await PXE.create(
    aztecNode,
    options.store,
    prover,
    simulator,
    protocolContractsProvider,
    configWithContracts,
    pxeLogger,
  );
  return pxe;
}
