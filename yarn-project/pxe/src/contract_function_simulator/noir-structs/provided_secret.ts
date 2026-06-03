import { Fr } from '@aztec/foundation/curves/bn254';
import { FieldReader } from '@aztec/foundation/serialize';
import { AppTaggingSecretKind } from '@aztec/stdlib/logs';

/** A tagging secret an app supplies explicitly to `getPendingTaggedLogs` when PXE cannot derive it internally. */
export class ProvidedSecret {
  constructor(
    public secret: Fr,
    public mode: AppTaggingSecretKind,
  ) {}

  static fromFields(fields: Fr[] | FieldReader): ProvidedSecret {
    const reader = FieldReader.asReader(fields);
    return new ProvidedSecret(reader.readField(), kindFromField(reader.readField()));
  }
}

function kindFromField(mode: Fr): AppTaggingSecretKind {
  switch (mode.toBigInt()) {
    case 0n:
      return AppTaggingSecretKind.UNCONSTRAINED;
    case 1n:
      return AppTaggingSecretKind.CONSTRAINED;
    default:
      throw new Error(`Invalid app tagging secret kind: ${mode.toString()}`);
  }
}
