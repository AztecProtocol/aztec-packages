import { Fr } from '@aztec/foundation/curves/bn254';
import { FieldReader } from '@aztec/foundation/serialize';

/**
 * A tagging secret an app supplies explicitly to `getPendingTaggedLogs` when PXE cannot derive it internally.
 */
export class ProvidedSecret {
  constructor(public secret: Fr) {}

  static fromFields(fields: Fr[] | FieldReader): ProvidedSecret {
    const reader = FieldReader.asReader(fields);
    return new ProvidedSecret(reader.readField());
  }
}
