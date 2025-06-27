import { BBWASMLazyPrivateKernelProver } from '@aztec/bb-prover/client/wasm/lazy';
import { randomBytes } from '@aztec/foundation/crypto';
import { createLogger } from '@aztec/foundation/log';
import { createStore } from '@aztec/kv-store/indexeddb';
import { LazyProtocolContractsProvider } from '@aztec/protocol-contracts/providers/lazy';
import { WASMSimulator } from '@aztec/simulator/client';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';

import type { PXEServiceConfig } from '../../../config/index.js';
import { PXEService } from '../../../pxe_service/pxe_service.js';
import type { PXECreationOptions } from '../../pxe_creation_options.js';

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
  const logSuffix =
    typeof options.useLogSuffix === 'boolean'
      ? options.useLogSuffix
        ? randomBytes(3).toString('hex')
        : undefined
      : options.useLogSuffix;

  const l1Contracts = await aztecNode.getL1ContractAddresses();
  const configWithContracts = {
    ...config,
    l2BlockBatchSize: 50,
    l1Contracts,
  } as PXEServiceConfig;

  const loggers = options.loggers ?? {};

  const storeLogger = loggers.store ? loggers.store : createLogger('pxe:data:idb' + (logSuffix ? `:${logSuffix}` : ''));

  const store = options.store ?? (await createStore('pxe_data', configWithContracts, storeLogger));

  const simulator = new WASMSimulator();
  const proverLogger = loggers.prover
    ? loggers.prover
    : createLogger('pxe:bb:wasm:bundle' + (logSuffix ? `:${logSuffix}` : ''));

  const prover = options.prover ?? new BBWASMLazyPrivateKernelProver(simulator, 16, proverLogger);

  const protocolContractsProvider = new LazyProtocolContractsProvider();

  const pxeLogger = loggers.pxe ? loggers.pxe : createLogger('pxe:service' + (logSuffix ? `:${logSuffix}` : ''));
  const pxe = await PXEService.create(
    aztecNode,
    store,
    prover,
    simulator,
    protocolContractsProvider,
    config,
    pxeLogger,
  );
  return pxe;
}
