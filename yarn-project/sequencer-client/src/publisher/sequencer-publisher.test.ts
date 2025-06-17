import { Blob } from '@aztec/blob-lib';
import { HttpBlobSinkClient } from '@aztec/blob-sink/client';
import { inboundTransform } from '@aztec/blob-sink/encoding';
import type { EpochCache } from '@aztec/epoch-cache';
import {
  type ForwarderContract,
  type GasPrice,
  type GovernanceProposerContract,
  type L1ContractsConfig,
  type L1TxUtilsConfig,
  type RollupContract,
  type SlashingProposerContract,
  defaultL1TxUtilsConfig,
  getL1ContractsConfigEnvVars,
} from '@aztec/ethereum';
import type { L1TxUtilsWithBlobs } from '@aztec/ethereum/l1-tx-utils-with-blobs';
import { EthAddress } from '@aztec/foundation/eth-address';
import { sleep } from '@aztec/foundation/sleep';
import { EmpireBaseAbi, RollupAbi } from '@aztec/l1-artifacts';
import { L2Block, Signature } from '@aztec/stdlib/block';
import type { ProposedBlockHeader } from '@aztec/stdlib/tx';

import express, { json } from 'express';
import type { Server } from 'http';
import { type MockProxy, mock } from 'jest-mock-extended';
import { type GetTransactionReceiptReturnType, type TransactionReceipt, encodeFunctionData, toHex } from 'viem';

import type { PublisherConfig, TxSenderConfig } from './config.js';
import { SequencerPublisher, VoteType } from './sequencer-publisher.js';

const mockRollupAddress = EthAddress.random().toString();
const mockGovernanceProposerAddress = EthAddress.random().toString();
const mockForwarderAddress = EthAddress.random().toString();
const BLOB_SINK_PORT = 50525;
const BLOB_SINK_URL = `http://localhost:${BLOB_SINK_PORT}`;

