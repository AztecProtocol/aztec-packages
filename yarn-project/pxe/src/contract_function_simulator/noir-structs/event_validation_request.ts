import { Fr } from '@aztec/foundation/curves/bn254';
import { FieldReader } from '@aztec/foundation/serialize';
import { EventSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { TxHash } from '@aztec/stdlib/tx';

// Event content is serialized as a BoundedVec: `storage[capacity] ++ len`. The storage capacity may differ across
// aztec-nr versions (e.g. old contracts used 11, current ones use 10), so we infer it dynamically from the total field
// count. This constant is only used to validate the *content length* (the BoundedVec `.len()`), not the storage size.
const MAX_EVENT_CONTENT_LEN = 10;

/**
 * Intermediate struct used to perform batch event validation by PXE. The `utilityValidateAndStoreEnqueuedNotesAndEvents` oracle
 * expects for values of this type to be stored in a `CapsuleArray`.
 */
export class EventValidationRequest {
  constructor(
    public contractAddress: AztecAddress,
    public eventTypeId: EventSelector,
    public randomness: Fr,
    public serializedEvent: Fr[],
    public eventCommitment: Fr,
    public txHash: TxHash,
    public recipient: AztecAddress,
  ) {}

  static fromFields(fields: Fr[] | FieldReader): EventValidationRequest {
    const reader = FieldReader.asReader(fields);

    const contractAddress = AztecAddress.fromField(reader.readField());
    const eventTypeId = EventSelector.fromField(reader.readField());

    const randomness = reader.readField();

    // Infer BoundedVec storage size from total field count for backward compat with older aztec-nr versions.
    const FOOTER_FIELDS = 4; // 1 BoundedVec len + eventCommitment + txHash + recipient
    const arraySize = reader.remainingFields() - FOOTER_FIELDS;
    if (arraySize < 0) {
      throw new Error(
        `Malformed EventValidationRequest: expected at least ${FOOTER_FIELDS} fields after header, got ${reader.remainingFields()}.`,
      );
    }

    const eventStorage = reader.readFieldArray(arraySize);
    const eventLen = reader.readField().toNumber();
    if (eventLen > MAX_EVENT_CONTENT_LEN) {
      throw new Error(`Event content length ${eventLen} exceeds MAX_EVENT_CONTENT_LEN ${MAX_EVENT_CONTENT_LEN}.`);
    }
    if (eventLen > arraySize) {
      throw new Error(`Event content length ${eventLen} exceeds BoundedVec storage capacity ${arraySize}.`);
    }
    const serializedEvent = eventStorage.slice(0, eventLen);

    const eventCommitment = reader.readField();
    const txHash = TxHash.fromField(reader.readField());
    const recipient = AztecAddress.fromField(reader.readField());

    return new EventValidationRequest(
      contractAddress,
      eventTypeId,
      randomness,
      serializedEvent,
      eventCommitment,
      txHash,
      recipient,
    );
  }
}
