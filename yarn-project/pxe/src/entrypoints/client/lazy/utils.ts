import { BBPrivateKernelProver } from '@aztec/bb-prover/client';
import { BBLazyPrivateKernelProver } from '@aztec/bb-prover/client/lazy';
import { createLogger } from '@aztec/foundation/log';
import { createStore } from '@aztec/kv-store/indexeddb';
import { LazyProtocolContractsProvider } from '@aztec/protocol-contracts/providers/lazy';
import { WASMSimulator } from '@aztec/simulator/client';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';

import type { PXEConfig } from '../../../config/index.js';
import { PXE } from '../../../pxe.js';
import { PXE_DATA_SCHEMA_VERSION } from '../../../storage/metadata.js';
import type { PXECreationOptions } from '../../pxe_creation_options.js';

/**
 * Create and start an PXE instance with the given AztecNode.
 * Returns a Promise that resolves to the started PXE instance.
 *
 * @param aztecNode - The AztecNode instance to be used by the server.
 * @param config - The PXE Config to use
 * @param options - (Optional) Optional information for creating an PXE.
 * @returns A Promise that resolves to the started PXE instance.
 */
export async function createPXE(
  aztecNode: AztecNode,
  config: PXEConfig,
  options: PXECreationOptions = { loggers: {} },
) {
  const actor = options.loggerActorLabel;

  const l1Contracts = await aztecNode.getL1ContractAddresses();
  const configWithContracts = {
    ...config,
    l1Contracts,
  } as PXEConfig;

  const loggers = options.loggers ?? {};

  const storeLogger = loggers.store ?? createLogger('pxe:data:idb', { actor });

  const store =
    options.store ?? (await createStore('pxe_data', configWithContracts, PXE_DATA_SCHEMA_VERSION, storeLogger));

  const simulator = options.simulator ?? new WASMSimulator();
  const proverLogger = loggers.prover ?? createLogger('pxe:bb:wasm:bundle', { actor });

  let prover;
  if (options.proverOrOptions instanceof BBPrivateKernelProver) {
    prover = options.proverOrOptions;
  } else {
    prover = new BBLazyPrivateKernelProver(simulator, { ...options.proverOrOptions, logger: proverLogger });
  }
  const protocolContractsProvider = new LazyProtocolContractsProvider();

  const pxeLogger = loggers.pxe ?? createLogger('pxe:service', { actor });
  const pxe = await PXE.create({
    node: aztecNode,
    store,
    proofCreator: prover,
    simulator,
    protocolContractsProvider,
    config,
    loggerOrSuffix: pxeLogger,
  });
  return pxe;
}