describe('SequencerPublisher', () => {
  let rollup: MockProxy<RollupContract>;
  let forwarder: MockProxy<ForwarderContract>;
  let slashingProposerContract: MockProxy<SlashingProposerContract>;
  let governanceProposerContract: MockProxy<GovernanceProposerContract>;
  let l1TxUtils: MockProxy<L1TxUtilsWithBlobs>;

  let proposeTxHash: `0x${string}`;
  let proposeTxReceipt: GetTransactionReceiptReturnType;
  let l2Block: L2Block;

  let header: ProposedBlockHeader;
  let archive: Buffer;
  let blockHash: Buffer;

  let blobSinkClient: HttpBlobSinkClient;
  let mockBlobSinkServer: Server | undefined = undefined;

  // An l1 publisher with some private methods exposed
  let publisher: SequencerPublisher;

  const GAS_GUESS = 300_000n;

  beforeEach(async () => {
    mockBlobSinkServer = undefined;
    blobSinkClient = new HttpBlobSinkClient({ blobSinkUrl: BLOB_SINK_URL });

    l2Block = await L2Block.random(42);

    header = l2Block.header.toPropose();
    archive = l2Block.archive.root.toBuffer();
    blockHash = (await l2Block.header.hash()).toBuffer();

    proposeTxHash = `0x${Buffer.from('txHashPropose').toString('hex')}`; // random tx hash

    proposeTxReceipt = {
      blockNumber: 1n,
      transactionHash: proposeTxHash,
      status: 'success',
      logs: [],
    } as unknown as GetTransactionReceiptReturnType;

    l1TxUtils = mock<L1TxUtilsWithBlobs>();
    l1TxUtils.getBlock.mockResolvedValue({ timestamp: 12n } as any);
    l1TxUtils.getBlockNumber.mockResolvedValue(1n);
    const config = {
      blobSinkUrl: BLOB_SINK_URL,
      l1RpcUrls: [`http://127.0.0.1:8545`],
      l1ChainId: 1,
      publisherPrivateKey: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`,
      l1Contracts: {
        rollupAddress: EthAddress.ZERO.toString(),
        governanceProposerAddress: mockGovernanceProposerAddress,
      },
      l1PublishRetryIntervalMS: 1,
      ethereumSlotDuration: getL1ContractsConfigEnvVars().ethereumSlotDuration,

      ...defaultL1TxUtilsConfig,
    } as unknown as TxSenderConfig &
      PublisherConfig &
      Pick<L1ContractsConfig, 'ethereumSlotDuration'> &
      L1TxUtilsConfig;

    rollup = mock<RollupContract>();
    rollup.validateHeader.mockReturnValue(Promise.resolve());
    (rollup as any).address = mockRollupAddress;

    forwarder = mock<ForwarderContract>();
    forwarder.getAddress.mockReturnValue(mockForwarderAddress);
    forwarder.forward.mockResolvedValue({
      receipt: proposeTxReceipt,
      gasPrice: { maxFeePerGas: 1n, maxPriorityFeePerGas: 1n },
      errorMsg: undefined,
    });

    slashingProposerContract = mock<SlashingProposerContract>();
    governanceProposerContract = mock<GovernanceProposerContract>();

    const epochCache = mock<EpochCache>();
    epochCache.getEpochAndSlotNow.mockReturnValue({ epoch: 1n, slot: 2n, ts: 3n, now: 3n });
    epochCache.getCommittee.mockResolvedValue({ committee: [], seed: 1n, epoch: 1n });

    publisher = new SequencerPublisher(config, {
      blobSinkClient,
      rollupContract: rollup,
      l1TxUtils,
      forwarderContract: forwarder,
      epochCache,
      slashingProposerContract,
      governanceProposerContract,
    });

    (publisher as any)['l1TxUtils'] = l1TxUtils;
    publisher as any;

    l1TxUtils.sendAndMonitorTransaction.mockResolvedValue({
      receipt: proposeTxReceipt,
      gasPrice: { maxFeePerGas: 1n, maxPriorityFeePerGas: 1n },
    });
    (l1TxUtils as any).estimateGas.mockResolvedValue(GAS_GUESS);
    (l1TxUtils as any).simulateGasUsed.mockResolvedValue(1_000_000n);
    (l1TxUtils as any).bumpGasLimit.mockImplementation((val: bigint) => val + (val * 20n) / 100n);
    (l1TxUtils as any).client = {
      account: {
        address: '0x1234567890123456789012345678901234567890',
      },
    };

    const currentL2Slot = publisher.getCurrentL2Slot();

    l2Block = await L2Block.random(42, undefined, undefined, undefined, undefined, Number(currentL2Slot));

    header = l2Block.header.toPropose();
    archive = l2Block.archive.root.toBuffer();
    blockHash = (await l2Block.header.hash()).toBuffer();
  });

  const closeServer = (server: Server): Promise<void> => {
    return new Promise((resolve, reject) => {
      server.close(err => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  };

  afterEach(async () => {
    if (mockBlobSinkServer) {
      await closeServer(mockBlobSinkServer);
      mockBlobSinkServer = undefined;
    }
  });

  // Run a mock blob sink in the background, and test that the correct data is sent to it
  const runBlobSinkServer = (blobs: Blob[]) => {
    const app = express();
    app.use(json({ limit: '10mb' }));

    app.post('/blob_sidecar', (req, res) => {
      const blobsBuffers = req.body.blobs.map((b: { index: number; blob: { type: string; data: string } }) =>
        Blob.fromBuffer(inboundTransform(Buffer.from(b.blob.data))),
      );

      expect(blobsBuffers).toEqual(blobs);
      res.status(200).send();
    });

    return new Promise<void>(resolve => {
      mockBlobSinkServer = app.listen(BLOB_SINK_PORT, () => {
        // Resolve when the server is listening
        resolve();
      });
    });
  };

  it('bundles propose and vote tx to l1', async () => {
    const kzg = Blob.getViemKzgInstance();

    const expectedBlobs = await Blob.getBlobsPerBlock(l2Block.body.toBlobFields());

    // Expect the blob sink server to receive the blobs
    await runBlobSinkServer(expectedBlobs);

    expect(await publisher.enqueueProposeL2Block(l2Block)).toEqual(true);
    const govPayload = EthAddress.random();
    const voteSig = Signature.random();
    publisher.setGovernancePayload(govPayload);
    governanceProposerContract.getRoundInfo.mockResolvedValue({
      lastVote: 1n,
      leader: govPayload.toString(),
      executed: false,
    });
    governanceProposerContract.createVoteRequestWithSignature.mockResolvedValue({
      to: mockGovernanceProposerAddress,
      data: encodeFunctionData({
        abi: EmpireBaseAbi,
        functionName: 'voteWithSig',
        args: [govPayload.toString(), voteSig.toViemSignature()],
      }),
    });
    rollup.getProposerAt.mockResolvedValueOnce(mockForwarderAddress);
    expect(await publisher.enqueueCastVote(2n, 1n, VoteType.GOVERNANCE)).toEqual(true);
    // expect(await publisher.enqueueCastVote(0n, 0n, VoteType.SLASHING)).toEqual(true);

    await publisher.sendRequests();
    expect(forwarder.forward).toHaveBeenCalledTimes(1);
    const blobInput = Blob.getPrefixedEthBlobCommitments(expectedBlobs);

    const args = [
      {
        header: header.toViem(),
        archive: toHex(archive),
        stateReference: l2Block.header.state.toViem(),
        blockHash: toHex(blockHash),
        oracleInput: {
          feeAssetPriceModifier: 0n,
        },
        txHashes: [],
      },
      [],
      blobInput,
    ] as const;
    expect(forwarder.forward).toHaveBeenCalledWith(
      [
        {
          to: mockRollupAddress,
          data: encodeFunctionData({ abi: RollupAbi, functionName: 'propose', args }),
        },
        {
          to: mockGovernanceProposerAddress,
          data: encodeFunctionData({
            abi: EmpireBaseAbi,
            functionName: 'voteWithSig',
            args: [govPayload.toString(), voteSig.toViemSignature()],
          }),
        },
      ],
      l1TxUtils,
      // val + (val * 20n) / 100n
      { gasLimit: 1_000_000n + GAS_GUESS + ((1_000_000n + GAS_GUESS) * 20n) / 100n },
      { blobs: expectedBlobs.map(b => b.data), kzg },
      expect.anything(), // the logger
    );
  });

  it('errors if forwarder tx fails', async () => {
    forwarder.forward.mockRejectedValueOnce(new Error()).mockResolvedValueOnce({
      receipt: proposeTxReceipt,
      gasPrice: { maxFeePerGas: 1n, maxPriorityFeePerGas: 1n },
      errorMsg: undefined,
    });

    const enqueued = await publisher.enqueueProposeL2Block(l2Block);
    expect(enqueued).toEqual(true);
    const result = await publisher.sendRequests();
    expect(result).toEqual(undefined);
  });

  it('does send propose tx if rollup validation fails', async () => {
    rollup.validateHeader.mockRejectedValueOnce(new Error('Test error'));

    await expect(publisher.enqueueProposeL2Block(l2Block)).rejects.toThrow();

    expect(rollup.validateHeader).toHaveBeenCalledTimes(1);

    const result = await publisher.sendRequests();
    expect(result).toEqual(undefined);
    expect(forwarder.forward).not.toHaveBeenCalled();
  });

  it('returns errorMsg if forwarder tx reverts', async () => {
    forwarder.forward.mockResolvedValueOnce({
      receipt: { ...proposeTxReceipt, status: 'reverted' },
      gasPrice: { maxFeePerGas: 1n, maxPriorityFeePerGas: 1n },
      errorMsg: 'Test error',
    });

    const enqueued = await publisher.enqueueProposeL2Block(l2Block);
    expect(enqueued).toEqual(true);
    const result = await publisher.sendRequests();

    expect(result?.result?.errorMsg).toEqual('Test error');
  });

  it('does not send requests if interrupted', async () => {
    forwarder.forward.mockImplementationOnce(
      () =>
        sleep(10, { receipt: proposeTxReceipt, gasPrice: { maxFeePerGas: 1n, maxPriorityFeePerGas: 1n } }) as Promise<{
          receipt: TransactionReceipt;
          gasPrice: GasPrice;
          errorMsg: undefined;
        }>,
    );
    const enqueued = await publisher.enqueueProposeL2Block(l2Block);
    expect(enqueued).toEqual(true);
    publisher.interrupt();
    const resultPromise = publisher.sendRequests();
    const result = await resultPromise;

    expect(result).toEqual(undefined);
    expect(forwarder.forward).not.toHaveBeenCalled();
    expect((publisher as any).requests.length).toEqual(0);
  });

  it('does not send requests if no valid requests are found', async () => {
    publisher.addRequest({
      action: 'propose',
      request: {
        to: mockRollupAddress,
        data: encodeFunctionData({ abi: EmpireBaseAbi, functionName: 'vote', args: [EthAddress.random().toString()] }),
      },
      lastValidL2Slot: 1n,
    });

    const resultPromise = publisher.sendRequests();
    const result = await resultPromise;

    expect(result).toEqual(undefined);
    expect(forwarder.forward).not.toHaveBeenCalled();
    expect((publisher as any).requests.length).toEqual(0);
  });
});
