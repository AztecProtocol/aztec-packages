import {
  INITIAL_L2_BLOCK_NUM,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
  PRIVATE_LOG_SIZE_IN_FIELDS,
  PUBLIC_LOG_SIZE_IN_FIELDS,
} from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { Buffer16, Buffer32 } from '@aztec/foundation/buffer';
import { times, timesParallel } from '@aztec/foundation/collection';
import { randomInt } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { toArray } from '@aztec/foundation/iterable';
import { sleep } from '@aztec/foundation/sleep';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { CommitteeAttestation, L2Block, L2BlockHash, wrapInBlock } from '@aztec/stdlib/block';
import {
  type ContractClassPublic,
  type ContractInstanceWithAddress,
  SerializableContractInstance,
  computePublicBytecodeCommitment,
} from '@aztec/stdlib/contract';
import { LogId, PrivateLog, PublicLog } from '@aztec/stdlib/logs';
import { InboxLeaf } from '@aztec/stdlib/messaging';
import {
  makeContractClassPublic,
  makeExecutablePrivateFunctionWithMembershipProof,
  makeUtilityFunctionWithMembershipProof,
} from '@aztec/stdlib/testing';
import '@aztec/stdlib/testing/jest';
import { type IndexedTxEffect, TxEffect, TxHash } from '@aztec/stdlib/tx';

import { makeInboxMessage, makeInboxMessages } from '../test/mock_structs.js';
import type { ArchiverDataStore, ArchiverL1SynchPoint } from './archiver_store.js';
import { BlockNumberNotSequentialError, InitialBlockNumberNotSequentialError } from './errors.js';
import { MessageStoreError } from './kv_archiver_store/message_store.js';
import type { InboxMessage } from './structs/inbox_message.js';
import type { PublishedL2Block } from './structs/published.js';

/**
 * @param testName - The name of the test suite.
 * @param getStore - Returns an instance of a store that's already been initialized.
 */
