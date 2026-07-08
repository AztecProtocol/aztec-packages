import { Fr } from '@aztec/foundation/curves/bn254';

// Keep in sync with aztec::messages::delivery::ResolvedTaggingStrategy
const NON_INTERACTIVE_HANDSHAKE = 1;
const UNCONSTRAINED_SECRET = 2;
const INTERACTIVE_HANDSHAKE = 3;

/**
 * The tagging secret PXE hands to the contract after applying the wallet's {@link TaggingSecretStrategy} choice
 * (and app-siloing). The contract uses it directly to derive the message tag, so it never sees raw key material.
 */
export type ResolvedTaggingStrategy =
  | {
      /** A non-interactive handshake: the recipient re-derives the secret from the onchain handshake registry. */
      type: 'non-interactive-handshake';
    }
  | {
      /**
       * An interactive handshake: the registry obtains the recipient's signed authorization through the custom
       * request oracle, and the recipient learns the secret while signing. Nothing announcing the handshake is
       * published onchain.
       */
      type: 'interactive-handshake';
    }
  | {
      /**
       * An app-siloed, recipient-directional secret, ready to use. Only sound for unconstrained delivery.
       */
      type: 'unconstrained-secret';
      /** The app-siloed directional tagging secret. */
      secret: Fr;
    };

/** Serializes a {@link ResolvedTaggingStrategy} to its Noir `[kind, secret]` field layout, zero-filling absent fields. */
export function resolvedTaggingStrategyToFields(resolved: ResolvedTaggingStrategy): Fr[] {
  switch (resolved.type) {
    case 'non-interactive-handshake':
      return [new Fr(NON_INTERACTIVE_HANDSHAKE), Fr.ZERO];
    case 'unconstrained-secret':
      return [new Fr(UNCONSTRAINED_SECRET), resolved.secret];
    case 'interactive-handshake':
      return [new Fr(INTERACTIVE_HANDSHAKE), Fr.ZERO];
  }
}

/** Deserializes a {@link ResolvedTaggingStrategy} from its `kind` discriminant and `secret` field. */
export function resolvedTaggingStrategyFromFields(kind: number, secret: Fr): ResolvedTaggingStrategy {
  switch (kind) {
    case NON_INTERACTIVE_HANDSHAKE:
      assertAbsentSecret(kind, secret);
      return { type: 'non-interactive-handshake' };
    case INTERACTIVE_HANDSHAKE:
      assertAbsentSecret(kind, secret);
      return { type: 'interactive-handshake' };
    case UNCONSTRAINED_SECRET:
      return { type: 'unconstrained-secret', secret };
    default:
      throw unrecognizedResolvedTaggingStrategy(kind);
  }
}

function assertAbsentSecret(kind: number, secret: Fr): void {
  if (!secret.isZero()) {
    throw new Error(`Resolved tagging strategy ${kind} must not include a secret`);
  }
}

function unrecognizedResolvedTaggingStrategy(kind: number): Error {
  return new Error(`Unrecognized resolved tagging strategy kind: ${kind}`);
}
