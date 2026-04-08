import type { BlobClientInterface } from '@aztec/blob-client/client';
import { getBlobsPerL1Block, getPrefixedEthBlobCommitments } from '@aztec/blob-lib';
import type { EpochCache } from '@aztec/epoch-cache';
import type { L1ContractsConfig } from '@aztec/ethereum/config';
import {
  type GovernanceProposerContract,
  Multicall3,
  type RollupContract,
  type SlashingProposerContract,
} from '@aztec/ethereum/contracts';
import {
  type GasPrice,
  type L1TxUtils,
  type L1TxUtilsConfig,
  defaultL1TxUtilsConfig,
} from '@aztec/ethereum/l1-tx-utils';
import { FormattedViemError } from '@aztec/ethereum/utils';
import { BlockNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { TimeoutError } from '@aztec/foundation/error';
import { EthAddress } from '@aztec/foundation/eth-address';
import { sleep } from '@aztec/foundation/sleep';
import { TestDateProvider } from '@aztec/foundation/timer';
import { EmpireBaseAbi, RollupAbi } from '@aztec/l1-artifacts';
import { CommitteeAttestationsAndSigners, L2Block, Signature } from '@aztec/stdlib/block';
import { Checkpoint } from '@aztec/stdlib/checkpoint';
import { EmptyL1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { CheckpointHeader } from '@aztec/stdlib/rollup';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';
import {
  type GetCodeReturnType,
  type GetTransactionReceiptReturnType,
  type PrivateKeyAccount,
  type TransactionReceipt,
  encodeFunctionData,
  toHex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import type { PublisherConfig, TxSenderConfig } from './config.js';
import type { SequencerPublisherMetrics } from './sequencer-publisher-metrics.js';
import { type Action, SequencerPublisher, compareActions } from './sequencer-publisher.js';

// Ensures proposal actions are sorted before slashing votes/signals

describe('compareActions sorting', () => {
  it('places propose before vote-offenses', () => {
    const actions: Action[] = ['propose', 'vote-offenses'];
    const sorted = [...actions].sort(compareActions);

    expect(sorted.indexOf('propose')).toBeLessThan(sorted.indexOf('vote-offenses'));
  });
});

const mockRollupAddress = EthAddress.random().toString();
const mockGovernanceProposerAddress = EthAddress.random().toString();
const mockForwarderAddress = EthAddress.random().toString();

describe('SequencerPublisher', () => {
  let rollup: MockProxy<RollupContract>;
  let slashingProposerContract: MockProxy<SlashingProposerContract>;
  let governanceProposerContract: MockProxy<GovernanceProposerContract>;
  let l1TxUtils: MockProxy<L1TxUtils>;
  let l1Metrics: MockProxy<SequencerPublisherMetrics>;
  let forwardSpy: jest.SpiedFunction<typeof Multicall3.forward>;

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
      l1Contracts: {
        rollupAddress: EthAddress.ZERO.toString(),
        governanceProposerAddress: mockGovernanceProposerAddress,
      },
      aztecSlotDuration: 36,
      ...defaultL1TxUtilsConfig,
    } as unknown as TxSenderConfig &
      PublisherConfig &
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

    const epochCache = mock<EpochCache>();
    epochCache.getEpochAndSlotNow.mockReturnValue({ epoch: EpochNumber(1), slot: SlotNumber(2), ts: 3n, nowMs: 3000n });
    epochCache.getL1Constants.mockReturnValue(EmptyL1RollupConstants);
    epochCache.getSlotNow.mockReturnValue(SlotNumber(2));
    epochCache.getCommittee.mockResolvedValue({
      committee: [],
      seed: 1n,
      epoch: EpochNumber(1),
      isEscapeHatchOpen: false,
    });

    publisher = new SequencerPublisher(config, {
      blobClient,
      rollupContract: rollup,
      l1TxUtils,
      epochCache,
      slashingProposerContract,
      governanceProposerContract,
      dateProvider: new TestDateProvider(),
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
    (l1TxUtils as any).client = {
      account: {
        address: '0x1234567890123456789012345678901234567890',
      },
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
    await publisher.enqueueProposeCheckpoint(checkpoint, CommitteeAttestationsAndSigners.empty(), Signature.empty());

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
      errorMsg: undefined,
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
      CommitteeAttestationsAndSigners.empty().getPackedAttestations(),
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
      mockRollupAddress,
      expect.anything(), // the logger
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
      errorMsg: undefined,
    });

    await publisher.enqueueProposeCheckpoint(
      new Checkpoint(l2Block.archive, header, [l2Block], l2Block.checkpointNumber),
      CommitteeAttestationsAndSigners.empty(),
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
      secondL1TxUtils.getSenderBalance.mockResolvedValue(1000n);

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
        { ethereumSlotDuration: 12, aztecSlotDuration: 36, l1ChainId: 1 } as any,
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
        .mockResolvedValueOnce({ receipt: proposeTxReceipt, errorMsg: undefined });
      getNextPublisher.mockResolvedValueOnce(secondL1TxUtils);

      await rotatingPublisher.enqueueProposeCheckpoint(
        new Checkpoint(l2Block.archive, header, [l2Block], l2Block.checkpointNumber),
        CommitteeAttestationsAndSigners.empty(),
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
        expect.anything(),
      );
      expect(forwardSpy).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        secondL1TxUtils,
        expect.anything(),
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
        CommitteeAttestationsAndSigners.empty(),
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
        CommitteeAttestationsAndSigners.empty(),
        Signature.empty(),
      );
      const result = await rotatingPublisher.sendRequests();

      expect(forwardSpy).toHaveBeenCalledTimes(2);
      expect(getNextPublisher).toHaveBeenCalledTimes(2);
      expect(result).toBeUndefined();
    });

    it('does not rotate when forward returns a revert (on-chain failure)', async () => {
      forwardSpy.mockResolvedValue({ receipt: { ...proposeTxReceipt, status: 'reverted' }, errorMsg: 'revert reason' });

      await rotatingPublisher.enqueueProposeCheckpoint(
        new Checkpoint(l2Block.archive, header, [l2Block], l2Block.checkpointNumber),
        CommitteeAttestationsAndSigners.empty(),
        Signature.empty(),
      );
      const result = await rotatingPublisher.sendRequests();

      expect(forwardSpy).toHaveBeenCalledTimes(1);
      expect(getNextPublisher).not.toHaveBeenCalled();
      // Result contains the reverted receipt (no rotation)
      expect(result?.result).toMatchObject({ receipt: { status: 'reverted' } });
    });
  });

  it('does not send propose tx if rollup validation fails', async () => {
    l1TxUtils.simulate.mockRejectedValueOnce(new Error('Test error'));

    await expect(
      publisher.enqueueProposeCheckpoint(
        new Checkpoint(l2Block.archive, header, [l2Block], l2Block.checkpointNumber),
        CommitteeAttestationsAndSigners.empty(),
        Signature.empty(),
      ),
    ).rejects.toThrow();

    expect(l1TxUtils.simulate).toHaveBeenCalledTimes(1);

    const result = await publisher.sendRequests();
    expect(result).toEqual(undefined);
    expect(forwardSpy).not.toHaveBeenCalled();
  });

  it('returns errorMsg if forwarder tx reverts', async () => {
    forwardSpy.mockResolvedValue({
      receipt: { ...proposeTxReceipt, status: 'reverted' },
      errorMsg: 'Test error',
    });

    await publisher.enqueueProposeCheckpoint(
      new Checkpoint(l2Block.archive, header, [l2Block], l2Block.checkpointNumber),
      CommitteeAttestationsAndSigners.empty(),
      Signature.empty(),
    );
    const result = await publisher.sendRequests();

    expect(result).not.toBeInstanceOf(FormattedViemError);
    if (result instanceof FormattedViemError) {
      fail('Not Expected result to be a FormattedViemError');
    } else {
      expect((result as any).result.errorMsg).toEqual('Test error');
    }
  });

  it('does not send requests if interrupted', async () => {
    forwardSpy.mockImplementationOnce(
      () =>
        sleep(10, { receipt: proposeTxReceipt, gasPrice: { maxFeePerGas: 1n, maxPriorityFeePerGas: 1n } }) as Promise<{
          receipt: TransactionReceipt;
          gasPrice: GasPrice;
          errorMsg: undefined;
        }>,
    );
    await publisher.enqueueProposeCheckpoint(
      new Checkpoint(l2Block.archive, header, [l2Block], l2Block.checkpointNumber),
      CommitteeAttestationsAndSigners.empty(),
      Signature.empty(),
    );
    publisher.interrupt();
    const resultPromise = publisher.sendRequests();
    const result = await resultPromise;

    expect(result).toEqual(undefined);
    expect(forwardSpy).not.toHaveBeenCalled();
    expect((publisher as any).requests.length).toEqual(0);
  });

  it('discards only the request whose preCheck fails before sending', async () => {
    const currentL2Slot = publisher.getCurrentL2Slot();
    const keptRequest = {
      to: mockGovernanceProposerAddress,
      data: encodeFunctionData({
        abi: EmpireBaseAbi,
        functionName: 'signal',
        args: [EthAddress.random().toString()],
      }),
    };
    const failedRequest = {
      to: mockRollupAddress,
      data: encodeFunctionData({
        abi: EmpireBaseAbi,
        functionName: 'signal',
        args: [EthAddress.random().toString()],
      }),
    };

    const keptPreCheck = jest.fn(() => Promise.resolve());
    const failedPreCheck = jest.fn(() => Promise.reject(new Error('preCheck failed')));

    publisher.addRequest({
      action: 'vote-offenses',
      request: keptRequest,
      lastValidL2Slot: currentL2Slot,
      preCheck: keptPreCheck,
      checkSuccess: () => true,
    });
    publisher.addRequest({
      action: 'governance-signal',
      request: failedRequest,
      lastValidL2Slot: currentL2Slot,
      preCheck: failedPreCheck,
      checkSuccess: () => true,
    });

    forwardSpy.mockResolvedValue({
      receipt: proposeTxReceipt,
      errorMsg: undefined,
    });

    const result = await publisher.sendRequestsAt(new Date((publisher as any).dateProvider.now()));

    expect(keptPreCheck).toHaveBeenCalledTimes(1);
    expect(failedPreCheck).toHaveBeenCalledTimes(1);
    expect(result?.sentActions).toEqual(['vote-offenses']);
    expect(forwardSpy).toHaveBeenCalledTimes(1);
    expect(forwardSpy).toHaveBeenCalledWith(
      [keptRequest],
      l1TxUtils,
      { gasLimit: undefined, txTimeoutAt: undefined },
      undefined,
      mockRollupAddress,
      expect.anything(),
    );
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
      errorMsg: undefined,
    });

    await publisher.sendRequests();

    expect(forwardSpy).toHaveBeenCalledTimes(1);
    // The gas config should only include the valid request's gas (100_000), not the expired one (500_000)
    const txConfig = forwardSpy.mock.calls[0][2];
    expect(txConfig?.gasLimit).toEqual(100_000n);
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

  it.each<GetCodeReturnType>([undefined])('does not signal for payload with empty code', async code => {
    const { govPayload } = mockGovernancePayload();
    l1TxUtils.getCode.mockReturnValue(Promise.resolve(code));

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
    governanceProposerContract.hasPayloadBeenProposed.mockResolvedValue(true);

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
    governanceProposerContract.hasPayloadBeenProposed.mockResolvedValue(false);

    expect(
      await publisher.enqueueGovernanceCastSignal(
        govPayload,
        SlotNumber(2),
        EthAddress.fromString(testHarnessAttesterAccount.address),
        msg => testHarnessAttesterAccount.signTypedData(msg),
      ),
    ).toEqual(true);
  });

  it('caches proposed result and prevents repeated L1 calls', async () => {
    const { govPayload } = mockGovernancePayload();
    governanceProposerContract.hasPayloadBeenProposed.mockResolvedValue(true);

    await publisher.enqueueGovernanceCastSignal(
      govPayload,
      SlotNumber(2),
      EthAddress.fromString(testHarnessAttesterAccount.address),
      msg => testHarnessAttesterAccount.signTypedData(msg),
    );

    await publisher.enqueueGovernanceCastSignal(
      govPayload,
      SlotNumber(3),
      EthAddress.fromString(testHarnessAttesterAccount.address),
      msg => testHarnessAttesterAccount.signTypedData(msg),
    );

    expect(governanceProposerContract.hasPayloadBeenProposed).toHaveBeenCalledTimes(1);
  });

  it('retries on transient RPC failure and succeeds', async () => {
    const { govPayload } = mockGovernancePayload();
    governanceProposerContract.hasPayloadBeenProposed
      .mockRejectedValueOnce(new Error('RPC error'))
      .mockRejectedValueOnce(new Error('RPC error'))
      .mockResolvedValueOnce(false);

    expect(
      await publisher.enqueueGovernanceCastSignal(
        govPayload,
        SlotNumber(2),
        EthAddress.fromString(testHarnessAttesterAccount.address),
        msg => testHarnessAttesterAccount.signTypedData(msg),
      ),
    ).toEqual(true);
  });

  it('fails closed on persistent RPC failure', async () => {
    const { govPayload } = mockGovernancePayload();
    governanceProposerContract.hasPayloadBeenProposed.mockRejectedValue(new Error('RPC error'));

    expect(
      await publisher.enqueueGovernanceCastSignal(
        govPayload,
        SlotNumber(2),
        EthAddress.fromString(testHarnessAttesterAccount.address),
        msg => testHarnessAttesterAccount.signTypedData(msg),
      ),
    ).toEqual(false);
  });

  it('does not cache false result and re-checks on subsequent calls', async () => {
    const { govPayload } = mockGovernancePayload();
    governanceProposerContract.hasPayloadBeenProposed.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    // First call: not proposed, signalling proceeds
    expect(
      await publisher.enqueueGovernanceCastSignal(
        govPayload,
        SlotNumber(2),
        EthAddress.fromString(testHarnessAttesterAccount.address),
        msg => testHarnessAttesterAccount.signTypedData(msg),
      ),
    ).toEqual(true);

    // Second call: now proposed, signalling stops
    expect(
      await publisher.enqueueGovernanceCastSignal(
        govPayload,
        SlotNumber(3),
        EthAddress.fromString(testHarnessAttesterAccount.address),
        msg => testHarnessAttesterAccount.signTypedData(msg),
      ),
    ).toEqual(false);

    expect(governanceProposerContract.hasPayloadBeenProposed).toHaveBeenCalledTimes(2);
  });
});
