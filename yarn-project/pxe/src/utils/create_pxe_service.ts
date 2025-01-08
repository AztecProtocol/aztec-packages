import { BBNativePrivateKernelProver } from '@aztec/bb-prover';
import { BbWasmSyncPrivateKernelProver } from '@aztec/bb-prover/wasm';
import { type AztecNode, type PrivateKernelProver } from '@aztec/circuit-types';
import { randomBytes } from '@aztec/foundation/crypto';
import { createLogger } from '@aztec/foundation/log';
import { KeyStore } from '@aztec/key-store';
import { createStore } from '@aztec/kv-store/lmdb';
import { L2TipsStore } from '@aztec/kv-store/stores';

import { type PXEServiceConfig } from '../config/index.js';
import { KVPxeDatabase } from '../database/kv_pxe_database.js';
import { TestPrivateKernelProver } from '../kernel_prover/test/test_circuit_prover.js';
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

  const keyStore = new KeyStore(
    await createStore('pxe_key_store', configWithContracts, createLogger('pxe:keystore:lmdb')),
  );

  const store = await createStore('pxe_data', configWithContracts, createLogger('pxe:data:lmdb'));

  const db = await KVPxeDatabase.create(store);
  const tips = new L2TipsStore(store, 'pxe');

  const prover = proofCreator ?? (await createProver(config, logSuffix));
  const pxe = new PXEService(keyStore, aztecNode, db, tips, prover, config, logSuffix);
  await pxe.init();
  return pxe;
}

function createProver(config: PXEServiceConfig, logSuffix?: string) {
  if (!config.proverEnabled) {
    return new TestPrivateKernelProver();
  }

  if (!config.bbBinaryPath || !config.bbWorkingDirectory) {
    return new BbWasmSyncPrivateKernelProver(16);
  } else {
    const bbConfig = config as Required<Pick<PXEServiceConfig, 'bbBinaryPath' | 'bbWorkingDirectory'>> &
      PXEServiceConfig;
    const log = createLogger('pxe:bb-native-prover' + (logSuffix ? `:${logSuffix}` : ''));
    return BBNativePrivateKernelProver.new({ bbSkipCleanup: false, ...bbConfig }, log);
  }
}
