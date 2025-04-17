import { BBWASMBundlePrivateKernelProver } from '@aztec/bb-prover/wasm/bundle';
import { createLogger } from '@aztec/foundation/log';
import { createStore } from '@aztec/kv-store/indexeddb';
import { BundledProtocolContractsProvider } from '@aztec/protocol-contracts/providers/bundle';
import { WASMSimulator } from '@aztec/simulator/client';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';

import type { PXEServiceConfig } from '../../../config/index.js';
import { PXEService } from '../../../pxe_service/pxe_service.js';
import type { PXECreationOptions } from '../pxe_creation_options.js';

/**
 * Create and start an PXEService instance with the given AztecNode.
 * If no keyStore or database is provided, it will use KeyStore and MemoryDB as default values.
 * Returns a Promise that resolves to the started PXEService instance.
 *
 * @param aztecNode - The AztecNode instance to be used by the server.
 * @param config - The PXE Service Config to use
 * @param options - (Optional) Optional information for creating an PXEService.
 * @returns A Promise that resolves to the started PXEService instance.
 */
export async function createPXEService(
  aztecNode: AztecNode,
  config: PXEServiceConfig,
  options: PXECreationOptions = { loggers: {} },
) {
  const l1Contracts = await aztecNode.getL1ContractAddresses();
  const configWithContracts = {
    ...config,
    l1Contracts,
    l2BlockBatchSize: 200,
  } as PXEServiceConfig;

  const store = await createStore(
    'pxe_data',
    configWithContracts,
    options.loggers.store ?? createLogger('pxe:data:indexeddb'),
  );

  const simulationProvider = new WASMSimulator();
  const prover =
    options.prover ??
    new BBWASMBundlePrivateKernelProver(
      simulationProvider,
      16,
      options.loggers.prover ?? createLogger('bb:wasm:bundle'),
    );
  const protocolContractsProvider = new BundledProtocolContractsProvider();
  const pxe = await PXEService.create(
    aztecNode,
    store,
    prover,
    simulationProvider,
    protocolContractsProvider,
    config,
    options.loggers.pxe ?? createLogger('pxe:service'),
  );
  return pxe;
}
