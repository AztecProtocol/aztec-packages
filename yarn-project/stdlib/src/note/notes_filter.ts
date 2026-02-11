import type { Fr } from '@aztec/foundation/curves/bn254';

import { z } from 'zod';

import type { AztecAddress } from '../aztec-address/index.js';
import { type ZodFor, schemas } from '../schemas/index.js';
import { NoteStatus } from './note_status.js';

/**
 * A filter used to fetch notes.
 * @remarks This filter is applied as an intersection of all its params.
 */
export type NotesFilter = {
  /**
   * The contract address the note belongs to.
   * @remarks Providing a contract address is required as we need that information to trigger private state sync.
   */
  contractAddress: AztecAddress;
  /** The owner of the note. */
  owner?: AztecAddress;
  /** The specific storage location of the note on the contract. */
  storageSlot?: Fr;
  /** The status of the note. Defaults to 'ACTIVE'. */
  status?: NoteStatus;
  /** The siloed nullifier for the note. */
  siloedNullifier?: Fr;
  /**
   * The scopes in which to get notes from
   * Undefined scopes means all scopes, while empty list of scopes means no scope at all
   */
  scopes?: AztecAddress[];
};

export const NotesFilterSchema: ZodFor<NotesFilter> = z.object({
  contractAddress: schemas.AztecAddress,
  owner: schemas.AztecAddress.optional(),
  storageSlot: schemas.Fr.optional(),
  status: z.nativeEnum(NoteStatus).optional(),
  siloedNullifier: schemas.Fr.optional(),
  scopes: z.array(schemas.AztecAddress).optional(),
});
