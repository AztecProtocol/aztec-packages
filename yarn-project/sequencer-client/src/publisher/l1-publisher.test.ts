import { L2Block } from '@aztec/circuit-types';
import { EthAddress, Fr } from '@aztec/circuits.js';
import { type L1ContractsConfig, getL1ContractsConfigEnvVars } from '@aztec/ethereum';
import { Blob } from '@aztec/foundation/blob';
import { type ViemSignature } from '@aztec/foundation/eth-signature';
import { sleep } from '@aztec/foundation/sleep';
import { RollupAbi } from '@aztec/l1-artifacts';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

import { jest } from '@jest/globals';
import express from 'express';
import { type Server } from 'http';
import { type MockProxy, mock } from 'jest-mock-extended';
import {
  type GetTransactionReceiptReturnType,
  type Kzg,
  type PrivateKeyAccount,
  type SendTransactionReturnType,
  encodeFunctionData,
} from 'viem';

import { type PublisherConfig, type TxSenderConfig } from './config.js';
import { L1Publisher } from './l1-publisher.js';

interface MockPublicClient {
  getTransactionReceipt: ({ hash }: { hash: '0x${string}' }) => Promise<GetTransactionReceiptReturnType>;
  getBlock(): Promise<{ timestamp: bigint }>;
  getTransaction: ({ hash }: { hash: '0x${string}' }) => Promise<{ input: `0x${string}`; hash: `0x${string}` }>;
}

interface MockWalletClient {
  sendTransaction: ({
    data,
    account,
    to,
    blobs,
    kzg,
    maxFeePerBlobGas,
  }: {
    data: '0x${string}';
    account: '0x${string}';
    to: '0x${string}';
    blobs: [Buffer];
    kzg: Kzg;
    maxFeePerBlobGas: bigint;
  }) => Promise<SendTransactionReturnType>;
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
  constructor(
    public read: MockRollupContractRead,
    public abi = RollupAbi,
    public address = EthAddress.fromField(new Fr(1)).toString(),
  ) {}
}

const BLOB_SINK_PORT = 5052;
const BLOB_SINK_URL = `http://localhost:${BLOB_SINK_PORT}`;

