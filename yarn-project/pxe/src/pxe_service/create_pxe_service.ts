import { BBNativePrivateKernelProver } from '@aztec/bb-prover';
import { type AztecNode, type PrivateKernelProver } from '@aztec/circuit-types';
import { randomBytes } from '@aztec/foundation/crypto';
import { createDebugLogger } from '@aztec/foundation/log';
import { KeyStore } from '@aztec/key-store';
import { createStore } from '@aztec/kv-store/utils';
import { getCanonicalAuthRegistry } from '@aztec/protocol-contracts/auth-registry';
import { getCanonicalClassRegisterer } from '@aztec/protocol-contracts/class-registerer';
import { getCanonicalFeeJuice } from '@aztec/protocol-contracts/fee-juice';
import { getCanonicalInstanceDeployer } from '@aztec/protocol-contracts/instance-deployer';
import { getCanonicalKeyRegistry } from '@aztec/protocol-contracts/key-registry';
import { getCanonicalMultiCallEntrypointContract } from '@aztec/protocol-contracts/multi-call-entrypoint';

import { join } from 'path';

import { type PXEServiceConfig } from '../config/index.js';
import { KVPxeDatabase } from '../database/kv_pxe_database.js';
import { TestPrivateKernelProver } from '../kernel_prover/test/test_circuit_prover.js';
import { PXEService } from './pxe_service.js';

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

  const pxeDbPath = config.dataDirectory ? join(config.dataDirectory, 'pxe_data') : undefined;
  const keyStorePath = config.dataDirectory ? join(config.dataDirectory, 'pxe_key_store') : undefined;
  const l1Contracts = await aztecNode.getL1ContractAddresses();

  const keyStore = new KeyStore(await createStore(keyStorePath, l1Contracts.rollupAddress));
  const db = new KVPxeDatabase(await createStore(pxeDbPath, l1Contracts.rollupAddress));

  const prover = proofCreator ?? (await createProver(config, logSuffix));
  const server = new PXEService(keyStore, aztecNode, db, prover, config, logSuffix);
  for (const contract of [
    getCanonicalClassRegisterer(),
    getCanonicalInstanceDeployer(),
    getCanonicalMultiCallEntrypointContract(),
    getCanonicalFeeJuice(),
    getCanonicalKeyRegistry(),
    getCanonicalAuthRegistry(),
  ]) {
    await server.registerContract(contract);
  }

  await server.start();
  return server;
}

function createProver(config: PXEServiceConfig, logSuffix?: string) {
  if (!config.proverEnabled) {
    return new TestPrivateKernelProver();
  }

  // (@PhilWindle) Temporary validation until WASM is implemented
  if (!config.bbBinaryPath || !config.bbWorkingDirectory) {
    throw new Error(`Prover must be configured with binary path and working directory`);
  }
  const bbConfig = config as Required<Pick<PXEServiceConfig, 'bbBinaryPath' | 'bbWorkingDirectory'>> & PXEServiceConfig;
  const log = createDebugLogger('aztec:pxe:bb-native-prover' + (logSuffix ? `:${logSuffix}` : ''));
  return BBNativePrivateKernelProver.new(bbConfig, log);
}
