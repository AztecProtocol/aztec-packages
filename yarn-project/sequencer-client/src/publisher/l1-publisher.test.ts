import { HttpBlobSinkClient } from '@aztec/blob-sink/client';
import { L2Block } from '@aztec/circuit-types';
import { EthAddress } from '@aztec/circuits.js';
import {
  type GasPrice,
  type L1ContractsConfig,
  type L1TxRequest,
  type L1TxUtilsConfig,
  defaultL1TxUtilsConfig,
  getL1ContractsConfigEnvVars,
} from '@aztec/ethereum';
import { Blob } from '@aztec/foundation/blob';
import { type ViemSignature } from '@aztec/foundation/eth-signature';
import { sleep } from '@aztec/foundation/sleep';
import { RollupAbi } from '@aztec/l1-artifacts';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

import { jest } from '@jest/globals';
import express, { json } from 'express';
import { type Server } from 'http';
import { type MockProxy, mock } from 'jest-mock-extended';
import {
  type GetTransactionReceiptReturnType,
  type PrivateKeyAccount,
  type TransactionReceipt,
  encodeFunctionData,
} from 'viem';

import { type PublisherConfig, type TxSenderConfig } from './config.js';
import { L1Publisher } from './l1-publisher.js';

const mockRollupAddress = '0xcafe';

interface MockPublicClient {
  getTransactionReceipt: ({ hash }: { hash: '0x${string}' }) => Promise<GetTransactionReceiptReturnType>;
  getBlock(): Promise<{ timestamp: bigint }>;
  getTransaction: ({ hash }: { hash: '0x${string}' }) => Promise<{ input: `0x${string}`; hash: `0x${string}` }>;
  estimateGas: ({ to, data }: { to: '0x${string}'; data: '0x${string}' }) => Promise<bigint>;
}

interface MockL1TxUtils {
  sendAndMonitorTransaction: (
    request: L1TxRequest,
    _gasConfig?: Partial<L1TxUtilsConfig>,
  ) => Promise<{ receipt: TransactionReceipt; gasPrice: GasPrice }>;
}

interface MockRollupContractWrite {
  propose: (
    args: readonly [`0x${string}`, `0x${string}`] | readonly [`0x${string}`, `0x${string}`, `0x${string}`],
    options: { account: PrivateKeyAccount },
  ) => Promise<`0x${string}`>;
}

interface MockRollupContractRead {
  archive: () => Promise<`0x${string}`>;
  getCurrentSlot(): Promise<bigint>;
  validateHeader: (
    args: readonly [
      `0x${string}`,
      ViemSignature[],
      `0x${string}`,
      bigint,
      { ignoreDA: boolean; ignoreSignatures: boolean },
    ],
  ) => Promise<void>;
}

class MockRollupContract {
  constructor(public write: MockRollupContractWrite, public read: MockRollupContractRead, public abi = RollupAbi) {}
  get address() {
    return mockRollupAddress;
  }
}

const BLOB_SINK_PORT = 5052;
const BLOB_SINK_URL = `http://localhost:${BLOB_SINK_PORT}`;

