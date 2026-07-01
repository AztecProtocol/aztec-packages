import { getPublicClient } from '@aztec/ethereum/client';
import { DefaultL1ContractsConfig } from '@aztec/ethereum/config';
import type { FeeHeader } from '@aztec/ethereum/contracts';
import { MAX_FEE_ASSET_PRICE_MODIFIER_BPS, RollupContract, TempCheckpointLogField } from '@aztec/ethereum/contracts';
import { deployAztecL1Contracts } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import { type Anvil, EthCheatCodes, RollupCheatCodes, startAnvil } from '@aztec/ethereum/test';
import type { ViemClient } from '@aztec/ethereum/types';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import { FEE_ORACLE_LAG, type GasFees, ManaUsageEstimate, computeExcessMana } from '@aztec/stdlib/gas';

import { jest } from '@jest/globals';
import { foundry } from 'viem/chains';

import { FeePredictor } from './fee_predictor.js';

describe('FeePredictor', () => {
  let anvil: Anvil;
  let rpcUrl: string;
  let publicClient: ViemClient;
  let cheatCodes: EthCheatCodes;
  let rollupCheatCodes: RollupCheatCodes;
  let rollup: RollupContract;

  let slotDuration: number;
  let ethereumSlotDuration: number;
  let l1GenesisTime: bigint;
  let feePredictorConfig: { slotDuration: number; l1GenesisTime: bigint; ethereumSlotDuration: number };
  let dateProvider: DateProvider;

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
    feePredictorConfig = { slotDuration, l1GenesisTime, ethereumSlotDuration };
    dateProvider = new DateProvider();
  }, 60_000);

  afterAll(async () => {
    await cheatCodes.setIntervalMining(0);
    await anvil?.stop().catch(err => createLogger('cleanup').error(`Error stopping anvil`, err));
  });

  function getTimestamp(slot: bigint): bigint {
    return l1GenesisTime + slot * BigInt(slotDuration);
  }

  /** Decays ethPerFeeAsset by MAX_FEE_ASSET_PRICE_MODIFIER_BPS per step, matching the predictor's conservative estimate. */
  function decayEthPerFeeAsset(ethPerFeeAsset: bigint, steps: number): bigint {
    let value = ethPerFeeAsset;
    for (let i = 0; i < steps; i++) {
      value = (value * (10000n - MAX_FEE_ASSET_PRICE_MODIFIER_BPS)) / 10000n;
    }
    return value;
  }

  /** Writes a fee header to the pending checkpoint's storage via cheat codes. */
  async function writePendingFeeHeader(feeHeader: FeeHeader) {
    const rollupAddress = EthAddress.fromString(rollup.address);
    const pendingCheckpointNumber = await rollup.getCheckpointNumber();
    const feeHeaderSlot = await rollup.getTempCheckpointLogStorageSlot(
      pendingCheckpointNumber,
      TempCheckpointLogField.FeeHeader,
    );
    await cheatCodes.store(rollupAddress, feeHeaderSlot, RollupContract.compressFeeHeader(feeHeader));
  }

  /** Writes a fee header and slot number for the given checkpoint, then bumps the pending tip. */
  async function advanceCheckpoint(checkpointNumber: CheckpointNumber, feeHeader: FeeHeader, slotNumber: bigint) {
    const rollupAddress = EthAddress.fromString(rollup.address);
    const feeHeaderSlot = await rollup.getTempCheckpointLogStorageSlot(
      checkpointNumber,
      TempCheckpointLogField.FeeHeader,
    );
    await cheatCodes.store(rollupAddress, feeHeaderSlot, RollupContract.compressFeeHeader(feeHeader));

    const slotNumberSlot = await rollup.getTempCheckpointLogStorageSlot(
      checkpointNumber,
      TempCheckpointLogField.SlotNumber,
    );
    await cheatCodes.store(rollupAddress, slotNumberSlot, slotNumber & ((1n << 32n) - 1n));

    const currentTips = await cheatCodes.load(rollupAddress, RollupContract.chainTipsStorageSlot);
    const provenCheckpointNumber = currentTips & ((1n << 128n) - 1n);
    await cheatCodes.store(
      rollupAddress,
      RollupContract.chainTipsStorageSlot,
      RollupContract.packChainTips(BigInt(checkpointNumber), provenCheckpointNumber),
    );
  }

  async function getPredictionStartSlot(): Promise<bigint> {
    const lastCheckpoint = await rollup.getPendingCheckpoint();
    const currentSlot = await rollup.getSlotNumber();
    const afterCheckpoint = BigInt(lastCheckpoint.slotNumber) + 1n;
    return afterCheckpoint > BigInt(currentSlot) ? afterCheckpoint : BigInt(currentSlot);
  }

  it('slot 0 matches L1 getManaMinFeeAt for all ManaUsageEstimate values', async () => {
    const startSlot = await getPredictionStartSlot();
    const l1Fee = await rollup.getManaMinFeeAt(getTimestamp(startSlot), true);

    for (const manaUsage of Object.values(ManaUsageEstimate)) {
      const predictor = new FeePredictor(rollup, publicClient, dateProvider, feePredictorConfig);
      const predicted = await predictor.getPredictedMinFees(manaUsage);
      expect(predicted[0].feePerL2Gas).toBe(l1Fee);
    }
  });

  it('all slots match L1 with ManaUsageEstimate.None and zero congestion', async () => {
    const predictor = new FeePredictor(rollup, publicClient, dateProvider, feePredictorConfig);
    const predicted = await predictor.getPredictedMinFees(ManaUsageEstimate.None);

    const startSlot = await getPredictionStartSlot();
    const pendingCheckpointNumber = await rollup.getCheckpointNumber();
    const currentFeeHeader = (await rollup.getCheckpoint(pendingCheckpointNumber)).feeHeader;

    for (let i = 0; i < predicted.length; i++) {
      // Write the decayed ethPerFeeAsset to L1 so getManaMinFeeAt matches the predictor's conservative estimate.
      if (i > 0) {
        await writePendingFeeHeader({
          ...currentFeeHeader,
          ethPerFeeAsset: decayEthPerFeeAsset(currentFeeHeader.ethPerFeeAsset, i),
        });
      }
      const l1Fee = await rollup.getManaMinFeeAt(getTimestamp(startSlot + BigInt(i)), true);
      expect(predicted[i].feePerL2Gas).toBe(l1Fee);
    }

    // Restore original fee header.
    await writePendingFeeHeader(currentFeeHeader);
  });

  it('each slot uses correct L1 fees across oracle transition', async () => {
    await rollupCheatCodes.advanceSlots(FEE_ORACLE_LAG + 1);
    await cheatCodes.setNextBlockBaseFeePerGas(1_000_000_000n);
    await cheatCodes.mine();
    await rollupCheatCodes.updateL1GasFeeOracle();

    await rollupCheatCodes.advanceSlots(FEE_ORACLE_LAG + 1);
    await cheatCodes.setNextBlockBaseFeePerGas(200_000_000_000n);
    await cheatCodes.mine();
    await rollupCheatCodes.updateL1GasFeeOracle();

    const predictor = new FeePredictor(rollup, publicClient, dateProvider, feePredictorConfig);
    const predicted = await predictor.getPredictedMinFees(ManaUsageEstimate.None);

    const startSlot = await getPredictionStartSlot();
    const pendingCheckpointNumber = await rollup.getCheckpointNumber();
    const currentFeeHeader = (await rollup.getCheckpoint(pendingCheckpointNumber)).feeHeader;

    for (let i = 0; i < predicted.length; i++) {
      // Write the decayed ethPerFeeAsset to L1 so getManaMinFeeAt matches the predictor's conservative estimate.
      if (i > 0) {
        await writePendingFeeHeader({
          ...currentFeeHeader,
          ethPerFeeAsset: decayEthPerFeeAsset(currentFeeHeader.ethPerFeeAsset, i),
        });
      }
      const l1Fee = await rollup.getManaMinFeeAt(getTimestamp(startSlot + BigInt(i)), true);
      expect(predicted[i].feePerL2Gas).toBe(l1Fee);
    }

    // Restore original fee header.
    await writePendingFeeHeader(currentFeeHeader);
  });

  it('L1 base fee change is reflected in slot 0 prediction', async () => {
    await rollupCheatCodes.advanceSlots(FEE_ORACLE_LAG + 1);
    await cheatCodes.setNextBlockBaseFeePerGas(100_000_000_000n);
    await cheatCodes.mine();
    await rollupCheatCodes.updateL1GasFeeOracle();
    await cheatCodes.mine();
    await rollupCheatCodes.advanceSlots(3);

    const predictor = new FeePredictor(rollup, publicClient, dateProvider, feePredictorConfig);
    const predicted = await predictor.getPredictedMinFees(ManaUsageEstimate.None);

    const startSlot = await getPredictionStartSlot();
    const l1Fee = await rollup.getManaMinFeeAt(getTimestamp(startSlot), true);
    expect(predicted[0].feePerL2Gas).toBe(l1Fee);
  });

  it('returns exactly FEE_ORACLE_LAG entries', async () => {
    const predictor = new FeePredictor(rollup, publicClient, dateProvider, feePredictorConfig);
    const predicted = await predictor.getPredictedMinFees(ManaUsageEstimate.Target);
    expect(predicted.length).toBe(FEE_ORACLE_LAG);
  });

  it.each([
    { name: 'None', estimate: ManaUsageEstimate.None },
    { name: 'Target', estimate: ManaUsageEstimate.Target },
    { name: 'Limit', estimate: ManaUsageEstimate.Limit },
  ])(
    'predictions match L1 across all slots when advancing with ManaUsageEstimate.$name',
    async ({ estimate }) => {
      const constantBaseFee = 50_000_000_000n;

      // Pin L1 fees to a constant by updating the oracle twice (sets both pre and post).
      await rollupCheatCodes.advanceSlots(FEE_ORACLE_LAG + 1);
      await cheatCodes.setNextBlockBaseFeePerGas(constantBaseFee);
      await rollupCheatCodes.updateL1GasFeeOracle();
      await rollupCheatCodes.advanceSlots(FEE_ORACLE_LAG + 1);
      await cheatCodes.setNextBlockBaseFeePerGas(constantBaseFee);
      await rollupCheatCodes.updateL1GasFeeOracle();
      await rollupCheatCodes.advanceSlots(3);
      await cheatCodes.mine();

      const manaTarget = await rollup.getManaTarget();
      const manaLimit = await rollup.getManaLimit();
      const assumedManaUsed =
        estimate === ManaUsageEstimate.None ? 0n : estimate === ManaUsageEstimate.Target ? manaTarget : manaLimit;

      const predictor = new FeePredictor(rollup, publicClient, dateProvider, feePredictorConfig);
      const predicted = await predictor.getPredictedMinFees(estimate);

      const startSlot = await getPredictionStartSlot();
      const pendingCheckpointNumber = await rollup.getCheckpointNumber();
      const currentFeeHeader = (await rollup.getCheckpoint(pendingCheckpointNumber)).feeHeader;

      let prevExcessMana = currentFeeHeader.excessMana;
      let prevManaUsed = currentFeeHeader.manaUsed;

      for (let i = 0; i < predicted.length; i++) {
        const slotI = startSlot + BigInt(i);
        const timestampI = getTimestamp(slotI);

        const l1Fee = await rollup.getManaMinFeeAt(timestampI, true);
        expect(predicted[i].feePerL2Gas).toBe(l1Fee);

        // Advance: simulate proposing a checkpoint at this slot with the assumed mana usage
        // and the decayed ethPerFeeAsset matching the predictor's conservative estimate.
        const newExcessMana = computeExcessMana(prevExcessMana, prevManaUsed, manaTarget);
        const newCheckpointNumber = CheckpointNumber.add(pendingCheckpointNumber, i + 1);
        const newFeeHeader: FeeHeader = {
          excessMana: newExcessMana,
          manaUsed: assumedManaUsed,
          ethPerFeeAsset: decayEthPerFeeAsset(currentFeeHeader.ethPerFeeAsset, i + 1),
          congestionCost: 0n,
          proverCost: 0n,
        };

        await advanceCheckpoint(newCheckpointNumber, newFeeHeader, slotI);

        if (i < predicted.length - 1) {
          const nextTimestamp = getTimestamp(slotI + 1n);
          await cheatCodes.warp(Number(nextTimestamp));
          await cheatCodes.setNextBlockBaseFeePerGas(constantBaseFee);
          await cheatCodes.mine();
        }

        prevExcessMana = newExcessMana;
        prevManaUsed = assumedManaUsed;
      }
    },
    60_000,
  );

  it('predictions match L1 across successive slots over time', async () => {
    const constantBaseFee = 50_000_000_000n;

    // Pin L1 fees to a constant by updating the oracle twice (sets both pre and post).
    await rollupCheatCodes.advanceSlots(FEE_ORACLE_LAG + 1);
    await cheatCodes.setNextBlockBaseFeePerGas(constantBaseFee);
    await rollupCheatCodes.updateL1GasFeeOracle();
    await rollupCheatCodes.advanceSlots(FEE_ORACLE_LAG + 1);
    await cheatCodes.setNextBlockBaseFeePerGas(constantBaseFee);
    await rollupCheatCodes.updateL1GasFeeOracle();
    await rollupCheatCodes.advanceSlots(3);
    await cheatCodes.mine();

    const manaTarget = await rollup.getManaTarget();

    const pendingCheckpointNumber = await rollup.getCheckpointNumber();
    const currentFeeHeader = (await rollup.getCheckpoint(pendingCheckpointNumber)).feeHeader;

    let prevExcessMana = currentFeeHeader.excessMana;
    let prevManaUsed = currentFeeHeader.manaUsed;
    let ethPerFeeAsset = currentFeeHeader.ethPerFeeAsset;
    let nextCheckpointOffset = 1;

    // Store previous predictions to verify their future entries against L1 when those slots arrive.
    const pastPredictions: { predicted: GasFees[]; startSlot: bigint }[] = [];

    // Step through 6 successive slots, creating a fresh predictor each time.
    for (let step = 0; step < 6; step++) {
      const predictor = new FeePredictor(rollup, publicClient, dateProvider, feePredictorConfig);
      const predicted = await predictor.getPredictedMinFees(ManaUsageEstimate.None);

      expect(predicted.length).toBe(FEE_ORACLE_LAG);

      // Slot 0 of each fresh predictor must match L1 exactly.
      const startSlot = await getPredictionStartSlot();
      const l1Fee = await rollup.getManaMinFeeAt(getTimestamp(startSlot), true);
      expect(predicted[0].feePerL2Gas).toBe(l1Fee);

      // Verify future entries of past predictions that now cover the current slot.
      for (const past of pastPredictions) {
        const offset = Number(startSlot - past.startSlot);
        if (offset > 0 && offset < past.predicted.length) {
          expect(past.predicted[offset].feePerL2Gas).toBe(l1Fee);
        }
      }

      pastPredictions.push({ predicted, startSlot });

      // Advance: simulate proposing a checkpoint at the current slot with zero mana usage
      // and the decayed ethPerFeeAsset matching the predictor's conservative estimate.
      const newExcessMana = computeExcessMana(prevExcessMana, prevManaUsed, manaTarget);
      const decayedEthPerFeeAsset = decayEthPerFeeAsset(ethPerFeeAsset, 1);
      const newCheckpointNumber = CheckpointNumber.add(pendingCheckpointNumber, nextCheckpointOffset);
      const newFeeHeader: FeeHeader = {
        excessMana: newExcessMana,
        manaUsed: 0n,
        ethPerFeeAsset: decayedEthPerFeeAsset,
        congestionCost: 0n,
        proverCost: 0n,
      };

      await advanceCheckpoint(newCheckpointNumber, newFeeHeader, startSlot);

      // Warp to the next slot.
      const nextTimestamp = getTimestamp(startSlot + 1n);
      await cheatCodes.warp(Number(nextTimestamp));
      await cheatCodes.setNextBlockBaseFeePerGas(constantBaseFee);
      await cheatCodes.mine();

      prevExcessMana = newExcessMana;
      prevManaUsed = 0n;
      ethPerFeeAsset = decayedEthPerFeeAsset;
      nextCheckpointOffset++;
    }
  }, 60_000);
});

describe('FeePredictor state caching', () => {
  it('recovers from a transient L1 read failure without waiting for a new L1 block', async () => {
    const blockNumber = 1n;
    const getBlockNumber = jest.fn<() => Promise<bigint>>(() => Promise.resolve(blockNumber));
    const state = { manaTarget: 1n } as unknown;
    const fetchState = jest
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new Error('L1 RPC request failed'))
      .mockResolvedValue(state);

    const predictor: FeePredictor = Object.create(FeePredictor.prototype);
    Reflect.set(predictor, 'publicClient', { getBlockNumber });
    Reflect.set(predictor, 'cachedL1BlockNumber', undefined);
    Reflect.set(predictor, 'cachedState', undefined);
    Reflect.set(predictor, 'fetchState', fetchState);

    const getState = Reflect.get(FeePredictor.prototype, 'getState') as () => Promise<unknown>;

    await expect(getState.call(predictor)).rejects.toThrow('L1 RPC request failed');
    // Same L1 block: must recompute rather than replay the cached rejection.
    await expect(getState.call(predictor)).resolves.toBe(state);
    expect(fetchState).toHaveBeenCalledTimes(2);
  });
});
