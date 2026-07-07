import type { Fr } from '@aztec/foundation/curves/bn254';
import type { Point } from '@aztec/foundation/curves/grumpkin';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { AppTaggingSecretKind } from '@aztec/stdlib/logs';

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

/** The strategy PXE applies to both delivery modes when no `resolveTaggingSecretStrategy` hook is configured. */
export const DEFAULT_TAGGING_SECRET_STRATEGY: TaggingSecretStrategy = { type: 'non-interactive-handshake' };

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
