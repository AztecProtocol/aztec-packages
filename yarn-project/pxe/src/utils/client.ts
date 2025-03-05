import { BBWASMLazyPrivateKernelProver } from '@aztec/bb-prover/wasm/lazy';
import { randomBytes } from '@aztec/foundation/crypto';
import { createLogger } from '@aztec/foundation/log';
import { createStore } from '@aztec/kv-store/indexeddb';
import { LazyProtocolContractsProvider } from '@aztec/protocol-contracts/providers/lazy';
import { type SimulationProvider, WASMSimulator } from '@aztec/simulator/client';
import type { AztecNode, PrivateKernelProver } from '@aztec/stdlib/interfaces/client';

import type { PXEServiceConfig } from '../config/index.js';
import { PXEService } from '../pxe_service/pxe_service.js';

/**
 * Create and start an PXEService instance with the given AztecNode.
 * If no keyStore or database is provided, it will use KeyStore and MemoryDB as default values.
 * Returns a Promise that resolves to the started PXEService instance.
 *
 * @param aztecNode - The AztecNode instance to be used by the server.
 * @param config - The PXE Service Config to use
 * @param options - (Optional) Optional information for creating an PXEService.
 * @param proofCreator - An optional proof creator to use in place of any other configuration
 * @returns A Promise that resolves to the started PXEService instance.
 */
export async function createPXEService(
  aztecNode: AztecNode,
  config: PXEServiceConfig,
  useLogSuffix: string | boolean | undefined = undefined,
  proofCreator?: PrivateKernelProver,
) {
  const logSuffix =
    typeof useLogSuffix === 'boolean' ? (useLogSuffix ? randomBytes(3).toString('hex') : undefined) : useLogSuffix;

  const l1Contracts = await aztecNode.getL1ContractAddresses();
  const configWithContracts = {
    ...config,
    l1Contracts,
  } as PXEServiceConfig;

  const store = await createStore('pxe_data', configWithContracts, createLogger('pxe:data:indexeddb'));

  const simulationProvider = new WASMSimulator();
  const prover = proofCreator ?? new BBWASMLazyPrivateKernelProver(simulationProvider, 16);
  const protocolContractsProvider = new LazyProtocolContractsProvider();
  const pxe = await PXEService.create(
    aztecNode,
    store,
    prover,
    simulationProvider,
    protocolContractsProvider,
    config,
    logSuffix,
  );
  return pxe;
}
