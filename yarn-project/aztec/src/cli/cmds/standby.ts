import { getInitialTestAccountsData } from '@aztec/accounts/testing';
import type { Fr } from '@aztec/aztec.js/fields';
import { getSponsoredFPCAddress } from '@aztec/cli/cli-utils';
import { getPublicClient } from '@aztec/ethereum/client';
import type { GenesisStateConfig } from '@aztec/ethereum/config';
import { RegistryContract, RollupContract } from '@aztec/ethereum/contracts';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { startHttpRpcServer } from '@aztec/foundation/json-rpc/server';
import { type LogFn, createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { VersionCheck } from '@aztec/stdlib/update-checker';
import { getGenesisValues } from '@aztec/world-state/testing';

import Koa from 'koa';

import { isShuttingDown, softShutdown } from '../util.js';

const ROLLUP_POLL_INTERVAL_S = 60;

/**
 * Computes the expected genesis archive root from the genesis state config.
 * Reads test accounts and sponsored FPC addresses as specified, then computes
 * the genesis values including the archive root and prefilled public data.
 */
export async function computeExpectedGenesisRoot(config: GenesisStateConfig, userLog: LogFn) {
  const testAccounts = config.testAccounts ? (await getInitialTestAccountsData()).map(a => a.address) : [];
  const sponsoredFPCAccounts = config.sponsoredFPC ? [await getSponsoredFPCAddress()] : [];
  const prefundAddresses = (config.prefundAddresses ?? []).map(a => AztecAddress.fromStringUnsafe(a));
  const initialFundedAccounts = testAccounts.concat(sponsoredFPCAccounts).concat(prefundAddresses);

  userLog(`Initial funded accounts: ${initialFundedAccounts.map(a => a.toString()).join(', ')}`);

  const { genesisArchiveRoot, genesis } = await getGenesisValues(initialFundedAccounts);

  userLog(`Genesis archive root: ${genesisArchiveRoot.toString()}`);

  return { genesisArchiveRoot, genesis };
}

/**
 * Compares the rollup's on-chain protocol constants (genesis archive root, VK tree root, protocol
 * contracts hash) against the node's expected local values. Returns a list of human-readable mismatch
 * descriptions, empty if the rollup is compatible.
 */
export async function checkRollupCompatibility(
  rollup: RollupContract,
  expected: { genesisArchiveRoot: Fr; vkTreeRoot: Fr; protocolContractsHash: Fr },
): Promise<string[]> {
  const mismatches: string[] = [];
  const [l1Genesis, l1Vk, l1Protocol] = await Promise.all([
    rollup.getGenesisArchiveTreeRoot(),
    rollup.getVkTreeRoot(),
    rollup.getProtocolContractsHash(),
  ]);
  if (!l1Genesis.equals(expected.genesisArchiveRoot)) {
    mismatches.push(`genesis archive root (expected ${expected.genesisArchiveRoot}, got ${l1Genesis})`);
  }
  if (!l1Vk.equals(expected.vkTreeRoot)) {
    mismatches.push(`VK tree root (expected ${expected.vkTreeRoot}, got ${l1Vk})`);
  }
  if (!l1Protocol.equals(expected.protocolContractsHash)) {
    mismatches.push(`protocol contracts hash (expected ${expected.protocolContractsHash}, got ${l1Protocol})`);
  }
  return mismatches;
}

/**
 * Waits until the canonical rollup's genesis archive root, VK tree root, and protocol contracts hash
 * all match the expected local values. If the rollup is not yet compatible (e.g. during L1 contract upgrades),
 * enters standby mode: starts a lightweight HTTP server for K8s liveness probes and polls every 60s
 * until a compatible rollup appears.
 */
export async function waitForCompatibleRollup(
  config: {
    l1RpcUrls: string[];
    l1ChainId: number;
    registryAddress: EthAddress;
    rollupVersion?: number;
  },
  expected: { genesisArchiveRoot: Fr; vkTreeRoot: Fr; protocolContractsHash: Fr },
  port: number | undefined,
  userLog: LogFn,
): Promise<void> {
  const publicClient = getPublicClient(config);
  const rollupVersion: number | 'canonical' = config.rollupVersion ?? 'canonical';

  const registry = new RegistryContract(publicClient, config.registryAddress);
  const rollupAddress = await registry.getRollupAddress(rollupVersion);
  const rollup = new RollupContract(publicClient, rollupAddress.toString());

  let mismatches: string[];
  try {
    mismatches = await checkRollupCompatibility(rollup, expected);
  } catch (err: any) {
    throw new Error(`Could not retrieve rollup config from canonical rollup at ${rollupAddress}: ${err.message}`);
  }

  if (mismatches.length === 0) {
    return;
  }

  userLog(
    `Rollup at ${rollupAddress} is incompatible: ${mismatches.join('; ')}. ` +
      `Entering standby mode. Will poll every ${ROLLUP_POLL_INTERVAL_S}s for a compatible rollup...`,
  );

  const standbyServer = await startHttpRpcServer({ getApp: () => new Koa(), isHealthy: () => true }, { port });
  userLog(`Standby status server listening on port ${standbyServer.port}`);

  try {
    await retryUntil(
      async () => {
        const currentRollupAddress = await registry.getRollupAddress(rollupVersion);
        const currentRollup = new RollupContract(publicClient, currentRollupAddress.toString());

        let currentMismatches: string[];
        try {
          currentMismatches = await checkRollupCompatibility(currentRollup, expected);
        } catch {
          userLog(`Failed to fetch rollup config from rollup at ${currentRollupAddress}. Retrying...`);
          return undefined;
        }

        if (currentMismatches.length === 0) {
          userLog(`Compatible rollup found at ${currentRollupAddress}. Exiting standby mode.`);
          return true;
        }

        userLog(`Still waiting. Rollup at ${currentRollupAddress}: ${currentMismatches.join('; ')}.`);
        return undefined;
      },
      'compatible rollup',
      0,
      ROLLUP_POLL_INTERVAL_S,
    );
  } finally {
    await new Promise<void>((resolve, reject) => standbyServer.close(err => (err ? reject(err) : resolve())));
  }
}

/**
 * Polls the canonical rollup's protocol constants every 10 minutes and soft-shuts-down the node once they
 * diverge from the node's expected local values (i.e. an incompatible rollup has become canonical on L1).
 * The HTTP health server is left running so K8s probes keep passing on the wound-down pod. This is the
 * inverse of {@link waitForCompatibleRollup}; it should only be set up for nodes following the canonical
 * rollup. Reuses the {@link checkRollupCompatibility} diff and the generic VersionChecker poll primitive.
 */
export async function setupAutoShutdown(
  config: { l1RpcUrls: string[]; l1ChainId: number },
  registryAddress: EthAddress,
  rollupVersion: number | 'canonical',
  expected: { genesisArchiveRoot: Fr; vkTreeRoot: Fr; protocolContractsHash: Fr },
  signalHandlers: Array<() => Promise<void>>,
): Promise<void> {
  const { VersionChecker } = await import('@aztec/stdlib/update-checker');

  const logger = createLogger('auto_shutdown');
  const publicClient = getPublicClient(config);
  const registry = new RegistryContract(publicClient, registryAddress);

  const check: VersionCheck = {
    name: 'rollup',
    currentVersion: 'compatible',
    getLatestVersion: async () => {
      const rollupAddress = await registry.getRollupAddress(rollupVersion);
      const rollup = new RollupContract(publicClient, rollupAddress.toString());
      const mismatches = await checkRollupCompatibility(rollup, expected);
      return mismatches.length === 0 ? 'compatible' : `incompatible: ${mismatches.join('; ')}`;
    },
  };

  const checker = new VersionChecker([check], 600_000, logger);
  checker.on('newVersion', ({ latestVersion }) => {
    if (isShuttingDown()) {
      return;
    }
    logger.warn('Canonical rollup is no longer compatible; auto-shutting down node', { latestVersion });
    // softShutdown never rejects (it awaits handlers via allSettled); fire-and-forget from the listener.
    void softShutdown(logger.info.bind(logger), signalHandlers);
  });
  checker.start();
  signalHandlers.push(() => checker.stop());
}
