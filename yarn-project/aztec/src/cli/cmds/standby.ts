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

  const { genesisArchiveRoot, prefilledPublicData } = await getGenesisValues(initialFundedAccounts);

  userLog(`Genesis archive root: ${genesisArchiveRoot.toString()}`);

  return { genesisArchiveRoot, prefilledPublicData };
}

/**
 * Waits until the canonical rollup's genesis archive root matches the expected local genesis root.
 * If the rollup is not yet compatible (e.g. during L1 contract upgrades), enters standby mode:
 * starts a lightweight HTTP server for K8s liveness probes and polls every 60s until a compatible rollup appears.
 */
export async function waitForCompatibleRollup(
  config: {
    l1RpcUrls: string[];
    l1ChainId: number;
    l1Contracts: { registryAddress: EthAddress };
    rollupVersion?: number;
  },
  expectedGenesisRoot: Fr,
  port: number | undefined,
  userLog: LogFn,
): Promise<void> {
  const publicClient = getPublicClient(config);
  const rollupVersion: number | 'canonical' = config.rollupVersion ?? 'canonical';

  const registry = new RegistryContract(publicClient, config.l1Contracts.registryAddress);
  const rollupAddress = await registry.getRollupAddress(rollupVersion);
  const rollup = new RollupContract(publicClient, rollupAddress.toString());

  let l1GenesisRoot: Fr;
  try {
    l1GenesisRoot = await rollup.getGenesisArchiveTreeRoot();
  } catch (err: any) {
    throw new Error(
      `Could not retrieve genesis archive root from canonical rollup at ${rollupAddress}: ${err.message}`,
    );
  }

  if (l1GenesisRoot.equals(expectedGenesisRoot)) {
    return;
  }

  userLog(
    `Genesis root mismatch: expected ${expectedGenesisRoot}, got ${l1GenesisRoot} from rollup at ${rollupAddress}. ` +
      `Entering standby mode. Will poll every ${ROLLUP_POLL_INTERVAL_S}s for a compatible rollup...`,
  );

  const standbyServer = await startHttpRpcServer({ getApp: () => new Koa(), isHealthy: () => true }, { port });
  userLog(`Standby status server listening on port ${standbyServer.port}`);

  try {
    await retryUntil(
      async () => {
        const currentRollupAddress = await registry.getRollupAddress(rollupVersion);
        const currentRollup = new RollupContract(publicClient, currentRollupAddress.toString());

        let currentGenesisRoot: Fr;
        try {
          currentGenesisRoot = await currentRollup.getGenesisArchiveTreeRoot();
        } catch {
          userLog(`Failed to fetch genesis root from rollup at ${currentRollupAddress}. Retrying...`);
          return undefined;
        }

        if (currentGenesisRoot.equals(expectedGenesisRoot)) {
          userLog(`Compatible rollup found at ${currentRollupAddress}. Exiting standby mode.`);
          return true;
        }

        userLog(`Still waiting. Rollup at ${currentRollupAddress} has genesis root ${currentGenesisRoot}.`);
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
