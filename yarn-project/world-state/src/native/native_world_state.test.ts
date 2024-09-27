import { MerkleTreeId } from '@aztec/circuit-types';
import { EthAddress, Fr } from '@aztec/circuits.js';

import { mkdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { NativeWorldStateService } from './native_world_state.js';

describe('NativeWorldState', () => {
  let dataDir: string;
  let rollupAddress: EthAddress;

  beforeAll(async () => {
    dataDir = join(tmpdir(), 'world-state-test');
    await mkdir(dataDir, { recursive: true });
    rollupAddress = EthAddress.random();
  });

  afterAll(async () => {
    await rm(dataDir, { recursive: true });
  });

  describe('persistence', () => {
    let committedNote: Fr;
    let uncommittedNote: Fr;
    beforeAll(async () => {
      committedNote = Fr.random();
      uncommittedNote = Fr.random();
      const ws = await NativeWorldStateService.create(rollupAddress, dataDir);

      await ws.appendLeaves(MerkleTreeId.NOTE_HASH_TREE, [committedNote]);
      await ws.commit();

      await ws.appendLeaves(MerkleTreeId.NOTE_HASH_TREE, [uncommittedNote]);

      await ws.closeRootDatabase();
    });

    it('correctly restores committed state', async () => {
      const ws = await NativeWorldStateService.create(rollupAddress, dataDir);
      // committed state should be restored
      await expect(ws.getLeafValue(MerkleTreeId.NOTE_HASH_TREE, 0n, false)).resolves.toEqual(committedNote);

      // but uncommitted state will be lost
      await expect(ws.findLeafIndex(MerkleTreeId.NOTE_HASH_TREE, uncommittedNote, true)).resolves.toBeUndefined();
    });

    it('clears the database if the rollup is different', async () => {
      // open ws against the same data dir but a different rollup
      let ws = await NativeWorldStateService.create(EthAddress.random(), dataDir);
      // db should be empty
      await expect(ws.findLeafIndex(MerkleTreeId.NOTE_HASH_TREE, committedNote, false)).resolves.toBeUndefined();

      await ws.closeRootDatabase();

      // later on, open ws against the original rollup and same data dir
      // db should be empty because we wiped all its files earlier
      ws = await NativeWorldStateService.create(rollupAddress, dataDir);
      await expect(ws.findLeafIndex(MerkleTreeId.NOTE_HASH_TREE, committedNote, false)).resolves.toBeUndefined();
    });
  });
});
