import { Fr } from '@aztec/foundation/fields';
import { FieldReader } from '@aztec/foundation/serialize';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { TxHash } from '@aztec/stdlib/tx';

const MAX_NOTE_PACKED_LEN = 12; // TODO ??

/**
 * Represents a pending tagged log as it is stored in the pending tagged log array to which the fetchTaggedLogs oracle
 * inserts found private logs. A TS version of `pending_tagged_log.nr`.
 */
export class NotePendingValidation {
  constructor(
    public contractAddress: AztecAddress,
    public storageSlot: Fr,
    public nonce: Fr,
    public content: Fr[],
    public noteHash: Fr,
    public nullifier: Fr,
    public txHash: TxHash,
    public recipient: AztecAddress,
  ) {}

  static fromFields(fields: Fr[] | FieldReader): NotePendingValidation {
    const reader = FieldReader.asReader(fields);

    const contractAddress = AztecAddress.fromField(reader.readField());
    const storageSlot = reader.readField();
    const nonce = reader.readField();

    const contentStorage = reader.readFieldArray(MAX_NOTE_PACKED_LEN);
    const contentLen = reader.readField().toNumber();
    const content = contentStorage.slice(0, contentLen);

    const noteHash = reader.readField();
    const nullifier = reader.readField();
    const txHash = TxHash.fromField(reader.readField());
    const recipient = AztecAddress.fromField(reader.readField());

    return new NotePendingValidation(
      contractAddress,
      storageSlot,
      nonce,
      content,
      noteHash,
      nullifier,
      txHash,
      recipient,
    );
  }
}
