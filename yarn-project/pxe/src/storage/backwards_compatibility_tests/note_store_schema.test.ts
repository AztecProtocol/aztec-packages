import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash } from '@aztec/stdlib/block';
import { Note, NoteDao } from '@aztec/stdlib/note';
import { TxHash } from '@aztec/stdlib/tx';

import { PXE_DATA_SCHEMA_VERSION } from '../metadata.js';
import { NoteStore } from '../note_store/note_store.js';
import { snapshotMap, snapshotMultiMap } from './kv_store_snapshot.js';

describe('NoteStore schema compatibility', () => {
  it('persists active and nullified notes across all three sub-stores', async () => {
    const kvStore = await openTmpStore('pxe-schema-note-store', true);
    try {
      const noteStore = new NoteStore(kvStore);

      const jobId = 'fixture-job';

      // Two contracts so `note_nullifiers_by_contract` exhibits both a multi-value row (contractA → {n1, n2})
      // and a single-value row (contractB → {n3}).
      const contractA = AztecAddress.fromBigInt(2n);
      const contractB = AztecAddress.fromBigInt(3n);
      const scopeX = AztecAddress.fromBigInt(5n);
      const scopeY = AztecAddress.fromBigInt(7n);

      // note1: active, will be added under two scopes to exercise the multi-element scopes vector encoding
      // in `StoredNote.toBuffer`.
      const note1 = new NoteDao(
        new Note([new Fr(13n), new Fr(17n), new Fr(19n)]),
        contractA,
        AztecAddress.fromBigInt(23n),
        new Fr(29n),
        new Fr(31n),
        new Fr(37n),
        new Fr(41n),
        new Fr(43n),
        TxHash.fromField(new Fr(47n)),
        BlockNumber(53),
        new Fr(59n).toString(),
        61,
        67,
      );

      // note2: same contract as note1 → produces the multi-value row in `note_nullifiers_by_contract`.
      const note2 = new NoteDao(
        new Note([new Fr(71n), new Fr(73n), new Fr(79n)]),
        contractA,
        AztecAddress.fromBigInt(83n),
        new Fr(89n),
        new Fr(97n),
        new Fr(101n),
        new Fr(103n),
        new Fr(107n),
        TxHash.fromField(new Fr(109n)),
        BlockNumber(113),
        new Fr(127n).toString(),
        131,
        137,
      );

      // note3: different contract; will be nullified to populate `note_block_number_to_nullifier` and
      // exercise the populated `_nullifiedAt` trailer of `StoredNote.toBuffer`.
      const note3 = new NoteDao(
        new Note([new Fr(139n), new Fr(149n), new Fr(151n)]),
        contractB,
        AztecAddress.fromBigInt(157n),
        new Fr(163n),
        new Fr(167n),
        new Fr(173n),
        new Fr(179n),
        new Fr(181n),
        TxHash.fromField(new Fr(191n)),
        BlockNumber(193),
        new Fr(197n).toString(),
        199,
        211,
      );

      // Adding note1 twice with different scopes triggers `addScope` on the staged StoredNote, producing a
      // 2-element scope vector in the committed buffer.
      await noteStore.addNotes([note1], scopeX, jobId);
      await noteStore.addNotes([note1], scopeY, jobId);
      await noteStore.addNotes([note2], scopeX, jobId);
      await noteStore.addNotes([note3], scopeX, jobId);

      // Nullify note3 within the same job. `applyNullifiers` reads the staged StoredNote, sets `_nullifiedAt`,
      // and writes back to the staged map; `commit` then flushes it to disk with the populated trailer and
      // adds the corresponding `note_block_number_to_nullifier` entry.
      await noteStore.applyNullifiers(
        [{ data: note3.siloedNullifier, l2BlockNumber: BlockNumber(223), l2BlockHash: BlockHash.ZERO }],
        jobId,
      );

      await kvStore.transactionAsync(() => noteStore.commit(jobId));

      const notes = kvStore.openMap<string, Buffer>('notes');
      const nullifiersByContract = kvStore.openMultiMap<string, string>('note_nullifiers_by_contract');
      const nullifiersByBlock = kvStore.openMultiMap<number, string>('note_block_number_to_nullifier');

      expect({
        schemaVersion: PXE_DATA_SCHEMA_VERSION,
        notes: await snapshotMap(notes),
        note_nullifiers_by_contract: await snapshotMultiMap(nullifiersByContract),
        note_block_number_to_nullifier: await snapshotMultiMap(nullifiersByBlock),
      }).toMatchSnapshot();
    } finally {
      await kvStore.close();
    }
  });
});
