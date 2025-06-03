import { Fr } from '@aztec/foundation/fields';
import { FieldReader } from '@aztec/foundation/serialize';
import { EventSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { TxHash } from '@aztec/stdlib/tx';

// TODO(#14617): should we compute this from constants? This value is aztec-nr specific.
const MAX_EVENT_SERIALIZED_LEN = 12;

/**
 * Intermediate struct used to perform batch event validation by PXE. The `validateEnqueuedEvents` oracle expects for
 * values of this type to be stored in a `CapsuleArray`.
 */
export class EventValidationRequest {
  constructor(
    public contractAddress: AztecAddress,
    public eventTypeId: EventSelector,
    public serializedEvent: Fr[],
    public eventHash: Fr,
    public txHash: TxHash,
    public recipient: AztecAddress,
    public logIndexInTx: number,
    public txIndexInBlock: number,
  ) {}

  static fromFields(fields: Fr[] | FieldReader): EventValidationRequest {
    const reader = FieldReader.asReader(fields);

    const contractAddress = AztecAddress.fromField(reader.readField());
    const eventTypeId = EventSelector.fromField(reader.readField());

    const eventStorage = reader.readFieldArray(MAX_EVENT_SERIALIZED_LEN);
    const eventLen = reader.readField().toNumber();
    const serializedEvent = eventStorage.slice(0, eventLen);

    const eventHash = reader.readField();
    const txHash = TxHash.fromField(reader.readField());
    const recipient = AztecAddress.fromField(reader.readField());
    const logIndexInTx = reader.readField().toNumber();
    const txIndexInBlock = reader.readField().toNumber();

    return new EventValidationRequest(
      contractAddress,
      eventTypeId,
      serializedEvent,
      eventHash,
      txHash,
      recipient,
      logIndexInTx,
      txIndexInBlock,
    );
  }
}
