import type { Fr } from '@aztec/foundation/curves/bn254';
import type { Point } from '@aztec/foundation/curves/grumpkin';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { AppTaggingSecretKind } from '@aztec/stdlib/logs';

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- only referenced by a {@link} doc tag
import type { ResolveCustomRequest } from './resolve_custom_request.js';

/**
 * How a message's tagging secret is chosen: the wallet's strategy, returned by the `resolveTaggingSecretStrategy` hook
 * when no onchain handshake has been registered for the sender/recipient pair. This is intent (plus, for an arbitrary
 * secret, the raw material); PXE resolves it into the secret it hands the contract.
 */
export type TaggingSecretStrategy =
  | {
      /** Establish a fresh non-interactive handshake via the onchain registry; reveals the recipient onchain. */
      type: 'non-interactive-handshake';
    }
  | {
      /**
       * Establish a fresh interactive handshake via the onchain registry. Reveals nothing about the recipient
       * onchain, but requires the recipient to answer the registry's signed-authorization request (served through
       * the {@link ResolveCustomRequest} hook), so the send fails when it cannot be served.
       */
      type: 'interactive-handshake';
    }
  | {
      /** Derive the secret from the sender's and recipient's address keys via ECDH. PXE computes and silos it. */
      type: 'address-derived';
    }
  | {
      /**
       * A raw shared secret point the two parties already share offchain (e.g. coordinated out-of-band), supplied by
       * the wallet. PXE app-silos it before use. Only sound for unconstrained delivery, since nothing onchain proves
       * the recipient knows it.
       */
      type: 'arbitrary-secret';
      /** The raw (un-siloed) shared secret point to derive the tag from. */
      secret: Point;
    };

/** Information about the message delivery requesting a tagging secret strategy. */
export type TaggingSecretStrategyRequest = {
  contractAddress: AztecAddress;
  /**
   * The contract class ID of the executing contract, so wallets can apply class-level (not just per-address) policy.
   */
  contractClassId: Fr;
  sender: AztecAddress;
  recipient: AztecAddress;
  deliveryMode: AppTaggingSecretKind;
};

/**
 * Hook returning the {@link TaggingSecretStrategy} for an outgoing message.
 */
export type ResolveTaggingSecretStrategy = (request: TaggingSecretStrategyRequest) => Promise<TaggingSecretStrategy>;
