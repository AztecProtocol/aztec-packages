import { BlockNumber, CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { L2TipsKVStore } from '@aztec/kv-store/stores';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { L2Block } from '@aztec/stdlib/block';
import { Checkpoint, L1PublishedData, PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import { GasFees } from '@aztec/stdlib/gas';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import { AppendOnlyTreeSnapshot } from '@aztec/stdlib/trees';

import { PXE_DATA_SCHEMA_VERSION } from '../metadata.js';
import { snapshotMap } from './kv_store_snapshot.js';

describe('L2TipsKVStore schema compatibility', () => {
  it('persists tips, hashes, block-to-checkpoint mappings, and checkpoints across event types', async () => {
    const kvStore = await openTmpStore('pxe-schema-l2-tips', true);
    try {
      const l2TipsStore = new L2TipsKVStore(kvStore, 'pxe');

      // Build a deterministic PublishedCheckpoint with primes for every primitive field that
      // serializes outside `L2Block`. The single inner block uses `L2Block.empty()` because
      // building one from scratch with primes is prohibitive; same-width swaps inside the empty
      // block remain invisible, but the full L2Block.toBuffer width and structure are pinned via
      // the surrounding buffer length.
      const checkpoint = new Checkpoint(
        new AppendOnlyTreeSnapshot(new Fr(2n), 3),
        new CheckpointHeader(
          new Fr(5n),
          new Fr(7n),
          new Fr(11n),
          new Fr(13n),
          new Fr(17n),
          SlotNumber(19),
          23n,
          EthAddress.fromField(new Fr(29n)),
          AztecAddress.fromBigInt(31n),
          new GasFees(37n, 41n),
          new Fr(43n),
        ),
        [L2Block.empty()],
        CheckpointNumber(47),
        53n,
      );
      const publishedCheckpoint = new PublishedCheckpoint(
        checkpoint,
        new L1PublishedData(59n, 61n, new Fr(67n).toString()),
        [],
      );

      // Drive the two event paths that together populate all four sub-stores. `'blocks-added'`
      // writes to `pxe_l2_tips` (proposed tag) and `pxe_l2_block_hashes`. `'chain-checkpointed'`
      // writes to all four: tip ('checkpointed' and 'proposedCheckpoint' tags),
      // block-to-checkpoint mapping, and the checkpoint store itself.
      await l2TipsStore.handleBlockStreamEvent({ type: 'blocks-added', blocks: [L2Block.empty()] });
      await l2TipsStore.handleBlockStreamEvent({
        type: 'chain-checkpointed',
        block: { number: BlockNumber(71), hash: new Fr(73n).toString() },
        checkpoint: publishedCheckpoint,
      });
      // `'chain-proven'` writes the 'proven' tag, completing 4 of the 5 L2BlockTag keys
      // (`'finalized'` is omitted because its handler runs delete-before logic that would
      // depend on the order of preceding events).
      await l2TipsStore.handleBlockStreamEvent({
        type: 'chain-proven',
        block: { number: BlockNumber(79), hash: new Fr(83n).toString() },
      });

      const tips = kvStore.openMap<string, number>('pxe_l2_tips');
      const blockHashes = kvStore.openMap<number, string>('pxe_l2_block_hashes');
      const blockToCheckpoint = kvStore.openMap<number, number>('pxe_l2_block_number_to_checkpoint_number');
      const checkpoints = kvStore.openMap<number, Buffer>('pxe_l2_checkpoint_store');

      expect({
        schemaVersion: PXE_DATA_SCHEMA_VERSION,
        pxe_l2_tips: await snapshotMap(tips),
        pxe_l2_block_hashes: await snapshotMap(blockHashes),
        pxe_l2_block_number_to_checkpoint_number: await snapshotMap(blockToCheckpoint),
        pxe_l2_checkpoint_store: await snapshotMap(checkpoints),
      }).toMatchSnapshot();
    } finally {
      await kvStore.close();
    }
  });
});
