import { TestCircuitVerifier } from '@aztec/bb-prover';
import { EpochCache } from '@aztec/epoch-cache';
import { getPublicClient } from '@aztec/ethereum/client';
import { DefaultL1ContractsConfig } from '@aztec/ethereum/config';
import { type FeeHeader, RollupContract } from '@aztec/ethereum/contracts';
import { deployAztecL1Contracts } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import { type Anvil, EthCheatCodes, RollupCheatCodes, startAnvil } from '@aztec/ethereum/test';
import type { ViemPublicClient } from '@aztec/ethereum/types';
import { BlockNumber, CheckpointNumber, IndexWithinCheckpoint, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { maxBy } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { ManualDateProvider } from '@aztec/foundation/timer';
import type { P2P } from '@aztec/p2p';
import { FeeProviderImpl, GlobalVariableBuilder, type GlobalVariableBuilderConfig } from '@aztec/sequencer-client';
import {
  type BlockData,
  BlockHash,
  type L1SyncPoint,
  L2Block,
  type L2BlockSource,
  type L2Tips,
} from '@aztec/stdlib/block';
import { L1PublishedData, type ProposedCheckpointData } from '@aztec/stdlib/checkpoint';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { GasFees, ManaUsageEstimate } from '@aztec/stdlib/gas';
import type { L2LogsSource, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import { mockTx } from '@aztec/stdlib/testing';
import { AppendOnlyTreeSnapshot } from '@aztec/stdlib/trees';
import { BlockHeader, GlobalVariables, type Tx } from '@aztec/stdlib/tx';
import { getPackageVersion } from '@aztec/stdlib/update-checker';
import { NativeWorldStateService } from '@aztec/world-state';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';
import { foundry } from 'viem/chains';

import { type AztecNodeConfig, getConfigEnvVars } from './config.js';
import { NextBlockPredictor } from './next_block/index.js';
import { AztecNodeService } from './server.js';

/**
 * Reproduces the wallet-quote / public-simulation fee mismatch: both ask L1 for a mana min fee, but they can
 * ask about different slots, and the L1 gas oracle steps between them. The oracle is driven so that the fee
 * before slot `C` (`HIGH`) is far above the fee from slot `C` on (`LOW`), and the L1 pending checkpoint is
 * planted at slot `C - 1`, which anchors the wallet quote to slot `C`.
 */
describe('fee quote vs public simulation', () => {
  const HIGH_L1_BASE_FEE = 1_000_000_000_000n; // 1000 gwei
  const LOW_L1_BASE_FEE = 1_000_000_000n; // 1 gwei
  const PENDING_CHECKPOINT = CheckpointNumber(1);
  /** Slots to skip before each oracle update so the rollup's `LIFETIME - LAG` cooldown has elapsed. */
  const ORACLE_UPDATE_SLOT_GAP = 10;

  let anvil: Anvil;
  let rpcUrl: string;
  let publicClient: ViemPublicClient;
  let cheatCodes: EthCheatCodes;
  let rollupCheatCodes: RollupCheatCodes;
  let rollup: RollupContract;

  const ethereumSlotDuration = DefaultL1ContractsConfig.ethereumSlotDuration;
  let slotDuration: number;
  let l1GenesisTime: bigint;
  let rollupVersion: bigint;
  let globalVariableBuilderConfig: GlobalVariableBuilderConfig;

  let dateProvider: ManualDateProvider;
  let epochCache: EpochCache;
  let globalVariableBuilder: GlobalVariableBuilder;
  let worldState: NativeWorldStateService;

  let blockSource: MockProxy<L2BlockSource>;
  let worldStateSynchronizer: MockProxy<WorldStateSynchronizer>;
  let l1ToL2MessageSource: MockProxy<L1ToL2MessageSource>;
  let contractDataSource: MockProxy<ContractDataSource>;

  let feeProvider: FeeProviderImpl;
  let node: AztecNodeService;
  /** L1 block the mocked archiver claims to be synced to; the fee provider prices at exactly this block. */
  let l1SyncPoint: L1SyncPoint;

  /** First slot at which the stepped-down oracle value applies. */
  let changeSlot: SlotNumber;
  /** Mana min fee at `changeSlot - 1` (pre-step, high). */
  let highFee: bigint;
  /** Mana min fee at `changeSlot` and beyond (post-step, low). */
  let lowFee: bigint;

  const tsOf = (slot: SlotNumber): bigint => l1GenesisTime + BigInt(slot) * BigInt(slotDuration);
  const feeAt = (slot: SlotNumber): Promise<bigint> => rollup.getManaMinFeeAt(tsOf(slot), true);

  /** Mirrors `BaseWallet.getMinFees` + its default `minFeePadding` of 0.5: worst fee by `feePerL2Gas`, padded. */
  const walletCap = (fees: GasFees[]): GasFees => maxBy(fees, f => f.feePerL2Gas)!.mul(1.5);

  /** Stable per-block hash, so tips and the block-data mock agree on identity for hash lookups. */
  const blockHashOf = (blockNumber: BlockNumber): BlockHash => new BlockHash(new Fr(1000 + blockNumber));

  const makeTips = (args: {
    proposed: BlockNumber;
    checkpointedBlock: BlockNumber;
    checkpointNumber?: CheckpointNumber;
  }): L2Tips => {
    const checkpointId = { number: args.checkpointNumber ?? PENDING_CHECKPOINT, hash: '0xc1' };
    const checkpointedBlockId = {
      number: args.checkpointedBlock,
      hash: blockHashOf(args.checkpointedBlock).toString(),
    };
    return {
      proposed: { number: args.proposed, hash: blockHashOf(args.proposed).toString() },
      checkpointed: { block: checkpointedBlockId, checkpoint: checkpointId },
      proven: { block: checkpointedBlockId, checkpoint: checkpointId },
      finalized: { block: checkpointedBlockId, checkpoint: checkpointId },
    };
  };

  /**
   * Points the mocked archiver at anvil's head, as a sync pass does. The fee provider follows this value and
   * never polls L1 for a head of its own, so nothing moves its view until this is called again.
   */
  const syncArchiverToL1Head = async (): Promise<void> => {
    const block = await publicClient.getBlock({ blockTag: 'latest' });
    l1SyncPoint = { blockNumber: block.number, blockHash: Buffer32.fromString(block.hash) };
    blockSource.getL1SyncPoint.mockResolvedValue(l1SyncPoint);
  };

  /** Points the block source at one atomic L2 frontier snapshot, the single read the simulator makes. */
  const mockL2Frontier = (args: {
    proposed: BlockNumber;
    checkpointedBlock: BlockNumber;
    checkpointedTipSlot: SlotNumber;
    checkpointNumber?: CheckpointNumber;
    proposedCheckpoint?: ProposedCheckpointData;
    /** Globals of the proposed tip's header, as the archiver reads them in the same snapshot. */
    latestBlockGlobals?: { slotNumber: SlotNumber; gasFees: GasFees };
  }) =>
    blockSource.getL2Frontier.mockResolvedValue({
      tips: makeTips(args),
      proposedCheckpoint: args.proposedCheckpoint,
      l1SyncPoint,
      latestBlockHeader: args.latestBlockGlobals
        ? makeBlockData(args.proposed, args.latestBlockGlobals.slotNumber, args.latestBlockGlobals.gasFees).header
        : undefined,
      checkpointedCheckpoint: {
        header: CheckpointHeader.empty({ slotNumber: args.checkpointedTipSlot }),
        l1: new L1PublishedData(1n, 0n, `0x`),
      },
      pendingChainValidationStatus: { valid: true },
    });

  const makeBlockData = (blockNumber: BlockNumber, slotNumber: SlotNumber, gasFees: GasFees): BlockData => ({
    header: BlockHeader.empty({ globalVariables: GlobalVariables.empty({ blockNumber, slotNumber, gasFees }) }),
    archive: L2Block.empty().archive,
    blockHash: blockHashOf(blockNumber),
    checkpointNumber: PENDING_CHECKPOINT,
    indexWithinCheckpoint: IndexWithinCheckpoint(0),
  });

  const makeProposedCheckpointData = (args: {
    checkpointNumber: CheckpointNumber;
    startBlock: BlockNumber;
    slotNumber: SlotNumber;
  }): ProposedCheckpointData => ({
    checkpointNumber: args.checkpointNumber,
    header: CheckpointHeader.empty({ slotNumber: args.slotNumber }),
    startBlock: args.startBlock,
    blockCount: 1,
    totalManaUsed: 0n,
    feeAssetPriceModifier: 0n,
    archive: AppendOnlyTreeSnapshot.empty(),
    checkpointOutHash: Fr.ZERO,
  });

  const makeTx = (seed: number, maxFeesPerGas: GasFees): Promise<Tx> =>
    mockTx(seed, {
      numberOfNonRevertiblePublicCallRequests: 0,
      numberOfRevertiblePublicCallRequests: 0,
      maxFeesPerGas,
      chainId: new Fr(foundry.id),
      version: new Fr(rollupVersion),
    });

  /**
   * Builds a fee provider and a node against the current node clock. The provider caches its quote at
   * `start()`, so it must be built after the clock is positioned for the scenario under test.
   */
  const startNodeAt = async (nodeClockSlotStart: bigint) => {
    dateProvider.setTime(Number(nodeClockSlotStart) * 1000);

    feeProvider = new FeeProviderImpl(dateProvider, publicClient, globalVariableBuilderConfig, blockSource);
    // Long polling interval: every refresh in these scenarios is driven explicitly, as an archiver pass would.
    await feeProvider.start(60_000);

    const config: AztecNodeConfig = {
      ...getConfigEnvVars(),
      rollupAddress: EthAddress.fromString(rollup.address),
    };

    // Not started: every boundary fee is priced inline on the request that misses, so the scenarios below
    // control exactly when L1 is asked.
    const nextBlockPredictor = NextBlockPredictor.create({
      blockSource,
      globalVariableBuilder,
      rollupContract: rollup,
      epochCache,
      signatureContext: { chainId: foundry.id, rollupAddress: config.rollupAddress },
      dateProvider,
    });

    node = new AztecNodeService({
      config,
      p2pClient: mock<P2P>(),
      blockSource,
      logsSource: mock<L2LogsSource>(),
      contractDataSource,
      l1ToL2MessageSource,
      worldStateSynchronizer,
      sequencer: undefined,
      proverNode: undefined,
      slasherClient: undefined,
      validatorsSentinel: undefined,
      stopStartedWatchers: () => Promise.resolve(),
      l1ChainId: foundry.id,
      version: Number(rollupVersion),
      globalVariableBuilder,
      rollupContract: rollup,
      feeProvider,
      nextBlockPredictor,
      epochCache,
      packageVersion: getPackageVersion(),
      peerProofVerifier: new TestCircuitVerifier(),
      rpcProofVerifier: new TestCircuitVerifier(),
    });
  };

  beforeAll(async () => {
    const privateKeyRaw = '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba';

    ({ anvil, rpcUrl } = await startAnvil());

    publicClient = getPublicClient({ l1RpcUrls: [rpcUrl], l1ChainId: foundry.id });
    cheatCodes = new EthCheatCodes([rpcUrl], new ManualDateProvider());

    const deployed = await deployAztecL1Contracts(rpcUrl, privateKeyRaw, foundry.id, {
      ...DefaultL1ContractsConfig,
      vkTreeRoot: Fr.random(),
      protocolContractsHash: Fr.random(),
      genesisArchiveRoot: Fr.random(),
      realVerifier: false,
    });

    rollup = new RollupContract(publicClient, deployed.l1ContractAddresses.rollupAddress.toString());
    rollupCheatCodes = RollupCheatCodes.create([rpcUrl], deployed.l1ContractAddresses, new ManualDateProvider());

    [slotDuration, l1GenesisTime, rollupVersion] = await Promise.all([
      rollup.getSlotDuration(),
      rollup.getL1GenesisTime(),
      rollup.getVersion().then(BigInt),
    ]);

    // Step the L1 gas oracle down: the first update publishes the high value, the second one demotes it to
    // `pre` and publishes the low value as `post`, which activates a couple of slots later.
    await publishOracleBaseFee(HIGH_L1_BASE_FEE);
    await publishOracleBaseFee(LOW_L1_BASE_FEE);

    changeSlot = await findOracleChangeSlot();

    // Plant the L1 pending checkpoint at the slot right before the oracle steps, with a neutral fee header so
    // the fee difference between slots comes purely from the L1 base fee. Marking it proven keeps the pending
    // chain unprunable, so the fee reads never fall back to the genesis checkpoint.
    const genesisFeeHeader = (await rollup.getCheckpoint(CheckpointNumber(0))).feeHeader;
    const feeHeader: FeeHeader = {
      excessMana: 0n,
      manaUsed: 0n,
      ethPerFeeAsset: genesisFeeHeader.ethPerFeeAsset,
      congestionCost: 0n,
      proverCost: 0n,
    };
    await rollupCheatCodes.setPendingCheckpoint(PENDING_CHECKPOINT, SlotNumber(changeSlot - 1), feeHeader);
    await rollupCheatCodes.markAsProven(PENDING_CHECKPOINT);

    highFee = await feeAt(SlotNumber(changeSlot - 1));
    lowFee = await feeAt(changeSlot);

    // Precondition: a wallet quote priced at the post-step slot cannot cover a simulation priced at the
    // pre-step slot, even with the wallet's default 1.5x padding.
    expect(highFee).toBeGreaterThan((lowFee * 3n) / 2n);

    globalVariableBuilderConfig = {
      rollupAddress: EthAddress.fromString(rollup.address),
      ethereumSlotDuration,
      rollupVersion,
      l1GenesisTime,
      slotDuration,
    };

    dateProvider = new ManualDateProvider();
    globalVariableBuilder = new GlobalVariableBuilder(publicClient, globalVariableBuilderConfig);
    const [
      l1StartBlock,
      epochDuration,
      proofSubmissionEpochs,
      targetCommitteeSize,
      rollupManaLimit,
      lagInEpochsForValidatorSet,
      lagInEpochsForRandao,
    ] = await Promise.all([
      rollup.getL1StartBlock(),
      rollup.getEpochDuration(),
      rollup.getProofSubmissionEpochs(),
      rollup.getTargetCommitteeSize(),
      rollup.getManaLimit(),
      rollup.getLagInEpochsForValidatorSet(),
      rollup.getLagInEpochsForRandao(),
    ]);
    epochCache = new EpochCache(
      rollup,
      {
        l1StartBlock,
        l1GenesisTime,
        slotDuration,
        epochDuration: Number(epochDuration),
        ethereumSlotDuration,
        proofSubmissionEpochs: Number(proofSubmissionEpochs),
        targetCommitteeSize: Number(targetCommitteeSize),
        rollupManaLimit: Number(rollupManaLimit),
        lagInEpochsForValidatorSet: Number(lagInEpochsForValidatorSet),
        lagInEpochsForRandao: Number(lagInEpochsForRandao),
      },
      dateProvider,
    );

    worldState = await NativeWorldStateService.tmp();
  }, 180_000);

  afterAll(async () => {
    await worldState?.close();
    await anvil?.stop().catch(err => createLogger('cleanup').error(`Error stopping anvil`, err));
  });

  beforeEach(async () => {
    blockSource = mock<L2BlockSource>();
    worldStateSynchronizer = mock<WorldStateSynchronizer>();
    l1ToL2MessageSource = mock<L1ToL2MessageSource>();
    contractDataSource = mock<ContractDataSource>();

    blockSource.getPendingChainValidationStatus.mockResolvedValue({ valid: true });
    blockSource.getProposedCheckpointData.mockResolvedValue(undefined);
    l1ToL2MessageSource.getL1ToL2Messages.mockResolvedValue([]);
    worldStateSynchronizer.syncImmediate.mockResolvedValue(BlockNumber.ZERO);
    // The mocked archiver reports block numbers the fresh world state does not have, so every fork is taken
    // at its (empty) latest block.
    worldStateSynchronizer.fork.mockImplementation(() => worldState.fork());
    await syncArchiverToL1Head();
  });

  afterEach(async () => {
    await feeProvider?.stop();
  });

  /**
   * Publishes `baseFee` as the oracle's `post` value. The rollup silently ignores an update that lands too
   * soon after the previous one activates, so L1 time is advanced well past that window first.
   */
  async function publishOracleBaseFee(baseFee: bigint): Promise<void> {
    const currentSlot = await rollup.getSlotNumber();
    await rollupCheatCodes.advanceToSlot(SlotNumber(currentSlot + ORACLE_UPDATE_SLOT_GAP));
    await cheatCodes.setNextBlockBaseFeePerGas(baseFee);
    await cheatCodes.mine();
    await rollupCheatCodes.updateL1GasFeeOracle();
  }

  /** Binary-searches for the first slot at which the oracle serves its `post` value instead of `pre`. */
  async function findOracleChangeSlot(): Promise<SlotNumber> {
    const currentSlot = await rollup.getSlotNumber();
    const farFutureSlot = SlotNumber(currentSlot + 100);
    const pre = (await rollup.getL1FeesAt(tsOf(SlotNumber(0)))).baseFee;
    const post = (await rollup.getL1FeesAt(tsOf(farFutureSlot))).baseFee;
    // Both oracle updates must have landed, and the step must be downwards for the scenarios below.
    expect(pre).toBeGreaterThan(post);

    let low = 0;
    let high = farFutureSlot as number;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if ((await rollup.getL1FeesAt(tsOf(SlotNumber(mid)))).baseFee === post) {
        high = mid;
      } else {
        low = mid + 1;
      }
    }
    return SlotNumber(low);
  }

  it('prices a tx the same way whether the node clock lags L1 or not', async () => {
    // The node still believes the next buildable slot is the one the pending checkpoint already took.
    await startNodeAt(tsOf(SlotNumber(changeSlot - 2)));
    expect(epochCache.getEpochAndSlotInNextL1Slot().slot).toEqual(SlotNumber(changeSlot - 2));

    mockL2Frontier({
      proposed: BlockNumber(1),
      checkpointedBlock: BlockNumber(1),
      checkpointedTipSlot: SlotNumber(changeSlot - 1),
      latestBlockGlobals: { slotNumber: SlotNumber(changeSlot - 1), gasFees: GasFees.empty() },
    });

    const fees = await feeProvider.getPredictedMinFees(ManaUsageEstimate.Limit);
    expect(fees[0].feePerL2Gas).toEqual(lowFee);

    const output = await node.simulatePublicCalls(await makeTx(0x10000, walletCap(fees)));

    expect(output.globalVariables.slotNumber).toEqual(changeSlot);
    expect(output.globalVariables.gasFees.feePerL2Gas).toEqual(fees[0].feePerL2Gas);
  }, 120_000);

  it('quotes the frozen checkpoint fee the simulation charges mid-checkpoint', async () => {
    await startNodeAt(tsOf(changeSlot));

    // Checkpoint 2 is proposed and terminates at block 2, but block 3 already extends it, so the next block
    // continues the in-progress checkpoint and inherits the (pre-step, high) fee frozen into its header. No
    // forward-looking L1 projection can see that fee: it was priced at a slot L1 has already moved past.
    mockL2Frontier({
      proposed: BlockNumber(3),
      checkpointedBlock: BlockNumber(1),
      checkpointedTipSlot: SlotNumber(changeSlot - 1),
      proposedCheckpoint: makeProposedCheckpointData({
        checkpointNumber: CheckpointNumber(2),
        startBlock: BlockNumber(2),
        slotNumber: SlotNumber(changeSlot - 1),
      }),
      latestBlockGlobals: { slotNumber: SlotNumber(changeSlot - 1), gasFees: new GasFees(0, highFee) },
    });

    const fees = await node.getPredictedMinFees(ManaUsageEstimate.Limit);
    expect(fees[0].feePerL2Gas).toEqual(highFee);

    const output = await node.simulatePublicCalls(await makeTx(0x20000, walletCap(fees)));

    expect(output.globalVariables.slotNumber).toEqual(SlotNumber(changeSlot - 1));
    expect(output.globalVariables.gasFees.feePerL2Gas).toEqual(highFee);
    // What the wallet would actually quote covers what the simulation charges.
    expect(walletCap(fees).feePerL2Gas).toBeGreaterThanOrEqual(output.globalVariables.gasFees.feePerL2Gas);
  }, 120_000);

  it('quotes the same fee the simulation charges when nothing is lagging', async () => {
    await startNodeAt(tsOf(changeSlot));

    mockL2Frontier({
      proposed: BlockNumber(1),
      checkpointedBlock: BlockNumber(1),
      checkpointedTipSlot: SlotNumber(changeSlot - 1),
      latestBlockGlobals: { slotNumber: SlotNumber(changeSlot - 1), gasFees: GasFees.empty() },
    });

    const fees = await node.getPredictedMinFees(ManaUsageEstimate.Limit);
    expect(fees[0].feePerL2Gas).toEqual(lowFee);

    const output = await node.simulatePublicCalls(await makeTx(0x30000, walletCap(fees)));

    expect(output.globalVariables.slotNumber).toEqual(SlotNumber(changeSlot + 1));
    expect(output.globalVariables.gasFees.feePerL2Gas).toEqual(lowFee);
    expect(output.globalVariables.gasFees).toEqual(fees[0]);
  }, 120_000);

  it('reuses the cached boundary fee across simulations instead of asking L1 again', async () => {
    await startNodeAt(tsOf(changeSlot));
    mockL2Frontier({
      proposed: BlockNumber(1),
      checkpointedBlock: BlockNumber(1),
      checkpointedTipSlot: SlotNumber(changeSlot - 1),
      latestBlockGlobals: { slotNumber: SlotNumber(changeSlot - 1), gasFees: GasFees.empty() },
    });
    const fees = await feeProvider.getPredictedMinFees(ManaUsageEstimate.Limit);
    const buildGlobals = jest.spyOn(globalVariableBuilder, 'buildCheckpointGlobalVariables');

    const first = await node.simulatePublicCalls(await makeTx(0x50000, walletCap(fees)));
    expect(buildGlobals).toHaveBeenCalledTimes(1);

    // Nothing moved between the two requests, so the second one is priced from memory: an RPC caller
    // hammering the node cannot turn L2 simulation traffic into L1 traffic.
    const second = await node.simulatePublicCalls(await makeTx(0x60000, walletCap(fees)));
    expect(buildGlobals).toHaveBeenCalledTimes(1);
    expect(second.globalVariables.gasFees).toEqual(first.globalVariables.gasFees);
    expect(second.globalVariables.slotNumber).toEqual(first.globalVariables.slotNumber);

    buildGlobals.mockRestore();
  }, 120_000);

  it('keeps quote and simulation on the archiver L1 view as a checkpoint lands', async () => {
    await startNodeAt(tsOf(changeSlot));
    mockL2Frontier({
      proposed: BlockNumber(1),
      checkpointedBlock: BlockNumber(1),
      checkpointedTipSlot: SlotNumber(changeSlot - 1),
      latestBlockGlobals: { slotNumber: SlotNumber(changeSlot - 1), gasFees: GasFees.empty() },
    });

    const before = await node.getPredictedMinFees(ManaUsageEstimate.Limit);
    expect(before[0].feePerL2Gas).toEqual(lowFee);

    // A checkpoint lands on L1 at slot `changeSlot + 1`, quartering `ethPerFeeAsset` so the fee it freezes in
    // is far above the one the previous L1 view priced, and anvil mines on past it.
    const previousFeeHeader = (await rollup.getCheckpoint(PENDING_CHECKPOINT)).feeHeader;
    const landedCheckpoint = CheckpointNumber(PENDING_CHECKPOINT + 1);
    await rollupCheatCodes.setPendingCheckpoint(landedCheckpoint, SlotNumber(changeSlot + 1), {
      ...previousFeeHeader,
      ethPerFeeAsset: previousFeeHeader.ethPerFeeAsset / 4n,
    });
    await rollupCheatCodes.markAsProven(landedCheckpoint);
    await cheatCodes.mine();

    const landedFee = await feeAt(SlotNumber(changeSlot + 2));
    expect(landedFee).toBeGreaterThan((lowFee * 3n) / 2n);

    // L1's head has moved, but the archiver has not run a pass. The provider prices at the L1 block the
    // simulator still plans from, so a refresh here changes nothing.
    await feeProvider.refresh();
    const beforeArchiverPass = await node.getPredictedMinFees(ManaUsageEstimate.Limit);
    expect(beforeArchiverPass[0].feePerL2Gas).toEqual(lowFee);

    // The archiver's sync pass moves the anchor and the frontier together; the provider follows it.
    await syncArchiverToL1Head();
    mockL2Frontier({
      proposed: BlockNumber(2),
      checkpointedBlock: BlockNumber(2),
      checkpointedTipSlot: SlotNumber(changeSlot + 1),
      checkpointNumber: landedCheckpoint,
      latestBlockGlobals: { slotNumber: SlotNumber(changeSlot + 1), gasFees: GasFees.empty() },
    });
    await feeProvider.refresh();

    const after = await node.getPredictedMinFees(ManaUsageEstimate.Limit);
    expect(after[0].feePerL2Gas).toEqual(landedFee);

    const output = await node.simulatePublicCalls(await makeTx(0x40000, walletCap(after)));

    expect(output.globalVariables.slotNumber).toEqual(SlotNumber(changeSlot + 2));
    expect(output.globalVariables.gasFees.feePerL2Gas).toEqual(after[0].feePerL2Gas);
  }, 120_000);
});
