import {
  type Body,
  EncryptedL2BlockL2Logs,
  EncryptedNoteL2BlockL2Logs,
  L2Block,
  LogType,
  UnencryptedL2BlockL2Logs,
} from '@aztec/circuit-types';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { sleep } from '@aztec/foundation/sleep';
import { AvailabilityOracleAbi, type InboxAbi, RollupAbi } from '@aztec/l1-artifacts';

import { type MockProxy, mock, mockFn } from 'jest-mock-extended';
import {
  type Chain,
  type Hex,
  type HttpTransport,
  type Log,
  type PublicClient,
  type Transaction,
  encodeFunctionData,
  toHex,
} from 'viem';

import { Archiver } from './archiver.js';
import { type ArchiverDataStore } from './archiver_store.js';
import { type ArchiverInstrumentation } from './instrumentation.js';
import { MemoryArchiverStore } from './memory_archiver_store/memory_archiver_store.js';

const mockTxHash = () => Fr.random().toString();

describe('Archiver', () => {
  const rollupAddress = EthAddress.ZERO;
  const inboxAddress = EthAddress.ZERO;
  const registryAddress = EthAddress.ZERO;
  const availabilityOracleAddress = EthAddress.ZERO;
  const blockNumbers = [1, 2, 3];

  let publicClient: MockProxy<PublicClient<HttpTransport, Chain>>;
  let instrumentation: MockProxy<ArchiverInstrumentation>;
  let archiverStore: ArchiverDataStore;
  let proverId: Fr;
  let now: number;

  let archiver: Archiver;

  let mockLogStore: Array<
    | ReturnType<typeof makeMessageSentEvent>
    | ReturnType<typeof makeTxsPublishedEvent>
    | ReturnType<typeof makeL2BlockProposedEvent>
    | ReturnType<typeof makeProofVerifiedEvent>
  >;

  let mockTxStore: Record<string, Transaction<bigint, number>>;

  beforeEach(() => {
    now = +new Date();
    mockLogStore = [];
    mockTxStore = {};
    publicClient = mock<PublicClient<HttpTransport, Chain>>({
      getBlock: ((args: any) => ({
        timestamp: args.blockNumber * 1000n + BigInt(now),
      })) as any,
      getLogs: mockFn().mockImplementation(({ fromBlock, toBlock, event: { name } }) => {
        return mockLogStore
          .filter(log => log.blockNumber >= fromBlock && log.blockNumber <= toBlock && log.eventName === name)
          .sort((a, b) => Number(a.blockNumber - b.blockNumber));
      }),
      getTransaction: mockFn().mockImplementation(({ hash }) => {
        return mockTxStore[hash];
      }),
    });
    instrumentation = mock({ isEnabled: () => true });
    archiverStore = new MemoryArchiverStore(1000);
    proverId = Fr.random();
  });

  afterEach(async () => {
    await archiver?.stop();
  });

  it('can start, sync and stop and handle l1 to l2 messages and logs', async () => {
    archiver = new Archiver(
      publicClient,
      rollupAddress,
      availabilityOracleAddress,
      inboxAddress,
      registryAddress,
      archiverStore,
      1000,
      100n,
      instrumentation,
    );

    let latestBlockNum = await archiver.getBlockNumber();
    expect(latestBlockNum).toEqual(0);

    const blocks = blockNumbers.map(x => L2Block.random(x, 4, x, x + 1, 2, 2));
    blocks.forEach((b, i) => (b.header.globalVariables.timestamp = new Fr(now + 1000 * (i + 1))));
    const publishTxs = blocks.map(block => block.body).map(b => makePublishTx(b));
    const rollupTxs = blocks.map(b => makeRollupTx(b));

    publicClient.getBlockNumber.mockResolvedValueOnce(2500n).mockResolvedValueOnce(2600n).mockResolvedValue(2700n);

    const proofVerifierTxHash = mockTxHash();
    mockLogStore.push(
      makeMessageSentEvent(mockTxHash(), 98n, 1n, 0n),
      makeMessageSentEvent(mockTxHash(), 99n, 1n, 1n),

      makeTxsPublishedEvent(publishTxs[0].hash, 101n, blocks[0].body.getTxsEffectsHash()),

      makeL2BlockProposedEvent(rollupTxs[0].hash, 101n, 1n),

      makeProofVerifiedEvent(proofVerifierTxHash, 102n, 1n, proverId),
    );

    mockLogStore.push(
      makeMessageSentEvent(mockTxHash(), 2504n, 2n, 0n),
      makeMessageSentEvent(mockTxHash(), 2505n, 2n, 1n),
      makeMessageSentEvent(mockTxHash(), 2505n, 2n, 2n),
      makeMessageSentEvent(mockTxHash(), 2506n, 3n, 1n),

      makeTxsPublishedEvent(publishTxs[1].hash, 2510n, blocks[1].body.getTxsEffectsHash()),
      makeTxsPublishedEvent(publishTxs[2].hash, 2520n, blocks[2].body.getTxsEffectsHash()),

      makeL2BlockProposedEvent(rollupTxs[1].hash, 2510n, 2n),
      makeL2BlockProposedEvent(rollupTxs[2].hash, 2520n, 3n),
    );

    publishTxs.forEach(tx => {
      mockTxStore[tx.hash] = tx;
    });
    rollupTxs.forEach(tx => {
      mockTxStore[tx.hash] = tx;
    });

    await archiver.start(false);

    // Wait until block 3 is processed. If this won't happen the test will fail with timeout.
    while ((await archiver.getBlockNumber()) !== 3) {
      await sleep(100);
    }

    latestBlockNum = await archiver.getBlockNumber();
    expect(latestBlockNum).toEqual(3);

    // L1 to L2 messages
    {
      // Checks that I get correct amount of sequenced new messages for L2 blocks 1 and 2
      let l1ToL2Messages = await archiver.getL1ToL2Messages(1n);
      expect(l1ToL2Messages.length).toEqual(2);

      l1ToL2Messages = await archiver.getL1ToL2Messages(2n);
      expect(l1ToL2Messages.length).toEqual(3);

      // Check that I cannot get messages for block 3 because there is a message gap (message with index 0 was not
      // processed) --> since we are fetching events individually for each message there is a message gap check when
      // fetching the messages for the block in order to ensure that all the messages were really obtained. E.g. if we
      // receive messages with indices 0, 1, 2, 4, 5, 6 we can be sure there is an issue because we are missing message
      // with index 3.
      await expect(async () => {
        await archiver.getL1ToL2Messages(3n);
      }).rejects.toThrow(`L1 to L2 message gap found in block ${3}`);
    }

    // Expect logs to correspond to what is set by L2Block.random(...)
    const noteEncryptedLogs = await archiver.getLogs(1, 100, LogType.NOTEENCRYPTED);
    expect(noteEncryptedLogs.length).toEqual(blockNumbers.length);

    for (const [index, x] of blockNumbers.entries()) {
      const expectedTotalNumEncryptedLogs = 4 * x * 2;
      const totalNumEncryptedLogs = EncryptedNoteL2BlockL2Logs.unrollLogs([noteEncryptedLogs[index]]).length;
      expect(totalNumEncryptedLogs).toEqual(expectedTotalNumEncryptedLogs);
    }

    const encryptedLogs = await archiver.getLogs(1, 100, LogType.ENCRYPTED);
    expect(encryptedLogs.length).toEqual(blockNumbers.length);

    for (const [index, x] of blockNumbers.entries()) {
      const expectedTotalNumEncryptedLogs = 4 * x * 2;
      const totalNumEncryptedLogs = EncryptedL2BlockL2Logs.unrollLogs([encryptedLogs[index]]).length;
      expect(totalNumEncryptedLogs).toEqual(expectedTotalNumEncryptedLogs);
    }

    const unencryptedLogs = await archiver.getLogs(1, 100, LogType.UNENCRYPTED);
    expect(unencryptedLogs.length).toEqual(blockNumbers.length);

    blockNumbers.forEach((x, index) => {
      const expectedTotalNumUnencryptedLogs = 4 * (x + 1) * 2;
      const totalNumUnencryptedLogs = UnencryptedL2BlockL2Logs.unrollLogs([unencryptedLogs[index]]).length;
      expect(totalNumUnencryptedLogs).toEqual(expectedTotalNumUnencryptedLogs);
    });

    // Check last proven block number
    const provenBlockNumber = await archiver.getProvenBlockNumber();
    expect(provenBlockNumber).toEqual(1);

    // Check getting only proven blocks
    expect((await archiver.getBlocks(1, 100)).map(b => b.number)).toEqual([1, 2, 3]);
    expect((await archiver.getBlocks(1, 100, true)).map(b => b.number)).toEqual([1]);

    // Check instrumentation of proven blocks
    expect(instrumentation.processProofsVerified).toHaveBeenCalledWith([
      {
        delay: 1000n,
        l1BlockNumber: 102n,
        l2BlockNumber: 1n,
        proverId: proverId.toString(),
        txHash: proofVerifierTxHash,
      },
    ]);
  }, 10_000);

  it('does not sync past current block number', async () => {
    const numL2BlocksInTest = 2;
    archiver = new Archiver(
      publicClient,
      rollupAddress,
      availabilityOracleAddress,
      inboxAddress,
      registryAddress,
      archiverStore,
      1000,
      100n,
      instrumentation,
    );

    let latestBlockNum = await archiver.getBlockNumber();
    expect(latestBlockNum).toEqual(0);

    const blocks = blockNumbers.map(x => L2Block.random(x, 4, x, x + 1, 2, 2));

    const publishTxs = blocks.map(block => block.body).map(makePublishTx);
    const rollupTxs = blocks.map(makeRollupTx);

    // Here we set the current L1 block number to 102. L1 to L2 messages after this should not be read.
    publicClient.getBlockNumber.mockResolvedValue(102n);

    mockLogStore.push(
      makeMessageSentEvent(Fr.random().toString(), 66n, 1n, 0n),
      makeMessageSentEvent(Fr.random().toString(), 68n, 1n, 1n),

      makeTxsPublishedEvent(publishTxs[0].hash, 70n, blocks[0].body.getTxsEffectsHash()),
      makeTxsPublishedEvent(publishTxs[1].hash, 80n, blocks[1].body.getTxsEffectsHash()),

      makeL2BlockProposedEvent(rollupTxs[0].hash, 70n, 1n),
      makeL2BlockProposedEvent(rollupTxs[1].hash, 80n, 2n),
    );

    publishTxs.slice(0, numL2BlocksInTest).forEach(tx => {
      mockTxStore[tx.hash] = tx;
    });
    rollupTxs.slice(0, numL2BlocksInTest).forEach(tx => {
      mockTxStore[tx.hash] = tx;
    });

    await archiver.start(false);

    // Wait until block 3 is processed. If this won't happen the test will fail with timeout.
    while ((await archiver.getBlockNumber()) !== numL2BlocksInTest) {
      await sleep(100);
    }

    latestBlockNum = await archiver.getBlockNumber();
    expect(latestBlockNum).toEqual(numL2BlocksInTest);
  }, 10_000);
});

