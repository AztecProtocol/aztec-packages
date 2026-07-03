import { parseGwei } from 'viem';

import type { ViemClient } from '../types.js';
import { captureWindowBlockFees } from './l1_fee_analyzer.js';

// Window [1000, 1072). Blocks are spaced 12s apart with block 100 at ts 988, so:
//   block 100 -> 988 (before window), 101 -> 1000, ..., 106 -> 1060 (last in window),
//   107 -> 1072 (== windowEnd, excluded), 108 -> 1084 (past window).
describe('captureWindowBlockFees', () => {
  const SPACING_S = 12n;
  const WINDOW_START_S = 1000n;
  const WINDOW_END_S = 1072n;

  const makeBlock = (number: bigint, timestamp: bigint) => ({
    number,
    timestamp,
    baseFeePerGas: parseGwei('1'),
    blobGasUsed: 0n,
  });

  const buildChain = (headNumber: number) => {
    const blocks = new Map<bigint, ReturnType<typeof makeBlock>>();
    for (let n = 100; n <= headNumber; n++) {
      const timestamp = 988n + BigInt(n - 100) * SPACING_S;
      blocks.set(BigInt(n), makeBlock(BigInt(n), timestamp));
    }
    return blocks;
  };

  // Reward fixture: per block number, [min included priority fee, p75 priority fee] in gwei.
  const makeClient = (
    blocks: Map<bigint, ReturnType<typeof makeBlock>>,
    headNumber: bigint,
    rewardsByNumber: Record<number, [number, number]> = {},
  ) =>
    ({
      getBlock: (args: { blockTag?: string; blockNumber?: bigint }) =>
        Promise.resolve(args.blockTag === 'latest' ? blocks.get(headNumber) : blocks.get(args.blockNumber!)),
      getFeeHistory: (args: { blockCount: number; blockNumber: bigint; rewardPercentiles: number[] }) => {
        const oldestBlock = args.blockNumber - BigInt(args.blockCount) + 1n;
        const reward = Array.from({ length: args.blockCount }, (_, i) => {
          const [min, p75] = rewardsByNumber[Number(oldestBlock) + i] ?? [0, 0];
          return [parseGwei(`${min}`), parseGwei(`${p75}`)];
        });
        return Promise.resolve({
          oldestBlock,
          baseFeePerGas: Array.from({ length: args.blockCount + 1 }, () => parseGwei('1')),
          gasUsedRatio: Array.from({ length: args.blockCount }, () => 0.5),
          reward,
        });
      },
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

  it('reads the min-included and p75 priority fees per block from eth_feeHistory', async () => {
    const blocks = buildChain(108);
    const result = await captureWindowBlockFees(
      makeClient(blocks, 108n, { 101: [1, 4], 103: [2, 3] }),
      WINDOW_START_S,
      WINDOW_END_S,
    );
    const block101 = result.find(b => b.blockNumber === 101n)!;
    expect(block101.minIncludedPriorityFee).toEqual(parseGwei('1'));
    expect(block101.p75PriorityFee).toEqual(parseGwei('4'));
    const block103 = result.find(b => b.blockNumber === 103n)!;
    expect(block103.minIncludedPriorityFee).toEqual(parseGwei('2'));
    expect(block103.p75PriorityFee).toEqual(parseGwei('3'));
  });

  it('requests fee history only for the window blocks', async () => {
    const blocks = buildChain(108);
    const calls: { blockCount: number; blockNumber: bigint }[] = [];
    const client = makeClient(blocks, 108n);
    const inner = client.getFeeHistory.bind(client);
    (client as any).getFeeHistory = (args: any) => {
      calls.push({ blockCount: args.blockCount, blockNumber: args.blockNumber });
      return inner(args);
    };
    await captureWindowBlockFees(client, WINDOW_START_S, WINDOW_END_S);
    expect(calls).toEqual([{ blockCount: 6, blockNumber: 106n }]);
  });

  it('never throws when the RPC fails', async () => {
    const failingClient = { getBlock: () => Promise.reject(new Error('rpc down')) } as unknown as ViemClient;
    await expect(captureWindowBlockFees(failingClient, WINDOW_START_S, WINDOW_END_S)).resolves.toEqual([]);

    const blocks = buildChain(108);
    const failingFeeHistory = {
      getBlock: (args: { blockTag?: string; blockNumber?: bigint }) =>
        Promise.resolve(args.blockTag === 'latest' ? blocks.get(108n) : blocks.get(args.blockNumber!)),
      getFeeHistory: () => Promise.reject(new Error('rpc down')),
    } as unknown as ViemClient;
    await expect(captureWindowBlockFees(failingFeeHistory, WINDOW_START_S, WINDOW_END_S)).resolves.toEqual([]);
  });
});
