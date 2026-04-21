import { RollupContract } from '@aztec/ethereum/contracts';
import type { ViemPublicClient } from '@aztec/ethereum/types';
import { EthAddress } from '@aztec/foundation/eth-address';

import { jest } from '@jest/globals';
import { createPublicClient, fallback, http } from 'viem';
import { foundry } from 'viem/chains';

import {
  type HistoricalLogsContractAddresses,
  validateAndLogHistoricalLogsAvailability,
} from './validate_historical_logs.js';

describe('validateAndLogHistoricalLogsAvailability', () => {
  const url1 = 'http://fake-url-1:8545';
  const url2 = 'http://fake-url-2:8545';

  let client: ViemPublicClient;
  let addresses: HistoricalLogsContractAddresses;
  let probeSpy: jest.SpiedFunction<RollupContract['getOwnershipTransferredEventsAtDeploy']>;
  let fetchSpy: jest.Spied<typeof fetch>;

  beforeEach(() => {
    // Build a real fallback-transport client over two fake URLs so the validator can extract them.
    client = createPublicClient({
      chain: foundry,
      transport: fallback([http(url1, { batch: false }), http(url2, { batch: false })]),
    }) as ViemPublicClient;

    addresses = {
      rollupAddress: EthAddress.random(),
      inboxAddress: EthAddress.random(),
      registryAddress: EthAddress.random(),
      governanceProposerAddress: EthAddress.random(),
    };

    probeSpy = jest.spyOn(RollupContract.prototype, 'getOwnershipTransferredEventsAtDeploy');

    // By default, make fetch (used by the per-URL client for web3_clientVersion) reject so we exercise
    // the "Could not determine client version" branch without real network traffic.
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fetch disabled in tests'));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('resolves when every URL returns the OwnershipTransferred event', async () => {
    probeSpy.mockResolvedValue([{ blockNumber: 10n } as any]);
    await expect(validateAndLogHistoricalLogsAvailability(client, addresses, false)).resolves.toBeUndefined();
    expect(probeSpy).toHaveBeenCalledTimes(2);
  });

  it('throws on the first URL that returns no events, and includes that URL and all addresses', async () => {
    probeSpy.mockResolvedValue([]);
    const err = await validateAndLogHistoricalLogsAvailability(client, addresses, false).then(
      () => new Error('expected to throw'),
      (e: unknown) => e as Error,
    );
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/does not return historical logs/);
    expect(err.message).toContain(url1);
    expect(err.message).not.toContain(url2);
    expect(err.message).toContain(addresses.rollupAddress.toString());
    expect(err.message).toContain(addresses.inboxAddress.toString());
    expect(err.message).toContain(addresses.registryAddress.toString());
    expect(err.message).toContain(addresses.governanceProposerAddress.toString());
    expect(probeSpy).toHaveBeenCalledTimes(1);
  });

  it('throws on the second URL when the first one succeeds', async () => {
    probeSpy.mockResolvedValueOnce([{ blockNumber: 10n } as any]);
    probeSpy.mockResolvedValueOnce([]);
    const err = await validateAndLogHistoricalLogsAvailability(client, addresses, false).then(
      () => new Error('expected to throw'),
      (e: unknown) => e as Error,
    );
    expect(err.message).toContain(url2);
    expect(err.message).not.toContain(url1);
    expect(probeSpy).toHaveBeenCalledTimes(2);
  });

  it('throws when the RPC event query itself fails', async () => {
    probeSpy.mockRejectedValue(new Error('rpc exploded'));
    const err = await validateAndLogHistoricalLogsAvailability(client, addresses, false).then(
      () => new Error('expected to throw'),
      (e: unknown) => e as Error,
    );
    expect(err.message).toMatch(/rpc exploded/);
  });

  it('logs a warning and continues when skipCheck is true', async () => {
    probeSpy.mockResolvedValue([]);
    await expect(validateAndLogHistoricalLogsAvailability(client, addresses, true)).resolves.toBeUndefined();
    // Skip mode still probes every URL.
    expect(probeSpy).toHaveBeenCalledTimes(2);
  });

  it('includes reth-specific guidance when the L1 client reports reth', async () => {
    probeSpy.mockResolvedValue([]);
    fetchSpy.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: 'reth/v1.0.0-abcdef/linux-x86_64/1.75.0' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const err = await validateAndLogHistoricalLogsAvailability(client, addresses, false).then(
      () => new Error('expected to throw'),
      (e: unknown) => e as Error,
    );
    expect(err.message).toMatch(/Detected L1 client version for .*: reth/);
    expect(err.message).toMatch(/prune\.segments\.receipts_log_filter/);
  });

  it('falls back to generic guidance when the L1 client is not reth', async () => {
    probeSpy.mockResolvedValue([]);
    fetchSpy.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: 'Geth/v1.14.0-stable/linux-amd64/go1.22.0' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const err = await validateAndLogHistoricalLogsAvailability(client, addresses, false).then(
      () => new Error('expected to throw'),
      (e: unknown) => e as Error,
    );
    expect(err.message).not.toMatch(/prune\.segments\.receipts_log_filter/);
    expect(err.message).toMatch(/retains full log history/);
  });
});
