import { Fr } from '@aztec/foundation/curves/bn254';
import { FieldReader } from '@aztec/foundation/serialize';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { TxHash } from '@aztec/stdlib/tx';

/**
 * Intermediate struct used to perform batch note validation by PXE. The `utilityValidateAndStoreEnqueuedNotesAndEvents` oracle
 * expects for values of this type to be stored in a `EphemeralArray`.
 */
export class NoteValidationRequest {
  constructor(
    public contractAddress: AztecAddress,
    public owner: AztecAddress,
    public storageSlot: Fr,
    public randomness: Fr,
    public noteNonce: Fr,
    public content: Fr[],
    public noteHash: Fr,
    public nullifier: Fr,
    public txHash: TxHash,
  ) {}

  static fromFields(fields: Fr[] | FieldReader): NoteValidationRequest {
    const reader = FieldReader.asReader(fields);

    const contractAddress = AztecAddress.fromField(reader.readField());
    const owner = AztecAddress.fromField(reader.readField());
    const storageSlot = reader.readField();
    const randomness = reader.readField();
    const noteNonce = reader.readField();

    const maxNotePackedLen = reader.readField().toNumber();
    const contentStorage = reader.readFieldArray(maxNotePackedLen);
    const contentLen = reader.readField().toNumber();
    const content = contentStorage.slice(0, contentLen);

    const noteHash = reader.readField();
    const nullifier = reader.readField();
    const txHash = TxHash.fromField(reader.readField());

    if (reader.remainingFields() !== 0) {
      throw new Error(
        `Error converting array of fields to NoteValidationRequest: expected ${reader.cursor} fields but received ${reader.cursor + reader.remainingFields()} (maxNotePackedLen=${maxNotePackedLen}).`,
      );
    }

    return new NoteValidationRequest(
      contractAddress,
      owner,
      storageSlot,
      randomness,
      noteNonce,
      content,
      noteHash,
      nullifier,
      txHash,
    );
  }
}