/**
 * Makes a fake L2BlockProposed event for testing purposes.
 * @param l1BlockNum - L1 block number.
 * @param l2BlockNum - L2 Block number.
 * @returns An L2BlockProposed event log.
 */
function makeL2BlockProposedEvent(transactionHash: Hex, l1BlockNum: bigint, l2BlockNum: bigint) {
  return {
    blockNumber: l1BlockNum,
    args: { blockNumber: l2BlockNum },
    transactionHash,
    eventName: 'L2BlockProposed',
  } as Log<bigint, number, false, undefined, true, typeof RollupAbi, 'L2BlockProposed'>;
}

/**
 * Makes a fake TxsPublished event for testing purposes.
 * @param l1BlockNum - L1 block number.
 * @param txsEffectsHash - txsEffectsHash for the body.
 * @returns A TxsPublished event log.
 */
function makeTxsPublishedEvent(transactionHash: Hex, l1BlockNum: bigint, txsEffectsHash: Buffer) {
  return {
    blockNumber: l1BlockNum,
    args: {
      txsEffectsHash: txsEffectsHash.toString('hex'),
    },
    eventName: 'TxsPublished',
    transactionHash,
  } as Log<bigint, number, false, undefined, true, typeof AvailabilityOracleAbi, 'TxsPublished'>;
}

