import type { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { NoteStatus } from '@aztec/stdlib/note';

import type { AccessScopes } from './access_scopes.js';

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
  scopes: AccessScopes;
};
