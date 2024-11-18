import { type AztecNode, L2Block } from '@aztec/circuit-types';
import { type Header } from '@aztec/circuits.js';
import { makeHeader } from '@aztec/circuits.js/testing';
import { randomInt } from '@aztec/foundation/crypto';
import { SerialQueue } from '@aztec/foundation/queue';
import { openTmpStore } from '@aztec/kv-store/utils';

import { type MockProxy, mock } from 'jest-mock-extended';

import { type PxeDatabase } from '../database/index.js';
import { KVPxeDatabase } from '../database/kv_pxe_database.js';
import { Synchronizer } from './synchronizer.js';

describe('Synchronizer', () => {
  let aztecNode: MockProxy<AztecNode>;
  let database: PxeDatabase;
  let synchronizer: TestSynchronizer;
  let jobQueue: SerialQueue;
  const initialSyncBlockNumber = 3;
  let headerBlock3: Header;

  beforeEach(() => {
    headerBlock3 = makeHeader(randomInt(1000), initialSyncBlockNumber, initialSyncBlockNumber);

    aztecNode = mock<AztecNode>();
    database = new KVPxeDatabase(openTmpStore());
    jobQueue = new SerialQueue();
    synchronizer = new TestSynchronizer(aztecNode, database, jobQueue);
  });

  it('sets header from aztec node on initial sync', async () => {
    aztecNode.getBlockNumber.mockResolvedValue(initialSyncBlockNumber);
    aztecNode.getHeader.mockResolvedValue(headerBlock3);

    await synchronizer.initialSync();

    expect(database.getHeader()).toEqual(headerBlock3);
  });

  it('sets header from latest block', async () => {
    const block = L2Block.random(1, 4);
    aztecNode.getLogs.mockResolvedValueOnce([block.body.encryptedLogs]).mockResolvedValue([block.body.unencryptedLogs]);
    aztecNode.getBlocks.mockResolvedValue([block]);

    await synchronizer.work();

    const obtainedHeader = database.getHeader();
    expect(obtainedHeader).toEqual(block.header);
  });

  it('overrides header from initial sync once current block number is larger', async () => {
    // Initial sync is done on block with height 3
    aztecNode.getBlockNumber.mockResolvedValue(initialSyncBlockNumber);
    aztecNode.getHeader.mockResolvedValue(headerBlock3);

    await synchronizer.initialSync();
    const header0 = database.getHeader();
    expect(header0).toEqual(headerBlock3);

    // We then process block with height 1, this should not change the header
    const block1 = L2Block.random(1, 4);

    aztecNode.getLogs
      .mockResolvedValueOnce([block1.body.encryptedLogs])
      .mockResolvedValue([block1.body.unencryptedLogs]);

    aztecNode.getBlocks.mockResolvedValue([block1]);

    await synchronizer.work();
    const header1 = database.getHeader();
    expect(header1).toEqual(headerBlock3);
    expect(header1).not.toEqual(block1.header);

    // But they should change when we process block with height 5
    const block5 = L2Block.random(5, 4);

    aztecNode.getBlocks.mockResolvedValue([block5]);

    await synchronizer.work();
    const header5 = database.getHeader();
    expect(header5).not.toEqual(headerBlock3);
    expect(header5).toEqual(block5.header);
  });
});

class TestSynchronizer extends Synchronizer {
  public override work(limit = 1) {
    return super.work(limit);
  }

  public override initialSync(): Promise<void> {
    return super.initialSync();
  }
}
