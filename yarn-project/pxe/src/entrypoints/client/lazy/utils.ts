import { BBWASMLazyPrivateKernelProver } from '@aztec/bb-prover/wasm/lazy';
import { createLogger } from '@aztec/foundation/log';
import { createStore } from '@aztec/kv-store/indexeddb';
import { LazyProtocolContractsProvider } from '@aztec/protocol-contracts/providers/lazy';
import { WASMSimulator } from '@aztec/simulator/client';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';

import type { PXEServiceConfig } from '../../../config/index.js';
import { PXEService } from '../../../pxe_service/pxe_service.js';
import type { PXECreationOptions } from '../pxe_creation_options.js';

/**
 * Create and start an PXEService instance with the given AztecNode.
 * Returns a Promise that resolves to the started PXEService instance.
 *
 * @param aztecNode - The AztecNode instance to be used by the server.
 * @param config - The PXE Service Config to use
 * @param
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
  } as PXEServiceConfig;

  const store = await createStore(
    'pxe_data',
    configWithContracts,
    options.loggers.store ?? createLogger('pxe:data:indexeddb'),
  );

  const simulationProvider = new WASMSimulator();
  const prover =
    options.prover ??
    new BBWASMLazyPrivateKernelProver(simulationProvider, 16, options.loggers.prover ?? createLogger('bb:wasm:lazy'));
  const protocolContractsProvider = new LazyProtocolContractsProvider();
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
