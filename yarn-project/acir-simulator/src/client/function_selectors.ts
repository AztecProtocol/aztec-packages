import { FunctionSelector } from '@aztec/circuits.js';

export const computeNoteHashAndNullifierSignature = 'compute_note_hash_and_nullifier(Field,Field,Field,[Field;3])';

export const computeNoteHashAndNullifierSelector = FunctionSelector.fromSignature(computeNoteHashAndNullifierSignature);