/**
 * Makes fake L1ToL2 MessageSent events for testing purposes.
 * @param l1BlockNum - L1 block number.
 * @param l2BlockNumber - The L2 block number of in which the message was included.
 * @returns MessageSent event logs.
 */
function makeMessageSentEvent(transactionHash: Hex, l1BlockNum: bigint, l2BlockNumber: bigint, index: bigint) {
  return {
    blockNumber: l1BlockNum,
    args: {
      l2BlockNumber,
      index,
      hash: Fr.random().toString(),
    },
    transactionHash,
    eventName: 'MessageSent',
  } as Log<bigint, number, false, undefined, true, typeof InboxAbi, 'MessageSent'>;
}

function makeProofVerifiedEvent(transactionHash: Hex, l1BlockNum: bigint, l2BlockNumber: bigint, proverId: Fr) {
  return {
    blockNumber: l1BlockNum,
    args: {
      blockNumber: l2BlockNumber,
      proverId: proverId.toString(),
    },
    eventName: 'L2ProofVerified',
    transactionHash,
  } as Log<bigint, number, false, undefined, true, typeof RollupAbi, 'L2ProofVerified'>;
}

/**
 * Makes a fake rollup tx for testing purposes.
 * @param block - The L2Block.
 * @returns A fake tx with calldata that corresponds to calling process in the Rollup contract.
 */
function makeRollupTx(l2Block: L2Block) {
  const header = toHex(l2Block.header.toBuffer());
  const archive = toHex(l2Block.archive.root.toBuffer());
  const blockHash = toHex(l2Block.header.hash().toBuffer());
  const input = encodeFunctionData({
    abi: RollupAbi,
    functionName: 'propose',
    args: [header, archive, blockHash],
  });
  return { input, hash: mockTxHash() } as Transaction<bigint, number>;
}

/**
 * Makes a fake availability oracle tx for testing purposes.
 * @param blockBody - The block body posted by the simulated tx.
 * @returns A fake tx with calldata that corresponds to calling publish in the Availability Oracle contract.
 */
function makePublishTx(blockBody: Body) {
  const body = toHex(blockBody.toBuffer());
  const input = encodeFunctionData({
    abi: AvailabilityOracleAbi,
    functionName: 'publish',
    args: [body],
  });
  return { input, hash: mockTxHash() } as Transaction<bigint, number>;
}
