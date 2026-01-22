import { BBPrivateKernelProver } from '@aztec/bb-prover/client';
import { BBBundlePrivateKernelProver } from '@aztec/bb-prover/client/bundle';
import { createLogger } from '@aztec/foundation/log';
import { createStore } from '@aztec/kv-store/indexeddb';
import { BundledProtocolContractsProvider } from '@aztec/protocol-contracts/providers/bundle';
import { WASMSimulator } from '@aztec/simulator/client';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';

import type { PXEConfig } from '../../../config/index.js';
import { PXE } from '../../../pxe.js';
import type { PXECreationOptions } from '../../pxe_creation_options.js';

/**
 * Create and start an PXE instance with the given AztecNode.
 * If no keyStore or database is provided, it will use KeyStore and MemoryDB as default values.
 * Returns a Promise that resolves to the started PXE instance.
 *
 * @param aztecNode - The AztecNode instance to be used by the server.
 * @param config - The PXE Config to use
 * @param options - Options for creating a PXE, including optional loggers.
 * @returns A Promise that resolves to the started PXE instance.
 */
export async function createPXE(aztecNode: AztecNode, config: PXEConfig, options: PXECreationOptions) {
  const { loggers } = options;
  const storeLogger = loggers?.store ?? createLogger('pxe:store');
  const simulatorLogger = loggers?.simulator ?? createLogger('pxe:simulator');
  const proverLogger = loggers?.prover ?? createLogger('pxe:prover');
  const pxeLogger = loggers?.pxe ?? createLogger('pxe');

  const l1Contracts = await aztecNode.getL1ContractAddresses();
  const configWithContracts = {
    ...config,
    l1Contracts,
  } as PXEConfig;

  const store = options.store ?? (await createStore('pxe_data', configWithContracts, storeLogger));

  const simulator = options.simulator ?? new WASMSimulator(simulatorLogger);

  let prover;
  if (options.proverOrOptions instanceof BBPrivateKernelProver) {
    prover = options.proverOrOptions;
  } else {
    prover = new BBBundlePrivateKernelProver(simulator, { ...options.proverOrOptions, logger: proverLogger });
  }
  const protocolContractsProvider = new BundledProtocolContractsProvider();

  const pxe = await PXE.create(aztecNode, store, prover, simulator, protocolContractsProvider, config, pxeLogger);
  return pxe;
}
