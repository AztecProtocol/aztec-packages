import { BarretenbergWasm } from '@aztec/barretenberg.js/wasm';
import { AppendOnlyTreeSnapshot, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/circuits.js';
import { INITIAL_LEAF, Pedersen, SiblingPath } from '@aztec/merkle-tree';
import { ContractData, L2Block, L2BlockSource, MerkleTreeId, PublicDataWrite, EventLogs } from '@aztec/types';
import { jest } from '@jest/globals';
import { MerkleTreeDb } from '../index.js';
import { ServerWorldStateSynchroniser } from './server_world_state_synchroniser.js';
import { WorldStateRunningState } from './world_state_synchroniser.js';
import { Fr } from '@aztec/foundation/fields';
import { sleep } from '@aztec/foundation/sleep';
import { createLogger } from '@aztec/foundation/log';

/**
 * Generic mock implementation.
 */
type Mockify<T> = {
  [P in keyof T]: jest.Mock;
};

const LATEST_BLOCK_NUMBER = 5;
const getLatestBlockNumber = () => LATEST_BLOCK_NUMBER;
let nextBlocks: L2Block[] = [];
const consumeNextBlocks = () => {
  const blocks = nextBlocks;
  nextBlocks = [];
  return Promise.resolve(blocks);
};

const getMockTreeSnapshot = () => {
  return new AppendOnlyTreeSnapshot(Fr.random(), 16);
};

const getMockContractData = () => {
  return ContractData.random();
};

const getMockL1ToL2MessagesData = () => {
  return new Array(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).map(() => Fr.random());
};

const getMockBlock = (blockNumber: number, newContractsCommitments?: Buffer[]) => {
  const newEncryptedLogs = EventLogs.random(2);
  const block = L2Block.fromFields({
    number: blockNumber,
    startPrivateDataTreeSnapshot: getMockTreeSnapshot(),
    startNullifierTreeSnapshot: getMockTreeSnapshot(),
    startContractTreeSnapshot: getMockTreeSnapshot(),
    startTreeOfHistoricPrivateDataTreeRootsSnapshot: getMockTreeSnapshot(),
    startTreeOfHistoricContractTreeRootsSnapshot: getMockTreeSnapshot(),
    startPublicDataTreeRoot: Fr.random(),
    startL1ToL2MessageTreeSnapshot: getMockTreeSnapshot(),
    startTreeOfHistoricL1ToL2MessageTreeRootsSnapshot: getMockTreeSnapshot(),
    endPrivateDataTreeSnapshot: getMockTreeSnapshot(),
    endNullifierTreeSnapshot: getMockTreeSnapshot(),
    endContractTreeSnapshot: getMockTreeSnapshot(),
    endTreeOfHistoricPrivateDataTreeRootsSnapshot: getMockTreeSnapshot(),
    endTreeOfHistoricContractTreeRootsSnapshot: getMockTreeSnapshot(),
    endPublicDataTreeRoot: Fr.random(),
    endL1ToL2MessageTreeSnapshot: getMockTreeSnapshot(),
    endTreeOfHistoricL1ToL2MessageTreeRootsSnapshot: getMockTreeSnapshot(),
    newCommitments: [Fr.random()],
    newNullifiers: [Fr.random()],
    newContracts: newContractsCommitments?.map(x => Fr.fromBuffer(x)) ?? [Fr.random()],
    newContractData: [getMockContractData()],
    newPublicDataWrites: [PublicDataWrite.random()],
    newL1ToL2Messages: getMockL1ToL2MessagesData(),
    newL2ToL1Msgs: [Fr.random()],
    newEncryptedLogs,
    newEncryptedLogsLength: newEncryptedLogs.getSerializedLength(),
  });
  return block;
};

const createSynchroniser = (merkleTreeDb: any, rollupSource: any) =>
  new ServerWorldStateSynchroniser(merkleTreeDb as MerkleTreeDb, rollupSource as L2BlockSource);

const log = createLogger('aztec:server_world_state_synchroniser_test');

describe('server_world_state_synchroniser', () => {
  const rollupSource: Mockify<Pick<L2BlockSource, 'getBlockHeight' | 'getL2Blocks'>> = {
    getBlockHeight: jest.fn().mockImplementation(getLatestBlockNumber),
    getL2Blocks: jest.fn().mockImplementation(consumeNextBlocks),
  };

  const merkleTreeDb: Mockify<MerkleTreeDb> = {
    getTreeInfo: jest
      .fn()
      .mockImplementation(() =>
        Promise.resolve({ treeId: MerkleTreeId.CONTRACT_TREE, root: Buffer.alloc(32, 0), size: 0n }),
      ),
    appendLeaves: jest.fn().mockImplementation(() => Promise.resolve()),
    updateLeaf: jest.fn().mockImplementation(() => Promise.resolve()),
    getSiblingPath: jest.fn().mockImplementation(() => {
      return async () => {
        const wasm = await BarretenbergWasm.get();
        const pedersen: Pedersen = new Pedersen(wasm);
        SiblingPath.ZERO(32, INITIAL_LEAF, pedersen);
      }; //Promise.resolve();
    }),
    updateHistoricRootsTrees: jest.fn().mockImplementation(() => Promise.resolve()),
    commit: jest.fn().mockImplementation(() => Promise.resolve()),
    rollback: jest.fn().mockImplementation(() => Promise.resolve()),
    handleL2Block: jest.fn().mockImplementation(() => Promise.resolve()),
  } as any;

  it('can be constructed', () => {
    expect(() => createSynchroniser(merkleTreeDb, rollupSource)).not.toThrow();
  });

  it('updates sync progress', async () => {
    const server = createSynchroniser(merkleTreeDb, rollupSource);

    // test initial state
    let status = await server.status();
    expect(status.syncedToL2Block).toEqual(0);
    expect(status.state).toEqual(WorldStateRunningState.IDLE);

    // create an initial block
    let currentBlockNumber = 0;
    nextBlocks = [getMockBlock(currentBlockNumber + 1)];

    // start the sync process but don't await
    server.start().catch(err => log('Sync not completed: ', err));

    // now setup a loop to monitor the sync progress and push new blocks in
    while (currentBlockNumber <= LATEST_BLOCK_NUMBER) {
      status = await server.status();
      expect(
        status.syncedToL2Block >= currentBlockNumber || status.syncedToL2Block <= currentBlockNumber + 1,
      ).toBeTruthy();
      if (status.syncedToL2Block === LATEST_BLOCK_NUMBER) {
        break;
      }
      expect(
        status.state >= WorldStateRunningState.IDLE || status.state <= WorldStateRunningState.SYNCHING,
      ).toBeTruthy();
      if (status.syncedToL2Block === currentBlockNumber) {
        await sleep(100);
        continue;
      }
      currentBlockNumber++;
      nextBlocks = [getMockBlock(currentBlockNumber + 1)];
    }

    // check the status agian, should be fully synced
    status = await server.status();
    expect(status.state).toEqual(WorldStateRunningState.RUNNING);
    expect(status.syncedToL2Block).toEqual(LATEST_BLOCK_NUMBER);

    // stop the synchroniser
    await server.stop();

    // check the final status
    status = await server.status();
    expect(status.state).toEqual(WorldStateRunningState.STOPPED);
    expect(status.syncedToL2Block).toEqual(LATEST_BLOCK_NUMBER);
  });

  it('enables blocking until synced', async () => {
    const server = createSynchroniser(merkleTreeDb, rollupSource);
    let currentBlockNumber = 0;

    const newBlocks = async () => {
      while (currentBlockNumber <= LATEST_BLOCK_NUMBER) {
        await sleep(100);
        nextBlocks = [...nextBlocks, getMockBlock(++currentBlockNumber)];
      }
    };

    // kick off the background queueing of blocks
    const newBlockPromise = newBlocks();

    // kick off the synching
    const syncPromise = server.start();

    // await the synching
    await syncPromise;

    await newBlockPromise;

    let status = await server.status();
    expect(status.state).toEqual(WorldStateRunningState.RUNNING);
    expect(status.syncedToL2Block).toEqual(LATEST_BLOCK_NUMBER);
    await server.stop();
    status = await server.status();
    expect(status.state).toEqual(WorldStateRunningState.STOPPED);
    expect(status.syncedToL2Block).toEqual(LATEST_BLOCK_NUMBER);
  });

  it('handles multiple calls to start', async () => {
    const server = createSynchroniser(merkleTreeDb, rollupSource);
    let currentBlockNumber = 0;

    const newBlocks = async () => {
      while (currentBlockNumber < LATEST_BLOCK_NUMBER) {
        await sleep(100);
        const newBlock = getMockBlock(++currentBlockNumber);
        nextBlocks = [...nextBlocks, newBlock];
      }
    };

    // kick off the background queueing of blocks
    const newBlockPromise = newBlocks();

    // kick off the synching
    await server.start();

    // call start again, should get back the same promise
    await server.start();

    // wait until the block production has finished
    await newBlockPromise;

    await server.stop();
  });

  it('immediately syncs if no new blocks', async () => {
    const server = createSynchroniser(merkleTreeDb, rollupSource);
    rollupSource.getBlockHeight.mockImplementationOnce(() => {
      return Promise.resolve(0);
    });

    // kick off the synching
    const syncPromise = server.start();

    // it should already be synced, no need to push new blocks
    await syncPromise;

    const status = await server.status();
    expect(status.state).toBe(WorldStateRunningState.RUNNING);
    expect(status.syncedToL2Block).toBe(0);
    await server.stop();
  });

  it("can't be started if already stopped", async () => {
    const server = createSynchroniser(merkleTreeDb, rollupSource);
    rollupSource.getBlockHeight.mockImplementationOnce(() => {
      return Promise.resolve(0);
    });

    // kick off the synching
    const syncPromise = server.start();
    await syncPromise;
    await server.stop();

    await expect(server.start()).rejects.toThrow();
  });

  it('adds the received L2 blocks', async () => {
    merkleTreeDb.handleL2Block.mockReset();
    const server = createSynchroniser(merkleTreeDb, rollupSource);
    const totalBlocks = LATEST_BLOCK_NUMBER + 1;
    nextBlocks = Array(totalBlocks)
      .fill(0)
      .map((_, index) => getMockBlock(index, [Buffer.alloc(32, index)]));
    // sync the server
    await server.start();

    expect(merkleTreeDb.handleL2Block).toHaveBeenCalledTimes(totalBlocks);
    await server.stop();
  });
});