export function describeArchiverDataStore(
  testName: string,
  getStore: () => ArchiverDataStore | Promise<ArchiverDataStore>,
) {
  describe(testName, () => {
    let store: ArchiverDataStore;
    let blocks: PublishedL2Block[];

    const blockTests: [number, number, () => PublishedL2Block[]][] = [
      [1, 1, () => blocks.slice(0, 1)],
      [10, 1, () => blocks.slice(9, 10)],
      [1, 10, () => blocks.slice(0, 10)],
      [2, 5, () => blocks.slice(1, 6)],
      [5, 2, () => blocks.slice(4, 6)],
    ];

    const makeBlockHash = (blockNumber: number) => `0x${blockNumber.toString(16).padStart(64, '0')}`;

    const makePublished = (block: L2Block, l1BlockNumber: number): PublishedL2Block => ({
      block: block,
      l1: {
        blockNumber: BigInt(l1BlockNumber),
        blockHash: makeBlockHash(l1BlockNumber),
        timestamp: BigInt(l1BlockNumber * 1000),
      },
      attestations: times(3, CommitteeAttestation.random),
    });

    const expectBlocksEqual = (actual: PublishedL2Block[], expected: PublishedL2Block[]) => {
      expect(actual.length).toEqual(expected.length);
      for (let i = 0; i < expected.length; i++) {
        const expectedBlock = expected[i];
        const actualBlock = actual[i];
        expect(actualBlock.l1).toEqual(expectedBlock.l1);
        expect(actualBlock.block.equals(expectedBlock.block)).toBe(true);
        expect(actualBlock.attestations.every((a, i) => a.equals(expectedBlock.attestations[i]))).toBe(true);
      }
    };

    beforeEach(async () => {
      store = await getStore();
      blocks = await timesParallel(10, async i => makePublished(await L2Block.random(i + 1), i + 10));
    });

    describe('addBlocks', () => {
      it('returns success when adding blocks', async () => {
        await expect(store.addBlocks(blocks)).resolves.toBe(true);
      });

      it('allows duplicate blocks', async () => {
        await store.addBlocks(blocks);
        await expect(store.addBlocks(blocks)).resolves.toBe(true);
      });

      it('throws an error if the previous block does not exist in the store', async () => {
        const block = makePublished(await L2Block.random(2), 2);
        await expect(store.addBlocks([block])).rejects.toThrow(InitialBlockNumberNotSequentialError);
        await expect(store.getPublishedBlocks(1, 10)).resolves.toEqual([]);
      });

      it('throws an error if there is a gap in the blocks being added', async () => {
        const blocks = [makePublished(await L2Block.random(1), 1), makePublished(await L2Block.random(3), 3)];
        await expect(store.addBlocks(blocks)).rejects.toThrow(BlockNumberNotSequentialError);
        await expect(store.getPublishedBlocks(1, 10)).resolves.toEqual([]);
      });
    });

    describe('unwindBlocks', () => {
      it('unwinding blocks will remove blocks from the chain', async () => {
        await store.addBlocks(blocks);
        const blockNumber = await store.getSynchedL2BlockNumber();

        expectBlocksEqual(await store.getPublishedBlocks(blockNumber, 1), [blocks[blocks.length - 1]]);

        await store.unwindBlocks(blockNumber, 1);

        expect(await store.getSynchedL2BlockNumber()).toBe(blockNumber - 1);
        expect(await store.getPublishedBlocks(blockNumber, 1)).toEqual([]);
      });

      it('can unwind multiple empty blocks', async () => {
        const emptyBlocks = await timesParallel(10, async i => makePublished(await L2Block.random(i + 1, 0), i + 10));
        await store.addBlocks(emptyBlocks);
        expect(await store.getSynchedL2BlockNumber()).toBe(10);

        await store.unwindBlocks(10, 3);
        expect(await store.getSynchedL2BlockNumber()).toBe(7);
        expect((await store.getPublishedBlocks(1, 10)).map(b => b.block.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
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
        expectBlocksEqual(await store.getPublishedBlocks(start, limit), getExpectedBlocks());
      });

      it('returns an empty array if no blocks are found', async () => {
        await expect(store.getPublishedBlocks(12, 1)).resolves.toEqual([]);
      });

      it('throws an error if limit is invalid', async () => {
        await expect(store.getPublishedBlocks(1, 0)).rejects.toThrow('Invalid limit: 0');
      });

      it('throws an error if `from` it is out of range', async () => {
        await expect(store.getPublishedBlocks(INITIAL_L2_BLOCK_NUM - 100, 1)).rejects.toThrow('Invalid start: -99');
      });

      it('throws an error if unexpected initial block number is found', async () => {
        await store.addBlocks([makePublished(await L2Block.random(21), 31)], { force: true });
        await expect(store.getPublishedBlocks(20, 1)).rejects.toThrow(`mismatch`);
      });

      it('throws an error if a gap is found', async () => {
        await store.addBlocks(
          [makePublished(await L2Block.random(20), 30), makePublished(await L2Block.random(22), 32)],
          { force: true },
        );
        await expect(store.getPublishedBlocks(20, 2)).rejects.toThrow(`mismatch`);
      });
    });

    describe('getSyncedL2BlockNumber', () => {
      it('returns the block number before INITIAL_L2_BLOCK_NUM if no blocks have been added', async () => {
        await expect(store.getSynchedL2BlockNumber()).resolves.toEqual(INITIAL_L2_BLOCK_NUM - 1);
      });

      it("returns the most recently added block's number", async () => {
        await store.addBlocks(blocks);
        await expect(store.getSynchedL2BlockNumber()).resolves.toEqual(blocks.at(-1)!.block.number);
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
        const l1BlockHash = Buffer32.random();
        const l1BlockNumber = 10n;
        await store.setMessageSynchedL1Block({ l1BlockNumber: 5n, l1BlockHash: Buffer32.random() });
        await store.addL1ToL2Messages([makeInboxMessage(Buffer16.ZERO, { l1BlockNumber, l1BlockHash })]);
        await expect(store.getSynchPoint()).resolves.toEqual({
          blocksSynchedTo: undefined,
          messagesSynchedTo: { l1BlockHash, l1BlockNumber },
        } satisfies ArchiverL1SynchPoint);
      });

      it('returns the latest syncpoint if latest message is behind', async () => {
        const l1BlockHash = Buffer32.random();
        const l1BlockNumber = 10n;
        await store.setMessageSynchedL1Block({ l1BlockNumber, l1BlockHash });
        const msg = makeInboxMessage(Buffer16.ZERO, { l1BlockNumber: 5n, l1BlockHash: Buffer32.random() });
        await store.addL1ToL2Messages([msg]);
        await expect(store.getSynchPoint()).resolves.toEqual({
          blocksSynchedTo: undefined,
          messagesSynchedTo: { l1BlockHash, l1BlockNumber },
        } satisfies ArchiverL1SynchPoint);
      });
    });

    describe('addLogs', () => {
      it('adds private & public logs', async () => {
        const block = blocks[0].block;
        await expect(store.addLogs([block])).resolves.toEqual(true);
      });
    });

    describe('deleteLogs', () => {
      it('deletes private & public logs', async () => {
        const block = blocks[0].block;
        await store.addBlocks([blocks[0]]);
        await expect(store.addLogs([block])).resolves.toEqual(true);

        expect((await store.getPrivateLogs(1, 1)).length).toEqual(
          block.body.txEffects.map(txEffect => txEffect.privateLogs).flat().length,
        );
        expect((await store.getPublicLogs({ fromBlock: 1 })).logs.length).toEqual(
          block.body.txEffects.map(txEffect => txEffect.publicLogs).flat().length,
        );

        // This one is a pain for memory as we would never want to just delete memory in the middle.
        await store.deleteLogs([block]);

        expect((await store.getPrivateLogs(1, 1)).length).toEqual(0);
        expect((await store.getPublicLogs({ fromBlock: 1 })).logs.length).toEqual(0);
      });
    });

    describe('getPrivateLogs', () => {
      it('gets added private logs', async () => {
        const block = blocks[0].block;
        await store.addBlocks([blocks[0]]);
        await store.addLogs([block]);

        const privateLogs = await store.getPrivateLogs(1, 1);
        expect(privateLogs).toEqual(block.body.txEffects.map(txEffect => txEffect.privateLogs).flat());
      });
    });

    describe('getTxEffect', () => {
      beforeEach(async () => {
        await store.addLogs(blocks.map(b => b.block));
        await store.addBlocks(blocks);
      });

      it.each([
        () => ({ data: blocks[0].block.body.txEffects[0], block: blocks[0].block, txIndexInBlock: 0 }),
        () => ({ data: blocks[9].block.body.txEffects[3], block: blocks[9].block, txIndexInBlock: 3 }),
        () => ({ data: blocks[3].block.body.txEffects[1], block: blocks[3].block, txIndexInBlock: 1 }),
        () => ({ data: blocks[5].block.body.txEffects[2], block: blocks[5].block, txIndexInBlock: 2 }),
        () => ({ data: blocks[1].block.body.txEffects[0], block: blocks[1].block, txIndexInBlock: 0 }),
      ])('retrieves a previously stored transaction', async getExpectedTx => {
        const { data, block, txIndexInBlock } = getExpectedTx();
        const expectedTx: IndexedTxEffect = {
          data,
          l2BlockNumber: block.number,
          l2BlockHash: L2BlockHash.fromField(await block.hash()),
          txIndexInBlock,
        };
        const actualTx = await store.getTxEffect(data.txHash);
        expect(actualTx).toEqual(expectedTx);
      });

      it('returns undefined if tx is not found', async () => {
        await expect(store.getTxEffect(TxHash.random())).resolves.toBeUndefined();
      });

      it.each([
        () => wrapInBlock(blocks[0].block.body.txEffects[0], blocks[0].block),
        () => wrapInBlock(blocks[9].block.body.txEffects[3], blocks[9].block),
        () => wrapInBlock(blocks[3].block.body.txEffects[1], blocks[3].block),
        () => wrapInBlock(blocks[5].block.body.txEffects[2], blocks[5].block),
        () => wrapInBlock(blocks[1].block.body.txEffects[0], blocks[1].block),
      ])('tries to retrieves a previously stored transaction after deleted', async getExpectedTx => {
        await store.unwindBlocks(blocks.length, blocks.length);

        const expectedTx = await getExpectedTx();
        const actualTx = await store.getTxEffect(expectedTx.data.txHash);
        expect(actualTx).toEqual(undefined);
      });

      it('returns undefined if tx is not found', async () => {
        await expect(store.getTxEffect(TxHash.random())).resolves.toBeUndefined();
      });

      it('does not fail if the block is unwound while requesting a tx', async () => {
        const expectedTx = await wrapInBlock(blocks[1].block.body.txEffects[0], blocks[1].block);
        let done = false;
        void (async () => {
          while (!done) {
            void store.getTxEffect(expectedTx.data.txHash);
            await sleep(1);
          }
        })();
        await store.unwindBlocks(blocks.length, blocks.length);
        done = true;
        expect(await store.getTxEffect(expectedTx.data.txHash)).toEqual(undefined);
      });
    });

    describe('L1 to L2 Messages', () => {
      const initialL2BlockNumber = 13;

      const checkMessages = async (msgs: InboxMessage[]) => {
        expect(await store.getLastL1ToL2Message()).toEqual(msgs.at(-1));
        expect(await toArray(store.iterateL1ToL2Messages())).toEqual(msgs);
        expect(await store.getTotalL1ToL2MessageCount()).toEqual(BigInt(msgs.length));
      };

      const makeInboxMessagesWithFullBlocks = (blockCount: number, opts: { initialL2BlockNumber?: number } = {}) =>
        makeInboxMessages(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP * blockCount, {
          overrideFn: (msg, i) => {
            const l2BlockNumber =
              (opts.initialL2BlockNumber ?? initialL2BlockNumber) + Math.floor(i / NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);
            const index =
              InboxLeaf.smallestIndexFromL2Block(l2BlockNumber) + BigInt(i % NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);
            return { ...msg, l2BlockNumber, index };
          },
        });

      it('stores first message ever', async () => {
        const msg = makeInboxMessage(Buffer16.ZERO, { index: 0n, l2BlockNumber: 1 });
        await store.addL1ToL2Messages([msg]);

        await checkMessages([msg]);
        expect(await store.getL1ToL2Messages(1)).toEqual([msg.leaf]);
      });

      it('stores single message', async () => {
        const msg = makeInboxMessage(Buffer16.ZERO, { l2BlockNumber: 2 });
        await store.addL1ToL2Messages([msg]);

        await checkMessages([msg]);
        expect(await store.getL1ToL2Messages(2)).toEqual([msg.leaf]);
      });

      it('stores and returns messages across different blocks', async () => {
        const msgs = makeInboxMessages(5, { initialL2BlockNumber });
        await store.addL1ToL2Messages(msgs);

        await checkMessages(msgs);
        expect(await store.getL1ToL2Messages(initialL2BlockNumber + 2)).toEqual([msgs[2]].map(m => m.leaf));
      });

      it('stores the same messages again', async () => {
        const msgs = makeInboxMessages(5, { initialL2BlockNumber });
        await store.addL1ToL2Messages(msgs);
        await store.addL1ToL2Messages(msgs.slice(2));

        await checkMessages(msgs);
      });

      it('stores and returns messages across different blocks with gaps', async () => {
        const msgs1 = makeInboxMessages(3, { initialL2BlockNumber: 1 });
        const msgs2 = makeInboxMessages(3, { initialL2BlockNumber: 20, initialHash: msgs1.at(-1)!.rollingHash });

        await store.addL1ToL2Messages(msgs1);
        await store.addL1ToL2Messages(msgs2);

        await checkMessages([...msgs1, ...msgs2]);

        expect(await store.getL1ToL2Messages(1)).toEqual([msgs1[0].leaf]);
        expect(await store.getL1ToL2Messages(4)).toEqual([]);
        expect(await store.getL1ToL2Messages(20)).toEqual([msgs2[0].leaf]);
        expect(await store.getL1ToL2Messages(24)).toEqual([]);
      });

      it('stores and returns messages with block numbers larger than a byte', async () => {
        const msgs = makeInboxMessages(5, { initialL2BlockNumber: 1000 });
        await store.addL1ToL2Messages(msgs);

        await checkMessages(msgs);
        expect(await store.getL1ToL2Messages(1002)).toEqual([msgs[2]].map(m => m.leaf));
      });

      it('stores and returns multiple messages per block', async () => {
        const msgs = makeInboxMessagesWithFullBlocks(4);
        await store.addL1ToL2Messages(msgs);

        await checkMessages(msgs);
        const blockMessages = await store.getL1ToL2Messages(initialL2BlockNumber + 1);
        expect(blockMessages).toHaveLength(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);
        expect(blockMessages).toEqual(
          msgs.slice(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP * 2).map(m => m.leaf),
        );
      });

      it('stores messages in multiple operations', async () => {
        const msgs = makeInboxMessages(20, { initialL2BlockNumber });
        await store.addL1ToL2Messages(msgs.slice(0, 10));
        await store.addL1ToL2Messages(msgs.slice(10, 20));

        expect(await store.getL1ToL2Messages(initialL2BlockNumber + 2)).toEqual([msgs[2]].map(m => m.leaf));
        expect(await store.getL1ToL2Messages(initialL2BlockNumber + 12)).toEqual([msgs[12]].map(m => m.leaf));
        await checkMessages(msgs);
      });

      it('iterates over messages from start index', async () => {
        const msgs = makeInboxMessages(10, { initialL2BlockNumber });
        await store.addL1ToL2Messages(msgs);

        const iterated = await toArray(store.iterateL1ToL2Messages({ start: msgs[3].index }));
        expect(iterated).toEqual(msgs.slice(3));
      });

      it('iterates over messages in reverse', async () => {
        const msgs = makeInboxMessages(10, { initialL2BlockNumber });
        await store.addL1ToL2Messages(msgs);

        const iterated = await toArray(store.iterateL1ToL2Messages({ reverse: true, end: msgs[3].index }));
        expect(iterated).toEqual(msgs.slice(0, 4).reverse());
      });

      it('throws if messages are added out of order', async () => {
        const msgs = makeInboxMessages(5, { overrideFn: (msg, i) => ({ ...msg, index: BigInt(10 - i) }) });
        await expect(store.addL1ToL2Messages(msgs)).rejects.toThrow(MessageStoreError);
      });

      it('throws if block number for the first message is out of order', async () => {
        const msgs = makeInboxMessages(4, { initialL2BlockNumber });
        msgs[2].l2BlockNumber = initialL2BlockNumber - 1;
        await store.addL1ToL2Messages(msgs.slice(0, 2));
        await expect(store.addL1ToL2Messages(msgs.slice(2, 4))).rejects.toThrow(MessageStoreError);
      });

      it('throws if rolling hash is not correct', async () => {
        const msgs = makeInboxMessages(5);
        msgs[1].rollingHash = Buffer16.random();
        await expect(store.addL1ToL2Messages(msgs)).rejects.toThrow(MessageStoreError);
      });

      it('throws if rolling hash for first message is not correct', async () => {
        const msgs = makeInboxMessages(4);
        msgs[2].rollingHash = Buffer16.random();
        await store.addL1ToL2Messages(msgs.slice(0, 2));
        await expect(store.addL1ToL2Messages(msgs.slice(2, 4))).rejects.toThrow(MessageStoreError);
      });

      it('throws if index is not in the correct range', async () => {
        const msgs = makeInboxMessages(5, { initialL2BlockNumber });
        msgs.at(-1)!.index += 100n;
        await expect(store.addL1ToL2Messages(msgs)).rejects.toThrow(MessageStoreError);
      });

      it('throws if first index in block has gaps', async () => {
        const msgs = makeInboxMessages(4, { initialL2BlockNumber });
        msgs[2].index++;
        await expect(store.addL1ToL2Messages(msgs)).rejects.toThrow(MessageStoreError);
      });

      it('throws if index does not follow previous one', async () => {
        const msgs = makeInboxMessages(2, {
          initialL2BlockNumber,
          overrideFn: (msg, i) => ({
            ...msg,
            l2BlockNumber: 2,
            index: BigInt(i + NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP * 2),
          }),
        });
        msgs[1].index++;
        await expect(store.addL1ToL2Messages(msgs)).rejects.toThrow(MessageStoreError);
      });

      it('removes messages up to the given block number', async () => {
        const msgs = makeInboxMessagesWithFullBlocks(4, { initialL2BlockNumber: 1 });

        await store.addL1ToL2Messages(msgs);
        await checkMessages(msgs);

        expect(await store.getL1ToL2Messages(1)).toHaveLength(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);
        expect(await store.getL1ToL2Messages(2)).toHaveLength(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);
        expect(await store.getL1ToL2Messages(3)).toHaveLength(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);
        expect(await store.getL1ToL2Messages(4)).toHaveLength(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);

        await store.rollbackL1ToL2MessagesToL2Block(2);

        expect(await store.getL1ToL2Messages(1)).toHaveLength(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);
        expect(await store.getL1ToL2Messages(2)).toHaveLength(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);
        expect(await store.getL1ToL2Messages(3)).toHaveLength(0);
        expect(await store.getL1ToL2Messages(4)).toHaveLength(0);

        await checkMessages(msgs.slice(0, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP * 2));
      });

      it('removes messages starting with the given index', async () => {
        const msgs = makeInboxMessagesWithFullBlocks(4, { initialL2BlockNumber: 1 });
        await store.addL1ToL2Messages(msgs);

        await store.removeL1ToL2Messages(msgs[13].index);
        await checkMessages(msgs.slice(0, 13));
      });
    });

    describe('contractInstances', () => {
      let contractInstance: ContractInstanceWithAddress;
      const blockNum = 10;

      beforeEach(async () => {
        const classId = Fr.random();
        const randomInstance = await SerializableContractInstance.random({
          currentContractClassId: classId,
          originalContractClassId: classId,
        });
        contractInstance = { ...randomInstance, address: await AztecAddress.random() };
        await store.addContractInstances([contractInstance], blockNum);
      });

      it('returns previously stored contract instances', async () => {
        await expect(store.getContractInstance(contractInstance.address, blockNum)).resolves.toMatchObject(
          contractInstance,
        );
      });

      it('returns undefined if contract instance is not found', async () => {
        await expect(store.getContractInstance(await AztecAddress.random(), blockNum)).resolves.toBeUndefined();
      });

      it('returns undefined if previously stored contract instances was deleted', async () => {
        await store.deleteContractInstances([contractInstance], blockNum);
        await expect(store.getContractInstance(contractInstance.address, blockNum)).resolves.toBeUndefined();
      });
    });

    describe('contractInstanceUpdates', () => {
      let contractInstance: ContractInstanceWithAddress;
      let classId: Fr;
      let nextClassId: Fr;
      const blockOfChange = 10;

      beforeEach(async () => {
        classId = Fr.random();
        nextClassId = Fr.random();
        const randomInstance = await SerializableContractInstance.random({
          currentContractClassId: classId,
          originalContractClassId: classId,
        });
        contractInstance = { ...randomInstance, address: await AztecAddress.random() };
        await store.addContractInstances([contractInstance], 1);
        await store.addContractInstanceUpdates(
          [
            {
              prevContractClassId: classId,
              newContractClassId: nextClassId,
              blockOfChange,
              address: contractInstance.address,
            },
          ],
          blockOfChange - 1,
        );
      });

      it('gets the correct current class id for a contract not updated yet', async () => {
        const fetchedInstance = await store.getContractInstance(contractInstance.address, blockOfChange - 1);
        expect(fetchedInstance?.originalContractClassId).toEqual(classId);
        expect(fetchedInstance?.currentContractClassId).toEqual(classId);
      });

      it('gets the correct current class id for a contract that has just been updated', async () => {
        const fetchedInstance = await store.getContractInstance(contractInstance.address, blockOfChange);
        expect(fetchedInstance?.originalContractClassId).toEqual(classId);
        expect(fetchedInstance?.currentContractClassId).toEqual(nextClassId);
      });

      it('gets the correct current class id for a contract that was updated in the past', async () => {
        const fetchedInstance = await store.getContractInstance(contractInstance.address, blockOfChange + 1);
        expect(fetchedInstance?.originalContractClassId).toEqual(classId);
        expect(fetchedInstance?.currentContractClassId).toEqual(nextClassId);
      });

      it('ignores updates for the wrong contract', async () => {
        const otherClassId = Fr.random();
        const randomInstance = await SerializableContractInstance.random({
          currentContractClassId: otherClassId,
          originalContractClassId: otherClassId,
        });
        const otherContractInstance = {
          ...randomInstance,
          address: await AztecAddress.random(),
        };
        await store.addContractInstances([otherContractInstance], 1);

        const fetchedInstance = await store.getContractInstance(otherContractInstance.address, blockOfChange + 1);
        expect(fetchedInstance?.originalContractClassId).toEqual(otherClassId);
        expect(fetchedInstance?.currentContractClassId).toEqual(otherClassId);
      });

      it('bounds its search to the right contract if more than than one update exists', async () => {
        const otherClassId = Fr.random();
        const otherNextClassId = Fr.random();
        const randomInstance = await SerializableContractInstance.random({
          currentContractClassId: otherClassId,
          originalContractClassId: otherNextClassId,
        });
        const otherContractInstance = {
          ...randomInstance,
          address: await AztecAddress.random(),
        };
        await store.addContractInstances([otherContractInstance], 1);
        await store.addContractInstanceUpdates(
          [
            {
              prevContractClassId: otherClassId,
              newContractClassId: otherNextClassId,
              blockOfChange,
              address: otherContractInstance.address,
            },
          ],
          blockOfChange - 1,
        );

        const fetchedInstance = await store.getContractInstance(contractInstance.address, blockOfChange + 1);
        expect(fetchedInstance?.originalContractClassId).toEqual(classId);
        expect(fetchedInstance?.currentContractClassId).toEqual(nextClassId);
      });
    });

    describe('contractClasses', () => {
      let contractClass: ContractClassPublic;
      const blockNum = 10;

      beforeEach(async () => {
        contractClass = await makeContractClassPublic();
        await store.addContractClasses(
          [contractClass],
          [await computePublicBytecodeCommitment(contractClass.packedBytecode)],
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
          [await computePublicBytecodeCommitment(contractClass.packedBytecode)],
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

      it('adds new utility functions', async () => {
        const fns = times(3, makeUtilityFunctionWithMembershipProof);
        await store.addFunctions(contractClass.id, [], fns);
        const stored = await store.getContractClass(contractClass.id);
        expect(stored?.utilityFunctions).toEqual(fns);
      });

      it('does not duplicate utility functions', async () => {
        const fns = times(3, makeUtilityFunctionWithMembershipProof);
        await store.addFunctions(contractClass.id, [], fns.slice(0, 1));
        await store.addFunctions(contractClass.id, [], fns);
        const stored = await store.getContractClass(contractClass.id);
        expect(stored?.utilityFunctions).toEqual(fns);
      });
    });

    describe('getLogsByTags', () => {
      const numBlocks = 3;
      const numTxsPerBlock = 4;
      const numPrivateLogsPerTx = 3;
      const numPublicLogsPerTx = 2;

      let blocks: PublishedL2Block[];

      const makeTag = (blockNumber: number, txIndex: number, logIndex: number, isPublic = false) =>
        blockNumber === 1 && txIndex === 0 && logIndex === 0
          ? Fr.ZERO // Shared tag
          : new Fr((blockNumber * 100 + txIndex * 10 + logIndex) * (isPublic ? 123 : 1));

      const makePrivateLog = (tag: Fr) =>
        PrivateLog.from({
          fields: makeTuple(PRIVATE_LOG_SIZE_IN_FIELDS, i => (!i ? tag : new Fr(tag.toNumber() + i))),
          emittedLength: PRIVATE_LOG_SIZE_IN_FIELDS,
        });

      const makePublicLog = (tag: Fr) =>
        PublicLog.from({
          contractAddress: AztecAddress.fromNumber(1),
          fields: makeTuple(PUBLIC_LOG_SIZE_IN_FIELDS, i => (!i ? tag : new Fr(tag.toNumber() + i))),
          emittedLength: PUBLIC_LOG_SIZE_IN_FIELDS,
        });

      const mockPrivateLogs = (blockNumber: number, txIndex: number) => {
        return times(numPrivateLogsPerTx, (logIndex: number) => {
          const tag = makeTag(blockNumber, txIndex, logIndex);
          return makePrivateLog(tag);
        });
      };

      const mockPublicLogs = (blockNumber: number, txIndex: number) => {
        return times(numPublicLogsPerTx, (logIndex: number) => {
          const tag = makeTag(blockNumber, txIndex, logIndex, /* isPublic */ true);
          return makePublicLog(tag);
        });
      };

      const mockBlockWithLogs = async (blockNumber: number): Promise<PublishedL2Block> => {
        const block = await L2Block.random(blockNumber);
        block.header.globalVariables.blockNumber = blockNumber;

        block.body.txEffects = await timesParallel(numTxsPerBlock, async (txIndex: number) => {
          const txEffect = await TxEffect.random();
          txEffect.privateLogs = mockPrivateLogs(blockNumber, txIndex);
          txEffect.publicLogs = mockPublicLogs(blockNumber, txIndex);
          return txEffect;
        });

        return {
          block: block,
          attestations: times(3, CommitteeAttestation.random),
          l1: {
            blockNumber: BigInt(blockNumber),
            blockHash: makeBlockHash(blockNumber),
            timestamp: BigInt(blockNumber),
          },
        };
      };

      beforeEach(async () => {
        blocks = await timesParallel(numBlocks, (index: number) => mockBlockWithLogs(index + 1));

        await store.addBlocks(blocks);
        await store.addLogs(blocks.map(b => b.block));
      });

      it('is possible to batch request private logs via tags', async () => {
        const tags = [makeTag(2, 1, 2), makeTag(1, 2, 0)];

        const logsByTags = await store.getLogsByTags(tags);

        expect(logsByTags).toEqual([
          [
            expect.objectContaining({
              blockNumber: 2,
              log: makePrivateLog(tags[0]),
              isFromPublic: false,
            }),
          ],
          [
            expect.objectContaining({
              blockNumber: 1,
              log: makePrivateLog(tags[1]),
              isFromPublic: false,
            }),
          ],
        ]);
      });

      it('is possible to batch request all logs (private and public) via tags', async () => {
        // Tag(1, 0, 0) is shared with the first private log and the first public log.
        const tags = [makeTag(1, 0, 0)];

        const logsByTags = await store.getLogsByTags(tags);

        expect(logsByTags).toEqual([
          [
            expect.objectContaining({
              blockNumber: 1,
              log: makePrivateLog(tags[0]),
              isFromPublic: false,
            }),
            expect.objectContaining({
              blockNumber: 1,
              log: makePublicLog(tags[0]),
              isFromPublic: true,
            }),
          ],
        ]);
      });

      it('is possible to batch request logs that have the same tag but different content', async () => {
        const tags = [makeTag(1, 2, 1)];

        // Create a block containing logs that have the same tag as the blocks before.
        const newBlockNumber = numBlocks;
        const newBlock = await mockBlockWithLogs(newBlockNumber);
        const newLog = newBlock.block.body.txEffects[1].privateLogs[1];
        newLog.fields[0] = tags[0];
        newBlock.block.body.txEffects[1].privateLogs[1] = newLog;
        await store.addBlocks([newBlock]);
        await store.addLogs([newBlock.block]);

        const logsByTags = await store.getLogsByTags(tags);

        expect(logsByTags).toEqual([
          [
            expect.objectContaining({
              blockNumber: 1,
              log: makePrivateLog(tags[0]),
              isFromPublic: false,
            }),
            expect.objectContaining({
              blockNumber: newBlockNumber,
              log: newLog,
              isFromPublic: false,
            }),
          ],
        ]);
      });

      it('is possible to request logs for non-existing tags and determine their position', async () => {
        const tags = [makeTag(99, 88, 77), makeTag(1, 1, 1)];

        const logsByTags = await store.getLogsByTags(tags);

        expect(logsByTags).toEqual([
          [
            // No logs for the first tag.
          ],
          [
            expect.objectContaining({
              blockNumber: 1,
              log: makePrivateLog(tags[1]),
              isFromPublic: false,
            }),
          ],
        ]);
      });
    });

    describe('getPublicLogs', () => {
      const txsPerBlock = 4;
      const numPublicFunctionCalls = 3;
      const numPublicLogs = 2;
      const numBlocks = 10;
      let blocks: PublishedL2Block[];

      beforeEach(async () => {
        blocks = await timesParallel(numBlocks, async (index: number) => ({
          block: await L2Block.random(index + 1, txsPerBlock, numPublicFunctionCalls, numPublicLogs),
          l1: { blockNumber: BigInt(index), blockHash: makeBlockHash(index), timestamp: BigInt(index) },
          attestations: times(3, CommitteeAttestation.random),
        }));

        await store.addBlocks(blocks);
        await store.addLogs(blocks.map(b => b.block));
      });

      it('no logs returned if deleted ("txHash" filter param is respected variant)', async () => {
        // get random tx
        const targetBlockIndex = randomInt(numBlocks);
        const targetTxIndex = randomInt(txsPerBlock);
        const targetTxHash = blocks[targetBlockIndex].block.body.txEffects[targetTxIndex].txHash;

        await Promise.all([
          store.unwindBlocks(blocks.length, blocks.length),
          store.deleteLogs(blocks.map(b => b.block)),
        ]);

        const response = await store.getPublicLogs({ txHash: targetTxHash });
        const logs = response.logs;

        expect(response.maxLogsHit).toBeFalsy();
        expect(logs.length).toEqual(0);
      });

      it('"txHash" filter param is respected', async () => {
        // get random tx
        const targetBlockIndex = randomInt(numBlocks);
        const targetTxIndex = randomInt(txsPerBlock);
        const targetTxHash = blocks[targetBlockIndex].block.body.txEffects[targetTxIndex].txHash;

        const response = await store.getPublicLogs({ txHash: targetTxHash });
        const logs = response.logs;

        expect(response.maxLogsHit).toBeFalsy();

        const expectedNumLogs = numPublicFunctionCalls * numPublicLogs;
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

        const response = await store.getPublicLogs({ fromBlock, toBlock });
        const logs = response.logs;

        expect(response.maxLogsHit).toBeFalsy();

        const expectedNumLogs = txsPerBlock * numPublicFunctionCalls * numPublicLogs * (toBlock - fromBlock);
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
        const targetLogIndex = randomInt(numPublicLogs * numPublicFunctionCalls);
        const targetContractAddress =
          blocks[targetBlockIndex].block.body.txEffects[targetTxIndex].publicLogs[targetLogIndex].contractAddress;

        const response = await store.getPublicLogs({ contractAddress: targetContractAddress });

        expect(response.maxLogsHit).toBeFalsy();

        for (const extendedLog of response.logs) {
          expect(extendedLog.log.contractAddress.equals(targetContractAddress)).toBeTruthy();
        }
      });

      it('"afterLog" filter param is respected', async () => {
        // Get a random log as reference
        const targetBlockIndex = randomInt(numBlocks);
        const targetTxIndex = randomInt(txsPerBlock);
        const targetLogIndex = randomInt(numPublicLogs);

        const afterLog = new LogId(targetBlockIndex + INITIAL_L2_BLOCK_NUM, targetTxIndex, targetLogIndex);

        const response = await store.getPublicLogs({ afterLog });
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
        const txHash = TxHash.random();
        const afterLog = new LogId(1, 0, 0);

        const response = await store.getPublicLogs({ txHash, afterLog });
        expect(response.logs.length).toBeGreaterThan(1);
      });

      it('intersecting works', async () => {
        let logs = (await store.getPublicLogs({ fromBlock: -10, toBlock: -5 })).logs;
        expect(logs.length).toBe(0);

        // "fromBlock" gets correctly trimmed to range and "toBlock" is exclusive
        logs = (await store.getPublicLogs({ fromBlock: -10, toBlock: 5 })).logs;
        let blockNumbers = new Set(logs.map(log => log.id.blockNumber));
        expect(blockNumbers).toEqual(new Set([1, 2, 3, 4]));

        // "toBlock" should be exclusive
        logs = (await store.getPublicLogs({ fromBlock: 1, toBlock: 1 })).logs;
        expect(logs.length).toBe(0);

        logs = (await store.getPublicLogs({ fromBlock: 10, toBlock: 5 })).logs;
        expect(logs.length).toBe(0);

        // both "fromBlock" and "toBlock" get correctly capped to range and logs from all blocks are returned
        logs = (await store.getPublicLogs({ fromBlock: -100, toBlock: +100 })).logs;
        blockNumbers = new Set(logs.map(log => log.id.blockNumber));
        expect(blockNumbers.size).toBe(numBlocks);

        // intersecting with "afterLog" works
        logs = (await store.getPublicLogs({ fromBlock: 2, toBlock: 5, afterLog: new LogId(4, 0, 0) })).logs;
        blockNumbers = new Set(logs.map(log => log.id.blockNumber));
        expect(blockNumbers).toEqual(new Set([4]));

        logs = (await store.getPublicLogs({ toBlock: 5, afterLog: new LogId(5, 1, 0) })).logs;
        expect(logs.length).toBe(0);

        logs = (await store.getPublicLogs({ fromBlock: 2, toBlock: 5, afterLog: new LogId(100, 0, 0) })).logs;
        expect(logs.length).toBe(0);
      });

      it('"txIndex" and "logIndex" are respected when "afterLog.blockNumber" is equal to "fromBlock"', async () => {
        // Get a random log as reference
        const targetBlockIndex = randomInt(numBlocks);
        const targetTxIndex = randomInt(txsPerBlock);
        const targetLogIndex = randomInt(numPublicLogs);

        const afterLog = new LogId(targetBlockIndex + INITIAL_L2_BLOCK_NUM, targetTxIndex, targetLogIndex);

        const response = await store.getPublicLogs({ afterLog, fromBlock: afterLog.blockNumber });
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
  });
}
