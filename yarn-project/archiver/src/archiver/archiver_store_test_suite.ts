import { InboxLeaf, L2Block, LogId, LogType, TxHash, wrapInBlock } from '@aztec/circuit-types';
import '@aztec/circuit-types/jest';
import {
  AztecAddress,
  type ContractClassPublic,
  type ContractInstanceWithAddress,
  Fr,
  INITIAL_L2_BLOCK_NUM,
  L1_TO_L2_MSG_SUBTREE_HEIGHT,
  MAX_NULLIFIERS_PER_TX,
  SerializableContractInstance,
  computePublicBytecodeCommitment,
} from '@aztec/circuits.js';
import {
  makeContractClassPublic,
  makeExecutablePrivateFunctionWithMembershipProof,
  makeUnconstrainedFunctionWithMembershipProof,
} from '@aztec/circuits.js/testing';
import { toBufferBE } from '@aztec/foundation/bigint-buffer';
import { times } from '@aztec/foundation/collection';
import { randomBytes, randomInt } from '@aztec/foundation/crypto';

import { type ArchiverDataStore, type ArchiverL1SynchPoint } from './archiver_store.js';
import { type L1Published } from './structs/published.js';

/**
 * @param testName - The name of the test suite.
 * @param getStore - Returns an instance of a store that's already been initialized.
 */
