import { getPublicClient } from '@aztec/ethereum/client';
import { DefaultL1ContractsConfig } from '@aztec/ethereum/config';
import { RollupContract } from '@aztec/ethereum/contracts';
import { deployAztecL1Contracts } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import type { L1SyncSnapshot, L1SyncSnapshotProvider } from '@aztec/ethereum/l1-types';
import { type Anvil, EthCheatCodes, RollupCheatCodes, startAnvil } from '@aztec/ethereum/test';
import type { ViemClient } from '@aztec/ethereum/types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { DateProvider, ManualDateProvider } from '@aztec/foundation/timer';
import { ManaUsageEstimate } from '@aztec/stdlib/gas';

import { foundry } from 'viem/chains';

import { type FeeSnapshotServiceConfig, getDefaultFeeSnapshotServiceConfig } from './fee_snapshot.js';
import { FeeSnapshotService } from './fee_snapshot_service.js';
import { computeLegacyCurrentMinFees, computeLegacyPredictedMinFees } from './legacy_fee_oracle.js';

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
    constants = { l1GenesisTime, slotDuration, ethereumSlotDuration };
  }, 60_000);

  afterAll(async () => {
    await cheatCodes.setIntervalMining(0);
    await anvil?.stop().catch(err => createLogger('cleanup').error('Error stopping anvil', err));
  });

  function makeService(identity: L1SyncSnapshot, dateProvider: ManualDateProvider): FeeSnapshotService {
    const config: FeeSnapshotServiceConfig = {
      ...getDefaultFeeSnapshotServiceConfig({ slotDuration, l1GenesisTime, ethereumSlotDuration, epochDuration }),
      clockDriftAllowanceSeconds: 0,
      maxRefreshAgeMs: 0,
      maxL1HeadAgeSeconds: 0,
      futureHeadAllowanceSeconds: 0,
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

  it('matches the legacy oracle at a fresh deploy', async () => {
    await assertEquivalent(await currentBlockTimestamp());
  });

  it('matches the legacy oracle after advancing several slots', async () => {
    await rollupCheatCodes.advanceSlots(5);
    await cheatCodes.mine();
    await assertEquivalent(await currentBlockTimestamp());
  }, 30_000);

  it('matches the legacy oracle after an L1 gas fee oracle update', async () => {
    await rollupCheatCodes.advanceSlots(3);
    await cheatCodes.setNextBlockBaseFeePerGas(120_000_000_000n);
    await cheatCodes.mine();
    await rollupCheatCodes.updateL1GasFeeOracle();
    await cheatCodes.mine();
    await assertEquivalent(await currentBlockTimestamp());
  }, 30_000);

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
});
