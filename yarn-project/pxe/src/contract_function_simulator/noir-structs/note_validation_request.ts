import { Fr } from '@aztec/foundation/curves/bn254';
import { FieldReader } from '@aztec/foundation/serialize';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { TxHash } from '@aztec/stdlib/tx';

// Default BoundedVec storage capacity for contracts that don't explicitly store their capacity.
// TODO(F-380): remove once all contracts store capacity explicitly.
export const DEFAULT_NOTE_BOUNDED_VEC_CAPACITY = 9;

/**
 * Intermediate struct used to perform batch note validation by PXE. The `utilityValidateAndStoreEnqueuedNotesAndEvents` oracle
 * expects for values of this type to be stored in a `CapsuleArray`.
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
    public recipient: AztecAddress,
  ) {}

  static fromFields(fields: Fr[], capacity: number = DEFAULT_NOTE_BOUNDED_VEC_CAPACITY): NoteValidationRequest {
    const reader = FieldReader.asReader(fields);

    const contractAddress = AztecAddress.fromField(reader.readField());
    const owner = AztecAddress.fromField(reader.readField());
    const storageSlot = reader.readField();
    const randomness = reader.readField();
    const noteNonce = reader.readField();

    const contentStorage = reader.readFieldArray(capacity);
    const contentLen = reader.readField().toNumber();
    const content = contentStorage.slice(0, contentLen);

    const noteHash = reader.readField();
    const nullifier = reader.readField();
    const txHash = TxHash.fromField(reader.readField());
    const recipient = AztecAddress.fromField(reader.readField());

    if (reader.remainingFields() !== 0) {
      throw new Error(
        `NoteValidationRequest deserialization did not consume all fields: ${reader.remainingFields()} remaining (capacity=${capacity}).`,
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
      recipient,
    );
  }
}
