import { DomainSeparator } from '@aztec/constants';
import { Grumpkin } from '@aztec/foundation/crypto/grumpkin';
import { poseidon2Hash } from '@aztec/foundation/crypto/poseidon';
import { type Fq, Fr } from '@aztec/foundation/curves/bn254';
import type { Point } from '@aztec/foundation/curves/grumpkin';

import { z } from 'zod';

import { AztecAddress } from '../aztec-address/index.js';
import type { CompleteAddress } from '../contract/complete_address.js';
import { computeLogTag } from '../hash/hash.js';
import { computeAddressSecret, computePreaddress } from '../keys/derivation.js';
import { AppTaggingSecretKind } from './app_tagging_secret_kind.js';
import { SiloedTag } from './siloed_tag.js';
import { Tag } from './tag.js';

const AppTaggingSecretKindSchema = z.union([
  z.literal(AppTaggingSecretKind.UNCONSTRAINED),
  z.literal(AppTaggingSecretKind.CONSTRAINED),
]);

/**
 * Sender-side application tagging secret used for log tagging.
 *
 * It bundles a tagging secret with the app contract address. Unconstrained secrets are derived by the simulator from
 * `(sender, recipient, app)` via ECDH. Constrained secrets are supplied to the simulator by the caller as an
 * app-siloed shared secret retrieved from a handshake registry.
 */
export class AppTaggingSecret {
  constructor(
    public readonly secret: Fr,
    public readonly app: AztecAddress,
    public readonly kind: AppTaggingSecretKind = AppTaggingSecretKind.UNCONSTRAINED,
  ) {}

  /**
   * Derives shared tagging secret and from that, the app address and recipient derives the directional app tagging
   * secret. Returns undefined if `externalAddress` is an invalid address.
   *
   * @param localAddress - The complete address of entity A in the shared tagging secret derivation scheme
   * @param localIvsk - The incoming viewing secret key of entity A
   * @param externalAddress - The address of entity B in the shared tagging secret derivation scheme
   * @param app - Contract address to silo the secret to
   * @param recipient - Recipient of the log. Defines the "direction of the secret".
   * @returns The secret that can be used along with an index to compute a tag to be included in a log.
   */
  static async compute(
    localAddress: CompleteAddress,
    localIvsk: Fq,
    externalAddress: AztecAddress,
    app: AztecAddress,
    recipient: AztecAddress,
  ): Promise<AppTaggingSecret | undefined> {
    const taggingSecretPoint = await computeSharedTaggingSecret(localAddress, localIvsk, externalAddress);
    if (!taggingSecretPoint) {
      return undefined;
    }

    const appTaggingSecret = await poseidon2Hash([taggingSecretPoint.x, taggingSecretPoint.y, app]);
    const directionalAppTaggingSecret = await poseidon2Hash([appTaggingSecret, recipient]);

    return new AppTaggingSecret(directionalAppTaggingSecret, app);
  }

  toString(): string {
    // Keep the existing two-part unconstrained key so stored tagging entries remain addressable.
    if (this.kind === AppTaggingSecretKind.UNCONSTRAINED) {
      return `${this.secret.toString()}:${this.app.toString()}`;
    }
    return `${this.kind}:${this.secret.toString()}:${this.app.toString()}`;
  }

  static fromString(str: string): AppTaggingSecret {
    const parts = str.split(':');
    if (parts.length === 2) {
      const [secretStr, appStr] = parts;
      return new AppTaggingSecret(Fr.fromString(secretStr), AztecAddress.fromString(appStr));
    }
    if (parts.length === 3) {
      const [kindStr, secretStr, appStr] = parts;
      return new AppTaggingSecret(
        Fr.fromString(secretStr),
        AztecAddress.fromString(appStr),
        appTaggingSecretKindFromString(kindStr),
      );
    }
    throw new Error(`Invalid AppTaggingSecret string: ${str}`);
  }
}

/**
 * Parses a stored `AppTaggingSecret` string key.
 */
export function appTaggingSecretFromString(str: string): AppTaggingSecret {
  return AppTaggingSecret.fromString(str);
}

/**
 * Returns the domain separator used by `compute_log_tag` for the given secret's delivery mode.
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
 * Computes the onchain siloed first-field for a given `(secret, index)` pair.
 */
export async function siloedTagFor(secret: AppTaggingSecret, index: number): Promise<SiloedTag> {
  const rawTag = await poseidon2Hash([secret.secret, new Fr(index)]);
  const logTag = await computeLogTag(rawTag, messageLogTagDomainSeparatorFor(secret));
  return SiloedTag.computeFromTagAndApp(new Tag(logTag), secret.app);
}

export const AppTaggingSecretSchema = z
  .object({
    kind: AppTaggingSecretKindSchema.default(AppTaggingSecretKind.UNCONSTRAINED),
    secret: Fr.schema,
    app: AztecAddress.schema,
  })
  .transform(({ kind, secret, app }) => new AppTaggingSecret(secret, app, kind));

function appTaggingSecretKindFromString(kind: string): AppTaggingSecretKind {
  switch (kind) {
    case AppTaggingSecretKind.CONSTRAINED:
      return AppTaggingSecretKind.CONSTRAINED;
    case AppTaggingSecretKind.UNCONSTRAINED:
      return AppTaggingSecretKind.UNCONSTRAINED;
    default:
      throw new Error(`Invalid AppTaggingSecret kind: ${kind}`);
  }
}

// Returns shared tagging secret computed with Diffie-Hellman key exchange, or undefined if `externalAddress` is an
// invalid address.
async function computeSharedTaggingSecret(
  localAddress: CompleteAddress,
  localIvsk: Fq,
  externalAddress: AztecAddress,
): Promise<Point | undefined> {
  // Given A (local complete address) -> B (external address) and h == preaddress
  // Compute shared secret as S = (h_A + local_ivsk_A) * Addr_Point_B

  const knownPreaddress = await computePreaddress(await localAddress.publicKeys.hash(), localAddress.partialAddress);

  // An invalid address has no corresponding address point
  if (!(await externalAddress.isValid())) {
    return undefined;
  }

  const externalAddressPoint = await externalAddress.toAddressPoint();

  // Beware! h_a + local_ivsk_a (also known as the address secret) can lead to an address point with a negative
  // y-coordinate, since there's two possible candidates computeAddressSecret takes care of selecting the one that
  // leads to a positive y-coordinate, which is the only valid address point
  return Grumpkin.mul(externalAddressPoint, await computeAddressSecret(knownPreaddress, localIvsk));
}
