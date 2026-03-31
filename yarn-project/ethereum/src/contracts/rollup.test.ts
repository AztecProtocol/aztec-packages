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
import type { FeeHeader } from './rollup.js';
import { RollupContract } from './rollup.js';

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
});
