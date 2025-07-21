import { BBNativePrivateKernelProver } from '@aztec/bb-prover/client/native';
import { BBWASMBundlePrivateKernelProver } from '@aztec/bb-prover/client/wasm/bundle';
import { randomBytes } from '@aztec/foundation/crypto';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { BundledProtocolContractsProvider } from '@aztec/protocol-contracts/providers/bundle';
import {
  type CircuitSimulator,
  MemoryCircuitRecorder,
  SimulatorRecorderWrapper,
  WASMSimulator,
} from '@aztec/simulator/client';
import { FileCircuitRecorder } from '@aztec/simulator/testing';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';

import type { PXEServiceConfig } from '../../config/index.js';
import { PXEService } from '../../pxe_service/pxe_service.js';
import { PXE_DATA_SCHEMA_VERSION } from '../../storage/index.js';
import type { PXECreationOptions } from '../pxe_creation_options.js';

type PXEConfigWithoutDefaults = Omit<
  PXEServiceConfig,
  'l1Contracts' | 'l1ChainId' | 'l2BlockBatchSize' | 'rollupVersion'
>;

/**
 * Create and start an PXEService instance with the given AztecNode and config.
 *
 * @param aztecNode - The AztecNode instance to be used by the server.
 * @param config - The PXE Service Config to use
 * @param useLogSuffix - Whether to add a randomly generated suffix to the PXE debug logs.
 * @returns A Promise that resolves to the started PXEService instance.
 */
export function createPXEService(
  aztecNode: AztecNode,
  config: PXEConfigWithoutDefaults,
  options: PXECreationOptions = { loggers: {} },
) {
  const simulator = new WASMSimulator();
  const recorder = process.env.CIRCUIT_RECORD_DIR
    ? new FileCircuitRecorder(process.env.CIRCUIT_RECORD_DIR)
    : new MemoryCircuitRecorder();
  const simulatorWithRecorder = new SimulatorRecorderWrapper(simulator, recorder);
  return createPXEServiceWithSimulator(aztecNode, simulatorWithRecorder, config, options);
}

/**
 * Create and start an PXEService instance with the given AztecNode, Simulator and config.
 *
 * @param aztecNode - The AztecNode instance to be used by the server.
 * @param simulator - The Simulator to use
 * @param config - The PXE Service Config to use
 * @param useLogSuffix - Whether to add a randomly generated suffix to the PXE debug logs.
 * @returns A Promise that resolves to the started PXEService instance.
 */
export async function createPXEServiceWithSimulator(
  aztecNode: AztecNode,
  simulator: CircuitSimulator,
  config: PXEConfigWithoutDefaults,
  options: PXECreationOptions = { loggers: {} },
) {
  const logSuffix =
    typeof options.useLogSuffix === 'boolean'
      ? options.useLogSuffix
        ? randomBytes(3).toString('hex')
        : undefined
      : options.useLogSuffix;
  const loggers = options.loggers ?? {};

  const { l1ChainId, l1ContractAddresses: l1Contracts, rollupVersion } = await aztecNode.getNodeInfo();
  const configWithContracts: PXEServiceConfig = {
    ...config,
    l1Contracts,
    l1ChainId,
    rollupVersion,
    l2BlockBatchSize: 50,
  };

  if (!options.store) {
    // TODO once https://github.com/AztecProtocol/aztec-packages/issues/13656 is fixed, we can remove this and always
    // import the lmdb-v2 version
    const { createStore } = await import('@aztec/kv-store/lmdb-v2');
    const storeLogger = loggers.store
      ? loggers.store
      : createLogger('pxe:data:lmdb' + (logSuffix ? `:${logSuffix}` : ''));
    options.store = await createStore('pxe_data', PXE_DATA_SCHEMA_VERSION, configWithContracts, storeLogger);
  }
  const proverLogger = loggers.prover
    ? loggers.prover
    : createLogger('pxe:bb:native' + (logSuffix ? `:${logSuffix}` : ''));

  const prover = options.prover ?? (await createProver(config, simulator, proverLogger));
  const protocolContractsProvider = new BundledProtocolContractsProvider();

  const pxeLogger = loggers.pxe ? loggers.pxe : createLogger('pxe:service' + (logSuffix ? `:${logSuffix}` : ''));
  const pxe = await PXEService.create(
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

function createProver(
  config: Pick<PXEServiceConfig, 'bbBinaryPath' | 'bbWorkingDirectory'>,
  simulator: CircuitSimulator,
  logger?: Logger,
) {
  if (!config.bbBinaryPath || !config.bbWorkingDirectory) {
    return new BBWASMBundlePrivateKernelProver(simulator, 16, logger);
  } else {
    const bbConfig = config as Required<Pick<PXEServiceConfig, 'bbBinaryPath' | 'bbWorkingDirectory'>> &
      PXEServiceConfig;
    return BBNativePrivateKernelProver.new(
      { bbSkipCleanup: false, numConcurrentIVCVerifiers: 1, bbIVCConcurrency: 1, ...bbConfig },
      simulator,
      logger,
    );
  }
}
