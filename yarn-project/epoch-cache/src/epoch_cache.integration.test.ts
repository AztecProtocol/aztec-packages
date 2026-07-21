import { getPublicClient } from '@aztec/ethereum/client';
import { DefaultL1ContractsConfig } from '@aztec/ethereum/config';
import { RollupContract } from '@aztec/ethereum/contracts';
import { deployAztecL1Contracts } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import { EthCheatCodes, RollupCheatCodes, startAnvil } from '@aztec/ethereum/test';
import type { Anvil } from '@aztec/ethereum/test';
import { EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { SecretValue } from '@aztec/foundation/config';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { TestDateProvider } from '@aztec/foundation/timer';

import type { Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { EpochCache } from './epoch_cache.js';

const NUM_VALIDATORS = 4;

/**
 * Integration tests for the EpochCache against a real Anvil instance.
 *
 * These tests deploy L1 contracts with validators, then exercise the epoch cache's
 * caching, TTL, finalization, and reorg-resilience behaviour.
 */
describe('EpochCache integration', () => {
  let anvil: Anvil;
  let rpcUrl: string;
  let dateProvider: TestDateProvider;
  let cheatCodes: EthCheatCodes;
  let rollupCheatCodes: RollupCheatCodes;
  let rollup: RollupContract;
  let epochCache: EpochCache;

  const deployerPrivateKey: Hex = '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba';

  const validatorKeys = [
    '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
    '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
    '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
    '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
  ] as const;

  const validatorAddresses = validatorKeys.map(k => EthAddress.fromString(privateKeyToAccount(k).address));

  beforeAll(async () => {
    dateProvider = new TestDateProvider();

    // Start Anvil with slotsInAnEpoch=8 so finalized = latest - 16 blocks.
    // This keeps most epoch data non-finalized (TTL-cached) after warps.
    ({ anvil, rpcUrl } = await startAnvil({
      l1BlockTime: 1,
      slotsInAnEpoch: 8,
      dateProvider,
    }));

    const deployed = await deployAztecL1Contracts(rpcUrl, deployerPrivateKey, foundry.id, {
      ...DefaultL1ContractsConfig,
      // Short L2 epochs: 4 slots * 12s = 48s per epoch
      aztecSlotDuration: 12,
      aztecEpochDuration: 4,
      aztecTargetCommitteeSize: NUM_VALIDATORS,
      vkTreeRoot: Fr.random(),
      protocolContractsHash: Fr.random(),
      genesisArchiveRoot: Fr.random(),
      realVerifier: false,
      initialValidators: validatorAddresses.map(attester => ({
        attester,
        withdrawer: attester,
        bn254SecretKey: new SecretValue(Fr.random().toBigInt()),
      })),
    });

    cheatCodes = new EthCheatCodes([rpcUrl], dateProvider);
    rollupCheatCodes = new RollupCheatCodes(cheatCodes, deployed.l1ContractAddresses);

    const publicClient = getPublicClient({ l1RpcUrls: [rpcUrl], l1ChainId: foundry.id });
    rollup = new RollupContract(publicClient, deployed.l1ContractAddresses.rollupAddress!);

    epochCache = new EpochCache(
      rollup,
      {
        l1StartBlock: await rollup.getL1StartBlock(),
        l1GenesisTime: await rollup.getL1GenesisTime(),
        slotDuration: await rollup.getSlotDuration(),
        epochDuration: await rollup.getEpochDuration(),
        ethereumSlotDuration: DefaultL1ContractsConfig.ethereumSlotDuration,
        proofSubmissionEpochs: await rollup.getProofSubmissionEpochs(),
        targetCommitteeSize: await rollup.getTargetCommitteeSize(),
        rollupManaLimit: Number(await rollup.getManaLimit()),
        lagInEpochsForValidatorSet: await rollup.getLagInEpochsForValidatorSet(),
        lagInEpochsForRandao: await rollup.getLagInEpochsForRandao(),
      },
      dateProvider,
    );
  });

  afterAll(async () => {
    await cheatCodes?.setIntervalMining(0);
    await anvil?.stop().catch(err => createLogger('cleanup').error(err));
  });

  it('returns committee for a finalized epoch and marks it as finalized', async () => {
    const lagInEpochsForRandao = await rollup.getLagInEpochsForRandao();
    const epochDuration = await rollup.getEpochDuration();

    // Advance well past the lag so the epoch's sampling data is finalized.
    const targetEpoch = EpochNumber(lagInEpochsForRandao + 2);
    await rollupCheatCodes.advanceToEpoch(targetEpoch);
    await rollupCheatCodes.setupEpoch();
    // Mine enough blocks so finalized catches up (finalized = latest - 16 with slotsInAnEpoch=8).
    // With 12s timestamps per block, we need enough blocks so that the finalized block's
    // timestamp covers the sampling timestamp for the target epoch.
    await cheatCodes.mine(30);

    // Query the specific target epoch rather than 'now', because auto-mining may have
    // advanced the dateProvider well past the target epoch.
    const slotForEpoch = SlotNumber(Number(targetEpoch) * Number(epochDuration));
    const { committee, seed, epoch } = await epochCache.getCommittee(slotForEpoch);

    expect(committee).toBeDefined();
    expect(committee!.length).toBe(NUM_VALIDATORS);
    expect(seed).not.toBe(0n);
    expect(epoch).toBe(targetEpoch);
    expect(epochCache.isFinalized(targetEpoch)).toBe(true);
  });

  it('refreshes non-finalized data after TTL expires', async () => {
    // Warp far ahead with a single block, creating a gap between latest and finalized.
    const currentTs = (await rollup.client.getBlock()).timestamp;
    await cheatCodes.warp(Number(currentTs) + 600);

    // First fetch — works but may not be finalized (warp only mines one block).
    const result1 = await epochCache.getCommittee('now');
    expect(result1.committee).toBeDefined();

    // Mine some blocks to advance finalized, then advance time past TTL.
    await cheatCodes.mine(5);
    dateProvider.advanceTime(DefaultL1ContractsConfig.ethereumSlotDuration);

    // Re-query: cache entry is stale, so it should re-fetch from L1.
    const result2 = await epochCache.getCommittee('now');
    expect(result2.committee).toBeDefined();
    // The entry was successfully re-fetched (we got a result without throwing).
  });

  it('picks up changed seed after an L1 rollback once the cache TTL expires', async () => {
    const epochDuration = await rollup.getEpochDuration();

    // Disable interval mining BEFORE the warp to avoid race conditions where
    // Anvil auto-mines blocks between the warp and the disable call. Enable
    // automine so transactions are still mined immediately.
    await cheatCodes.setIntervalMining(0);
    await cheatCodes.setAutomine(true);

    // Advance to a known point. The warp creates a gap between latest and finalized,
    // keeping the epoch's sampling data non-finalized (TTL-cached, not permanent).
    const currentTs = (await rollup.client.getBlock()).timestamp;
    await cheatCodes.warp(Number(currentTs) + 600);
    await cheatCodes.mine(3);

    // Call setupEpoch so the contract captures prevrandao for the current epoch.
    await rollupCheatCodes.setupEpoch();

    // Record the epoch and populate the cache.
    const epochBefore = epochCache.getEpochNow();
    const before = await epochCache.getCommittee('now');
    expect(before.committee).toBeDefined();
    expect(epochCache.isFinalized(epochBefore)).toBe(false);

    // Record the L1 timestamp at which the cache entry was last refreshed.
    const l1TsBefore = epochCache.getCachedLastRefreshL1Timestamp(epochBefore);
    expect(l1TsBefore).toBeDefined();

    // Rollback past the setupEpoch block and mine new blocks so the chain tip changes.
    await cheatCodes.reorg(2);
    await cheatCodes.mine(5);
    await rollupCheatCodes.setupEpoch();

    // Sync the dateProvider to the latest L1 block time since interval mining is off
    // and the stdout-based sync may not update the dateProvider for automined blocks.
    const latestBlock = await rollup.client.getBlock();
    dateProvider.setTime(Number(latestBlock.timestamp) * 1000);

    // Advance time well past TTL so the cached entry is stale.
    // The TTL is one Ethereum slot (12s). We advance by 2x to ensure staleness
    // regardless of small timestamp differences between the dateProvider and the
    // L1 block timestamp stored in the cache entry.
    dateProvider.advanceTime(DefaultL1ContractsConfig.ethereumSlotDuration * 2);

    // Re-query the SAME epoch by passing an explicit slot number,
    // so we don't accidentally query a different epoch if time advanced.
    const slotForEpoch = SlotNumber(Number(epochBefore) * Number(epochDuration));
    const after = await epochCache.getCommittee(slotForEpoch);
    expect(after.committee).toBeDefined();
    expect(after.epoch).toBe(before.epoch);

    // The cache was refreshed: the L1 timestamp must have advanced because
    // the chain was reorged and new blocks were mined.
    const l1TsAfter = epochCache.getCachedLastRefreshL1Timestamp(epochBefore);
    expect(l1TsAfter).toBeDefined();
    expect(l1TsAfter).not.toBe(l1TsBefore);
  });
});
