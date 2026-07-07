import type { BlobClientInterface } from '@aztec/blob-client/client';
import { getBlobsPerL1Block, getPrefixedEthBlobCommitments } from '@aztec/blob-lib';
import type { EpochCache } from '@aztec/epoch-cache';
import type { L1ContractsConfig } from '@aztec/ethereum/config';
import {
  type GovernanceProposerContract,
  Multicall3,
  MulticallForwarderRevertedError,
  type RollupContract,
  type SlashingProposerContract,
  type ViemCommitteeAttestations,
} from '@aztec/ethereum/contracts';
import {
  type L1TxUtils,
  type L1TxUtilsConfig,
  MAX_L1_TX_LIMIT,
  defaultL1TxUtilsConfig,
} from '@aztec/ethereum/l1-tx-utils';
import { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { TimeoutError } from '@aztec/foundation/error';
import { EthAddress } from '@aztec/foundation/eth-address';
import { sleep } from '@aztec/foundation/sleep';
import { bufferToHex } from '@aztec/foundation/string';
import { TestDateProvider } from '@aztec/foundation/timer';
import { EmpireBaseAbi, RollupAbi } from '@aztec/l1-artifacts';
import {
  CommitteeAttestationsAndSigners,
  L2Block,
  Signature,
  type ValidateCheckpointResult,
} from '@aztec/stdlib/block';
import { Checkpoint } from '@aztec/stdlib/checkpoint';
import { EmptyL1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { CheckpointHeader } from '@aztec/stdlib/rollup';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';
import {
  type GetCodeReturnType,
  type GetTransactionReceiptReturnType,
  type Hex,
  type PrivateKeyAccount,
  type TransactionReceipt,
  encodeFunctionData,
  encodeFunctionResult,
  multicall3Abi,
  toHex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import type { PublisherConfig, SequencerPublisherConfig, TxSenderConfig } from './config.js';
import type { SequencerPublisherMetrics } from './sequencer-publisher-metrics.js';
import { type Action, SequencerPublisher, compareActions } from './sequencer-publisher.js';

// Ensures proposal actions are sorted before slashing votes/signals

describe('compareActions sorting', () => {
  it('places propose before vote-offenses', () => {
    const actions: Action[] = ['propose', 'vote-offenses'];
    const sorted = [...actions].sort(compareActions);

    expect(sorted.indexOf('propose')).toBeLessThan(sorted.indexOf('vote-offenses'));
  });

  it('places prune before propose', () => {
    const actions: Action[] = ['propose', 'prune'];
    const sorted = [...actions].sort(compareActions);

    expect(sorted.indexOf('prune')).toBeLessThan(sorted.indexOf('propose'));
  });
});

const mockRollupAddress = EthAddress.random().toString();
const mockGovernanceProposerAddress = EthAddress.random().toString();
const mockForwarderAddress = EthAddress.random().toString();
const testSignatureContext = {
  chainId: 1,
  rollupAddress: EthAddress.fromString(mockRollupAddress),
};

describe('SequencerPublisher', () => {
  let rollup: MockProxy<RollupContract>;
  let slashingProposerContract: MockProxy<SlashingProposerContract>;
  let governanceProposerContract: MockProxy<GovernanceProposerContract>;
  let epochCache: MockProxy<EpochCache>;
  let l1TxUtils: MockProxy<L1TxUtils>;
  let l1Metrics: MockProxy<SequencerPublisherMetrics>;
  let forwardSpy: jest.SpiedFunction<typeof Multicall3.forward>;
  let dateProvider: TestDateProvider;

  let proposeTxHash: `0x${string}`;
  let proposeTxReceipt: GetTransactionReceiptReturnType;
  let l2Block: L2Block;

  let header: CheckpointHeader;
  let archive: Buffer;

  let blobClient: MockProxy<BlobClientInterface>;

  // An l1 publisher with some private methods exposed
  let publisher: SequencerPublisher;

  let testHarnessAttesterAccount: PrivateKeyAccount;

  const GAS_GUESS = 300_000n;

  beforeEach(async () => {
    jest.clearAllMocks();

    blobClient = mock<BlobClientInterface>();
    blobClient.sendBlobsToFilestore.mockResolvedValue(true);

    l2Block = await L2Block.random(BlockNumber(42));

    header = CheckpointHeader.random();
    archive = l2Block.archive.root.toBuffer();

    proposeTxHash = `0x${Buffer.from('txHashPropose').toString('hex')}`; // random tx hash

    proposeTxReceipt = {
      blockNumber: 1n,
      transactionHash: proposeTxHash,
      status: 'success',
      logs: [],
    } as unknown as GetTransactionReceiptReturnType;

    testHarnessAttesterAccount = privateKeyToAccount(
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    );
    l1TxUtils = mock<L1TxUtils>();
    l1TxUtils.getBlock.mockResolvedValue({ timestamp: 12n } as any);
    l1TxUtils.getBlockNumber.mockResolvedValue(1n);
    l1TxUtils.getSenderAddress.mockReturnValue(EthAddress.fromString(testHarnessAttesterAccount.address));
    l1TxUtils.getCode.mockReturnValue(Promise.resolve(`0x1` as GetCodeReturnType));
    const config = {
      l1RpcUrls: [`http://127.0.0.1:8545`],
      l1ChainId: 1,
      aztecSlotDuration: 36,
      sequencerPublisherPreviousL1BlockWaitTimeoutMs: 8_000,
      sequencerPublisherPreviousL1BlockWaitPollIntervalMs: 500,
      ...defaultL1TxUtilsConfig,
    } as unknown as TxSenderConfig &
      PublisherConfig &
      SequencerPublisherConfig &
      Pick<L1ContractsConfig, 'ethereumSlotDuration' | 'aztecSlotDuration'> &
      L1TxUtilsConfig;

    rollup = mock<RollupContract>();
    rollup.validateHeader.mockReturnValue(Promise.resolve());
    rollup.getL1StartBlock.mockResolvedValue(1n);
    (rollup as any).address = mockRollupAddress;
    forwardSpy = jest.spyOn(Multicall3, 'forward');

    slashingProposerContract = mock<SlashingProposerContract>();
    l1Metrics = mock<SequencerPublisherMetrics>();

    governanceProposerContract = mock<GovernanceProposerContract>();

    epochCache = mock<EpochCache>();
    epochCache.getEpochAndSlotNow.mockReturnValue({ epoch: EpochNumber(1), slot: SlotNumber(2), ts: 3n, nowMs: 3000n });
    epochCache.getL1Constants.mockReturnValue(EmptyL1RollupConstants);
    epochCache.getSlotNow.mockReturnValue(SlotNumber(2));
    epochCache.getCommittee.mockResolvedValue({
      committee: [],
      seed: 1n,
      epoch: EpochNumber(1),
      isEscapeHatchOpen: false,
    });

    dateProvider = new TestDateProvider();

    publisher = new SequencerPublisher(config, {
      blobClient,
      rollupContract: rollup,
      l1TxUtils,
      epochCache,
      slashingProposerContract,
      governanceProposerContract,
      dateProvider,
      metrics: l1Metrics,
      lastActions: {},
    });

    publisher.l1TxUtils = l1TxUtils;

    l1TxUtils.sendAndMonitorTransaction.mockResolvedValue({
      receipt: proposeTxReceipt,
      state: { gasPrice: { maxFeePerGas: 1n, maxPriorityFeePerGas: 1n } } as any,
    });
    (l1TxUtils as any).estimateGas.mockResolvedValue(GAS_GUESS);
    (l1TxUtils as any).simulate.mockResolvedValue({ gasUsed: 1_000_000n, result: '0x' });
    (l1TxUtils as any).bumpGasLimit.mockImplementation((val: bigint) => val + (val * 20n) / 100n);
    l1TxUtils.getSenderBalance.mockResolvedValue(10_000_000_000_000_000_000n); // 10 ETH, sufficient for all tests
    (l1TxUtils as any).client = {
      account: {
        address: '0x1234567890123456789012345678901234567890',
      },
      getGasPrice: () => Promise.resolve(1n),
      getBlock: () => Promise.resolve({ timestamp: 0n }),
    };

    const currentL2Slot = publisher.getCurrentL2Slot();

    l2Block = await L2Block.random(BlockNumber(42), { slotNumber: SlotNumber(Number(currentL2Slot)) });

    header = CheckpointHeader.random({ slotNumber: SlotNumber(Number(currentL2Slot)) });
    archive = l2Block.archive.root.toBuffer();
  });

  afterEach(() => {
    forwardSpy.mockRestore();
  });

  const mockGovernancePayload = () => {
    const govPayload = EthAddress.random();
    const voteSig = Signature.random();
    governanceProposerContract.getRoundInfo.mockResolvedValue({
      lastSignalSlot: SlotNumber(1),
      payloadWithMostSignals: govPayload.toString(),
      quorumReached: false,
      executed: false,
    });
    governanceProposerContract.createSignalRequestWithSignature.mockResolvedValue({
      to: mockGovernanceProposerAddress,
      data: encodeFunctionData({
        abi: EmpireBaseAbi,
        functionName: 'signalWithSig',
        args: [govPayload.toString(), voteSig.toViemSignature()],
      }),
    });
    return { govPayload, voteSig };
  };

  it('bundles propose and vote tx to l1', async () => {
    const checkpoint = new Checkpoint(l2Block.archive, header, [l2Block], l2Block.checkpointNumber);
    const expectedBlobs = await getBlobsPerL1Block(checkpoint.toBlobFields());
    await publisher.enqueueProposeCheckpoint(
      checkpoint,
      CommitteeAttestationsAndSigners.empty(testSignatureContext),
      Signature.empty(),
    );

    const { govPayload, voteSig } = mockGovernancePayload();

    rollup.getProposerAt.mockResolvedValueOnce(EthAddress.fromString(mockForwarderAddress));

    expect(
      await publisher.enqueueGovernanceCastSignal(
        govPayload,
        SlotNumber(2),
        EthAddress.fromString(testHarnessAttesterAccount.address),
        msg => testHarnessAttesterAccount.signTypedData(msg),
      ),
    ).toEqual(true);

    forwardSpy.mockResolvedValue({
      receipt: proposeTxReceipt,
      stats: undefined,
      multicallData: '0x',
    });

    await publisher.sendRequests();
    expect(forwardSpy).toHaveBeenCalledTimes(1);
    const blobInput = getPrefixedEthBlobCommitments(expectedBlobs);

    const args = [
      {
        header: header.toViem(),
        archive: toHex(archive),
        oracleInput: {
          feeAssetPriceModifier: 0n,
        },
      },
      CommitteeAttestationsAndSigners.packAttestations([]),
      [],
      Signature.empty().toViemSignature(),
      blobInput,
    ] as const;

    expect(forwardSpy).toHaveBeenCalledWith(
      [
        {
          to: mockRollupAddress,
          data: encodeFunctionData({ abi: RollupAbi, functionName: 'propose', args }),
        },
        {
          to: mockGovernanceProposerAddress,
          data: encodeFunctionData({
            abi: EmpireBaseAbi,
            functionName: 'signalWithSig',
            args: [govPayload.toString(), voteSig.toViemSignature()],
          }),
        },
      ],
      l1TxUtils,
      {
        gasLimit: expect.any(BigInt),
        txTimeoutAt: undefined,
      },
      expect.objectContaining({
        blobs: expect.any(Array),
      }),
      { gasLimitRequired: true },
    );

    expect(forwardSpy.mock.calls[0][2]?.gasLimit).toBeGreaterThan(2_000_000n);

    // Verify blob data (Buffer comparison requires manual content check)
    const actualBlobConfig = forwardSpy.mock.calls[0][3];
    expect(actualBlobConfig!.blobs).toHaveLength(expectedBlobs.length);
    expectedBlobs.forEach((expectedBlob, i) => {
      expect(Buffer.from(actualBlobConfig!.blobs[i]).equals(expectedBlob.data)).toBe(true);
    });
  });

  it('errors if forwarder tx fails', async () => {
    forwardSpy.mockRejectedValueOnce(new Error()).mockResolvedValueOnce({
      receipt: proposeTxReceipt,
      stats: undefined,
      multicallData: '0x',
    });

    await publisher.enqueueProposeCheckpoint(
      new Checkpoint(l2Block.archive, header, [l2Block], l2Block.checkpointNumber),
      CommitteeAttestationsAndSigners.empty(testSignatureContext),
      Signature.empty(),
    );
    const result = await publisher.sendRequests();
    expect(result).toEqual(undefined);
  });

  describe('publisher rotation on send failure', () => {
    let secondL1TxUtils: MockProxy<L1TxUtils>;
    let getNextPublisher: jest.MockedFunction<(excludeAddresses: EthAddress[]) => Promise<L1TxUtils | undefined>>;
    let rotatingPublisher: SequencerPublisher;

    beforeEach(() => {
      secondL1TxUtils = mock<L1TxUtils>();
      secondL1TxUtils.getBlockNumber.mockResolvedValue(1n);
      secondL1TxUtils.getSenderAddress.mockReturnValue(EthAddress.random());
      secondL1TxUtils.getSenderBalance.mockResolvedValue(10_000_000_000_000_000_000n); // 10 ETH
      (secondL1TxUtils as any).client = {
        account: { address: EthAddress.random().toString() },
        getGasPrice: () => Promise.resolve(1n),
      };
      (secondL1TxUtils as any).bumpGasLimit = (val: bigint) => val + (val * 20n) / 100n;
      (secondL1TxUtils as any).simulate = () => Promise.resolve({ gasUsed: 1_000_000n, result: '0x' });
      (secondL1TxUtils as any).getBlockNumber = () => Promise.resolve(1n);

      getNextPublisher = jest.fn();

      const epochCache = mock<EpochCache>();
      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: EpochNumber(1),
        slot: SlotNumber(2),
        ts: 3n,
        nowMs: 3000n,
      });
      epochCache.getSlotNow.mockReturnValue(SlotNumber(2));
      epochCache.getL1Constants.mockReturnValue(EmptyL1RollupConstants);
      epochCache.getCommittee.mockResolvedValue({
        committee: [],
        seed: 1n,
        epoch: EpochNumber(1),
        isEscapeHatchOpen: false,
      });

      rotatingPublisher = new SequencerPublisher(
        {
          ethereumSlotDuration: 12,
          aztecSlotDuration: 36,
          l1ChainId: 1,
          sequencerPublisherPreviousL1BlockWaitTimeoutMs: 8_000,
          sequencerPublisherPreviousL1BlockWaitPollIntervalMs: 500,
        } as any,
        {
          blobClient,
          rollupContract: rollup,
          l1TxUtils,
          epochCache,
          slashingProposerContract,
          governanceProposerContract,
          dateProvider: new TestDateProvider(),
          metrics: l1Metrics,
          lastActions: {},
          getNextPublisher,
        },
      );
    });

    it('rotates to next publisher when forward throws and retries successfully', async () => {
      forwardSpy
        .mockRejectedValueOnce(new Error('RPC error'))
        .mockResolvedValueOnce({ receipt: proposeTxReceipt, stats: undefined, multicallData: '0x' });
      getNextPublisher.mockResolvedValueOnce(secondL1TxUtils);

      await rotatingPublisher.enqueueProposeCheckpoint(
        new Checkpoint(l2Block.archive, header, [l2Block], l2Block.checkpointNumber),
        CommitteeAttestationsAndSigners.empty(testSignatureContext),
        Signature.empty(),
      );
      const result = await rotatingPublisher.sendRequests();

      expect(forwardSpy).toHaveBeenCalledTimes(2);
      // First call uses original publisher, second uses the rotated one
      expect(forwardSpy).toHaveBeenNthCalledWith(
        1,
        expect.anything(),
        l1TxUtils,
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
      expect(forwardSpy).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        secondL1TxUtils,
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
      expect(getNextPublisher).toHaveBeenCalledWith([l1TxUtils.getSenderAddress()]);
      // Result is defined (rotation succeeded and tx was sent)
      expect(result).toBeDefined();
      expect(result?.sentActions).toContain('propose');
      // l1TxUtils updated to the one that succeeded
      expect(rotatingPublisher.l1TxUtils).toBe(secondL1TxUtils);
    });

    it('does not rotate on TimeoutError, re-throws instead', async () => {
      forwardSpy.mockRejectedValueOnce(new TimeoutError('timed out'));

      await rotatingPublisher.enqueueProposeCheckpoint(
        new Checkpoint(l2Block.archive, header, [l2Block], l2Block.checkpointNumber),
        CommitteeAttestationsAndSigners.empty(testSignatureContext),
        Signature.empty(),
      );
      // TimeoutError propagates to the outer catch in sendRequests which returns undefined
      const result = await rotatingPublisher.sendRequests();

      expect(result).toBeUndefined();
      expect(getNextPublisher).not.toHaveBeenCalled();
      expect(forwardSpy).toHaveBeenCalledTimes(1);
    });

    it('returns undefined when all publishers are exhausted', async () => {
      forwardSpy
        .mockRejectedValueOnce(new Error('RPC error on first'))
        .mockRejectedValueOnce(new Error('RPC error on second'));
      getNextPublisher.mockResolvedValueOnce(secondL1TxUtils).mockResolvedValueOnce(undefined);

      await rotatingPublisher.enqueueProposeCheckpoint(
        new Checkpoint(l2Block.archive, header, [l2Block], l2Block.checkpointNumber),
        CommitteeAttestationsAndSigners.empty(testSignatureContext),
        Signature.empty(),
      );
      const result = await rotatingPublisher.sendRequests();

      expect(forwardSpy).toHaveBeenCalledTimes(2);
      expect(getNextPublisher).toHaveBeenCalledTimes(2);
      expect(result).toBeUndefined();
    });

    it('does not enter the rotation loop when txTimeoutAt is already in the past', async () => {
      const pastTimeout = new Date(Date.now() - 1000);
      await rotatingPublisher.enqueueProposeCheckpoint(
        new Checkpoint(l2Block.archive, header, [l2Block], l2Block.checkpointNumber),
        CommitteeAttestationsAndSigners.empty(testSignatureContext),
        Signature.empty(),
        { txTimeoutAt: pastTimeout },
      );
      const result = await rotatingPublisher.sendRequests();

      expect(result).toBeUndefined();
      expect(forwardSpy).not.toHaveBeenCalled();
      expect(getNextPublisher).not.toHaveBeenCalled();
    });

    it('stops rotating once txTimeoutAt elapses mid-rotation', async () => {
      // First forward throws; getNextPublisher rotates to a new publisher; but by then the
      // deadline has elapsed and the rotation loop should bail before the second forward call.
      // Use jest fake timers to control `Date.now()` deterministically — the rotation loop
      // checks the deadline via `new Date() > txConfig.txTimeoutAt`, so faking the system clock
      // is the cleanest way to model "deadline elapses mid-rotation" without racing wall-clock
      // setTimeout against CI host speed.
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
      try {
        jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
        const futureTimeout = new Date(Date.now() + 1000);
        forwardSpy.mockImplementationOnce(() => {
          // Simulate enough wall-clock advance during the forward to push past the deadline,
          // so the loop's next deadline check bails before the second attempt.
          jest.setSystemTime(Date.now() + 5000);
          return Promise.reject(new Error('RPC error on first'));
        });
        getNextPublisher.mockResolvedValueOnce(secondL1TxUtils);

        await rotatingPublisher.enqueueProposeCheckpoint(
          new Checkpoint(l2Block.archive, header, [l2Block], l2Block.checkpointNumber),
          CommitteeAttestationsAndSigners.empty(testSignatureContext),
          Signature.empty(),
          { txTimeoutAt: futureTimeout },
        );
        const result = await rotatingPublisher.sendRequests();

        expect(result).toBeUndefined();
        // forward was attempted exactly once (the first publisher); rotation was aborted before
        // the second attempt because the deadline had passed.
        expect(forwardSpy).toHaveBeenCalledTimes(1);
      } finally {
        jest.useRealTimers();
      }
    });

    it('does not rotate when forward throws MulticallForwarderRevertedError (on-chain failure)', async () => {
      forwardSpy.mockRejectedValueOnce(
        new MulticallForwarderRevertedError({ ...proposeTxReceipt, status: 'reverted' }),
      );

      await rotatingPublisher.enqueueProposeCheckpoint(
        new Checkpoint(l2Block.archive, header, [l2Block], l2Block.checkpointNumber),
        CommitteeAttestationsAndSigners.empty(testSignatureContext),
        Signature.empty(),
      );
      const result = await rotatingPublisher.sendRequests();

      expect(forwardSpy).toHaveBeenCalledTimes(1);
      expect(getNextPublisher).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });
  });

  it('does not send propose tx if rollup validation fails', async () => {
    await publisher.enqueueProposeCheckpoint(
      new Checkpoint(l2Block.archive, header, [l2Block], l2Block.checkpointNumber),
      CommitteeAttestationsAndSigners.empty(testSignatureContext),
      Signature.empty(),
    );

    // Simulate the bundle-level validate returning a failed entry for the propose call.
    // When all entries fail, bundleSimulate returns undefined and sendRequests returns undefined.
    const failedResult = encodeFunctionResult({
      abi: multicall3Abi,
      functionName: 'aggregate3',
      result: [{ success: false, returnData: '0x' }],
    });
    (l1TxUtils as any).simulate.mockResolvedValueOnce({ gasUsed: 0n, result: failedResult });

    const result = await publisher.sendRequests();
    expect(result).toEqual(undefined);
    expect(forwardSpy).not.toHaveBeenCalled();
    expect(l1TxUtils.simulate).toHaveBeenCalledTimes(1);
  });

  it('validates block headers when L1 head is already at the L2 slot boundary', async () => {
    epochCache.getL1Constants.mockReturnValue({
      ...EmptyL1RollupConstants,
      l1GenesisTime: 1000n,
      slotDuration: 72,
      ethereumSlotDuration: 12,
    });
    const slotStartTimestamp = 1360n;
    (l1TxUtils as any).simulate.mockImplementationOnce((_call: unknown, blockOverrides: { time?: bigint }) => {
      if ((blockOverrides.time ?? 0n) <= slotStartTimestamp) {
        throw new Error(`simulated block timestamp must be greater than parent timestamp`);
      }
      return Promise.resolve({ gasUsed: 1_000_000n, result: '0x' });
    });

    await expect(
      publisher.validateBlockHeader(CheckpointHeader.random({ slotNumber: SlotNumber(5) })),
    ).resolves.toBeUndefined();
  });

  it('simulates request bundles at the last L1 timestamp within the target L2 slot', async () => {
    epochCache.getL1Constants.mockReturnValue({
      ...EmptyL1RollupConstants,
      l1GenesisTime: 1000n,
      slotDuration: 72,
      ethereumSlotDuration: 12,
    });
    publisher.addRequest({
      action: 'invalidate-by-invalid-attestation',
      request: { to: mockRollupAddress, data: '0xdeadbeef' },
      lastValidL2Slot: SlotNumber(5),
      checkSuccess: () => true,
    });
    forwardSpy.mockResolvedValue({ receipt: proposeTxReceipt, stats: undefined, multicallData: '0x' });

    await publisher.sendRequests(SlotNumber(5));

    expect(l1TxUtils.simulate.mock.calls[0][1]).toEqual({
      time: 1420n,
      gasLimit: MAX_L1_TX_LIMIT * 2n,
    });
  });

  describe('bundleSimulate second-pass re-decode', () => {
    const addTwoRequests = () => {
      const currentL2Slot = publisher.getCurrentL2Slot();
      publisher.addRequest({
        action: 'invalidate-by-invalid-attestation',
        request: { to: mockRollupAddress, data: '0xdeadbeef' },
        lastValidL2Slot: SlotNumber(Number(currentL2Slot) + 2),
        checkSuccess: () => true,
      });
      publisher.addRequest({
        action: 'propose',
        request: {
          to: mockRollupAddress,
          data: encodeFunctionData({
            abi: EmpireBaseAbi,
            functionName: 'signal',
            args: [EthAddress.random().toString()],
          }),
        },
        lastValidL2Slot: SlotNumber(Number(currentL2Slot) + 2),
        checkSuccess: () => true,
      });
    };

    it('drops an entry that still reverts in the second-pass re-simulate', async () => {
      addTwoRequests();

      // First simulate: invalidate succeeds, propose fails.
      const firstResult = encodeFunctionResult({
        abi: multicall3Abi,
        functionName: 'aggregate3',
        result: [
          { success: true, returnData: '0x' },
          { success: false, returnData: '0x' },
        ],
      });
      // Second simulate (reduced bundle with only invalidate): that entry also fails.
      const secondResult = encodeFunctionResult({
        abi: multicall3Abi,
        functionName: 'aggregate3',
        result: [{ success: false, returnData: '0x' }],
      });

      (l1TxUtils as any).simulate
        .mockResolvedValueOnce({ gasUsed: 500_000n, result: firstResult })
        .mockResolvedValueOnce({ gasUsed: 0n, result: secondResult });

      const result = await publisher.sendRequests();

      // Both passes dropped everything — should abort.
      expect(result).toBeUndefined();
      expect(forwardSpy).not.toHaveBeenCalled();
      expect(l1TxUtils.simulate).toHaveBeenCalledTimes(2);
    });

    it('sends only survivors after second-pass re-simulate filters additional failures', async () => {
      addTwoRequests();

      // First simulate: both succeed initially.
      // (Simulate a case where second-pass further trims — to test the path where
      // first pass survivors differ from second pass survivors.)
      const firstResult = encodeFunctionResult({
        abi: multicall3Abi,
        functionName: 'aggregate3',
        result: [
          { success: true, returnData: '0x' },
          { success: false, returnData: '0x' },
        ],
      });
      // Second simulate (reduced bundle with only invalidate): that one succeeds.
      const secondResult = encodeFunctionResult({
        abi: multicall3Abi,
        functionName: 'aggregate3',
        result: [{ success: true, returnData: '0x' }],
      });

      (l1TxUtils as any).simulate
        .mockResolvedValueOnce({ gasUsed: 500_000n, result: firstResult })
        .mockResolvedValueOnce({ gasUsed: 300_000n, result: secondResult });

      forwardSpy.mockResolvedValue({ receipt: proposeTxReceipt, stats: undefined, multicallData: '0x' });

      const result = await publisher.sendRequests();

      expect(result).toBeDefined();
      // Only the invalidate survivor was sent.
      expect(result?.sentActions).toEqual(['invalidate-by-invalid-attestation']);
      expect(forwardSpy).toHaveBeenCalledTimes(1);
      expect(l1TxUtils.simulate).toHaveBeenCalledTimes(2);
    });

    it('preserves first-pass survivors when second-pass simulate returns fallback', async () => {
      addTwoRequests();

      // First simulate: propose fails, invalidate survives.
      const firstResult = encodeFunctionResult({
        abi: multicall3Abi,
        functionName: 'aggregate3',
        result: [
          { success: true, returnData: '0x' },
          { success: false, returnData: '0x' },
        ],
      });
      // Second simulate: fallback (eth_simulateV1 not supported on the reduced bundle).
      (l1TxUtils as any).simulate
        .mockResolvedValueOnce({ gasUsed: 500_000n, result: firstResult })
        .mockResolvedValueOnce({ gasUsed: 1_000_000n, result: '0x' });

      forwardSpy.mockResolvedValue({ receipt: proposeTxReceipt, stats: undefined, multicallData: '0x' });

      const result = await publisher.sendRequests();

      // Second-pass fallback must NOT re-include the propose entry that first-pass dropped.
      expect(result).toBeDefined();
      expect(result?.sentActions).toEqual(['invalidate-by-invalid-attestation']);
      expect(result?.failedActions).toEqual(['propose']);
      expect(forwardSpy).toHaveBeenCalledTimes(1);
      expect(forwardSpy.mock.calls[0][2]?.gasLimit).toEqual(MAX_L1_TX_LIMIT);
      // The forwarded bundle should only contain the survivor.
      expect(forwardSpy.mock.calls[0][0]).toHaveLength(1);
      expect(l1TxUtils.simulate).toHaveBeenCalledTimes(2);
    });
  });

  it('does not send requests if interrupted', async () => {
    forwardSpy.mockImplementationOnce(
      () =>
        sleep(10, {
          receipt: proposeTxReceipt,
          stats: undefined,
          multicallData: '0x',
        }) as Promise<{
          receipt: TransactionReceipt;
          stats: undefined;
          multicallData: Hex;
        }>,
    );
    await publisher.enqueueProposeCheckpoint(
      new Checkpoint(l2Block.archive, header, [l2Block], l2Block.checkpointNumber),
      CommitteeAttestationsAndSigners.empty(testSignatureContext),
      Signature.empty(),
    );
    publisher.interrupt();
    const resultPromise = publisher.sendRequests();
    const result = await resultPromise;

    expect(result).toEqual(undefined);
    expect(forwardSpy).not.toHaveBeenCalled();
    expect((publisher as any).requests.length).toEqual(0);
  });

  it('does not sleep in sendRequestsAt if interrupted beforehand', async () => {
    // A target slot far enough in the future that sendRequestsAt would sleep for ~1 hour
    // (EmptyL1RollupConstants has slotDuration 1s and l1GenesisTime 0, so slot N starts at N seconds).
    const targetSlot = SlotNumber(Math.ceil(Date.now() / 1000) + 3600);
    publisher.interrupt();

    let timeout: NodeJS.Timeout | undefined;
    try {
      const result = await Promise.race([
        publisher.sendRequestsAt(targetSlot),
        new Promise<'timed-out'>(resolve => {
          timeout = setTimeout(() => resolve('timed-out'), 1000);
        }),
      ]);
      expect(result).toBeUndefined();
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  });

  it('waits for the previous L1 block before sending scheduled requests', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
    try {
      // EmptyL1RollupConstants has l1GenesisTime=0 and slotDuration=1s. With the publisher's
      // ethereumSlotDuration=12s, slot 112 has submitAfter=100s.
      jest.setSystemTime(new Date(100_000));
      const targetSlot = SlotNumber(112);
      const sendSpy = jest.spyOn(publisher, 'sendRequests').mockResolvedValue(undefined);
      l1TxUtils.getBlock
        .mockResolvedValueOnce({ timestamp: 99n } as any)
        .mockResolvedValueOnce({ timestamp: 100n } as any);

      const resultPromise = publisher.sendRequestsAt(targetSlot);
      await jest.advanceTimersByTimeAsync(499);

      expect(sendSpy).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(1);
      await jest.advanceTimersByTimeAsync(500);
      await expect(resultPromise).resolves.toBeUndefined();

      expect(sendSpy).toHaveBeenCalledWith(targetSlot);
      expect(l1TxUtils.getBlock).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('sends scheduled requests if the previous L1 block wait times out', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
    try {
      jest.setSystemTime(new Date(100_000));
      const targetSlot = SlotNumber(112);
      const sendSpy = jest.spyOn(publisher, 'sendRequests').mockResolvedValue(undefined);
      l1TxUtils.getBlock.mockResolvedValue({ timestamp: 99n } as any);

      const resultPromise = publisher.sendRequestsAt(targetSlot);
      await jest.advanceTimersByTimeAsync(8_000);
      await jest.advanceTimersByTimeAsync(500);

      await expect(resultPromise).resolves.toBeUndefined();
      expect(sendSpy).toHaveBeenCalledWith(targetSlot);
      expect(l1TxUtils.getBlock).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('uses configured previous L1 block wait timing for scheduled requests', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
    try {
      jest.setSystemTime(new Date(100_000));
      const configuredPublisher = new SequencerPublisher(
        {
          ethereumSlotDuration: 12,
          aztecSlotDuration: 36,
          l1ChainId: 1,
          sequencerPublisherPreviousL1BlockWaitTimeoutMs: 1_000,
          sequencerPublisherPreviousL1BlockWaitPollIntervalMs: 250,
        } as any,
        {
          blobClient,
          rollupContract: rollup,
          l1TxUtils,
          epochCache,
          slashingProposerContract,
          governanceProposerContract,
          dateProvider,
          metrics: l1Metrics,
          lastActions: {},
        },
      );
      const targetSlot = SlotNumber(112);
      const sendSpy = jest.spyOn(configuredPublisher, 'sendRequests').mockResolvedValue(undefined);
      l1TxUtils.getBlock.mockResolvedValue({ timestamp: 99n } as any);

      const resultPromise = configuredPublisher.sendRequestsAt(targetSlot);
      await jest.advanceTimersByTimeAsync(999);

      expect(sendSpy).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(1);
      await jest.advanceTimersByTimeAsync(250);
      await expect(resultPromise).resolves.toBeUndefined();

      expect(sendSpy).toHaveBeenCalledWith(targetSlot);
      expect(l1TxUtils.getBlock).toHaveBeenCalledTimes(4);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not send requests if no valid requests are found', async () => {
    publisher.addRequest({
      action: 'propose',
      request: {
        to: mockRollupAddress,
        data: encodeFunctionData({
          abi: EmpireBaseAbi,
          functionName: 'signal',
          args: [EthAddress.random().toString()],
        }),
      },
      lastValidL2Slot: SlotNumber(1),
      checkSuccess: () => true,
    });

    const resultPromise = publisher.sendRequests();
    const result = await resultPromise;

    expect(result).toEqual(undefined);
    expect(forwardSpy).not.toHaveBeenCalled();
    expect((publisher as any).requests.length).toEqual(0);
  });

  it('does not include gas config from expired requests', async () => {
    const currentL2Slot = publisher.getCurrentL2Slot();

    // Add an expired request with a gas config
    publisher.addRequest({
      action: 'vote-offenses',
      request: {
        to: mockRollupAddress,
        data: encodeFunctionData({
          abi: EmpireBaseAbi,
          functionName: 'signal',
          args: [EthAddress.random().toString()],
        }),
      },
      lastValidL2Slot: SlotNumber(1), // expired
      gasConfig: { gasLimit: 500_000n },
      checkSuccess: () => true,
    });

    // Add a valid request with a gas config
    publisher.addRequest({
      action: 'propose',
      request: {
        to: mockRollupAddress,
        data: encodeFunctionData({
          abi: EmpireBaseAbi,
          functionName: 'signal',
          args: [EthAddress.random().toString()],
        }),
      },
      lastValidL2Slot: SlotNumber(Number(currentL2Slot) + 10), // valid
      gasConfig: { gasLimit: 100_000n },
      checkSuccess: () => true,
    });

    forwardSpy.mockResolvedValue({
      receipt: proposeTxReceipt,
      stats: undefined,
      multicallData: '0x',
    });

    await publisher.sendRequests();

    expect(forwardSpy).toHaveBeenCalledTimes(1);
    // The expired request (500_000) is filtered before bundle simulate.
    // Bundle simulate returns '0x' (fallback), so gasLimit comes from MAX_L1_TX_LIMIT,
    // not from per-request gasConfig — the expired request's gasLimit has no effect.
    const txConfig = forwardSpy.mock.calls[0][2];
    expect(txConfig?.gasLimit).toEqual(MAX_L1_TX_LIMIT);
  });

  it('does not signal for payload when quorum is reached', async () => {
    const { govPayload } = mockGovernancePayload();

    governanceProposerContract.getRoundInfo.mockResolvedValue({
      lastSignalSlot: SlotNumber(1),
      payloadWithMostSignals: govPayload.toString(),
      quorumReached: true,
      executed: false,
    });

    expect(
      await publisher.enqueueGovernanceCastSignal(
        govPayload,
        SlotNumber(2),
        EthAddress.fromString(testHarnessAttesterAccount.address),
        msg => testHarnessAttesterAccount.signTypedData(msg),
      ),
    ).toEqual(false);
  });

  it('does not signal for payload with empty code', async () => {
    const { govPayload } = mockGovernancePayload();
    // isPayloadEmpty now lives on GovernanceProposerContract, not L1TxUtils.
    governanceProposerContract.isPayloadEmpty.mockResolvedValue(true);

    expect(
      await publisher.enqueueGovernanceCastSignal(
        govPayload,
        SlotNumber(2),
        EthAddress.fromString(testHarnessAttesterAccount.address),
        msg => testHarnessAttesterAccount.signTypedData(msg),
      ),
    ).toEqual(false);
  });

  it('stops signalling when payload was previously proposed', async () => {
    const { govPayload } = mockGovernancePayload();
    governanceProposerContract.hasActiveProposalWithPayload.mockResolvedValue(true);

    expect(
      await publisher.enqueueGovernanceCastSignal(
        govPayload,
        SlotNumber(2),
        EthAddress.fromString(testHarnessAttesterAccount.address),
        msg => testHarnessAttesterAccount.signTypedData(msg),
      ),
    ).toEqual(false);
  });

  it('continues signalling when payload was NOT proposed', async () => {
    const { govPayload } = mockGovernancePayload();
    governanceProposerContract.hasActiveProposalWithPayload.mockResolvedValue(false);

    expect(
      await publisher.enqueueGovernanceCastSignal(
        govPayload,
        SlotNumber(2),
        EthAddress.fromString(testHarnessAttesterAccount.address),
        msg => testHarnessAttesterAccount.signTypedData(msg),
      ),
    ).toEqual(true);
  });

  it('re-checks on every call without caching, so re-signaling resumes if a proposal becomes terminal', async () => {
    const { govPayload } = mockGovernancePayload();
    // Simulates a payload that has a live proposal in slot 2 but whose proposal becomes terminal
    // (Dropped/Rejected/Expired/Executed) by slot 3. The contracts allow re-signaling the same
    // payload in a later round once the previous proposal is dead, so the publisher must re-check
    // each slot rather than cache the first `true` result indefinitely.
    governanceProposerContract.hasActiveProposalWithPayload.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    expect(
      await publisher.enqueueGovernanceCastSignal(
        govPayload,
        SlotNumber(2),
        EthAddress.fromString(testHarnessAttesterAccount.address),
        msg => testHarnessAttesterAccount.signTypedData(msg),
      ),
    ).toEqual(false);

    expect(
      await publisher.enqueueGovernanceCastSignal(
        govPayload,
        SlotNumber(3),
        EthAddress.fromString(testHarnessAttesterAccount.address),
        msg => testHarnessAttesterAccount.signTypedData(msg),
      ),
    ).toEqual(true);

    expect(governanceProposerContract.hasActiveProposalWithPayload).toHaveBeenCalledTimes(2);
  });

  it('fails open on persistent RPC failure and signals anyway', async () => {
    // Failing closed (skipping the signal) on transient RPC errors would let a flaky L1 endpoint
    // silence governance participation entirely. Failing open at worst produces a duplicate signal
    // that the contract simply counts alongside others in the round.
    const { govPayload } = mockGovernancePayload();
    governanceProposerContract.hasActiveProposalWithPayload.mockRejectedValue(new Error('RPC error'));

    expect(
      await publisher.enqueueGovernanceCastSignal(
        govPayload,
        SlotNumber(2),
        EthAddress.fromString(testHarnessAttesterAccount.address),
        msg => testHarnessAttesterAccount.signTypedData(msg),
      ),
    ).toEqual(true);
  });

  it('re-checks each call (no caching of false results)', async () => {
    const { govPayload } = mockGovernancePayload();
    governanceProposerContract.hasActiveProposalWithPayload.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    // First call: no live proposal, signalling proceeds
    expect(
      await publisher.enqueueGovernanceCastSignal(
        govPayload,
        SlotNumber(2),
        EthAddress.fromString(testHarnessAttesterAccount.address),
        msg => testHarnessAttesterAccount.signTypedData(msg),
      ),
    ).toEqual(true);

    // Second call: live proposal now exists, signalling stops
    expect(
      await publisher.enqueueGovernanceCastSignal(
        govPayload,
        SlotNumber(3),
        EthAddress.fromString(testHarnessAttesterAccount.address),
        msg => testHarnessAttesterAccount.signTypedData(msg),
      ),
    ).toEqual(false);

    expect(governanceProposerContract.hasActiveProposalWithPayload).toHaveBeenCalledTimes(2);
  });

  describe('enqueuePruneIfPrunable', () => {
    const pruneData = encodeFunctionData({ abi: RollupAbi, functionName: 'prune', args: [] });

    it('enqueues a prune and bundles it to L1 when the rollup is prunable', async () => {
      rollup.canPruneAtTime.mockResolvedValue(true);

      expect(await publisher.enqueuePruneIfPrunable(SlotNumber(2))).toEqual(true);

      forwardSpy.mockResolvedValue({ receipt: proposeTxReceipt, stats: undefined, multicallData: '0x' });
      await publisher.sendRequests();

      expect(forwardSpy).toHaveBeenCalledTimes(1);
      expect(forwardSpy.mock.calls[0][0]).toEqual([{ to: mockRollupAddress, data: pruneData }]);
    });

    it('does not enqueue a prune when the rollup is not prunable', async () => {
      rollup.canPruneAtTime.mockResolvedValue(false);

      expect(await publisher.enqueuePruneIfPrunable(SlotNumber(2))).toEqual(false);

      await publisher.sendRequests();
      expect(forwardSpy).not.toHaveBeenCalled();
    });

    it('does not enqueue a duplicate prune for the same slot', async () => {
      rollup.canPruneAtTime.mockResolvedValue(true);

      expect(await publisher.enqueuePruneIfPrunable(SlotNumber(2))).toEqual(true);
      expect(await publisher.enqueuePruneIfPrunable(SlotNumber(2))).toEqual(false);
    });

    it('fails closed (skips prune) when canPruneAtTime rejects', async () => {
      rollup.canPruneAtTime.mockRejectedValue(new Error('rpc error'));

      expect(await publisher.enqueuePruneIfPrunable(SlotNumber(2))).toEqual(false);

      await publisher.sendRequests();
      expect(forwardSpy).not.toHaveBeenCalled();
    });
  });

  describe('buildInvalidateCheckpointRequest', () => {
    const checkpointNumber = CheckpointNumber(5);
    const committee = [EthAddress.random(), EthAddress.random()];
    const checkpoint = {
      archive: Fr.random(),
      lastArchive: Fr.random(),
      slotNumber: SlotNumber(1),
      checkpointNumber,
      timestamp: 0n,
    };

    const makeInvalidResult = (verbatimAttestations: ViemCommitteeAttestations): ValidateCheckpointResult => ({
      valid: false,
      reason: 'invalid-attestation',
      checkpoint,
      committee,
      epoch: EpochNumber(1),
      seed: 0n,
      attestors: [],
      invalidIndex: 1,
      attestations: [],
      verbatimAttestations,
    });

    beforeEach(() => {
      rollup.getCheckpointNumber.mockResolvedValue(checkpointNumber);
      rollup.buildInvalidateBadAttestationRequest.mockReturnValue({
        to: mockRollupAddress,
        data: '0x',
        abi: [],
      } as any);
    });

    it('passes the raw packed attestations tuple verbatim to invalidateBadAttestation', async () => {
      const packed = { signatureIndices: '0x80', signaturesOrAddresses: bufferToHex(Buffer.alloc(65, 7)) } as const;
      await publisher.simulateInvalidateCheckpoint(makeInvalidResult(packed));
      expect(rollup.buildInvalidateBadAttestationRequest).toHaveBeenCalledWith(checkpointNumber, packed, committee, 1);
    });
  });
});
