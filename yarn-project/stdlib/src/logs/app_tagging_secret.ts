import { DomainSeparator } from '@aztec/constants';
import { poseidon2Hash } from '@aztec/foundation/crypto/poseidon';
import { Fr } from '@aztec/foundation/curves/bn254';

import { computeLogTag } from '../hash/hash.js';
import { AppTaggingSecretKind } from './app_tagging_secret_kind.js';
import { ConstrainedAppTaggingSecret } from './constrained_app_tagging_secret.js';
import { ExtendedDirectionalAppTaggingSecret } from './extended_directional_app_tagging_secret.js';
import { SiloedTag } from './siloed_tag.js';
import { Tag } from './tag.js';

/**
 * Sender-side tagging key. One of two shapes depending on the delivery mode:
 *
 * - [`ExtendedDirectionalAppTaggingSecret`](./extended_directional_app_tagging_secret.js): unconstrained delivery,
 *   simulator-derived via ECDH from `(sender, recipient, app)`.
 * - [`ConstrainedAppTaggingSecret`](./constrained_app_tagging_secret.js): constrained delivery, supplied to the
 *   simulator by the caller as the app-siloed shared secret retrieved from a handshake registry.
 *
 * Both shapes expose `{ secret, app }` and a `kind` literal discriminator, plus a self-describing `toString()` so
 * they can share storage that keys on `secret.toString()`.
 */
export type AppTaggingSecret = ExtendedDirectionalAppTaggingSecret | ConstrainedAppTaggingSecret;

/**
 * Parses a stored `AppTaggingSecret` string key back into its concrete class, dispatching on the discriminator prefix
 * written by `toString()`.
 */
export function appTaggingSecretFromString(str: string): AppTaggingSecret {
  if (str.startsWith(ConstrainedAppTaggingSecret.PREFIX)) {
    return ConstrainedAppTaggingSecret.fromString(str);
  }
  return ExtendedDirectionalAppTaggingSecret.fromString(str);
}

/**
 * Returns the domain separator used by `compute_log_tag` for the given secret's delivery mode. Constrained secrets
 * use `CONSTRAINED_MSG_LOG_TAG`, unconstrained secrets use `UNCONSTRAINED_MSG_LOG_TAG`.
 */
export function messageLogTagDomainSeparatorFor(secret: AppTaggingSecret): DomainSeparator {
  switch (secret.kind) {
    case AppTaggingSecretKind.CONSTRAINED:
      return DomainSeparator.CONSTRAINED_MSG_LOG_TAG;
    case AppTaggingSecretKind.UNCONSTRAINED:
      return DomainSeparator.UNCONSTRAINED_MSG_LOG_TAG;
  }
}

/**
 * Computes the onchain siloed first-field for a given `(secret, index)` pair, matching whatever the app contract
 * emits on chain. Use this when recomputing tags during partial-revert finalization or when scanning the chain for
 * tags belonging to a known secret.
 *
 * The two flavors differ only in which domain separator silos the inner tag. The unconstrained path uses
 * `UNCONSTRAINED_MSG_LOG_TAG`, the constrained path uses `CONSTRAINED_MSG_LOG_TAG`. The final silo by app address is
 * identical for both.
 */
export async function siloedTagFor(secret: AppTaggingSecret, index: number): Promise<SiloedTag> {
  const rawTag = await poseidon2Hash([secret.secret, new Fr(index)]);
  const logTag = await computeLogTag(rawTag, messageLogTagDomainSeparatorFor(secret));
  return SiloedTag.computeFromTagAndApp(new Tag(logTag), secret.app);
}
