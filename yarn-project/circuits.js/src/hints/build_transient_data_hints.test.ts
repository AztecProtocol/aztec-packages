import { AztecAddress, Fr, NoteHash, NullifierContext, type ScopedNoteHash } from '@aztec/circuits.js';

import { buildTransientDataHints } from './build_transient_data_hints.js';

describe('buildTransientDataHints', () => {
  const contractAddress = AztecAddress.fromBigInt(987654n);

  let noteHashes: ScopedNoteHash[];
  let nullifiers: NullifierContext[];

  beforeEach(() => {
    noteHashes = [
      new NoteHash(new Fr(11), 100).scope(700, contractAddress),
      new NoteHash(new Fr(22), 200).scope(0, contractAddress),
      new NoteHash(new Fr(33), 300).scope(500, contractAddress),
    ];
    nullifiers = [
      new NullifierContext(new Fr(44), 400, new Fr(0), contractAddress),
      new NullifierContext(new Fr(55), 500, new Fr(33), contractAddress),
      new NullifierContext(new Fr(66), 600, new Fr(0), contractAddress),
      new NullifierContext(new Fr(77), 700, new Fr(11), contractAddress),
    ];
  });

  it('builds index hints that link transient note hashes and nullifiers', () => {
    const [nullifierIndexes, noteHashIndexes] = buildTransientDataHints(noteHashes, nullifiers);
    expect(nullifierIndexes).toEqual([3, 4, 1]);
    expect(noteHashIndexes).toEqual([3, 2, 3, 0]);
  });

  it('throws if no matching nullifier', () => {
    noteHashes[0].nullifierCounter = 450;
    expect(() => buildTransientDataHints(noteHashes, nullifiers)).toThrow('Unknown nullifier counter.');
  });

  it('throws if note hash does not match', () => {
    nullifiers[1].noteHash = new Fr(11);
    expect(() => buildTransientDataHints(noteHashes, nullifiers)).toThrow('Hinted note hash does not match.');
  });

  it('throws if contract address does not match', () => {
    nullifiers[1].contractAddress = AztecAddress.fromBigInt(123456n);
    expect(() => buildTransientDataHints(noteHashes, nullifiers)).toThrow(
      'Contract address of hinted note hash does not match.',
    );
  });
});
