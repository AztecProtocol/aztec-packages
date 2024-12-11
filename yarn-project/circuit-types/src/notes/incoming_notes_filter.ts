import { type AztecAddress, type Fr } from '@aztec/circuits.js';
import { type ZodFor, schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

import { TxHash } from '../tx/tx_hash.js';
import { NoteStatus } from './note_status.js';

/**
 * A filter used to fetch incoming notes.
 * @remarks This filter is applied as an intersection of all its params.
 */
export type IncomingNotesFilter = {
  /** Hash of a transaction from which to fetch the notes. */
  txHash?: TxHash;
  /** The contract address the note belongs to. */
  contractAddress?: AztecAddress;
  /** The specific storage location of the note on the contract. */
  storageSlot?: Fr;
  /** The owner of the note (whose public key was used to encrypt the note). */
  owner?: AztecAddress;
  /** The status of the note. Defaults to 'ACTIVE'. */
  status?: NoteStatus;
  /** The siloed nullifier for the note. */
  siloedNullifier?: Fr;
  /** The scopes in which to get incoming notes from. This defaults to all scopes. */
  scopes?: AztecAddress[];
};

export const IncomingNotesFilterSchema: ZodFor<IncomingNotesFilter> = z.object({
  txHash: TxHash.schema.optional(),
  contractAddress: schemas.AztecAddress.optional(),
  storageSlot: schemas.Fr.optional(),
  owner: schemas.AztecAddress.optional(),
  status: z.nativeEnum(NoteStatus).optional(),
  siloedNullifier: schemas.Fr.optional(),
  scopes: z.array(schemas.AztecAddress).optional(),
});
