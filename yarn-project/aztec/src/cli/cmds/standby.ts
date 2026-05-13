import { getInitialTestAccountsData } from '@aztec/accounts/testing';
import type { Fr } from '@aztec/aztec.js/fields';
import { getSponsoredFPCAddress } from '@aztec/cli/cli-utils';
import { getPublicClient } from '@aztec/ethereum/client';
import type { GenesisStateConfig } from '@aztec/ethereum/config';
import { RegistryContract, RollupContract } from '@aztec/ethereum/contracts';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { startHttpRpcServer } from '@aztec/foundation/json-rpc/server';
import type { LogFn } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { getGenesisValues } from '@aztec/world-state/testing';

import Koa from 'koa';

const ROLLUP_POLL_INTERVAL_S = 60;

/**
 * Computes the expected genesis archive root from the genesis state config.
 * Reads test accounts and sponsored FPC addresses as specified, then computes
 * the genesis values including the archive root and prefilled public data.
 */
export async function computeExpectedGenesisRoot(config: GenesisStateConfig, userLog: LogFn) {
  const testAccounts = config.testAccounts ? (await getInitialTestAccountsData()).map(a => a.address) : [];
  const sponsoredFPCAccounts = config.sponsoredFPC ? [await getSponsoredFPCAddress()] : [];
  const prefundAddresses = (config.prefundAddresses ?? []).map(a => AztecAddress.fromString(a));
  const initialFundedAccounts = testAccounts.concat(sponsoredFPCAccounts).concat(prefundAddresses);

  userLog(`Initial funded accounts: ${initialFundedAccounts.map(a => a.toString()).join(', ')}`);

  const { genesisArchiveRoot, genesis } = await getGenesisValues(initialFundedAccounts);

  userLog(`Genesis archive root: ${genesisArchiveRoot.toString()}`);

  return { genesisArchiveRoot, genesis };
}

async function checkRollupCompatibility(
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
