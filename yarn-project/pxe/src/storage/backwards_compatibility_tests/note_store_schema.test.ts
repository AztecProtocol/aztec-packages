import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { Note, NoteDao } from '@aztec/stdlib/note';
import { TxHash } from '@aztec/stdlib/tx';

import { PXE_DATA_SCHEMA_VERSION } from '../metadata.js';
import { NoteStore } from '../note_store/note_store.js';
import { snapshotMap, snapshotMultiMap } from './kv_store_snapshot.js';

describe('NoteStore schema compatibility', () => {
  it('persists added notes after commit', async () => {
    const kvStore = await openTmpStore('pxe-schema-note-store', true);
    try {
      const noteStore = new NoteStore(kvStore);

      const jobId = 'fixture-job';
      const contractAddress = AztecAddress.fromBigInt(7n);
      const owner = AztecAddress.fromBigInt(11n);
      const scope = AztecAddress.fromBigInt(43n);

      const noteDao = new NoteDao(
        new Note([new Fr(2n), new Fr(3n), new Fr(5n)]),
        contractAddress,
        owner,
        new Fr(13n),
        new Fr(17n),
        new Fr(19n),
        new Fr(23n),
        new Fr(29n),
        TxHash.fromField(new Fr(31n)),
        BlockNumber(37),
        new Fr(41n).toString(),
        43,
        47,
      );

      await noteStore.addNotes([noteDao], scope, jobId);
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
