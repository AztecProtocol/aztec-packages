import { getPublicClient } from '@aztec/ethereum/client';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import { RollupAbi } from '@aztec/l1-artifacts/RollupAbi';

import type { Abi } from 'viem';
import { foundry } from 'viem/chains';

import { DefaultL1ContractsConfig } from '../config.js';
import { deployAztecL1Contracts } from '../deploy_aztec_l1_contracts.js';
import { EthCheatCodes } from '../test/eth_cheat_codes.js';
import type { Anvil } from '../test/start_anvil.js';
import { startAnvil } from '../test/start_anvil.js';
import type { ViemClient } from '../types.js';
import { type FeeHeader, RollupContract, TempCheckpointLogField } from './rollup.js';

describe('Rollup', () => {
  let anvil: Anvil;
  let rpcUrl: string;
  let publicClient: ViemClient;
  let cheatCodes: EthCheatCodes;

  let vkTreeRoot: Fr;
  let protocolContractsHash: Fr;
  let rollupAddress: `0x${string}`;
  let rollup: RollupContract;

  beforeAll(async () => {
    // this is the 6th address that gets funded by the junk mnemonic
    const privateKeyRaw = '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba';
    vkTreeRoot = Fr.random();
    protocolContractsHash = Fr.random();

    ({ anvil, rpcUrl } = await startAnvil());

    publicClient = getPublicClient({ l1RpcUrls: [rpcUrl], l1ChainId: 31337 });
    cheatCodes = new EthCheatCodes([rpcUrl], new DateProvider());

    const deployed = await deployAztecL1Contracts(rpcUrl, privateKeyRaw, foundry.id, {
      ...DefaultL1ContractsConfig,
      vkTreeRoot,
      protocolContractsHash,
      genesisArchiveRoot: Fr.random(),
      realVerifier: false,
    });

    rollupAddress = deployed.l1ContractAddresses.rollupAddress.toString();
    rollup = new RollupContract(publicClient, rollupAddress);
  });

  afterAll(async () => {
    await cheatCodes.setIntervalMining(0);
    await anvil?.stop().catch(err => createLogger('cleanup').error(err));
  });

  describe('makePendingCheckpointNumberOverride', () => {
    it('creates state override that correctly overrides pending checkpoint number', async () => {
      const testProvenCheckpointNumber = CheckpointNumber(42);
      const testPendingCheckpointNumber = CheckpointNumber(100);
      const newPendingCheckpointNumber = CheckpointNumber(150);

      // Set storage directly using cheat codes
      // The storage slot stores both values: pending (high 128 bits) | proven (low 128 bits)
      const storageSlot = RollupContract.stfStorageSlot;
      const packedValue = (BigInt(testPendingCheckpointNumber) << 128n) | BigInt(testProvenCheckpointNumber);
      await cheatCodes.store(EthAddress.fromString(rollupAddress), BigInt(storageSlot), packedValue);

      // Verify the values were set correctly by calling the getters directly
      const provenCheckpointNumber = await rollup.getProvenCheckpointNumber();
      const pendingCheckpointNumber = await rollup.getCheckpointNumber();

      expect(provenCheckpointNumber).toBe(testProvenCheckpointNumber);
      expect(pendingCheckpointNumber).toBe(testPendingCheckpointNumber);

      // Create the override
      const stateOverride = await rollup.makePendingCheckpointNumberOverride(newPendingCheckpointNumber);

      // Test the override using simulateContract
      const { result: overriddenPendingCheckpointNumber } = await publicClient.simulateContract({
        address: rollupAddress,
        abi: RollupAbi as Abi,
        functionName: 'getPendingCheckpointNumber',
        stateOverride,
      });

      // The overridden value should be the new pending checkpoint number
      expect(overriddenPendingCheckpointNumber).toBe(BigInt(newPendingCheckpointNumber));

      // Verify that the proven checkpoint number is preserved in the override
      const { result: overriddenProvenCheckpointNumber } = await publicClient.simulateContract({
        address: rollupAddress,
        abi: RollupAbi as Abi,
        functionName: 'getProvenCheckpointNumber',
        stateOverride,
      });

      expect(CheckpointNumber.fromBigInt(overriddenProvenCheckpointNumber)).toBe(testProvenCheckpointNumber);

      // Verify the actual storage hasn't changed
      const actualPendingCheckpointNumber = await rollup.getCheckpointNumber();
      expect(actualPendingCheckpointNumber).toBe(testPendingCheckpointNumber);
    });
  });

  describe('getVkTreeRoot and getProtocolContractsHash', () => {
    it('reads vkTreeRoot from storage', async () => {
      const result = await rollup.getVkTreeRoot();
      expect(result).toEqual(vkTreeRoot);
    });

    it('reads protocolContractsHash from storage', async () => {
      const result = await rollup.getProtocolContractsHash();
      expect(result).toEqual(protocolContractsHash);
    });
  });

  describe('getSlashingProposer', () => {
    it('returns a slashing proposer', async () => {
      const slashingProposer = await rollup.getSlashingProposer();
      expect(slashingProposer).toBeDefined();
    });
  });

  describe('compressFeeHeader', () => {
    it('compressed fee header can be read back by L1 getFeeHeader', async () => {
      const feeHeader: FeeHeader = {
        manaUsed: 12345n,
        excessMana: 67890n,
        ethPerFeeAsset: 1_000_000_000_000n,
        congestionCost: 99999n,
        proverCost: 55555n,
      };

      // Ensure pending checkpoint is 0 so getFeeHeader(0) is in range
      await cheatCodes.store(
        EthAddress.fromString(rollupAddress),
        RollupContract.chainTipsStorageSlot,
        RollupContract.packChainTips(0n, 0n),
      );

      const checkpointNumber = CheckpointNumber(0);
      const slot = await rollup.getTempCheckpointLogStorageSlot(checkpointNumber, TempCheckpointLogField.FeeHeader);
      await cheatCodes.store(EthAddress.fromString(rollupAddress), slot, RollupContract.compressFeeHeader(feeHeader));

      const result = await rollup.getFeeHeader(0n);
      expect(result.manaUsed).toBe(feeHeader.manaUsed);
      expect(result.excessMana).toBe(feeHeader.excessMana);
      expect(result.ethPerFeeAsset).toBe(feeHeader.ethPerFeeAsset);
      expect(result.congestionCost).toBe(feeHeader.congestionCost);
      expect(result.proverCost).toBe(feeHeader.proverCost);
    });
  });

  describe('packChainTips', () => {
    it('packed tips can be read back as pending and proven checkpoint numbers', async () => {
      const pending = 200n;
      const proven = 150n;

      await cheatCodes.store(
        EthAddress.fromString(rollupAddress),
        RollupContract.chainTipsStorageSlot,
        RollupContract.packChainTips(pending, proven),
      );

      expect(await rollup.getCheckpointNumber()).toBe(CheckpointNumber.fromBigInt(pending));
      expect(await rollup.getProvenCheckpointNumber()).toBe(CheckpointNumber.fromBigInt(proven));
    });
  });

  describe('getTempCheckpointLogStorageSlot', () => {
    it('writing to the slot number field is readable via getCheckpoint', async () => {
      // First restore tips so checkpoint 0 is pending
      await cheatCodes.store(
        EthAddress.fromString(rollupAddress),
        RollupContract.chainTipsStorageSlot,
        RollupContract.packChainTips(0n, 0n),
      );

      const slotNumberStorageSlot = await rollup.getTempCheckpointLogStorageSlot(
        CheckpointNumber(0),
        TempCheckpointLogField.SlotNumber,
      );

      const testSlotNumber = 42n;
      await cheatCodes.store(EthAddress.fromString(rollupAddress), slotNumberStorageSlot, testSlotNumber);

      const checkpoint = await rollup.getCheckpoint(CheckpointNumber(0));
      expect(BigInt(checkpoint.slotNumber)).toBe(testSlotNumber);
    });
  });
});
