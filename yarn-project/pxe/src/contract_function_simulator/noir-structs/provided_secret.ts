import { Fr } from '@aztec/foundation/curves/bn254';
import { FieldReader } from '@aztec/foundation/serialize';
import { type AppTaggingSecretKind, appTaggingSecretKindFromDeliveryMode } from '@aztec/stdlib/logs';

/**
 * A tagging secret an app supplies explicitly to `getPendingTaggedLogs` when PXE cannot derive it internally.
 */
export class ProvidedSecret {
  constructor(
    public secret: Fr,
    public mode: AppTaggingSecretKind,
  ) {}

  static fromFields(fields: Fr[] | FieldReader): ProvidedSecret {
    const reader = FieldReader.asReader(fields);
    const secret = reader.readField();
    const mode = appTaggingSecretKindFromDeliveryMode(reader.readField().toNumber());
    return new ProvidedSecret(secret, mode);
  }
}
