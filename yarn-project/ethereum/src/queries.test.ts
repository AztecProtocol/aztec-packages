import { type MockProxy, mock } from 'jest-mock-extended';
import { BaseError, RpcRequestError } from 'viem';

import { getFinalizedL1Block, isFinalizedBlockTagNotFoundError } from './queries.js';
import type { ViemPublicClient } from './types.js';

describe('isFinalizedBlockTagNotFoundError', () => {
  const makeRpcError = (code: number, message: string) =>
    new RpcRequestError({
      body: {},
      error: { code, message },
      url: 'http://localhost:8545',
    });

  it.each([
    ['geth finalized', -32000, 'finalized block not found'],
    ['geth safe', -32000, 'safe block not found'],
    ['reth finalized', -32001, 'block not found: finalized'],
    ['reth safe', -32001, 'block not found: safe'],
    ['nethermind', -39001, 'Unknown block error'],
    ['besu', -39001, 'Unknown block'],
    ['erigon finalized', -39001, 'block "finalized" not available (head block: 5)'],
    ['erigon safe', -39001, 'block "safe" not available (head block: 5)'],
  ])('matches %s', (_name, code, message) => {
    const viemErr = new BaseError('Request failed', { cause: makeRpcError(code, message) });
    expect(isFinalizedBlockTagNotFoundError(viemErr)).toBe(true);
  });

  it('matches a plain Error whose message says the safe block is missing', () => {
    expect(isFinalizedBlockTagNotFoundError(new Error('safe block not found'))).toBe(true);
  });

  it('matches a nested cause chain', () => {
    const inner = new Error('finalized block not found');
    const mid = Object.assign(new Error('rpc error'), { cause: inner });
    const outer = Object.assign(new Error('wrapped'), { cause: mid });
    expect(isFinalizedBlockTagNotFoundError(outer)).toBe(true);
  });

  it('does not match unrelated errors', () => {
    expect(isFinalizedBlockTagNotFoundError(new Error('reverted: returned no data'))).toBe(false);
    expect(isFinalizedBlockTagNotFoundError(null)).toBe(false);
    expect(isFinalizedBlockTagNotFoundError(undefined)).toBe(false);
  });
});

describe('getFinalizedL1Block', () => {
  let client: MockProxy<ViemPublicClient>;

  beforeEach(() => {
    client = mock<ViemPublicClient>();
  });

  it('returns the finalized block on happy path', async () => {
    const block = { number: 42n, timestamp: 100n, hash: '0xabc' } as any;
    client.getBlock.mockResolvedValue(block);
    await expect(getFinalizedL1Block(client)).resolves.toBe(block);
  });

  it('returns undefined when L1 has no finalized block', async () => {
    client.getBlock.mockRejectedValue(new Error('finalized block not found'));
    await expect(getFinalizedL1Block(client)).resolves.toBeUndefined();
  });

  it('rethrows unrelated errors', async () => {
    const err = new Error('connection refused');
    client.getBlock.mockRejectedValue(err);
    await expect(getFinalizedL1Block(client)).rejects.toBe(err);
  });
});
