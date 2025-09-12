import type { Fr } from '@aztec/foundation/fields';

import { z } from 'zod';

import type { AztecAddress } from '../aztec-address/index.js';
import { type ZodFor, schemas } from '../schemas/index.js';
import { TxHash } from '../tx/tx_hash.js';
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
  /** Hash of a transaction from which to fetch the notes. */
  txHash?: TxHash;
  /** The specific storage location of the note on the contract. */
  storageSlot?: Fr;
  /** The recipient of the note (whose public key was used to encrypt the note). */
  recipient?: AztecAddress;
  /** The status of the note. Defaults to 'ACTIVE'. */
  status?: NoteStatus;
  /** The siloed nullifier for the note. */
  siloedNullifier?: Fr;
  /** The scopes in which to get notes from. This defaults to all scopes. */
  scopes?: AztecAddress[];
};

export const NotesFilterSchema: ZodFor<NotesFilter> = z.object({
  contractAddress: schemas.AztecAddress,
  txHash: TxHash.schema.optional(),
  storageSlot: schemas.Fr.optional(),
  recipient: schemas.AztecAddress.optional(),
  status: z.nativeEnum(NoteStatus).optional(),
  siloedNullifier: schemas.Fr.optional(),
  scopes: z.array(schemas.AztecAddress).optional(),
});
