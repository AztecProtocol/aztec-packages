import { type Hex, parseGwei } from 'viem';

import type { ViemClient } from '../types.js';
import { captureWindowBlockFees } from './l1_fee_analyzer.js';

// Window [1000, 1072). Blocks are spaced 12s apart with block 100 at ts 988, so:
//   block 100 -> 988 (before window), 101 -> 1000, ..., 106 -> 1060 (last in window),
//   107 -> 1072 (== windowEnd, excluded), 108 -> 1084 (past window).
describe('captureWindowBlockFees', () => {
  const SPACING_S = 12n;
  const WINDOW_START_S = 1000n;
  const WINDOW_END_S = 1072n;

  const makeTx = (priorityFeeGwei: number) => ({
    hash: '0x' as Hex,
    maxPriorityFeePerGas: parseGwei(`${priorityFeeGwei}`),
    maxFeePerGas: parseGwei(`${priorityFeeGwei + 1}`),
    gas: 21_000n,
  });

  const makeBlock = (number: bigint, timestamp: bigint, priorityFeesGwei: number[]) => ({
    number,
    timestamp,
    baseFeePerGas: parseGwei('1'),
    blobGasUsed: 0n,
    transactions: priorityFeesGwei.map(makeTx),
  });

  const buildChain = (headNumber: number, txsByNumber: Record<number, number[]> = {}) => {
    const blocks = new Map<bigint, ReturnType<typeof makeBlock>>();
    for (let n = 100; n <= headNumber; n++) {
      const timestamp = 988n + BigInt(n - 100) * SPACING_S;
      blocks.set(BigInt(n), makeBlock(BigInt(n), timestamp, txsByNumber[n] ?? []));
    }
    return blocks;
  };

  const makeClient = (blocks: Map<bigint, ReturnType<typeof makeBlock>>, headNumber: bigint) =>
    ({
      getBlock: (args: { blockTag?: string; blockNumber?: bigint }) =>
        Promise.resolve(args.blockTag === 'latest' ? blocks.get(headNumber) : blocks.get(args.blockNumber!)),
    }) as unknown as ViemClient;

  it('returns only the in-window blocks, chronologically, when the head is past the window', async () => {
    const blocks = buildChain(108);
    const result = await captureWindowBlockFees(makeClient(blocks, 108n), WINDOW_START_S, WINDOW_END_S);
    expect(result.map(b => b.blockNumber)).toEqual([101n, 102n, 103n, 104n, 105n, 106n]);
  });

  it('returns the partial window mined so far when the head is inside the window', async () => {
    const blocks = buildChain(103);
    const result = await captureWindowBlockFees(makeClient(blocks, 103n), WINDOW_START_S, WINDOW_END_S);
    expect(result.map(b => b.blockNumber)).toEqual([101n, 102n, 103n]);
  });

  it('returns nothing when the head is still before the window start', async () => {
    const blocks = buildChain(100);
    const result = await captureWindowBlockFees(makeClient(blocks, 100n), WINDOW_START_S, WINDOW_END_S);
    expect(result).toEqual([]);
  });

  it('computes the min-included and p75 priority fees per block', async () => {
    const blocks = buildChain(108, { 101: [1, 2, 3, 4] });
    const result = await captureWindowBlockFees(makeClient(blocks, 108n), WINDOW_START_S, WINDOW_END_S);
    const block101 = result.find(b => b.blockNumber === 101n)!;
    expect(block101.minIncludedPriorityFee).toEqual(parseGwei('1'));
    expect(block101.p75PriorityFee).toEqual(parseGwei('4'));
  });

  it('never throws when the RPC fails', async () => {
    const failingClient = { getBlock: () => Promise.reject(new Error('rpc down')) } as unknown as ViemClient;
    await expect(captureWindowBlockFees(failingClient, WINDOW_START_S, WINDOW_END_S)).resolves.toEqual([]);
  });
});