describe('L1Publisher', () => {
  let rollupContractRead: MockProxy<MockRollupContractRead>;
  let rollupContract: MockRollupContract;

  let publicClient: MockProxy<MockPublicClient>;
  let walletClient: MockProxy<MockWalletClient>;

  let proposeTxHash: `0x${string}`;
  let proposeTxReceipt: GetTransactionReceiptReturnType;
  let l2Block: L2Block;

  let header: Buffer;
  let archive: Buffer;
  let blockHash: Buffer;
  let body: Buffer;

  let account: PrivateKeyAccount;

  let mockBlobSinkServer: Server | undefined = undefined;

  // An l1 publisher with some private methods exposed
  let publisher: L1Publisher;

  beforeEach(() => {
    mockBlobSinkServer = undefined;

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

    rollupContractRead = mock<MockRollupContractRead>();
    rollupContract = new MockRollupContract(rollupContractRead);

    publicClient = mock<MockPublicClient>();
    walletClient = mock<MockWalletClient>();

    const config = {
      blobSinkUrl: BLOB_SINK_URL,
      l1RpcUrl: `http://127.0.0.1:8545`,
      l1ChainId: 1,
      publisherPrivateKey: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`,
      l1Contracts: {
        rollupAddress: rollupContract.address,
      },
      l1PublishRetryIntervalMS: 1,
      ethereumSlotDuration: getL1ContractsConfigEnvVars().ethereumSlotDuration,
    } as unknown as TxSenderConfig & PublisherConfig & Pick<L1ContractsConfig, 'ethereumSlotDuration'>;

    publisher = new L1Publisher(config, new NoopTelemetryClient());

    (publisher as any)['rollupContract'] = rollupContract;
    (publisher as any)['publicClient'] = publicClient;
    (publisher as any)['walletClient'] = walletClient;

    account = (publisher as any)['account'];

    rollupContractRead.getCurrentSlot.mockResolvedValue(l2Block.header.globalVariables.slotNumber.toBigInt());
    publicClient.getBlock.mockResolvedValue({ timestamp: 12n });
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
  const expectBlobsAreSentToBlobSink = (_blockId: string, blobs: Blob[]) => {
    const sendToBlobSinkSpy = jest.spyOn(publisher as any, 'sendBlobsToBlobSink');

    const app = express();
    app.use(express.json({ limit: '10mb' }));

    app.post('/blob_sidecar', (req, res) => {
      const blobsBuffers = req.body.blobs.map((b: { index: number; blob: { type: string; data: string } }) =>
        Blob.fromBuffer(Buffer.from(b.blob.data)),
      );

      expect(blobsBuffers).toEqual(blobs);
      res.status(200).send();
    });

    mockBlobSinkServer = app.listen(BLOB_SINK_PORT);

    return sendToBlobSinkSpy;
  };

  it('publishes and propose l2 block to l1', async () => {
    rollupContractRead.archive.mockResolvedValue(l2Block.header.lastArchive.root.toString() as `0x${string}`);
    walletClient.sendTransaction.mockResolvedValueOnce(proposeTxHash);

    publicClient.getTransactionReceipt.mockResolvedValueOnce(proposeTxReceipt);

    const blobs = Blob.getBlobs(l2Block.body.toBlobFields());

    const blobInput = Blob.getEthBlobEvaluationInputs(blobs);

    const args = [
      {
        header: `0x${header.toString('hex')}`,
        archive: `0x${archive.toString('hex')}`,
        blockHash: `0x${blockHash.toString('hex')}`,
        txHashes: [],
      },
      [],
      `0x${body.toString('hex')}`,
      blobInput,
    ] as const;

    const data = encodeFunctionData({
      abi: RollupAbi,
      functionName: 'propose',
      args,
    });
    // TODO(md): could probably do this in the beforeEach
    const kzg = Blob.getViemKzgInstance();

    // Check the blobs were forwarded to the blob sink service
    const sendToBlobSinkSpy = expectBlobsAreSentToBlobSink(blockHash.toString('hex'), blobs);

    const result = await publisher.proposeL2Block(l2Block);

    expect(result).toEqual(true);
    expect(walletClient.sendTransaction).toHaveBeenCalledWith({
      data,
      account,
      to: rollupContract.address,
      blobs: blobs.map(blob => blob.data),
      kzg,
      maxFeePerBlobGas: 10000000000n,
    });
    expect(publicClient.getTransactionReceipt).toHaveBeenCalledWith({ hash: proposeTxHash });

    expect(sendToBlobSinkSpy).toHaveBeenCalledTimes(1);
    // If this does not return true, then the mocked server will have errored, and
    // the expects that run there will have failed
    expect(sendToBlobSinkSpy).toHaveReturnedWith(Promise.resolve(true));
  });

  it('does not retry if sending a propose tx fails', async () => {
    rollupContractRead.archive.mockResolvedValue(l2Block.header.lastArchive.root.toString() as `0x${string}`);
    walletClient.sendTransaction.mockRejectedValueOnce(new Error()).mockResolvedValueOnce(proposeTxHash);

    const result = await publisher.proposeL2Block(l2Block);

    expect(result).toEqual(false);
    expect(walletClient.sendTransaction).toHaveBeenCalledTimes(1);
  });

  it('does not retry if simulating a publish and propose tx fails', async () => {
    rollupContractRead.archive.mockResolvedValue(l2Block.header.lastArchive.root.toString() as `0x${string}`);
    rollupContractRead.validateHeader.mockRejectedValueOnce(new Error('Test error'));

    await expect(publisher.proposeL2Block(l2Block)).rejects.toThrow();

    expect(rollupContractRead.validateHeader).toHaveBeenCalledTimes(1);
    expect(walletClient.sendTransaction).toHaveBeenCalledTimes(0);
  });

  it('does not retry if sending a publish and propose tx fails', async () => {
    rollupContractRead.archive.mockResolvedValue(l2Block.header.lastArchive.root.toString() as `0x${string}`);
    walletClient.sendTransaction.mockRejectedValueOnce(new Error());

    const result = await publisher.proposeL2Block(l2Block);

    expect(result).toEqual(false);
    expect(walletClient.sendTransaction).toHaveBeenCalledTimes(1);
  });

  it('retries if fetching the receipt fails (propose)', async () => {
    rollupContractRead.archive.mockResolvedValue(l2Block.header.lastArchive.root.toString() as `0x${string}`);
    walletClient.sendTransaction.mockResolvedValueOnce(proposeTxHash);
    publicClient.getTransactionReceipt.mockRejectedValueOnce(new Error()).mockResolvedValueOnce(proposeTxReceipt);

    const result = await publisher.proposeL2Block(l2Block);

    expect(result).toEqual(true);
    expect(publicClient.getTransactionReceipt).toHaveBeenCalledTimes(2);
  });

  it('retries if fetching the receipt fails (publish propose)', async () => {
    rollupContractRead.archive.mockResolvedValue(l2Block.header.lastArchive.root.toString() as `0x${string}`);
    walletClient.sendTransaction.mockResolvedValueOnce(proposeTxHash as `0x${string}`);
    publicClient.getTransactionReceipt.mockRejectedValueOnce(new Error()).mockResolvedValueOnce(proposeTxReceipt);

    const result = await publisher.proposeL2Block(l2Block);

    expect(result).toEqual(true);
    expect(publicClient.getTransactionReceipt).toHaveBeenCalledTimes(2);
  });

  it('returns false if publish and propose tx reverts', async () => {
    rollupContractRead.archive.mockResolvedValue(l2Block.header.lastArchive.root.toString() as `0x${string}`);
    walletClient.sendTransaction.mockResolvedValueOnce(proposeTxHash);
    publicClient.getTransactionReceipt.mockResolvedValueOnce({ ...proposeTxReceipt, status: 'reverted' });

    const result = await publisher.proposeL2Block(l2Block);

    expect(result).toEqual(false);
  });

  it('returns false if propose tx reverts', async () => {
    rollupContractRead.archive.mockResolvedValue(l2Block.header.lastArchive.root.toString() as `0x${string}`);

    publicClient.getTransactionReceipt.mockResolvedValueOnce({ ...proposeTxReceipt, status: 'reverted' });

    const result = await publisher.proposeL2Block(l2Block);

    expect(result).toEqual(false);
  });

  it('returns false if sending publish and progress tx is interrupted', async () => {
    rollupContractRead.archive.mockResolvedValue(l2Block.header.lastArchive.root.toString() as `0x${string}`);
    walletClient.sendTransaction.mockImplementationOnce(() => sleep(10, proposeTxHash) as Promise<`0x${string}`>);

    const resultPromise = publisher.proposeL2Block(l2Block);
    publisher.interrupt();
    const result = await resultPromise;

    expect(result).toEqual(false);
    expect(publicClient.getTransactionReceipt).not.toHaveBeenCalled();
  });

  it('returns false if sending propose tx is interrupted', async () => {
    rollupContractRead.archive.mockResolvedValue(l2Block.header.lastArchive.root.toString() as `0x${string}`);
    walletClient.sendTransaction.mockImplementationOnce(() => sleep(10, proposeTxHash) as Promise<`0x${string}`>);

    const resultPromise = publisher.proposeL2Block(l2Block);
    publisher.interrupt();
    const result = await resultPromise;

    expect(result).toEqual(false);
    expect(publicClient.getTransactionReceipt).not.toHaveBeenCalled();
  });
});
