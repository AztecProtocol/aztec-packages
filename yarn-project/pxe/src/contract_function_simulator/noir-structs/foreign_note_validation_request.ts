import { Fr } from '@aztec/foundation/curves/bn254';
import { FieldReader } from '@aztec/foundation/serialize';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { TxHash } from '@aztec/stdlib/tx';

// TODO(#14617): should we compute this from constants? This value is aztec-nr specific.
export const MAX_NOTE_PACKED_LEN = 10;

/**
 * Intermediate struct used to perform batch validation of foreign notes by PXE.
 * These are notes that were shared with a non-owner recipient, who cannot compute the nullifier.
 * The `utilityValidateAndStoreEnqueuedNotesAndEvents` oracle expects for values of this type to be stored in a
 * `CapsuleArray`.
 */
export class ForeignNoteValidationRequest {
  constructor(
    public readonly contractAddress: AztecAddress,
    public readonly owner: AztecAddress,
    public readonly storageSlot: Fr,
    public readonly randomness: Fr,
    public readonly noteNonce: Fr,
    public readonly content: Fr[],
    public readonly noteHash: Fr,
    // No nullifier field - recipient can't compute it
    public readonly txHash: TxHash,
    public readonly recipient: AztecAddress,
  ) {}

  static fromFields(fields: Fr[] | FieldReader): ForeignNoteValidationRequest {
    const reader = FieldReader.asReader(fields);

    const contractAddress = AztecAddress.fromField(reader.readField());
    const owner = AztecAddress.fromField(reader.readField());
    const storageSlot = reader.readField();
    const randomness = reader.readField();
    const noteNonce = reader.readField();

    const contentStorage = reader.readFieldArray(MAX_NOTE_PACKED_LEN);
    const contentLen = reader.readField().toNumber();
    const content = contentStorage.slice(0, contentLen);

    const noteHash = reader.readField();
    // No nullifier field
    const txHash = TxHash.fromField(reader.readField());
    const recipient = AztecAddress.fromField(reader.readField());

    if (reader.remainingFields() !== 0) {
      throw new Error(
        `Error converting array of fields to ForeignNoteValidationRequest. Hint: check that MAX_NOTE_PACKED_LEN is consistent with private_notes::MAX_NOTE_PACKED_LEN in Aztec-nr.`,
      );
    }

    return new ForeignNoteValidationRequest(
      contractAddress,
      owner,
      storageSlot,
      randomness,
      noteNonce,
      content,
      noteHash,
      txHash,
      recipient,
    );
  }
}