describe('L1Publisher', () => {
  let rollupContractRead: MockProxy<MockRollupContractRead>;
  let rollupContractWrite: MockProxy<MockRollupContractWrite>;
  let rollupContract: MockRollupContract;

  let publicClient: MockProxy<MockPublicClient>;
  let l1TxUtils: MockProxy<MockL1TxUtils>;

  let proposeTxHash: `0x${string}`;
  let proposeTxReceipt: GetTransactionReceiptReturnType;
  let l2Block: L2Block;

  let header: Buffer;
  let archive: Buffer;
  let blockHash: Buffer;
  let body: Buffer;

  let blobSinkClient: HttpBlobSinkClient;
  let mockBlobSinkServer: Server | undefined = undefined;

  // An l1 publisher with some private methods exposed
  let publisher: L1Publisher;

  const GAS_GUESS = 300_000n;

  beforeEach(() => {
    mockBlobSinkServer = undefined;
    blobSinkClient = new HttpBlobSinkClient(BLOB_SINK_URL);

    l2Block = L2Block.random(42);

    header = l2Block.header.toBuffer();
    archive = l2Block.archive.root.toBuffer();
    blockHash = l2Block.header.hash().toBuffer();
    body = l2Block.body.toBuffer();

    proposeTxHash = `0x${Buffer.from('txHashPropose').toString('hex')}`; // random tx hash

    proposeTxReceipt = {
      transactionHash: proposeTxHash,
      status: 'success',
      logs: [],
    } as unknown as GetTransactionReceiptReturnType;

    rollupContractWrite = mock<MockRollupContractWrite>();
    rollupContractRead = mock<MockRollupContractRead>();
    rollupContract = new MockRollupContract(rollupContractWrite, rollupContractRead);

    publicClient = mock<MockPublicClient>();
    l1TxUtils = mock<MockL1TxUtils>();
    const config = {
      blobSinkUrl: BLOB_SINK_URL,
      l1RpcUrl: `http://127.0.0.1:8545`,
      l1ChainId: 1,
      publisherPrivateKey: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`,
      l1Contracts: { rollupAddress: EthAddress.ZERO.toString() },
      l1PublishRetryIntervalMS: 1,
      ethereumSlotDuration: getL1ContractsConfigEnvVars().ethereumSlotDuration,
      ...defaultL1TxUtilsConfig,
    } as unknown as TxSenderConfig &
      PublisherConfig &
      Pick<L1ContractsConfig, 'ethereumSlotDuration'> &
      L1TxUtilsConfig;

    publisher = new L1Publisher(config, { telemetry: new NoopTelemetryClient(), blobSinkClient });

    (publisher as any)['rollupContract'] = rollupContract;
    (publisher as any)['publicClient'] = publicClient;
    (publisher as any)['l1TxUtils'] = l1TxUtils;
    publisher as any;

    rollupContractRead.getCurrentSlot.mockResolvedValue(l2Block.header.globalVariables.slotNumber.toBigInt());
    publicClient.getBlock.mockResolvedValue({ timestamp: 12n });
    publicClient.estimateGas.mockResolvedValue(GAS_GUESS);
    l1TxUtils.sendAndMonitorTransaction.mockResolvedValue({
      receipt: proposeTxReceipt,
      gasPrice: { maxFeePerGas: 1n, maxPriorityFeePerGas: 1n },
    });
    (l1TxUtils as any).estimateGas.mockResolvedValue(GAS_GUESS);
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
        Blob.fromBuffer(Buffer.from(b.blob.data)),
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

  it('publishes and propose l2 block to l1', async () => {
    rollupContractRead.archive.mockResolvedValue(l2Block.header.lastArchive.root.toString() as `0x${string}`);
    rollupContractWrite.propose.mockResolvedValueOnce(proposeTxHash);

    const kzg = Blob.getViemKzgInstance();

    const expectedBlobs = Blob.getBlobs(l2Block.body.toBlobFields());

    // Check the blobs were forwarded to the blob sink service
    const sendToBlobSinkSpy = jest.spyOn(publisher as any, 'sendBlobsToBlobSink');

    // Expect the blob sink server to receive the blobs
    await runBlobSinkServer(expectedBlobs);

    const result = await publisher.proposeL2Block(l2Block);

    expect(result).toEqual(true);

    const blobInput = Blob.getEthBlobEvaluationInputs(expectedBlobs);

    const args = [
      {
        header: `0x${header.toString('hex')}`,
        archive: `0x${archive.toString('hex')}`,
        blockHash: `0x${blockHash.toString('hex')}`,
        oracleInput: {
          feeAssetPriceModifier: 0n,
          provingCostModifier: 0n,
        },
        txHashes: [],
      },
      [],
      `0x${body.toString('hex')}`,
      blobInput,
    ] as const;
    expect(l1TxUtils.sendAndMonitorTransaction).toHaveBeenCalledWith(
      {
        to: mockRollupAddress,
        data: encodeFunctionData({ abi: rollupContract.abi, functionName: 'propose', args }),
      },
      { fixedGas: GAS_GUESS + L1Publisher.PROPOSE_GAS_GUESS },
      { blobs: expectedBlobs.map(b => b.dataWithZeros), kzg },
    );

    expect(sendToBlobSinkSpy).toHaveBeenCalledTimes(1);
    // If this does not return true, then the mocked server will have errored, and
    // the expects that run there will have failed
    const returnValuePromise = sendToBlobSinkSpy.mock.results[0].value;
    expect(await returnValuePromise).toBe(true);
  });

  it('does not retry if sending a propose tx fails', async () => {
    rollupContractRead.archive.mockResolvedValue(l2Block.header.lastArchive.root.toString() as `0x${string}`);
    l1TxUtils.sendAndMonitorTransaction
      .mockRejectedValueOnce(new Error())
      .mockResolvedValueOnce({ receipt: proposeTxReceipt, gasPrice: { maxFeePerGas: 1n, maxPriorityFeePerGas: 1n } });

    const result = await publisher.proposeL2Block(l2Block);

    expect(result).toEqual(false);
  });

  it('does not retry if simulating a publish and propose tx fails', async () => {
    rollupContractRead.archive.mockResolvedValue(l2Block.header.lastArchive.root.toString() as `0x${string}`);
    rollupContractRead.validateHeader.mockRejectedValueOnce(new Error('Test error'));

    await expect(publisher.proposeL2Block(l2Block)).rejects.toThrow();

    expect(rollupContractRead.validateHeader).toHaveBeenCalledTimes(1);
  });

  it('does not retry if sending a publish and propose tx fails', async () => {
    rollupContractRead.archive.mockResolvedValue(l2Block.header.lastArchive.root.toString() as `0x${string}`);
    l1TxUtils.sendAndMonitorTransaction
      .mockRejectedValueOnce(new Error())
      .mockResolvedValueOnce({ receipt: proposeTxReceipt, gasPrice: { maxFeePerGas: 1n, maxPriorityFeePerGas: 1n } });

    const result = await publisher.proposeL2Block(l2Block);

    expect(result).toEqual(false);
  });

  it('returns false if publish and propose tx reverts', async () => {
    rollupContractRead.archive.mockResolvedValue(l2Block.header.lastArchive.root.toString() as `0x${string}`);
    l1TxUtils.sendAndMonitorTransaction.mockResolvedValueOnce({
      receipt: { ...proposeTxReceipt, status: 'reverted' },
      gasPrice: { maxFeePerGas: 1n, maxPriorityFeePerGas: 1n },
    });

    const result = await publisher.proposeL2Block(l2Block);

    expect(result).toEqual(false);
  });

  it('returns false if propose tx reverts', async () => {
    rollupContractRead.archive.mockResolvedValue(l2Block.header.lastArchive.root.toString() as `0x${string}`);

    l1TxUtils.sendAndMonitorTransaction.mockResolvedValueOnce({
      receipt: { ...proposeTxReceipt, status: 'reverted' },
      gasPrice: { maxFeePerGas: 1n, maxPriorityFeePerGas: 1n },
    });

    const result = await publisher.proposeL2Block(l2Block);

    expect(result).toEqual(false);
  });

  it('returns false if sending publish and progress tx is interrupted', async () => {
    rollupContractRead.archive.mockResolvedValue(l2Block.header.lastArchive.root.toString() as `0x${string}`);
    l1TxUtils.sendAndMonitorTransaction.mockImplementationOnce(
      () =>
        sleep(10, { receipt: proposeTxReceipt, gasPrice: { maxFeePerGas: 1n, maxPriorityFeePerGas: 1n } }) as Promise<{
          receipt: TransactionReceipt;
          gasPrice: GasPrice;
        }>,
    );
    const resultPromise = publisher.proposeL2Block(l2Block);
    publisher.interrupt();
    const result = await resultPromise;

    expect(result).toEqual(false);
    expect(publicClient.getTransactionReceipt).not.toHaveBeenCalled();
  });

  it('returns false if sending propose tx is interrupted', async () => {
    rollupContractRead.archive.mockResolvedValue(l2Block.header.lastArchive.root.toString() as `0x${string}`);
    l1TxUtils.sendAndMonitorTransaction.mockImplementationOnce(
      () =>
        sleep(10, { receipt: proposeTxReceipt, gasPrice: { maxFeePerGas: 1n, maxPriorityFeePerGas: 1n } }) as Promise<{
          receipt: TransactionReceipt;
          gasPrice: GasPrice;
        }>,
    );

    const resultPromise = publisher.proposeL2Block(l2Block);
    publisher.interrupt();
    const result = await resultPromise;

    expect(result).toEqual(false);
    expect(publicClient.getTransactionReceipt).not.toHaveBeenCalled();
  });
});
