import { Fr } from '@aztec/foundation/curves/bn254';

import { z } from 'zod';

import { AztecAddress } from '../aztec-address/index.js';
import { AppTaggingSecretKind } from './app_tagging_secret_kind.js';

/**
 * Sender-side tagging key for constrained delivery.
 *
 * Unlike [`ExtendedDirectionalAppTaggingSecret`](./extended_directional_app_tagging_secret.js), which the simulator
 * derives from `(sender, recipient, app)` via ECDH, this secret is supplied to the simulator as a `Field` by the
 * caller. The caller obtained it from a handshake registry as the app-siloed shared secret for a given
 * `(sender, recipient)` pair, and the app contract emits the tag itself as
 * `compute_log_tag(h(secret, index), DOM_SEP__CONSTRAINED_MSG_LOG_TAG)` siloed by the calling contract address.
 *
 * The simulator only keeps this around as a bookkeeping key for the per-secret index counter and to recompute on-chain
 * siloed tags during partial-revert finalization. It never re-derives the secret from PXE-local data.
 *
 * The `app` field is the contract address the on-chain siloed first-field will be siloed by - i.e. the app contract
 * that emitted the constrained-delivered log. This is needed to reconstruct the siloed tag from the stored
 * `(secret, index)` pair.
 */
export class ConstrainedAppTaggingSecret {
  /**
   * Discriminator prefix used in `toString()`. Distinguishes the constrained on-disk key from the unconstrained
   * `${secret}:${app}` form of `ExtendedDirectionalAppTaggingSecret`.
   */
  static readonly PREFIX = 'c:';

  /** In-memory discriminator for the [`AppTaggingSecret`](./app_tagging_secret.js) union. */
  public readonly kind = AppTaggingSecretKind.CONSTRAINED;

  constructor(
    public readonly secret: Fr,
    public readonly app: AztecAddress,
  ) {}

  toString(): string {
    return `${ConstrainedAppTaggingSecret.PREFIX}${this.secret.toString()}:${this.app.toString()}`;
  }

  static fromString(str: string): ConstrainedAppTaggingSecret {
    if (!str.startsWith(ConstrainedAppTaggingSecret.PREFIX)) {
      throw new Error(
        `Expected ConstrainedAppTaggingSecret string to start with '${ConstrainedAppTaggingSecret.PREFIX}', got: ${str}`,
      );
    }
    const [secretStr, appStr] = str.slice(ConstrainedAppTaggingSecret.PREFIX.length).split(':');
    return new ConstrainedAppTaggingSecret(Fr.fromString(secretStr), AztecAddress.fromString(appStr));
  }
}

export const ConstrainedAppTaggingSecretSchema = z
  .object({
    kind: z.literal(AppTaggingSecretKind.CONSTRAINED),
    secret: Fr.schema,
    app: AztecAddress.schema,
  })
  .transform(({ secret, app }) => new ConstrainedAppTaggingSecret(secret, app));
