import { getPublicClient } from '@aztec/ethereum/client';
import { DefaultL1ContractsConfig } from '@aztec/ethereum/config';
import { type FeeHeader, RollupContract, TempCheckpointLogField } from '@aztec/ethereum/contracts';
import { deployAztecL1Contracts } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import type { L1SyncSnapshot, L1SyncSnapshotProvider } from '@aztec/ethereum/l1-types';
import { type Anvil, EthCheatCodes, RollupCheatCodes, startAnvil } from '@aztec/ethereum/test';
import type { ViemClient } from '@aztec/ethereum/types';
import { CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { times } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { DateProvider, ManualDateProvider } from '@aztec/foundation/timer';
import {
  type L1RollupConstants,
  getNextL1SlotTimestamp,
  getSlotAtNextL1Block,
  getTimestampForSlot,
} from '@aztec/stdlib/epoch-helpers';
import { FEE_ORACLE_LAG, GasFees, ManaUsageEstimate, computeExcessMana } from '@aztec/stdlib/gas';

import { foundry } from 'viem/chains';

import { type FeeOracleState, computePredictions } from './fee_prediction.js';
import { FeeSnapshotService } from './fee_snapshot_service.js';
import { type FeeSnapshotServiceConfig, getDefaultFeeSnapshotServiceConfig } from './fee_snapshot_types.js';

type LegacyOracleConstants = Pick<L1RollupConstants, 'l1GenesisTime' | 'slotDuration' | 'ethereumSlotDuration'>;

/**
 * Faithful refactor of the pre-snapshot `FeeProviderImpl.computeCurrentMinFees`, taking `(blockNumber, now)`
 * explicitly and pinned to that block. Kept here as the equivalence oracle for the snapshot service.
 */
async function computeLegacyCurrentMinFees(
  rollup: RollupContract,
  blockNumber: bigint,
  nowSeconds: number,
  constants: LegacyOracleConstants,
): Promise<GasFees> {
  const pendingCheckpointNumber = await rollup.getCheckpointNumber({ blockNumber });
  const lastCheckpoint = await rollup.getCheckpoint(pendingCheckpointNumber, { blockNumber });
  const earliestTimestamp = getTimestampForSlot(SlotNumber.add(lastCheckpoint.slotNumber, 1), constants);
  const nextEthTimestamp = getNextL1SlotTimestamp(nowSeconds, constants);
  const timestamp = earliestTimestamp > nextEthTimestamp ? earliestTimestamp : nextEthTimestamp;
  return new GasFees(0, await rollup.getManaMinFeeAt(timestamp, true, { blockNumber }));
}

/**
 * Faithful refactor of the pre-snapshot `FeePredictor.fetchState`, taking `(blockNumber, now)` explicitly and
 * pinned to that block.
 */
async function fetchLegacyFeeOracleState(
  rollup: RollupContract,
  blockNumber: bigint,
  nowSeconds: number,
  constants: LegacyOracleConstants,
): Promise<FeeOracleState> {
  const opts = { blockNumber };
  const [manaTarget, manaLimit, provingCostPerManaEth, epochDuration] = await Promise.all([
    rollup.readManaTarget(opts),
    rollup.readManaLimit(opts),
    rollup.readProvingCostPerManaInEth(opts),
    rollup.getEpochDuration(),
  ]);

  const currentSlot = await rollup.getSlotNumber(opts);
  const slotAtNextL1Block = getSlotAtNextL1Block(BigInt(nowSeconds), constants);
  const preliminaryNextSlot = SlotNumber(Math.max(currentSlot, slotAtNextL1Block));
  const nextSlotTimestamp = getTimestampForSlot(preliminaryNextSlot, constants);

  const lastCheckpoint = await rollup.getEffectivePendingCheckpoint(nextSlotTimestamp, opts);
  const lastSlot = lastCheckpoint.slotNumber;
  const nextSlot = SlotNumber(Math.max(SlotNumber.add(lastSlot, 1), preliminaryNextSlot));
  const feeHeader = lastCheckpoint.feeHeader;

  const timestamps = times(FEE_ORACLE_LAG, i => getTimestampForSlot(SlotNumber.add(nextSlot, i), constants));
  const l1FeesBySlot = await Promise.all(timestamps.map(ts => rollup.getL1FeesAt(ts, opts)));

  return {
    lastSlot,
    excessMana: computeExcessMana(feeHeader.excessMana, feeHeader.manaUsed, manaTarget),
    ethPerFeeAsset: feeHeader.ethPerFeeAsset,
    manaTarget,
    manaLimit,
    provingCostPerManaEth,
    epochDuration: BigInt(epochDuration),
    l1FeesBySlot,
  };
}

/** Legacy `getPredictedMinFees`: current fee followed by the prediction window, on identical explicit inputs. */
async function computeLegacyPredictedMinFees(
  rollup: RollupContract,
  blockNumber: bigint,
  nowSeconds: number,
  constants: LegacyOracleConstants,
  manaUsage: ManaUsageEstimate,
): Promise<GasFees[]> {
  const [current, state] = await Promise.all([
    computeLegacyCurrentMinFees(rollup, blockNumber, nowSeconds, constants),
    fetchLegacyFeeOracleState(rollup, blockNumber, nowSeconds, constants),
  ]);
  return [current, ...computePredictions(state, manaUsage)];
}

// The snapshot service path must reduce exactly to the legacy oracle on identical (blockNumber, now).
describe('FeeSnapshot equivalence with legacy oracle', () => {
  let anvil: Anvil;
  let rpcUrl: string;
  let publicClient: ViemClient;
  let rollup: RollupContract;
  let cheatCodes: EthCheatCodes;
  let rollupCheatCodes: RollupCheatCodes;

  let slotDuration: number;
  let ethereumSlotDuration: number;
  let l1GenesisTime: bigint;
  let epochDuration: number;
  let proofSubmissionEpochs: number;
  let constants: { l1GenesisTime: bigint; slotDuration: number; ethereumSlotDuration: number };

  beforeAll(async () => {
    const privateKeyRaw = '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba';
    ({ anvil, rpcUrl } = await startAnvil());
    publicClient = getPublicClient({ l1RpcUrls: [rpcUrl], l1ChainId: 31337 });
    cheatCodes = new EthCheatCodes([rpcUrl], new DateProvider());

    const deployed = await deployAztecL1Contracts(rpcUrl, privateKeyRaw, foundry.id, {
      ...DefaultL1ContractsConfig,
      vkTreeRoot: Fr.random(),
      protocolContractsHash: Fr.random(),
      genesisArchiveRoot: Fr.random(),
      realVerifier: false,
    });

    rollup = new RollupContract(publicClient, deployed.l1ContractAddresses.rollupAddress.toString());
    rollupCheatCodes = RollupCheatCodes.create([rpcUrl], deployed.l1ContractAddresses, new DateProvider());
    slotDuration = await rollup.getSlotDuration();
    ethereumSlotDuration = DefaultL1ContractsConfig.ethereumSlotDuration;
    l1GenesisTime = await rollup.getL1GenesisTime();
    epochDuration = await rollup.getEpochDuration();
    proofSubmissionEpochs = await rollup.getProofSubmissionEpochs();
    constants = { l1GenesisTime, slotDuration, ethereumSlotDuration };
  }, 60_000);

  afterAll(async () => {
    await cheatCodes.setIntervalMining(0);
    await anvil?.stop().catch(err => createLogger('cleanup').error('Error stopping anvil', err));
  });

  function makeService(identity: L1SyncSnapshot, dateProvider: ManualDateProvider): FeeSnapshotService {
    const config: FeeSnapshotServiceConfig = {
      ...getDefaultFeeSnapshotServiceConfig({ slotDuration, l1GenesisTime, ethereumSlotDuration, epochDuration }),
      // The cases below drive the clock explicitly, so the head-age bound is disabled and the loop never ticks.
      maxL1HeadAgeSeconds: 0,
      refreshTimeoutMs: 30_000,
      pollIntervalMs: 1_000_000_000,
    };
    const identityProvider: L1SyncSnapshotProvider = { getL1SyncSnapshot: () => identity };
    return new FeeSnapshotService(rollup, identityProvider, dateProvider, config);
  }

  /** Compares the snapshot service output against the legacy oracle at the current L1 block, for a given now. */
  async function assertEquivalent(nowSeconds: number): Promise<void> {
    const block = await publicClient.getBlock();
    const blockNumber = block.number!;
    const identity: L1SyncSnapshot = {
      blockNumber,
      blockHash: Buffer32.fromString(block.hash),
      blockTimestamp: block.timestamp,
    };
    const dateProvider = new ManualDateProvider();
    dateProvider.setTime(nowSeconds * 1000);
    const service = makeService(identity, dateProvider);
    try {
      const currentService = await service.getCurrentMinFees();
      const currentLegacy = await computeLegacyCurrentMinFees(rollup, blockNumber, nowSeconds, constants);
      expect(currentService.feePerL2Gas).toBe(currentLegacy.feePerL2Gas);

      for (const estimate of [ManaUsageEstimate.None, ManaUsageEstimate.Target, ManaUsageEstimate.Limit]) {
        const fromService = await service.getPredictedMinFees(estimate);
        const fromLegacy = await computeLegacyPredictedMinFees(rollup, blockNumber, nowSeconds, constants, estimate);
        expect(fromService.map(f => f.feePerL2Gas)).toEqual(fromLegacy.map(f => f.feePerL2Gas));
      }
    } finally {
      await service.stop();
    }
  }

  async function currentBlockTimestamp(): Promise<number> {
    return Number((await publicClient.getBlock()).timestamp);
  }

  function tsForSlot(slot: number): bigint {
    return l1GenesisTime + BigInt(slot) * BigInt(slotDuration);
  }

  /** Writes a checkpoint log (slot + fee header) into the Rollup's temp-checkpoint circular buffer via storage. */
  async function writeCheckpointLog(checkpointNumber: CheckpointNumber, slot: number, feeHeader: FeeHeader) {
    const address = EthAddress.fromString(rollup.address);
    const feeHeaderSlot = await rollup.getTempCheckpointLogStorageSlot(
      checkpointNumber,
      TempCheckpointLogField.FeeHeader,
    );
    await cheatCodes.store(address, feeHeaderSlot, RollupContract.compressFeeHeader(feeHeader));
    const slotNumberSlot = await rollup.getTempCheckpointLogStorageSlot(
      checkpointNumber,
      TempCheckpointLogField.SlotNumber,
    );
    await cheatCodes.store(address, slotNumberSlot, BigInt(slot) & ((1n << 32n) - 1n));
  }

  /** Sets the chain tips (pending, proven) directly via storage. */
  async function setTips(pending: CheckpointNumber, proven: CheckpointNumber) {
    await cheatCodes.store(
      EthAddress.fromString(rollup.address),
      RollupContract.chainTipsStorageSlot,
      RollupContract.packChainTips(BigInt(pending), BigInt(proven)),
    );
  }

  it('matches the legacy oracle at a fresh deploy', async () => {
    await assertEquivalent(await currentBlockTimestamp());
  });

  it('matches the legacy oracle after advancing several slots', async () => {
    await rollupCheatCodes.advanceSlots(5);
    await cheatCodes.mine();
    await assertEquivalent(await currentBlockTimestamp());
  }, 30_000);

  it('matches the legacy oracle across an oracle rotation placed below/inside/above the window', async () => {
    const preBaseFee = 50_000_000_000n;
    const postBaseFee = 200_000_000_000n;

    // Two accepted updates leave pre=preBaseFee, post=postBaseFee with slotOfChange = updateSlot + LAG. The
    // updates are spaced past the oracle LIFETIME cooldown so both take effect.
    await rollupCheatCodes.advanceSlots(6);
    await cheatCodes.setNextBlockBaseFeePerGas(preBaseFee);
    await rollupCheatCodes.updateL1GasFeeOracle();
    await rollupCheatCodes.advanceSlots(6);
    await cheatCodes.setNextBlockBaseFeePerGas(postBaseFee);
    await rollupCheatCodes.updateL1GasFeeOracle();

    const block = await publicClient.getBlock();
    const blockNumber = block.number!;
    const pinnedSlot = Number((block.timestamp - l1GenesisTime) / BigInt(slotDuration));
    const slotOfChange = pinnedSlot + FEE_ORACLE_LAG;

    // Confirm the rotation is real (pre != post) and located exactly at slotOfChange.
    const pre = await rollup.getL1FeesAt(tsForSlot(slotOfChange - 1), { blockNumber });
    const post = await rollup.getL1FeesAt(tsForSlot(slotOfChange), { blockNumber });
    expect(pre.baseFee).not.toBe(post.baseFee);
    const classify = (fees: { baseFee: bigint }) => (fees.baseFee === pre.baseFee ? 'pre' : 'post');

    // Placing the next-L1-block slot at `anchorSlot` makes the prediction window [anchorSlot, anchorSlot+1].
    const placements = [
      { name: 'above the window (whole window uses pre)', deltaT: 0, expected: ['pre', 'pre'] },
      { name: 'inside the window (window straddles the rotation)', deltaT: 1, expected: ['pre', 'post'] },
      { name: 'below the window (whole window uses post)', deltaT: 2, expected: ['post', 'post'] },
    ] as const;

    for (const { name, deltaT, expected } of placements) {
      const anchorSlot = pinnedSlot + deltaT;
      const nowSeconds = Number(tsForSlot(anchorSlot)) - ethereumSlotDuration;

      const windowLow = await rollup.getL1FeesAt(tsForSlot(anchorSlot), { blockNumber });
      const windowHigh = await rollup.getL1FeesAt(tsForSlot(anchorSlot + 1), { blockNumber });
      // Verify the rotation lands where we intend before comparing, so the case tests what it claims.
      expect({ placement: name, composition: [classify(windowLow), classify(windowHigh)] }).toEqual({
        placement: name,
        composition: [...expected],
      });

      await assertEquivalent(nowSeconds);
    }
  }, 60_000);

  it('matches with the host clock one Ethereum slot behind and ahead of the L1 timestamp', async () => {
    const ts = await currentBlockTimestamp();
    await assertEquivalent(ts - ethereumSlotDuration);
    await assertEquivalent(ts + ethereumSlotDuration);
  }, 30_000);

  it('is pinned: a snapshot built at block N is unaffected by later blocks until refresh', async () => {
    const block = await publicClient.getBlock();
    const blockNumber = block.number!;
    const nowSeconds = Number(block.timestamp);
    const identity: L1SyncSnapshot = {
      blockNumber,
      blockHash: Buffer32.fromString(block.hash),
      blockTimestamp: block.timestamp,
    };
    const dateProvider = new ManualDateProvider();
    dateProvider.setTime(nowSeconds * 1000);
    const service = makeService(identity, dateProvider);
    try {
      const before = await service.getCurrentMinFees();
      // Mine later blocks and bump the base fee; the fixed-identity service must still serve the block-N value.
      await cheatCodes.setNextBlockBaseFeePerGas(500_000_000_000n);
      await cheatCodes.mine(3);
      const afterPinned = await service.getCurrentMinFees();
      expect(afterPinned.feePerL2Gas).toBe(before.feePerL2Gas);
      // And it equals the legacy oracle recomputed at the same pinned block N.
      const legacyAtN = await computeLegacyCurrentMinFees(rollup, blockNumber, nowSeconds, constants);
      expect(afterPinned.feePerL2Gas).toBe(legacyAtN.feePerL2Gas);
    } finally {
      await service.stop();
    }
  }, 30_000);

  it('getManaMinFeeAt is constant within an Aztec slot (start, mid, end)', async () => {
    const block = await publicClient.getBlock();
    const blockNumber = block.number!;
    const currentSlot = await rollup.getSlotNumber({ blockNumber });
    const slotStart = l1GenesisTime + BigInt(Number(currentSlot) + 1) * BigInt(slotDuration);
    const mid = slotStart + BigInt(Math.floor(slotDuration / 2));
    const slotEnd = slotStart + BigInt(slotDuration - 1);
    const [atStart, atMid, atEnd] = await Promise.all([
      rollup.getManaMinFeeAt(slotStart, true, { blockNumber }),
      rollup.getManaMinFeeAt(mid, true, { blockNumber }),
      rollup.getManaMinFeeAt(slotEnd, true, { blockNumber }),
    ]);
    expect(atMid).toBe(atStart);
    expect(atEnd).toBe(atStart);
  });

  // These cases write a real pending checkpoint beyond the proven tip (pending != proven) so the prune-aware
  // effective-parent selection is exercised: pending when canPrune is false, proven when canPrune is true.
  describe('pending checkpoint beyond the proven tip', () => {
    const provenFeeHeader: FeeHeader = {
      excessMana: 0n,
      manaUsed: 0n,
      ethPerFeeAsset: 1_000_000_000_000n,
      congestionCost: 0n,
      proverCost: 0n,
    };
    const pendingFeeHeader: FeeHeader = {
      excessMana: 5_000n,
      manaUsed: 1_000n,
      ethPerFeeAsset: 500_000_000_000n,
      congestionCost: 0n,
      proverCost: 0n,
    };

    afterEach(async () => {
      // Restore genesis tips so the written pending>proven state does not leak into other tests.
      await setTips(CheckpointNumber(0), CheckpointNumber(0));
    });

    it('canPrune=false selects the pending checkpoint as effective parent, matching legacy', async () => {
      const block = await publicClient.getBlock();
      const blockNumber = block.number!;
      const nowSeconds = Number(block.timestamp);
      const pinnedSlot = Number((block.timestamp - l1GenesisTime) / BigInt(slotDuration));

      // Proven at slot 0; pending at the current (recent) slot, so its epoch still accepts proofs.
      await writeCheckpointLog(CheckpointNumber(1), 0, provenFeeHeader);
      await writeCheckpointLog(CheckpointNumber(2), pinnedSlot, pendingFeeHeader);
      await setTips(CheckpointNumber(2), CheckpointNumber(1));

      const tips = await rollup.getTips({ blockNumber });
      expect(tips.pending).toBe(CheckpointNumber(2));
      expect(tips.proven).toBe(CheckpointNumber(1));

      const nextSlotTs = tsForSlot(pinnedSlot);
      expect(await rollup.canPruneAtTime(nextSlotTs, { blockNumber })).toBe(false);
      // Effective parent is the pending checkpoint (its slot), not the proven one (slot 0).
      const effective = await rollup.getEffectivePendingCheckpoint(nextSlotTs, { blockNumber });
      expect(Number(effective.slotNumber)).toBe(pinnedSlot);

      await assertEquivalent(nowSeconds);
    }, 30_000);

    it('canPrune=true selects the proven checkpoint as effective parent, matching legacy', async () => {
      // Advance well past the proof-submission deadline of epoch 0 so a prune becomes possible.
      await rollupCheatCodes.advanceSlots(epochDuration * (proofSubmissionEpochs + 2));
      await cheatCodes.mine();

      const block = await publicClient.getBlock();
      const blockNumber = block.number!;
      const nowSeconds = Number(block.timestamp);
      const pinnedSlot = Number((block.timestamp - l1GenesisTime) / BigInt(slotDuration));

      // Proven at slot 0 and pending at slot 1, both in epoch 0 (long past its proof deadline).
      await writeCheckpointLog(CheckpointNumber(1), 0, provenFeeHeader);
      await writeCheckpointLog(CheckpointNumber(2), 1, pendingFeeHeader);
      await setTips(CheckpointNumber(2), CheckpointNumber(1));

      const tips = await rollup.getTips({ blockNumber });
      expect(tips.pending).toBe(CheckpointNumber(2));
      expect(tips.proven).toBe(CheckpointNumber(1));

      // The effective-parent selection happens at the prediction anchor (the current slot at this late time).
      const nextSlotTs = tsForSlot(pinnedSlot);
      expect(await rollup.canPruneAtTime(nextSlotTs, { blockNumber })).toBe(true);
      // Effective parent is the proven checkpoint (slot 0), not the pending one (slot 1).
      const effective = await rollup.getEffectivePendingCheckpoint(nextSlotTs, { blockNumber });
      expect(Number(effective.slotNumber)).toBe(0);

      await assertEquivalent(nowSeconds);
    }, 30_000);
  });
});
