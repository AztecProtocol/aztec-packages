import { type Logger, createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';

import { type PrivateKeyAccount, createPublicClient, createWalletClient, fallback, http, publicActions } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import type { ExtendedViemWalletClient, ViemPublicClient } from '../types.js';
import { EthCheatCodes } from './eth_cheat_codes.js';
import type { Anvil } from './start_anvil.js';
import { startAnvil } from './start_anvil.js';

/**
 * Pins the anvil interval-mining timestamp semantics that the pipelined sequencer timetable relies on.
 *
 * The production timetable (see `stdlib/src/timetable/README.md`) broadcasts the L1 publish tx at
 * `target_slot_start - l1PublishLeadTime` and requires that the L1 block including it carries a timestamp
 * that maps to the target L2 slot (or later) — never to the previous slot, which would revert
 * `ProposeLib.validateHeader` with `HeaderLib__InvalidSlotNumber`. Unlike real Ethereum (where a block for
 * slot n is stamped at the slot start but assembled during the slot), anvil interval mining stamps each block
 * with a timestamp that snaps up to the next `interval`-aligned grid point at-or-after wall-clock mine time,
 * advancing in exact `interval`-second steps anchored to the last explicitly-set timestamp.
 *
 * These tests would catch a future anvil upgrade or mining-mode change that broke that contract.
 */
describe('anvil interval mining timestamp semantics', () => {
  let anvil: Anvil | undefined;
  let rpcUrl: string;
  let logger: Logger;
  let cheatCodes: EthCheatCodes;
  let account: PrivateKeyAccount;

  // The fast e2e profile (PIPELINING_SETUP_OPTS) uses an Ethereum slot duration of 4s.
  const E = 4;

  beforeAll(async () => {
    ({ anvil, rpcUrl } = await startAnvil({ l1BlockTime: E }));
    cheatCodes = new EthCheatCodes([rpcUrl], new DateProvider());
    logger = createLogger('ethereum:test:anvil_interval_mining');
    account = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
  });

  afterAll(async () => {
    await anvil?.stop().catch(err => createLogger('cleanup').error(err));
  });

  const publicClient = (): ViemPublicClient =>
    createPublicClient({ transport: fallback([http(rpcUrl, { batch: false })]), chain: foundry });

  const walletClient = (): ExtendedViemWalletClient =>
    createWalletClient({ transport: fallback([http(rpcUrl, { batch: false })]), chain: foundry, account }).extend(
      publicActions,
    ) as unknown as ExtendedViemWalletClient;

  /**
   * Minimal read surface shared by the public client and the publicActions-extended wallet client, so the
   * timestamp poller below accepts either without a nominal cast.
   */
  type BlockReader = {
    getBlockNumber: (args: { cacheTime: number }) => Promise<bigint>;
    getBlock: (args: { blockNumber: bigint }) => Promise<{ timestamp: bigint }>;
  };

  /** Polls until block `n` exists and returns its timestamp in seconds. */
  const timestampOfBlock = async (client: BlockReader, n: bigint): Promise<number> => {
    let tip = await client.getBlockNumber({ cacheTime: 0 });
    while (tip < n) {
      await new Promise(r => setTimeout(r, 50));
      tip = await client.getBlockNumber({ cacheTime: 0 });
    }
    const block = await client.getBlock({ blockNumber: n });
    return Number(block.timestamp);
  };

  it('stamps each interval-mined block exactly `interval` seconds after the previous one', async () => {
    await cheatCodes.setIntervalMining(E);
    const client = publicClient();
    const start = await client.getBlockNumber({ cacheTime: 0 });

    const tsByBlock: number[] = [];
    for (let i = 1; i <= 4; i++) {
      tsByBlock.push(await timestampOfBlock(client, start + BigInt(i)));
    }

    const deltas = tsByBlock.slice(1).map((ts, i) => ts - tsByBlock[i]);
    logger.info(`Interval-mined block timestamps`, { tsByBlock, deltas });

    // Each interval-mined block advances the timestamp by exactly `E`, not by a wall-clock delta.
    expect(deltas).toEqual([E, E, E]);
  }, 60000);

  it('produces block timestamps independent of the rollup genesis, so mine ticks do not align to slot boundaries', async () => {
    await cheatCodes.setIntervalMining(E);
    const client = publicClient();

    // Anvil knows nothing about the rollup's L1 genesis. Choose a genesis whose phase relative to the E grid
    // is deliberately misaligned with where the slot boundaries fall, then observe that interval-mined block
    // timestamps do NOT land on slot boundaries: (ts - genesis) % S != 0.
    const S = 12;
    const tip = await client.getBlock({ blockTag: 'latest' });
    // genesis offset so that slot boundaries (genesis + k*S) never coincide with this chain's E-grid blocks.
    // With S a multiple of E, a block ts is on a boundary iff (ts - genesis) % S == 0. Pick genesis so the
    // current tip is mid-slot (offset 2 of 12), and since blocks advance by E=4 they hit offsets 2,6,10,2,...
    // — i.e. never 0. This holds for any free-running interval chain whose genesis is not E*S-aligned to it.
    const genesis = Number(tip.timestamp) - 2;

    const startN = await client.getBlockNumber({ cacheTime: 0 });
    const slotOffsets: number[] = [];
    for (let i = 1; i <= 4; i++) {
      const ts = await timestampOfBlock(client, startN + BigInt(i));
      slotOffsets.push((((ts - genesis) % S) + S) % S);
    }
    logger.info(`Block offsets within the slot grid`, { genesis, S, slotOffsets });

    // No interval-mined block lands exactly on a slot boundary: the mine grid floats relative to the slot grid.
    // The timetable therefore cannot assume the including block's timestamp equals a slot boundary — only that
    // it advances in +E steps and snaps up to >= wall-clock (pinned by the other tests). This is why the
    // `target - lead` rule needs 0 < lead < E rather than lead == 0 (which would race the boundary).
    expect(slotOffsets.every(o => o !== 0)).toBe(true);
  }, 60000);

  it('stamps the next block at-or-after wall-clock mine time, snapping up to the E grid after an idle gap', async () => {
    await cheatCodes.setIntervalMining(E);
    const client = walletClient();
    const tip = await client.getBlock({ blockTag: 'latest' });
    const base = Number(tip.timestamp);

    // Sit idle ~3.5 intervals of wall time before sending a tx, so several E-ticks elapse with no block. The
    // generous margin (vs the 2*E lower bound asserted below) absorbs timer/event-loop jitter under CI load.
    await new Promise(r => setTimeout(r, Math.floor(E * 1000 * 3.5)));
    const sentWall = Math.floor(Date.now() / 1000);
    const hash = await client.sendTransaction({ to: account.address });
    const rcpt = await client.waitForTransactionReceipt({ hash });
    const includedTs = await timestampOfBlock(client, rcpt.blockNumber);

    const deltaFromBase = includedTs - base;
    logger.info(`Idle-gap inclusion`, { base, sentWall, idleSecs: sentWall - base, includedTs, deltaFromBase });

    // The including block's timestamp jumped multiple intervals (it caught up to wall-clock in E-steps)...
    expect(deltaFromBase).toBeGreaterThanOrEqual(2 * E);
    expect(deltaFromBase % E).toBe(0);
    // ...and is at-or-after the wall-clock time the tx was broadcast — never behind it. This is the property
    // the `target_slot_start - lead` broadcast rule depends on: the tx lands in a block stamped >= broadcast time.
    expect(includedTs).toBeGreaterThanOrEqual(sentWall);
  }, 60000);

  // Lead values follow the default rule `clamp(round(E/2), 1, 6)`: E=4→2, E=8→4, E=12→6.
  describe.each([
    { name: 'fast profile', E: 4, S: 12, lead: 2 },
    { name: 'mid profile', E: 8, S: 24, lead: 4 },
    { name: 'spartan profile', E: 12, S: 36, lead: 6 },
  ])('broadcast at target_slot_start - lead lands in-slot ($name: E=$E, lead=$lead)', profile => {
    it(`maps the including block to the target slot or later`, async () => {
      const { E: e, S, lead } = profile;
      await cheatCodes.setIntervalMining(0, { silent: true });
      const client = walletClient();

      // Pick an E-aligned genesis (the realistic post-deploy case: l1GenesisTime is set to an L1 block ts,
      // and the rollup slot grid is a multiple of E). slot = floor((ts - genesis) / S); slotStart = genesis + slot*S.
      const tip = await client.getBlock({ blockTag: 'latest' });
      const now = Number(tip.timestamp);
      // Genesis a few slots in the past, E-aligned, so target slots are in the near future.
      const genesis = Math.ceil(now / e) * e - 4 * S;
      const slotAt = (ts: number) => Math.floor((ts - genesis) / S);
      const slotStart = (slot: number) => genesis + slot * S;

      // Target the next slot boundary strictly in the future of `now`, then re-enable interval mining and
      // warp the chain to exactly the broadcast time `target_slot_start - lead`.
      const targetSlot = slotAt(now) + 2;
      const broadcastTs = slotStart(targetSlot) - lead;
      expect(broadcastTs).toBeGreaterThan(now);

      // Warp so the latest mined block sits exactly at the broadcast time, then turn on interval mining at E.
      await cheatCodes.setNextBlockTimestamp(broadcastTs);
      await cheatCodes.evmMine();
      await cheatCodes.setIntervalMining(e, { silent: true });

      // Broadcast the tx now (wall-clock ~ broadcastTs). The next interval block is stamped broadcastTs + e.
      const hash = await client.sendTransaction({ to: account.address });
      const rcpt = await client.waitForTransactionReceipt({ hash });
      const includedTs = await timestampOfBlock(client, rcpt.blockNumber);
      const includedSlot = slotAt(includedTs);

      logger.info(`Broadcast-at-(target - lead) inclusion`, {
        ...profile,
        genesis,
        targetSlot,
        broadcastTs,
        includedTs,
        includedSlot,
      });

      // The including block must map to the target slot or a later one — never the previous slot (which would
      // revert validateHeader). With an E-aligned genesis and 0 < lead < E, the next interval block lands at
      // broadcastTs + e = target_slot_start + (e - lead), strictly inside the target slot.
      expect(includedSlot).toBeGreaterThanOrEqual(targetSlot);

      await cheatCodes.setIntervalMining(0, { silent: true });
    }, 60000);

    it(`maps a tx broadcast at the attestation deadline to the target slot`, async () => {
      const { E: e, S, lead } = profile;
      await cheatCodes.setIntervalMining(0, { silent: true });
      const client = walletClient();

      const tip = await client.getBlock({ blockTag: 'latest' });
      const now = Number(tip.timestamp);
      const genesis = Math.ceil(now / e) * e - 4 * S;
      const slotAt = (ts: number) => Math.floor((ts - genesis) / S);
      const slotStart = (slot: number) => genesis + slot * S;

      const targetSlot = slotAt(now) + 2;
      const attestationDeadline = slotStart(targetSlot) + S - e - lead;
      expect(attestationDeadline).toBeGreaterThan(now);

      await cheatCodes.setNextBlockTimestamp(attestationDeadline);
      await cheatCodes.evmMine();
      await cheatCodes.setIntervalMining(e, { silent: true });

      const hash = await client.sendTransaction({ to: account.address });
      const rcpt = await client.waitForTransactionReceipt({ hash });
      const includedTs = await timestampOfBlock(client, rcpt.blockNumber);
      const includedSlot = slotAt(includedTs);

      logger.info(`Attestation-deadline inclusion`, {
        ...profile,
        genesis,
        targetSlot,
        attestationDeadline,
        includedTs,
        includedSlot,
      });

      expect(includedSlot).toBe(targetSlot);
      expect(includedTs).toBeLessThan(slotStart(targetSlot + 1));

      await cheatCodes.setIntervalMining(0, { silent: true });
    }, 60000);
  });
});
