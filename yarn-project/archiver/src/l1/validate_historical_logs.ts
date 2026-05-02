import { getPublicClient, getRpcUrlsFromClient } from '@aztec/ethereum/client';
import { RollupContract } from '@aztec/ethereum/contracts';
import type { L1ContractAddresses } from '@aztec/ethereum/l1-contract-addresses';
import type { ViemPublicClient } from '@aztec/ethereum/types';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';

/** Subset of L1 contract addresses whose historical logs the Aztec node relies on. */
export type HistoricalLogsContractAddresses = Pick<
  L1ContractAddresses,
  'rollupAddress' | 'inboxAddress' | 'registryAddress' | 'governanceProposerAddress'
>;

/** Result of probing a single RPC URL. */
type ProbeResult = { ok: true } | { ok: false; reason: string; clientVersion: string | undefined };

/**
 * Validates that every configured L1 RPC URL returns historical logs for the Rollup contract.
 *
 * Some RPC providers prune old logs, which would cause L1 syncing to silently fail. To detect this,
 * we query for the `OwnershipTransferred` event which every Rollup emits in its constructor (via
 * Ownable) on the block it was deployed (`l1StartBlock`). The `client` is typically a viem fallback
 * transport over several user-configured RPC URLs — checking only the first URL would miss a bad
 * secondary, so we probe each URL independently. The first URL that fails aborts startup, unless
 * the operator has explicitly opted out.
 *
 * @param client - The L1 public client built from the user-configured RPC URLs.
 * @param addresses - The subset of L1 contract addresses we rely on for historical log retrieval.
 * @param skipCheck - If true, log warnings instead of throwing.
 * @param bindings - Optional logger bindings for context.
 * @throws Error if any URL fails the probe and skipCheck is false.
 */
export async function validateAndLogHistoricalLogsAvailability(
  client: ViemPublicClient,
  addresses: HistoricalLogsContractAddresses,
  skipCheck: boolean,
  bindings?: LoggerBindings,
): Promise<void> {
  const logger = createLogger('archiver:validate_historical_logs', bindings);
  logger.debug('Validating historical log availability on L1 RPCs');

  const urls = getRpcUrlsFromClient(client);
  if (urls.length === 0) {
    logger.warn('Could not determine L1 RPC URLs from the public client; skipping historical logs check.');
    return;
  }

  const chainId = client.chain?.id;
  if (chainId === undefined) {
    logger.warn('Could not determine L1 chain ID from the public client; skipping historical logs check.');
    return;
  }

  for (const url of urls) {
    const probeClient = getPublicClient({ l1RpcUrls: [url], l1ChainId: chainId });
    const rollup = new RollupContract(probeClient, addresses.rollupAddress.toString());
    const result = await probeRpcUrl(rollup, probeClient, logger);

    if (result.ok) {
      logger.debug(`L1 RPC ${url} returned historical OwnershipTransferred log for the Rollup contract.`);
      continue;
    }

    const errorMessage = buildErrorMessage(url, result, addresses);
    if (skipCheck) {
      logger.warn(`${errorMessage}\nContinuing because ARCHIVER_SKIP_HISTORICAL_LOGS_CHECK is true.`);
      continue;
    }

    logger.error(errorMessage);
    throw new Error(errorMessage);
  }
}

/** Runs the OwnershipTransferred probe against a single RPC and queries its client version. */
async function probeRpcUrl(rollup: RollupContract, client: ViemPublicClient, logger: Logger): Promise<ProbeResult> {
  let queryError: unknown;
  try {
    const logs = await rollup.getOwnershipTransferredEventsAtDeploy();
    if (logs.length > 0) {
      return { ok: true };
    }
  } catch (err) {
    queryError = err;
  }

  const clientVersion = await getClientVersion(client, logger);

  let reason: string;
  if (queryError instanceof Error) {
    reason = `Query for historical logs failed: ${queryError.message}`;
  } else if (queryError !== undefined) {
    reason = 'Query for historical logs failed with a non-Error value.';
  } else {
    reason = 'No OwnershipTransferred event was returned by the L1 RPC for the Rollup deploy block.';
  }
  return { ok: false, reason, clientVersion };
}

/** Builds the operator-facing error message for a failing RPC URL. */
function buildErrorMessage(
  url: string,
  result: Extract<ProbeResult, { ok: false }>,
  addresses: HistoricalLogsContractAddresses,
): string {
  return [
    `L1 RPC at ${url} does not return historical logs for the Rollup contract. ${result.reason}`,
    `This likely means this Ethereum RPC node prunes old logs, which would cause the archiver ` +
      `to silently miss data during L1 sync.`,
    result.clientVersion
      ? `Detected L1 client version for ${url}: ${result.clientVersion}.`
      : `Could not determine L1 client version for ${url}.`,
    `The following L1 contract addresses must have their historical logs retained by the RPC node:`,
    `  - Rollup:             ${addresses.rollupAddress.toString()}`,
    `  - Inbox:              ${addresses.inboxAddress.toString()}`,
    `  - Registry:           ${addresses.registryAddress.toString()}`,
    `  - GovernanceProposer: ${addresses.governanceProposerAddress.toString()}`,
    isReth(result.clientVersion)
      ? `To retain logs for these contracts, configure reth with a ` +
        `prune.segments.receipts_log_filter entry for each address above ` +
        `so reth does not prune their receipts/logs. See https://reth.rs/run/pruning.html for details.`
      : `Point this RPC endpoint at a node that retains full log history for the addresses above.`,
    `Set ARCHIVER_SKIP_HISTORICAL_LOGS_CHECK=true to bypass this check at your own risk.`,
  ].join('\n');
}

/** Queries `web3_clientVersion` on the L1 RPC. Returns undefined if the call fails or returns a non-string. */
async function getClientVersion(client: ViemPublicClient, logger: Logger): Promise<string | undefined> {
  try {
    const result = await client.request({ method: 'web3_clientVersion' });
    return typeof result === 'string' ? result : undefined;
  } catch (err) {
    logger.debug(`Failed to query web3_clientVersion: ${err instanceof Error ? err.message : err}`);
    return undefined;
  }
}

/** Heuristic check for reth based on the web3_clientVersion string (reth returns e.g. "reth/v1.0.0-..."). */
function isReth(clientVersion: string | undefined): boolean {
  return !!clientVersion && /reth/i.test(clientVersion);
}
