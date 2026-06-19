import { L1RpcError, getPublicClient } from '@aztec/ethereum/client';
import { CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import { RollupAbi } from '@aztec/l1-artifacts/RollupAbi';

import { jest } from '@jest/globals';
import { type Abi, RpcRequestError, encodeAbiParameters, encodeErrorResult, hexToBigInt, keccak256 } from 'viem';
import { foundry } from 'viem/chains';

import { DefaultL1ContractsConfig } from '../config.js';
import { deployAztecL1Contracts } from '../deploy_aztec_l1_contracts.js';
import { EthCheatCodes } from '../test/eth_cheat_codes.js';
import type { Anvil } from '../test/start_anvil.js';
import { startAnvil } from '../test/start_anvil.js';
import type { ViemClient } from '../types.js';
import { type FeeHeader, RollupContract, TempCheckpointLogField } from './rollup.js';

describe('compressFeeHeader', () => {
  /** Creates a zero fee header with the given overrides. */
  function makeFeeHeader(overrides: Partial<FeeHeader> = {}): FeeHeader {
    return { manaUsed: 0n, excessMana: 0n, ethPerFeeAsset: 0n, congestionCost: 0n, proverCost: 0n, ...overrides };
  }

  it('sets the preheat flag (bit 255)', () => {
    const header = makeFeeHeader();
    const result = RollupContract.compressFeeHeader(header);
    expect(result >> 255n).toBe(1n);
  });

  it('packs manaUsed into bits [0:31]', () => {
    const header = makeFeeHeader({ manaUsed: 0xdeadbeefn });
    const result = RollupContract.compressFeeHeader(header);
    expect(result & ((1n << 32n) - 1n)).toBe(0xdeadbeefn);
  });

  it('truncates manaUsed to 32 bits', () => {
    const header = makeFeeHeader({ manaUsed: (1n << 32n) + 5n });
    const result = RollupContract.compressFeeHeader(header);
    expect(result & ((1n << 32n) - 1n)).toBe(5n);
  });

  it('packs excessMana into bits [32:79]', () => {
    const header = makeFeeHeader({ excessMana: 123456n });
    const result = RollupContract.compressFeeHeader(header);
    expect((result >> 32n) & ((1n << 48n) - 1n)).toBe(123456n);
  });

  it('clamps excessMana to 48 bits', () => {
    const maxValue = (1n << 48n) - 1n;
    const header = makeFeeHeader({ excessMana: maxValue + 100n });
    const result = RollupContract.compressFeeHeader(header);
    expect((result >> 32n) & maxValue).toBe(maxValue);
  });

  it('packs ethPerFeeAsset into bits [80:127]', () => {
    const header = makeFeeHeader({ ethPerFeeAsset: 999n });
    const result = RollupContract.compressFeeHeader(header);
    expect((result >> 80n) & ((1n << 48n) - 1n)).toBe(999n);
  });

  it('packs congestionCost into bits [128:191]', () => {
    const header = makeFeeHeader({ congestionCost: 42n });
    const result = RollupContract.compressFeeHeader(header);
    expect((result >> 128n) & ((1n << 64n) - 1n)).toBe(42n);
  });

  it('clamps congestionCost to 64 bits', () => {
    const maxValue = (1n << 64n) - 1n;
    const header = makeFeeHeader({ congestionCost: maxValue + 1n });
    const result = RollupContract.compressFeeHeader(header);
    expect((result >> 128n) & maxValue).toBe(maxValue);
  });

  it('packs proverCost into bits [192:254]', () => {
    const header = makeFeeHeader({ proverCost: 77n });
    const result = RollupContract.compressFeeHeader(header);
    expect((result >> 192n) & ((1n << 63n) - 1n)).toBe(77n);
  });

  it('clamps proverCost to 63 bits', () => {
    const maxValue = (1n << 63n) - 1n;
    const header = makeFeeHeader({ proverCost: maxValue + 1n });
    const result = RollupContract.compressFeeHeader(header);
    expect((result >> 192n) & maxValue).toBe(maxValue);
  });

  it('packs all fields together correctly', () => {
    const header = makeFeeHeader({
      manaUsed: 1000n,
      excessMana: 2000n,
      ethPerFeeAsset: 3000n,
      congestionCost: 4000n,
      proverCost: 5000n,
    });
    const result = RollupContract.compressFeeHeader(header);

    expect(result & ((1n << 32n) - 1n)).toBe(1000n);
    expect((result >> 32n) & ((1n << 48n) - 1n)).toBe(2000n);
    expect((result >> 80n) & ((1n << 48n) - 1n)).toBe(3000n);
    expect((result >> 128n) & ((1n << 64n) - 1n)).toBe(4000n);
    expect((result >> 192n) & ((1n << 63n) - 1n)).toBe(5000n);
    expect(result >> 255n).toBe(1n);
  });

  it('handles all-zero fee header', () => {
    const header = makeFeeHeader();
    const result = RollupContract.compressFeeHeader(header);
    // Only the preheat flag should be set
    expect(result).toBe(1n << 255n);
  });
});

// These tests verify parity with Solidity FeeLib.sol (computeNewEthPerFeeAsset, clampedAdd).
// If FeeLib.sol changes, these tests must be updated to match.
describe('computeChildFeeHeader', () => {
  const manaTarget = 10_000n;
  const baseFeeHeader: FeeHeader = {
    manaUsed: 5000n,
    excessMana: 3000n,
    ethPerFeeAsset: 1000n,
    congestionCost: 100n,
    proverCost: 200n,
  };

  it('computes excessMana as clamped subtraction of (parent excess + parent used - target)', () => {
    // parent.excessMana (3000) + parent.manaUsed (5000) = 8000 < manaTarget (10000) => 0
    const result = RollupContract.computeChildFeeHeader(baseFeeHeader, 0n, 0n, manaTarget);
    expect(result.excessMana).toBe(0n);
  });

  it('computes positive excessMana when sum exceeds target', () => {
    const parent: FeeHeader = { ...baseFeeHeader, excessMana: 8000n, manaUsed: 5000n };
    // 8000 + 5000 = 13000 > 10000 => 3000
    const result = RollupContract.computeChildFeeHeader(parent, 0n, 0n, manaTarget);
    expect(result.excessMana).toBe(3000n);
  });

  it('sets child manaUsed to the provided childManaUsed', () => {
    const result = RollupContract.computeChildFeeHeader(baseFeeHeader, 7777n, 0n, manaTarget);
    expect(result.manaUsed).toBe(7777n);
  });

  it('always sets congestionCost and proverCost to zero', () => {
    const result = RollupContract.computeChildFeeHeader(baseFeeHeader, 0n, 0n, manaTarget);
    expect(result.congestionCost).toBe(0n);
    expect(result.proverCost).toBe(0n);
  });

  it('applies positive fee asset price modifier', () => {
    // modifier = 500 bps = 5% increase. parentPrice = 1000 => 1000 * 10500 / 10000 = 1050
    const result = RollupContract.computeChildFeeHeader(baseFeeHeader, 0n, 500n, manaTarget);
    expect(result.ethPerFeeAsset).toBe(1050n);
  });

  it('applies negative fee asset price modifier', () => {
    // modifier = -500 bps = 5% decrease. parentPrice = 1000 => 1000 * 9500 / 10000 = 950
    const result = RollupContract.computeChildFeeHeader(baseFeeHeader, 0n, -500n, manaTarget);
    expect(result.ethPerFeeAsset).toBe(950n);
  });

  it('clamps ethPerFeeAsset to MIN_ETH_PER_FEE_ASSET', () => {
    const parent: FeeHeader = { ...baseFeeHeader, ethPerFeeAsset: 100n }; // already at min
    // modifier = -9999 bps = -99.99% decrease => 100 * 1 / 10000 = 0 => clamped to 100
    const result = RollupContract.computeChildFeeHeader(parent, 0n, -9999n, manaTarget);
    expect(result.ethPerFeeAsset).toBe(100n);
  });

  it('clamps ethPerFeeAsset to MAX_ETH_PER_FEE_ASSET', () => {
    const maxPrice = 100_000_000_000_000n;
    const parent: FeeHeader = { ...baseFeeHeader, ethPerFeeAsset: maxPrice };
    // modifier = 1000 bps = 10% increase => would exceed max
    const result = RollupContract.computeChildFeeHeader(parent, 0n, 1000n, manaTarget);
    expect(result.ethPerFeeAsset).toBe(maxPrice);
  });

  it('floors parent ethPerFeeAsset to MIN before applying modifier', () => {
    const parent: FeeHeader = { ...baseFeeHeader, ethPerFeeAsset: 50n }; // below min
    // Should use 100 (min) as base. modifier = 0 => stays 100
    const result = RollupContract.computeChildFeeHeader(parent, 0n, 0n, manaTarget);
    expect(result.ethPerFeeAsset).toBe(100n);
  });

  it('handles zero modifier', () => {
    // parentPrice = 1000 => 1000 * 10000 / 10000 = 1000
    const result = RollupContract.computeChildFeeHeader(baseFeeHeader, 0n, 0n, manaTarget);
    expect(result.ethPerFeeAsset).toBe(1000n);
  });

  it('handles zero mana target', () => {
    // parent.excessMana (3000) + parent.manaUsed (5000) = 8000 > 0 => excess = 8000
    const result = RollupContract.computeChildFeeHeader(baseFeeHeader, 0n, 0n, 0n);
    expect(result.excessMana).toBe(8000n);
  });

  it('handles exact target match', () => {
    const parent: FeeHeader = { ...baseFeeHeader, excessMana: 5000n, manaUsed: 5000n };
    // 5000 + 5000 = 10000 = manaTarget => excess = 0
    const result = RollupContract.computeChildFeeHeader(parent, 0n, 0n, manaTarget);
    expect(result.excessMana).toBe(0n);
  });

  it('truncates ethPerFeeAsset via integer division (matches Solidity)', () => {
    // Solidity: 1001 * 10001 / 10000 = 10011001 / 10000 = 1001 (integer division)
    const parent: FeeHeader = { ...baseFeeHeader, ethPerFeeAsset: 1001n };
    const result = RollupContract.computeChildFeeHeader(parent, 0n, 1n, manaTarget);
    expect(result.ethPerFeeAsset).toBe(1001n);
  });

  it('matches Solidity for combined excess + price computation', () => {
    // Full round-trip: parent excess=15000, used=8000, target=10000 => excess = 13000
    // ethPerFeeAsset: 5000 * (10000 + 250) / 10000 = 5000 * 10250 / 10000 = 5125
    const parent: FeeHeader = {
      manaUsed: 8000n,
      excessMana: 15000n,
      ethPerFeeAsset: 5000n,
      congestionCost: 999n,
      proverCost: 888n,
    };
    const result = RollupContract.computeChildFeeHeader(parent, 42n, 250n, manaTarget);
    expect(result.excessMana).toBe(13000n);
    expect(result.manaUsed).toBe(42n);
    expect(result.ethPerFeeAsset).toBe(5125n);
    expect(result.congestionCost).toBe(0n);
    expect(result.proverCost).toBe(0n);
  });
});

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

  describe('makeChainTipsOverride', () => {
    const testProvenCheckpointNumber = CheckpointNumber(42);
    const testPendingCheckpointNumber = CheckpointNumber(100);

    async function setLiveTips(pending: CheckpointNumber, proven: CheckpointNumber) {
      const storageSlot = RollupContract.stfStorageSlot;
      const packedValue = (BigInt(pending) << 128n) | BigInt(proven);
      await cheatCodes.store(EthAddress.fromString(rollupAddress), BigInt(storageSlot), packedValue);
    }

    async function readOverridden(stateOverride: Awaited<ReturnType<RollupContract['makeChainTipsOverride']>>) {
      const [pendingResult, provenResult] = await Promise.all([
        publicClient.simulateContract({
          address: rollupAddress,
          abi: RollupAbi as Abi,
          functionName: 'getPendingCheckpointNumber',
          stateOverride,
        }),
        publicClient.simulateContract({
          address: rollupAddress,
          abi: RollupAbi as Abi,
          functionName: 'getProvenCheckpointNumber',
          stateOverride,
        }),
      ]);
      return {
        pending: CheckpointNumber.fromBigInt(pendingResult.result),
        proven: CheckpointNumber.fromBigInt(provenResult.result),
      };
    }

    it('emits a single combined state-diff when both pending and proven are set', async () => {
      await setLiveTips(testPendingCheckpointNumber, testProvenCheckpointNumber);

      const newPending = CheckpointNumber(150);
      const newProven = CheckpointNumber(75);
      const stateOverride = await rollup.makeChainTipsOverride({ pending: newPending, proven: newProven });

      expect(stateOverride).toHaveLength(1);
      expect(stateOverride[0].stateDiff).toHaveLength(1);
      expect(stateOverride[0].stateDiff![0].slot).toBe(RollupContract.stfStorageSlot);
      const expectedValue = (BigInt(newPending) << 128n) | BigInt(newProven);
      expect(stateOverride[0].stateDiff![0].value).toBe(`0x${expectedValue.toString(16).padStart(64, '0')}`);

      const observed = await readOverridden(stateOverride);
      expect(observed.pending).toBe(newPending);
      expect(observed.proven).toBe(newProven);
    });

    it('preserves the live proven half when only pending is overridden', async () => {
      await setLiveTips(testPendingCheckpointNumber, testProvenCheckpointNumber);

      const newPending = CheckpointNumber(150);
      const stateOverride = await rollup.makeChainTipsOverride({ pending: newPending });

      const observed = await readOverridden(stateOverride);
      expect(observed.pending).toBe(newPending);
      expect(observed.proven).toBe(testProvenCheckpointNumber);
    });

    it('preserves the live pending half when only proven is overridden', async () => {
      await setLiveTips(testPendingCheckpointNumber, testProvenCheckpointNumber);

      const newProven = CheckpointNumber(75);
      const stateOverride = await rollup.makeChainTipsOverride({ proven: newProven });

      const observed = await readOverridden(stateOverride);
      expect(observed.pending).toBe(testPendingCheckpointNumber);
      expect(observed.proven).toBe(newProven);
    });

    it('returns an empty override when neither pending nor proven is set', async () => {
      const stateOverride = await rollup.makeChainTipsOverride({});
      expect(stateOverride).toEqual([]);
    });

    it('throws when the resulting proven > pending', async () => {
      await setLiveTips(testPendingCheckpointNumber, testProvenCheckpointNumber);

      await expect(
        rollup.makeChainTipsOverride({ pending: CheckpointNumber(50), proven: CheckpointNumber(100) }),
      ).rejects.toThrow(/proven .* > pending/);
    });

    it('throws when only proven is set and the resulting proven > live pending', async () => {
      await setLiveTips(CheckpointNumber(10), CheckpointNumber(5));

      await expect(rollup.makeChainTipsOverride({ proven: CheckpointNumber(20) })).rejects.toThrow(
        /proven .* > pending/,
      );
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

  describe('committee helpers', () => {
    it('handles wrapped insufficient validator set errors', async () => {
      const data = encodeErrorResult({
        abi: RollupAbi,
        errorName: 'ValidatorSelection__InsufficientValidatorSetSize',
        args: [0n, 1n],
      });
      using _simulateContractSpy = jest.spyOn(publicClient, 'simulateContract').mockRejectedValueOnce(
        new L1RpcError('L1 RPC request failed', {
          cause: new RpcRequestError({
            body: { method: 'eth_call', params: [] },
            error: { code: 3, data, message: 'execution reverted' },
            url: 'https://example.com/rpc',
          }),
        }),
      );

      await expect(rollup.getCurrentEpochCommittee()).resolves.toBeUndefined();
    });
  });

  describe('makeArchiveOverride', () => {
    it('creates state override that correctly sets archive for a checkpoint number', async () => {
      const checkpointNumber = CheckpointNumber(5);
      const expectedArchive = Fr.random();

      // Create the override
      const stateOverride = rollup.makeArchiveOverride(checkpointNumber, expectedArchive);

      // Test the override using simulateContract to read archiveAt(checkpointNumber)
      const { result: overriddenArchive } = await publicClient.simulateContract({
        address: rollupAddress,
        abi: RollupAbi as Abi,
        functionName: 'archiveAt',
        args: [BigInt(checkpointNumber)],
        stateOverride,
      });

      expect(Fr.fromString(overriddenArchive as string).equals(expectedArchive)).toBe(true);
    });
  });

  describe('makeTempCheckpointLogOverride', () => {
    const fields = {
      headerHash: Fr.random(),
      outHash: Fr.random(),
      payloadDigest: Buffer32.random(),
      slotNumber: SlotNumber(42),
      feeHeader: {
        manaUsed: 12345n,
        excessMana: 67890n,
        ethPerFeeAsset: 1_000_000_000_000n,
        congestionCost: 99999n,
        proverCost: 55555n,
      } as FeeHeader,
    };

    function getDiffMap(
      checkpointNumber: CheckpointNumber,
      override: Awaited<ReturnType<RollupContract['makeTempCheckpointLogOverride']>>,
    ) {
      const map = new Map<string, string>();
      for (const entry of override) {
        for (const diff of entry.stateDiff ?? []) {
          map.set(diff.slot.toLowerCase(), diff.value.toLowerCase());
        }
      }
      const slotFor = async (field: TempCheckpointLogField) =>
        `0x${(await rollup.getTempCheckpointLogStorageSlot(checkpointNumber, field)).toString(16).padStart(64, '0')}`.toLowerCase();
      return { map, slotFor };
    }

    it('emits one diff entry per required field at the expected storage slot', async () => {
      const checkpointNumber = CheckpointNumber(7);
      const override = await rollup.makeTempCheckpointLogOverride(checkpointNumber, fields);
      const { map, slotFor } = getDiffMap(checkpointNumber, override);

      expect(override).toHaveLength(1);
      expect(override[0].stateDiff).toHaveLength(5);
      expect(map.get(await slotFor(TempCheckpointLogField.HeaderHash))).toBe(
        fields.headerHash.toString().toLowerCase(),
      );
      expect(map.get(await slotFor(TempCheckpointLogField.OutHash))).toBe(fields.outHash.toString().toLowerCase());
      expect(map.get(await slotFor(TempCheckpointLogField.PayloadDigest))).toBe(
        fields.payloadDigest.toString().toLowerCase(),
      );
      expect(map.get(await slotFor(TempCheckpointLogField.SlotNumber))).toBe(
        `0x${BigInt(fields.slotNumber).toString(16).padStart(64, '0')}`.toLowerCase(),
      );
      expect(map.get(await slotFor(TempCheckpointLogField.FeeHeader))).toBe(
        `0x${RollupContract.compressFeeHeader(fields.feeHeader).toString(16).padStart(64, '0')}`.toLowerCase(),
      );
    });

    it('throws when slotNumber overflows uint32 (matches L1 SafeCast.toUint32 semantics)', async () => {
      const checkpointNumber = CheckpointNumber(3);
      const slotNumber = SlotNumber(0xdeadbeef + 0x1_0000_0000);
      await expect(rollup.makeTempCheckpointLogOverride(checkpointNumber, { ...fields, slotNumber })).rejects.toThrow(
        /does not fit in uint32/,
      );
    });

    it('partial override emits only the supplied fields', async () => {
      const checkpointNumber = CheckpointNumber(13);
      const override = await rollup.makeTempCheckpointLogOverride(checkpointNumber, {
        slotNumber: SlotNumber(7),
      });
      const { map, slotFor } = getDiffMap(checkpointNumber, override);
      expect(override[0].stateDiff).toHaveLength(1);
      expect(map.get(await slotFor(TempCheckpointLogField.SlotNumber))).toBe(
        `0x${7n.toString(16).padStart(64, '0')}`.toLowerCase(),
      );
    });

    it('partial override returns an empty array when no fields are supplied', async () => {
      const override = await rollup.makeTempCheckpointLogOverride(CheckpointNumber(13), {});
      expect(override).toEqual([]);
    });

    it('round-trips slot, header hash, and fee header through getCheckpoint', async () => {
      // Reset tips so checkpoint 0 is in range, then build an override and read it back through the contract.
      await cheatCodes.store(
        EthAddress.fromString(rollupAddress),
        RollupContract.chainTipsStorageSlot,
        RollupContract.packChainTips(0n, 0n),
      );

      const checkpointNumber = CheckpointNumber(0);
      const override = await rollup.makeTempCheckpointLogOverride(checkpointNumber, fields);

      const { result } = await publicClient.simulateContract({
        address: rollupAddress,
        abi: RollupAbi as Abi,
        functionName: 'getCheckpoint',
        args: [BigInt(checkpointNumber)],
        stateOverride: override,
      });
      const checkpoint = result as { headerHash: `0x${string}`; outHash: `0x${string}`; slotNumber: bigint };
      expect(checkpoint.headerHash.toLowerCase()).toBe(fields.headerHash.toString().toLowerCase());
      expect(checkpoint.outHash.toLowerCase()).toBe(fields.outHash.toString().toLowerCase());
      expect(checkpoint.slotNumber).toBe(BigInt(fields.slotNumber));
    });
  });

  describe('getSlashingProposer', () => {
    it('returns a slashing proposer', async () => {
      const slashingProposer = await rollup.getSlashingProposer();
      expect(slashingProposer).toBeDefined();
    });
  });

  describe('getOwnershipTransferredEventsAtDeploy', () => {
    it('finds OwnershipTransferred event emitted at deploy block', async () => {
      const logs = await rollup.getOwnershipTransferredEventsAtDeploy();
      expect(logs.length).toBeGreaterThan(0);

      const l1StartBlock = await rollup.getL1StartBlock();
      for (const log of logs) {
        expect(log.blockNumber).toBe(l1StartBlock);
      }
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

  describe('getCheckpoint with out-of-range archive', () => {
    /** Computes the storage slot for `archives[checkpointNumber]` (mapping base is stfStorageSlot + 1). */
    function archiveStorageSlot(checkpointNumber: bigint): bigint {
      const archivesMappingBase = hexToBigInt(RollupContract.stfStorageSlot) + 1n;
      return hexToBigInt(
        keccak256(
          encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }], [checkpointNumber, archivesMappingBase]),
        ),
      );
    }

    it('does not throw when the stored archive root is outside the BN254 field', async () => {
      // A malicious proposer can land a checkpoint whose archive root is >= the BN254 modulus. An honest node
      // reading it on a sync/startup path (e.g. the tx-pool fee provider booting against the pending tip) must
      // not brick. The archive is therefore carried as raw bytes; converting to Fr would throw here.
      await cheatCodes.store(
        EthAddress.fromString(rollupAddress),
        RollupContract.chainTipsStorageSlot,
        RollupContract.packChainTips(0n, 0n),
      );

      // 2^256 - 1: maximal bytes32, far above the BN254 modulus, so Fr.fromString would reject it.
      const outOfRange = (1n << 256n) - 1n;
      await cheatCodes.store(EthAddress.fromString(rollupAddress), archiveStorageSlot(0n), outOfRange);

      const checkpoint = await rollup.getCheckpoint(CheckpointNumber(0));
      expect(checkpoint.archive).toEqual(Buffer32.fromBigInt(outOfRange));
    });
  });
});
