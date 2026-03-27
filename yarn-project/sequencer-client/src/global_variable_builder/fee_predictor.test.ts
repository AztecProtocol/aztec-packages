import { getPublicClient } from '@aztec/ethereum/client';
import { DefaultL1ContractsConfig } from '@aztec/ethereum/config';
import type { FeeHeader } from '@aztec/ethereum/contracts';
import { RollupContract, TempCheckpointLogField } from '@aztec/ethereum/contracts';
import { deployAztecL1Contracts } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import { type Anvil, EthCheatCodes, RollupCheatCodes, startAnvil } from '@aztec/ethereum/test';
import type { ViemClient } from '@aztec/ethereum/types';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import { FEE_ORACLE_LAG, ManaUsageEstimate, computeExcessMana } from '@aztec/stdlib/gas';

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
  let l1GenesisTime: bigint;

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
    l1GenesisTime = await rollup.getL1GenesisTime();
  }, 60_000);

  afterAll(async () => {
    await cheatCodes.setIntervalMining(0);
    await anvil?.stop().catch(err => createLogger('cleanup').error(`Error stopping anvil`, err));
  });

  function getTimestamp(slot: bigint): bigint {
    return l1GenesisTime + slot * BigInt(slotDuration);
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
      const predictor = new FeePredictor(rollup, slotDuration, l1GenesisTime);
      const predicted = await predictor.getPredictedMinFees(publicClient, manaUsage);
      expect(predicted[0].feePerL2Gas).toBe(l1Fee);
    }
  });

  it('all slots match L1 with ManaUsageEstimate.None and zero congestion', async () => {
    const predictor = new FeePredictor(rollup, slotDuration, l1GenesisTime);
    const predicted = await predictor.getPredictedMinFees(publicClient, ManaUsageEstimate.None);

    const startSlot = await getPredictionStartSlot();
    for (let i = 0; i < predicted.length; i++) {
      const l1Fee = await rollup.getManaMinFeeAt(getTimestamp(startSlot + BigInt(i)), true);
      expect(predicted[i].feePerL2Gas).toBe(l1Fee);
    }
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

    const predictor = new FeePredictor(rollup, slotDuration, l1GenesisTime);
    const predicted = await predictor.getPredictedMinFees(publicClient, ManaUsageEstimate.None);

    const startSlot = await getPredictionStartSlot();
    for (let i = 0; i < predicted.length; i++) {
      const l1Fee = await rollup.getManaMinFeeAt(getTimestamp(startSlot + BigInt(i)), true);
      expect(predicted[i].feePerL2Gas).toBe(l1Fee);
    }
  });

  it('L1 base fee change is reflected in slot 0 prediction', async () => {
    await rollupCheatCodes.advanceSlots(FEE_ORACLE_LAG + 1);
    await cheatCodes.setNextBlockBaseFeePerGas(100_000_000_000n);
    await cheatCodes.mine();
    await rollupCheatCodes.updateL1GasFeeOracle();
    await cheatCodes.mine();
    await rollupCheatCodes.advanceSlots(3);

    const predictor = new FeePredictor(rollup, slotDuration, l1GenesisTime);
    const predicted = await predictor.getPredictedMinFees(publicClient, ManaUsageEstimate.None);

    const startSlot = await getPredictionStartSlot();
    const l1Fee = await rollup.getManaMinFeeAt(getTimestamp(startSlot), true);
    expect(predicted[0].feePerL2Gas).toBe(l1Fee);
  });

  it('returns exactly FEE_ORACLE_LAG + 1 entries', async () => {
    const predictor = new FeePredictor(rollup, slotDuration, l1GenesisTime);
    const predicted = await predictor.getPredictedMinFees(publicClient, ManaUsageEstimate.Target);
    expect(predicted.length).toBe(FEE_ORACLE_LAG + 1);
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

      const predictor = new FeePredictor(rollup, slotDuration, l1GenesisTime);
      const predicted = await predictor.getPredictedMinFees(publicClient, estimate);

      const rollupAddress = EthAddress.fromString(rollup.address);

      /** Writes a fee header and slot number for the given checkpoint, then bumps the pending tip. */
      async function advanceCheckpoint(checkpointNumber: CheckpointNumber, feeHeader: FeeHeader, slotNumber: bigint) {
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

        // Advance: simulate proposing a checkpoint at this slot with the assumed mana usage.
        const newExcessMana = computeExcessMana(prevExcessMana, prevManaUsed, manaTarget);
        const newCheckpointNumber = CheckpointNumber.add(pendingCheckpointNumber, i + 1);
        const newFeeHeader: FeeHeader = {
          excessMana: newExcessMana,
          manaUsed: assumedManaUsed,
          ethPerFeeAsset: currentFeeHeader.ethPerFeeAsset,
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
});
