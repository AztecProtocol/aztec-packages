import { Fr } from '@aztec/foundation/curves/bn254';

const NON_INTERACTIVE_HANDSHAKE = 1;
const SHARED_SECRET = 2;

/**
 * How a message's tagging secret is sourced, decided by the wallet's `resolveTaggingSecret` hook when no secret is
 * already established for the sender/recipient pair. Each variant carries whatever material its derivation needs.
 */
export type TaggingSecretSource =
  | {
      /** Establish a fresh non-interactive handshake via the on-chain registry; reveals the recipient on-chain. */
      type: 'non-interactive-handshake';
    }
  | {
      /**
       * A secret the two parties already share off-chain (e.g. via Diffie-Hellman); only sound for unconstrained
       * delivery, since nothing on-chain proves the recipient knows it.
       */
      type: 'shared-secret';
      /** The shared secret to derive the tag from. */
      secret: Fr;
    };

/** Serializes a {@link TaggingSecretSource} to its Noir `[kind, secret]` field layout, zero-filling absent fields. */
export function taggingSecretSourceToFields(source: TaggingSecretSource): Fr[] {
  switch (source.type) {
    case 'non-interactive-handshake':
      return [new Fr(NON_INTERACTIVE_HANDSHAKE), Fr.ZERO];
    case 'shared-secret':
      return [new Fr(SHARED_SECRET), source.secret];
  }
}

/** Deserializes a {@link TaggingSecretSource} from its `kind` discriminant and `secret` field. */
export function taggingSecretSourceFromFields(kind: number, secret: Fr): TaggingSecretSource {
  switch (kind) {
    case NON_INTERACTIVE_HANDSHAKE:
      return { type: 'non-interactive-handshake' };
    case SHARED_SECRET:
      return { type: 'shared-secret', secret };
    default:
      throw new Error(`Unrecognized tagging secret source kind: ${kind}`);
  }
}
