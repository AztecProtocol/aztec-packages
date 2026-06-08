import { Fr } from '@aztec/foundation/curves/bn254';
import { FieldReader } from '@aztec/foundation/serialize';
import { AppTaggingSecretKind, appTaggingSecretKindFromDeliveryMode } from '@aztec/stdlib/logs';

/** A tagging secret an app supplies explicitly to `getPendingTaggedLogs` when PXE cannot derive it internally. */
export class ProvidedSecret {
  constructor(
    public secret: Fr,
    public mode: AppTaggingSecretKind,
  ) {}

  static fromFields(fields: Fr[] | FieldReader): ProvidedSecret {
    const reader = FieldReader.asReader(fields);
    return new ProvidedSecret(reader.readField(), appTaggingSecretKindFromDeliveryMode(reader.readField().toNumber()));
  }
}
