import { type L2Block, MerkleTreeId } from '@aztec/circuit-types';
import { AppendOnlyTreeSnapshot, EthAddress, Fr, Header } from '@aztec/circuits.js';
import { makeContentCommitment, makeGlobalVariables } from '@aztec/circuits.js/testing';

import { mkdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { NativeWorldStateService } from './native_world_state.js';
import { assertSameState, mockBlock } from './test_util.js';

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
    let block: L2Block;
    let messages: Fr[];

    beforeAll(async () => {
      const ws = await NativeWorldStateService.new(rollupAddress, dataDir);
      const fork = await ws.fork();
      ({ block, messages } = await mockBlock(1, fork));
      await fork.close();

      await ws.handleL2BlockAndMessages(block, messages);
      await ws.close();
    });

    it('correctly restores committed state', async () => {
      const ws = await NativeWorldStateService.new(rollupAddress, dataDir);
      await expect(
        ws.getCommitted().findLeafIndex(MerkleTreeId.NOTE_HASH_TREE, block.body.txEffects[0].noteHashes[0]),
      ).resolves.toBeDefined();
      await ws.close();
    });

    it('clears the database if the rollup is different', async () => {
      // open ws against the same data dir but a different rollup
      let ws = await NativeWorldStateService.new(EthAddress.random(), dataDir);
      // db should be empty
      await expect(
        ws.getCommitted().findLeafIndex(MerkleTreeId.NOTE_HASH_TREE, block.body.txEffects[0].noteHashes[0]),
      ).resolves.toBeUndefined();

      await ws.close();

      // later on, open ws against the original rollup and same data dir
      // db should be empty because we wiped all its files earlier
      ws = await NativeWorldStateService.new(rollupAddress, dataDir);
      await expect(
        ws.getCommitted().findLeafIndex(MerkleTreeId.NOTE_HASH_TREE, block.body.txEffects[0].noteHashes[0]),
      ).resolves.toBeUndefined();
      await ws.close();
    });
  });

  describe('Forks', () => {
    let ws: NativeWorldStateService;

    beforeEach(async () => {
      ws = await NativeWorldStateService.new(rollupAddress, dataDir);
    });

    afterEach(async () => {
      await ws.close();
    });

    it('creates a fork', async () => {
      const initialHeader = ws.getInitialHeader();
      const fork = await ws.fork();
      await assertSameState(fork, ws.getCommitted());

      expect(fork.getInitialHeader()).toEqual(initialHeader);

      const stateReference = await fork.getStateReference();
      const archiveInfo = await fork.getTreeInfo(MerkleTreeId.ARCHIVE);
      const header = new Header(
        new AppendOnlyTreeSnapshot(new Fr(archiveInfo.root), Number(archiveInfo.size)),
        makeContentCommitment(),
        stateReference,
        makeGlobalVariables(),
        Fr.ZERO,
      );

      await fork.updateArchive(header);

      expect(await fork.getTreeInfo(MerkleTreeId.ARCHIVE)).not.toEqual(archiveInfo);
      expect(await ws.getCommitted().getTreeInfo(MerkleTreeId.ARCHIVE)).toEqual(archiveInfo);

      // initial header should still work as before
      expect(fork.getInitialHeader()).toEqual(initialHeader);
    });
  });
});