export function describeArchiverDataStore(testName: string, getStore: () => ArchiverDataStore) {
  describe(testName, () => {
    let store: ArchiverDataStore;
    let blocks: L1Published<L2Block>[];
    const blockTests: [number, number, () => L1Published<L2Block>[]][] = [
      [1, 1, () => blocks.slice(0, 1)],
      [10, 1, () => blocks.slice(9, 10)],
      [1, 10, () => blocks.slice(0, 10)],
      [2, 5, () => blocks.slice(1, 6)],
      [5, 2, () => blocks.slice(4, 6)],
    ];

    const makeL1Published = (block: L2Block, l1BlockNumber: number): L1Published<L2Block> => ({
      data: block,
      l1: {
        blockNumber: BigInt(l1BlockNumber),
        blockHash: `0x${l1BlockNumber}`,
        timestamp: BigInt(l1BlockNumber * 1000),
      },
    });

    beforeEach(() => {
      store = getStore();
      blocks = times(10, i => makeL1Published(L2Block.random(i + 1), i + 10));
    });

    describe('addBlocks', () => {
      it('returns success when adding blocks', async () => {
        await expect(store.addBlocks(blocks)).resolves.toBe(true);
      });

      it('allows duplicate blocks', async () => {
        await store.addBlocks(blocks);
        await expect(store.addBlocks(blocks)).resolves.toBe(true);
      });
    });

    describe('unwindBlocks', () => {
      it('unwinding blocks will remove blocks from the chain', async () => {
        await store.addBlocks(blocks);
        const blockNumber = await store.getSynchedL2BlockNumber();

        expect(await store.getBlocks(blockNumber, 1)).toEqual([blocks[blocks.length - 1]]);

        await store.unwindBlocks(blockNumber, 1);

        expect(await store.getSynchedL2BlockNumber()).toBe(blockNumber - 1);
        expect(await store.getBlocks(blockNumber, 1)).toEqual([]);
      });

      it('can unwind multiple empty blocks', async () => {
        const emptyBlocks = times(10, i => makeL1Published(L2Block.random(i + 1, 0), i + 10));
        await store.addBlocks(emptyBlocks);
        expect(await store.getSynchedL2BlockNumber()).toBe(10);

        await store.unwindBlocks(10, 3);
        expect(await store.getSynchedL2BlockNumber()).toBe(7);
        expect((await store.getBlocks(1, 10)).map(b => b.data.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
      });

      it('refuses to unwind blocks if the tip is not the last block', async () => {
        await store.addBlocks(blocks);
        await expect(store.unwindBlocks(5, 1)).rejects.toThrow(/can only unwind blocks from the tip/i);
      });
    });

    describe('getBlocks', () => {
      beforeEach(async () => {
        await store.addBlocks(blocks);
      });

      it.each(blockTests)('retrieves previously stored blocks', async (start, limit, getExpectedBlocks) => {
        await expect(store.getBlocks(start, limit)).resolves.toEqual(getExpectedBlocks());
      });

      it('returns an empty array if no blocks are found', async () => {
        await expect(store.getBlocks(12, 1)).resolves.toEqual([]);
      });

      it('throws an error if limit is invalid', async () => {
        await expect(store.getBlocks(1, 0)).rejects.toThrow('Invalid limit: 0');
      });

      it('throws an error if `from` it is out of range', async () => {
        await expect(store.getBlocks(INITIAL_L2_BLOCK_NUM - 100, 1)).rejects.toThrow('Invalid start: -99');
      });
    });

    describe('getSyncedL2BlockNumber', () => {
      it('returns the block number before INITIAL_L2_BLOCK_NUM if no blocks have been added', async () => {
        await expect(store.getSynchedL2BlockNumber()).resolves.toEqual(INITIAL_L2_BLOCK_NUM - 1);
      });

      it("returns the most recently added block's number", async () => {
        await store.addBlocks(blocks);
        await expect(store.getSynchedL2BlockNumber()).resolves.toEqual(blocks.at(-1)!.data.number);
      });
    });

    describe('getSynchPoint', () => {
      it('returns undefined if no blocks have been added', async () => {
        await expect(store.getSynchPoint()).resolves.toEqual({
          blocksSynchedTo: undefined,
          messagesSynchedTo: undefined,
        } satisfies ArchiverL1SynchPoint);
      });

      it('returns the L1 block number in which the most recent L2 block was published', async () => {
        await store.addBlocks(blocks);
        await expect(store.getSynchPoint()).resolves.toEqual({
          blocksSynchedTo: 19n,
          messagesSynchedTo: undefined,
        } satisfies ArchiverL1SynchPoint);
      });

      it('returns the L1 block number that most recently added messages from inbox', async () => {
        await store.addL1ToL2Messages({
          lastProcessedL1BlockNumber: 1n,
          retrievedData: [new InboxLeaf(1n, Fr.ZERO)],
        });
        await expect(store.getSynchPoint()).resolves.toEqual({
          blocksSynchedTo: undefined,
          messagesSynchedTo: 1n,
        } satisfies ArchiverL1SynchPoint);
      });
    });

    describe('addLogs', () => {
      it('adds encrypted & unencrypted logs', async () => {
        const block = blocks[0].data;
        await expect(store.addLogs([block])).resolves.toEqual(true);
      });
    });

    describe('deleteLogs', () => {
      it('deletes encrypted & unencrypted logs', async () => {
        const block = blocks[0].data;
        await store.addBlocks([blocks[0]]);
        await expect(store.addLogs([block])).resolves.toEqual(true);

        expect((await store.getLogs(1, 1, LogType.NOTEENCRYPTED))[0]).toEqual(block.body.noteEncryptedLogs);
        expect((await store.getLogs(1, 1, LogType.ENCRYPTED))[0]).toEqual(block.body.encryptedLogs);
        expect((await store.getLogs(1, 1, LogType.UNENCRYPTED))[0]).toEqual(block.body.unencryptedLogs);

        // This one is a pain for memory as we would never want to just delete memory in the middle.
        await store.deleteLogs([block]);

        expect((await store.getLogs(1, 1, LogType.NOTEENCRYPTED))[0]).toEqual(undefined);
        expect((await store.getLogs(1, 1, LogType.ENCRYPTED))[0]).toEqual(undefined);
        expect((await store.getLogs(1, 1, LogType.UNENCRYPTED))[0]).toEqual(undefined);
      });
    });

    describe.each([
      ['note_encrypted', LogType.NOTEENCRYPTED],
      ['encrypted', LogType.ENCRYPTED],
      ['unencrypted', LogType.UNENCRYPTED],
    ])('getLogs (%s)', (_, logType) => {
      beforeEach(async () => {
        await store.addBlocks(blocks);
        await store.addLogs(blocks.map(b => b.data));
      });

      it.each(blockTests)('retrieves previously stored logs', async (from, limit, getExpectedBlocks) => {
        const expectedLogs = getExpectedBlocks().map(block => {
          switch (logType) {
            case LogType.ENCRYPTED:
              return block.data.body.encryptedLogs;
            case LogType.NOTEENCRYPTED:
              return block.data.body.noteEncryptedLogs;
            case LogType.UNENCRYPTED:
            default:
              return block.data.body.unencryptedLogs;
          }
        });
        const actualLogs = await store.getLogs(from, limit, logType);
        expect(actualLogs[0].txLogs[0]).toEqual(expectedLogs[0].txLogs[0]);
      });
    });

    describe('getTxEffect', () => {
      beforeEach(async () => {
        await store.addLogs(blocks.map(b => b.data));
        await store.addBlocks(blocks);
      });

      it.each([
        () => wrapInBlock(blocks[0].data.body.txEffects[0], blocks[0].data),
        () => wrapInBlock(blocks[9].data.body.txEffects[3], blocks[9].data),
        () => wrapInBlock(blocks[3].data.body.txEffects[1], blocks[3].data),
        () => wrapInBlock(blocks[5].data.body.txEffects[2], blocks[5].data),
        () => wrapInBlock(blocks[1].data.body.txEffects[0], blocks[1].data),
      ])('retrieves a previously stored transaction', async getExpectedTx => {
        const expectedTx = getExpectedTx();
        const actualTx = await store.getTxEffect(expectedTx.data.txHash);
        expect(actualTx).toEqual(expectedTx);
      });

      it('returns undefined if tx is not found', async () => {
        await expect(store.getTxEffect(new TxHash(Fr.random().toBuffer()))).resolves.toBeUndefined();
      });

      it.each([
        () => wrapInBlock(blocks[0].data.body.txEffects[0], blocks[0].data),
        () => wrapInBlock(blocks[9].data.body.txEffects[3], blocks[9].data),
        () => wrapInBlock(blocks[3].data.body.txEffects[1], blocks[3].data),
        () => wrapInBlock(blocks[5].data.body.txEffects[2], blocks[5].data),
        () => wrapInBlock(blocks[1].data.body.txEffects[0], blocks[1].data),
      ])('tries to retrieves a previously stored transaction after deleted', async getExpectedTx => {
        await store.unwindBlocks(blocks.length, blocks.length);

        const expectedTx = getExpectedTx();
        const actualTx = await store.getTxEffect(expectedTx.data.txHash);
        expect(actualTx).toEqual(undefined);
      });

      it('returns undefined if tx is not found', async () => {
        await expect(store.getTxEffect(new TxHash(Fr.random().toBuffer()))).resolves.toBeUndefined();
      });
    });

    describe('L1 to L2 Messages', () => {
      const l2BlockNumber = 13n;
      const l1ToL2MessageSubtreeSize = 2 ** L1_TO_L2_MSG_SUBTREE_HEIGHT;

      const generateBlockMessages = (blockNumber: bigint, numMessages: number) =>
        Array.from(
          { length: numMessages },
          (_, i) => new InboxLeaf(InboxLeaf.smallestIndexFromL2Block(blockNumber) + BigInt(i), Fr.random()),
        );

      it('returns messages in correct order', async () => {
        const msgs = generateBlockMessages(l2BlockNumber, l1ToL2MessageSubtreeSize);
        const shuffledMessages = msgs.slice().sort(() => randomInt(1) - 0.5);
        await store.addL1ToL2Messages({ lastProcessedL1BlockNumber: 100n, retrievedData: shuffledMessages });
        const retrievedMessages = await store.getL1ToL2Messages(l2BlockNumber);

        const expectedLeavesOrder = msgs.map(msg => msg.leaf);
        expect(expectedLeavesOrder).toEqual(retrievedMessages);
      });

      it('throws if it is impossible to sequence messages correctly', async () => {
        const msgs = generateBlockMessages(l2BlockNumber, l1ToL2MessageSubtreeSize - 1);
        // We replace a message with index 4 with a message with index at the end of the tree
        // --> with that there will be a gap and it will be impossible to sequence the
        // end of tree = start of next tree/block - 1
        msgs[4] = new InboxLeaf(InboxLeaf.smallestIndexFromL2Block(l2BlockNumber + 1n) - 1n, Fr.random());

        await store.addL1ToL2Messages({ lastProcessedL1BlockNumber: 100n, retrievedData: msgs });
        await expect(async () => {
          await store.getL1ToL2Messages(l2BlockNumber);
        }).rejects.toThrow(`L1 to L2 message gap found in block ${l2BlockNumber}`);
      });
    });

    describe('contractInstances', () => {
      let contractInstance: ContractInstanceWithAddress;
      const blockNum = 10;

      beforeEach(async () => {
        contractInstance = { ...SerializableContractInstance.random(), address: AztecAddress.random() };
        await store.addContractInstances([contractInstance], blockNum);
      });

      it('returns previously stored contract instances', async () => {
        await expect(store.getContractInstance(contractInstance.address)).resolves.toMatchObject(contractInstance);
      });

      it('returns undefined if contract instance is not found', async () => {
        await expect(store.getContractInstance(AztecAddress.random())).resolves.toBeUndefined();
      });

      it('returns undefined if previously stored contract instances was deleted', async () => {
        await store.deleteContractInstances([contractInstance], blockNum);
        await expect(store.getContractInstance(contractInstance.address)).resolves.toBeUndefined();
      });
    });

    describe('contractClasses', () => {
      let contractClass: ContractClassPublic;
      const blockNum = 10;

      beforeEach(async () => {
        contractClass = makeContractClassPublic();
        await store.addContractClasses(
          [contractClass],
          [computePublicBytecodeCommitment(contractClass.packedBytecode)],
          blockNum,
        );
      });

      it('returns previously stored contract class', async () => {
        await expect(store.getContractClass(contractClass.id)).resolves.toMatchObject(contractClass);
      });

      it('returns undefined if the initial deployed contract class was deleted', async () => {
        await store.deleteContractClasses([contractClass], blockNum);
        await expect(store.getContractClass(contractClass.id)).resolves.toBeUndefined();
      });

      it('returns contract class if later "deployment" class was deleted', async () => {
        await store.addContractClasses(
          [contractClass],
          [computePublicBytecodeCommitment(contractClass.packedBytecode)],
          blockNum + 1,
        );
        await store.deleteContractClasses([contractClass], blockNum + 1);
        await expect(store.getContractClass(contractClass.id)).resolves.toMatchObject(contractClass);
      });

      it('returns undefined if contract class is not found', async () => {
        await expect(store.getContractClass(Fr.random())).resolves.toBeUndefined();
      });

      it('adds new private functions', async () => {
        const fns = times(3, makeExecutablePrivateFunctionWithMembershipProof);
        await store.addFunctions(contractClass.id, fns, []);
        const stored = await store.getContractClass(contractClass.id);
        expect(stored?.privateFunctions).toEqual(fns);
      });

      it('does not duplicate private functions', async () => {
        const fns = times(3, makeExecutablePrivateFunctionWithMembershipProof);
        await store.addFunctions(contractClass.id, fns.slice(0, 1), []);
        await store.addFunctions(contractClass.id, fns, []);
        const stored = await store.getContractClass(contractClass.id);
        expect(stored?.privateFunctions).toEqual(fns);
      });

      it('adds new unconstrained functions', async () => {
        const fns = times(3, makeUnconstrainedFunctionWithMembershipProof);
        await store.addFunctions(contractClass.id, [], fns);
        const stored = await store.getContractClass(contractClass.id);
        expect(stored?.unconstrainedFunctions).toEqual(fns);
      });

      it('does not duplicate unconstrained functions', async () => {
        const fns = times(3, makeUnconstrainedFunctionWithMembershipProof);
        await store.addFunctions(contractClass.id, [], fns.slice(0, 1));
        await store.addFunctions(contractClass.id, [], fns);
        const stored = await store.getContractClass(contractClass.id);
        expect(stored?.unconstrainedFunctions).toEqual(fns);
      });
    });

    describe('getLogsByTags', () => {
      const txsPerBlock = 4;
      const numPrivateFunctionCalls = 3;
      const numPublicFunctionCalls = 1;
      const numEncryptedLogsPerFn = 2;
      const numUnencryptedLogsPerFn = 1;
      const numBlocks = 10;
      let blocks: L1Published<L2Block>[];
      let encryptedLogTags: { [i: number]: { [j: number]: Buffer[] } } = {};
      let unencryptedLogTags: { [i: number]: { [j: number]: Buffer[] } } = {};

      beforeEach(async () => {
        blocks = times(numBlocks, (index: number) => ({
          data: L2Block.random(
            index + 1,
            txsPerBlock,
            numPrivateFunctionCalls,
            numPublicFunctionCalls,
            numEncryptedLogsPerFn,
            numUnencryptedLogsPerFn,
          ),
          l1: { blockNumber: BigInt(index), blockHash: `0x${index}`, timestamp: BigInt(index) },
        }));
        // Last block has the note encrypted log tags of the first tx copied from the previous block
        blocks[numBlocks - 1].data.body.noteEncryptedLogs.txLogs[0].functionLogs.forEach((fnLogs, fnIndex) => {
          fnLogs.logs.forEach((log, logIndex) => {
            const previousLogData =
              blocks[numBlocks - 2].data.body.noteEncryptedLogs.txLogs[0].functionLogs[fnIndex].logs[logIndex].data;
            previousLogData.copy(log.data, 0, 0, 32);
          });
        });
        // Last block has invalid tags in the second tx
        const tooBig = toBufferBE(Fr.MODULUS, 32);
        blocks[numBlocks - 1].data.body.noteEncryptedLogs.txLogs[1].functionLogs.forEach(fnLogs => {
          fnLogs.logs.forEach(log => {
            tooBig.copy(log.data, 0, 0, 32);
          });
        });

        await store.addBlocks(blocks);
        await store.addLogs(blocks.map(b => b.data));

        encryptedLogTags = {};
        unencryptedLogTags = {};
        blocks.forEach((b, blockIndex) => {
          if (!encryptedLogTags[blockIndex]) {
            encryptedLogTags[blockIndex] = {};
          }
          if (!unencryptedLogTags[blockIndex]) {
            unencryptedLogTags[blockIndex] = {};
          }
          b.data.body.noteEncryptedLogs.txLogs.forEach((txLogs, txIndex) => {
            if (!encryptedLogTags[blockIndex][txIndex]) {
              encryptedLogTags[blockIndex][txIndex] = [];
            }
            encryptedLogTags[blockIndex][txIndex].push(...txLogs.unrollLogs().map(log => log.data.subarray(0, 32)));
          });
          b.data.body.unencryptedLogs.txLogs.forEach((txLogs, txIndex) => {
            if (!unencryptedLogTags[blockIndex][txIndex]) {
              unencryptedLogTags[blockIndex][txIndex] = [];
            }
            unencryptedLogTags[blockIndex][txIndex].push(...txLogs.unrollLogs().map(log => log.data.subarray(0, 32)));
          });
        });
      });

      it('is possible to batch request encrypted logs of a tx via tags', async () => {
        // get random tx from any block that's not the last one
        const targetBlockIndex = randomInt(numBlocks - 2);
        const targetTxIndex = randomInt(txsPerBlock);

        const logsByTags = await store.getLogsByTags(
          encryptedLogTags[targetBlockIndex][targetTxIndex].map(buffer => new Fr(buffer)),
        );

        const expectedResponseSize = numPrivateFunctionCalls * numEncryptedLogsPerFn;
        expect(logsByTags.length).toEqual(expectedResponseSize);

        logsByTags.forEach((logsByTag, logIndex) => {
          expect(logsByTag).toHaveLength(1);
          const [scopedLog] = logsByTag;
          expect(scopedLog.txHash).toEqual(blocks[targetBlockIndex].data.body.txEffects[targetTxIndex].txHash);
          expect(scopedLog.logData).toEqual(
            blocks[targetBlockIndex].data.body.noteEncryptedLogs.txLogs[targetTxIndex].unrollLogs()[logIndex].data,
          );
        });
      });

      // TODO: Allow this test when #9835 is fixed and tags can be correctly decoded
      it.skip('is possible to batch request all logs (encrypted and unencrypted) of a tx via tags', async () => {
        // get random tx from any block that's not the last one
        const targetBlockIndex = randomInt(numBlocks - 2);
        const targetTxIndex = randomInt(txsPerBlock);

        const logsByTags = await store.getLogsByTags(
          encryptedLogTags[targetBlockIndex][targetTxIndex]
            .concat(unencryptedLogTags[targetBlockIndex][targetTxIndex])
            .map(buffer => new Fr(buffer)),
        );

        const expectedResponseSize =
          numPrivateFunctionCalls * numEncryptedLogsPerFn + numPublicFunctionCalls * numUnencryptedLogsPerFn;
        expect(logsByTags.length).toEqual(expectedResponseSize);

        const encryptedLogsByTags = logsByTags.slice(0, numPrivateFunctionCalls * numEncryptedLogsPerFn);
        const unencryptedLogsByTags = logsByTags.slice(numPrivateFunctionCalls * numEncryptedLogsPerFn);
        encryptedLogsByTags.forEach((logsByTag, logIndex) => {
          expect(logsByTag).toHaveLength(1);
          const [scopedLog] = logsByTag;
          expect(scopedLog.txHash).toEqual(blocks[targetBlockIndex].data.body.txEffects[targetTxIndex].txHash);
          expect(scopedLog.logData).toEqual(
            blocks[targetBlockIndex].data.body.noteEncryptedLogs.txLogs[targetTxIndex].unrollLogs()[logIndex].data,
          );
        });
        unencryptedLogsByTags.forEach((logsByTag, logIndex) => {
          expect(logsByTag).toHaveLength(1);
          const [scopedLog] = logsByTag;
          expect(scopedLog.logData).toEqual(
            blocks[targetBlockIndex].data.body.unencryptedLogs.txLogs[targetTxIndex].unrollLogs()[logIndex].data,
          );
        });
      });

      it('is possible to batch request logs of different blocks via tags', async () => {
        // get first tx of first block and second tx of second block
        const logsByTags = await store.getLogsByTags(
          [...encryptedLogTags[0][0], ...encryptedLogTags[1][1]].map(buffer => new Fr(buffer)),
        );

        const expectedResponseSize = 2 * numPrivateFunctionCalls * numEncryptedLogsPerFn;
        expect(logsByTags.length).toEqual(expectedResponseSize);

        logsByTags.forEach(logsByTag => expect(logsByTag).toHaveLength(1));
      });

      it('is possible to batch request logs that have the same tag but different content', async () => {
        // get first tx of last block
        const logsByTags = await store.getLogsByTags(encryptedLogTags[numBlocks - 1][0].map(buffer => new Fr(buffer)));

        const expectedResponseSize = numPrivateFunctionCalls * numEncryptedLogsPerFn;
        expect(logsByTags.length).toEqual(expectedResponseSize);

        logsByTags.forEach(logsByTag => {
          expect(logsByTag).toHaveLength(2);
          const [tag0, tag1] = logsByTag.map(scopedLog => new Fr(scopedLog.logData.subarray(0, 32)));
          expect(tag0).toEqual(tag1);
        });
      });

      it('is possible to request logs for non-existing tags and determine their position', async () => {
        // get random tx from any block that's not the last one
        const targetBlockIndex = randomInt(numBlocks - 2);
        const targetTxIndex = randomInt(txsPerBlock);

        const logsByTags = await store.getLogsByTags([
          Fr.random(),
          ...encryptedLogTags[targetBlockIndex][targetTxIndex].slice(1).map(buffer => new Fr(buffer)),
        ]);

        const expectedResponseSize = numPrivateFunctionCalls * numEncryptedLogsPerFn;
        expect(logsByTags.length).toEqual(expectedResponseSize);

        const [emptyLogsByTag, ...populatedLogsByTags] = logsByTags;
        expect(emptyLogsByTag).toHaveLength(0);

        populatedLogsByTags.forEach((logsByTag, logIndex) => {
          expect(logsByTag).toHaveLength(1);
          const [scopedLog] = logsByTag;
          expect(scopedLog.txHash).toEqual(blocks[targetBlockIndex].data.body.txEffects[targetTxIndex].txHash);
          expect(scopedLog.logData).toEqual(
            blocks[targetBlockIndex].data.body.noteEncryptedLogs.txLogs[targetTxIndex].unrollLogs()[logIndex + 1].data,
          );
        });
      });
    });

    describe('getUnencryptedLogs', () => {
      const txsPerBlock = 4;
      const numPublicFunctionCalls = 3;
      const numUnencryptedLogs = 2;
      const numBlocks = 10;
      let blocks: L1Published<L2Block>[];

      beforeEach(async () => {
        blocks = times(numBlocks, (index: number) => ({
          data: L2Block.random(index + 1, txsPerBlock, 2, numPublicFunctionCalls, 2, numUnencryptedLogs),
          l1: { blockNumber: BigInt(index), blockHash: `0x${index}`, timestamp: BigInt(index) },
        }));

        await store.addBlocks(blocks);
        await store.addLogs(blocks.map(b => b.data));
      });

      it('no logs returned if deleted ("txHash" filter param is respected variant)', async () => {
        // get random tx
        const targetBlockIndex = randomInt(numBlocks);
        const targetTxIndex = randomInt(txsPerBlock);
        const targetTxHash = blocks[targetBlockIndex].data.body.txEffects[targetTxIndex].txHash;

        await Promise.all([
          store.unwindBlocks(blocks.length, blocks.length),
          store.deleteLogs(blocks.map(b => b.data)),
        ]);

        const response = await store.getUnencryptedLogs({ txHash: targetTxHash });
        const logs = response.logs;

        expect(response.maxLogsHit).toBeFalsy();
        expect(logs.length).toEqual(0);
      });

      it('"txHash" filter param is respected', async () => {
        // get random tx
        const targetBlockIndex = randomInt(numBlocks);
        const targetTxIndex = randomInt(txsPerBlock);
        const targetTxHash = blocks[targetBlockIndex].data.body.txEffects[targetTxIndex].txHash;

        const response = await store.getUnencryptedLogs({ txHash: targetTxHash });
        const logs = response.logs;

        expect(response.maxLogsHit).toBeFalsy();

        const expectedNumLogs = numPublicFunctionCalls * numUnencryptedLogs;
        expect(logs.length).toEqual(expectedNumLogs);

        const targeBlockNumber = targetBlockIndex + INITIAL_L2_BLOCK_NUM;
        for (const log of logs) {
          expect(log.id.blockNumber).toEqual(targeBlockNumber);
          expect(log.id.txIndex).toEqual(targetTxIndex);
        }
      });

      it('"fromBlock" and "toBlock" filter params are respected', async () => {
        // Set "fromBlock" and "toBlock"
        const fromBlock = 3;
        const toBlock = 7;

        const response = await store.getUnencryptedLogs({ fromBlock, toBlock });
        const logs = response.logs;

        expect(response.maxLogsHit).toBeFalsy();

        const expectedNumLogs = txsPerBlock * numPublicFunctionCalls * numUnencryptedLogs * (toBlock - fromBlock);
        expect(logs.length).toEqual(expectedNumLogs);

        for (const log of logs) {
          const blockNumber = log.id.blockNumber;
          expect(blockNumber).toBeGreaterThanOrEqual(fromBlock);
          expect(blockNumber).toBeLessThan(toBlock);
        }
      });

      it('"contractAddress" filter param is respected', async () => {
        // Get a random contract address from the logs
        const targetBlockIndex = randomInt(numBlocks);
        const targetTxIndex = randomInt(txsPerBlock);
        const targetFunctionLogIndex = randomInt(numPublicFunctionCalls);
        const targetLogIndex = randomInt(numUnencryptedLogs);
        const targetContractAddress =
          blocks[targetBlockIndex].data.body.txEffects[targetTxIndex].unencryptedLogs.functionLogs[
            targetFunctionLogIndex
          ].logs[targetLogIndex].contractAddress;

        const response = await store.getUnencryptedLogs({ contractAddress: targetContractAddress });

        expect(response.maxLogsHit).toBeFalsy();

        for (const extendedLog of response.logs) {
          expect(extendedLog.log.contractAddress.equals(targetContractAddress)).toBeTruthy();
        }
      });

      it('"afterLog" filter param is respected', async () => {
        // Get a random log as reference
        const targetBlockIndex = randomInt(numBlocks);
        const targetTxIndex = randomInt(txsPerBlock);
        const targetLogIndex = randomInt(numUnencryptedLogs);

        const afterLog = new LogId(targetBlockIndex + INITIAL_L2_BLOCK_NUM, targetTxIndex, targetLogIndex);

        const response = await store.getUnencryptedLogs({ afterLog });
        const logs = response.logs;

        expect(response.maxLogsHit).toBeFalsy();

        for (const log of logs) {
          const logId = log.id;
          expect(logId.blockNumber).toBeGreaterThanOrEqual(afterLog.blockNumber);
          if (logId.blockNumber === afterLog.blockNumber) {
            expect(logId.txIndex).toBeGreaterThanOrEqual(afterLog.txIndex);
            if (logId.txIndex === afterLog.txIndex) {
              expect(logId.logIndex).toBeGreaterThan(afterLog.logIndex);
            }
          }
        }
      });

      it('"txHash" filter param is ignored when "afterLog" is set', async () => {
        // Get random txHash
        const txHash = new TxHash(randomBytes(TxHash.SIZE));
        const afterLog = new LogId(1, 0, 0);

        const response = await store.getUnencryptedLogs({ txHash, afterLog });
        expect(response.logs.length).toBeGreaterThan(1);
      });

      it('intersecting works', async () => {
        let logs = (await store.getUnencryptedLogs({ fromBlock: -10, toBlock: -5 })).logs;
        expect(logs.length).toBe(0);

        // "fromBlock" gets correctly trimmed to range and "toBlock" is exclusive
        logs = (await store.getUnencryptedLogs({ fromBlock: -10, toBlock: 5 })).logs;
        let blockNumbers = new Set(logs.map(log => log.id.blockNumber));
        expect(blockNumbers).toEqual(new Set([1, 2, 3, 4]));

        // "toBlock" should be exclusive
        logs = (await store.getUnencryptedLogs({ fromBlock: 1, toBlock: 1 })).logs;
        expect(logs.length).toBe(0);

        logs = (await store.getUnencryptedLogs({ fromBlock: 10, toBlock: 5 })).logs;
        expect(logs.length).toBe(0);

        // both "fromBlock" and "toBlock" get correctly capped to range and logs from all blocks are returned
        logs = (await store.getUnencryptedLogs({ fromBlock: -100, toBlock: +100 })).logs;
        blockNumbers = new Set(logs.map(log => log.id.blockNumber));
        expect(blockNumbers.size).toBe(numBlocks);

        // intersecting with "afterLog" works
        logs = (await store.getUnencryptedLogs({ fromBlock: 2, toBlock: 5, afterLog: new LogId(4, 0, 0) })).logs;
        blockNumbers = new Set(logs.map(log => log.id.blockNumber));
        expect(blockNumbers).toEqual(new Set([4]));

        logs = (await store.getUnencryptedLogs({ toBlock: 5, afterLog: new LogId(5, 1, 0) })).logs;
        expect(logs.length).toBe(0);

        logs = (await store.getUnencryptedLogs({ fromBlock: 2, toBlock: 5, afterLog: new LogId(100, 0, 0) })).logs;
        expect(logs.length).toBe(0);
      });

      it('"txIndex" and "logIndex" are respected when "afterLog.blockNumber" is equal to "fromBlock"', async () => {
        // Get a random log as reference
        const targetBlockIndex = randomInt(numBlocks);
        const targetTxIndex = randomInt(txsPerBlock);
        const targetLogIndex = randomInt(numUnencryptedLogs);

        const afterLog = new LogId(targetBlockIndex + INITIAL_L2_BLOCK_NUM, targetTxIndex, targetLogIndex);

        const response = await store.getUnencryptedLogs({ afterLog, fromBlock: afterLog.blockNumber });
        const logs = response.logs;

        expect(response.maxLogsHit).toBeFalsy();

        for (const log of logs) {
          const logId = log.id;
          expect(logId.blockNumber).toBeGreaterThanOrEqual(afterLog.blockNumber);
          if (logId.blockNumber === afterLog.blockNumber) {
            expect(logId.txIndex).toBeGreaterThanOrEqual(afterLog.txIndex);
            if (logId.txIndex === afterLog.txIndex) {
              expect(logId.logIndex).toBeGreaterThan(afterLog.logIndex);
            }
          }
        }
      });
    });

    describe('findNullifiersIndexesWithBlock', () => {
      let blocks: L2Block[];
      const numBlocks = 10;
      const nullifiersPerBlock = new Map<number, Fr[]>();

      beforeEach(() => {
        blocks = times(numBlocks, (index: number) => L2Block.random(index + 1, 1));

        blocks.forEach((block, blockIndex) => {
          nullifiersPerBlock.set(
            blockIndex,
            block.body.txEffects.flatMap(txEffect => txEffect.nullifiers),
          );
        });
      });

      it('returns wrapped nullifiers with blocks if they exist', async () => {
        await store.addNullifiers(blocks);
        const nullifiersToRetrieve = [...nullifiersPerBlock.get(0)!, ...nullifiersPerBlock.get(5)!, Fr.random()];
        const blockScopedNullifiers = await store.findNullifiersIndexesWithBlock(10, nullifiersToRetrieve);

        expect(blockScopedNullifiers).toHaveLength(nullifiersToRetrieve.length);
        const [undefinedNullifier] = blockScopedNullifiers.slice(-1);
        const realNullifiers = blockScopedNullifiers.slice(0, -1);
        realNullifiers.forEach((blockScopedNullifier, index) => {
          expect(blockScopedNullifier).not.toBeUndefined();
          const { data, l2BlockNumber } = blockScopedNullifier!;
          expect(data).toEqual(expect.any(BigInt));
          expect(l2BlockNumber).toEqual(index < MAX_NULLIFIERS_PER_TX ? 1 : 6);
        });
        expect(undefinedNullifier).toBeUndefined();
      });

      it('returns wrapped nullifiers filtering by blockNumber', async () => {
        await store.addNullifiers(blocks);
        const nullifiersToRetrieve = [...nullifiersPerBlock.get(0)!, ...nullifiersPerBlock.get(5)!];
        const blockScopedNullifiers = await store.findNullifiersIndexesWithBlock(5, nullifiersToRetrieve);

        expect(blockScopedNullifiers).toHaveLength(nullifiersToRetrieve.length);
        const undefinedNullifiers = blockScopedNullifiers.slice(-MAX_NULLIFIERS_PER_TX);
        const realNullifiers = blockScopedNullifiers.slice(0, -MAX_NULLIFIERS_PER_TX);
        realNullifiers.forEach(blockScopedNullifier => {
          expect(blockScopedNullifier).not.toBeUndefined();
          const { data, l2BlockNumber } = blockScopedNullifier!;
          expect(data).toEqual(expect.any(BigInt));
          expect(l2BlockNumber).toEqual(1);
        });
        undefinedNullifiers.forEach(undefinedNullifier => {
          expect(undefinedNullifier).toBeUndefined();
        });
      });
    });
  });
}
