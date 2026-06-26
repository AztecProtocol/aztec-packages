import type { Fr } from '@aztec/foundation/curves/bn254';
import type { AppTaggingSecretKind } from '@aztec/stdlib/logs';

/** A tagging secret an app supplies explicitly to `getPendingTaggedLogs` when PXE cannot derive it internally. */
export type ProvidedSecret = { secret: Fr; mode: AppTaggingSecretKind };
