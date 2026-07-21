import { Grumpkin } from '@aztec/foundation/crypto/grumpkin';
import { poseidon2Hash } from '@aztec/foundation/crypto/poseidon';
import { type Fq, Fr } from '@aztec/foundation/curves/bn254';
import type { Point } from '@aztec/foundation/curves/grumpkin';

import { z } from 'zod';

import { AztecAddress } from '../aztec-address/index.js';
import type { CompleteAddress } from '../contract/complete_address.js';
import { computeAddressSecret, computePreaddress } from '../keys/derivation.js';
import { AppTaggingSecretKind } from './app_tagging_secret_kind.js';
import { appSiloEcdhSharedSecretPoint } from './shared_secret_derivation.js';

const AppTaggingSecretKindSchema = z.union([
  z.literal(AppTaggingSecretKind.UNCONSTRAINED),
  z.literal(AppTaggingSecretKind.CONSTRAINED),
]);

/**
 * Application tagging secret used for log tagging.
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
   * Derives an app-siloed, recipient-directional tagging secret from a shared tagging secret point.
   *
   * App-silos the point via {@link appSiloEcdhSharedSecretPoint}, then directs the result to `recipient`:
   * `h([s_app, recipient])`. The directional step stops a symmetric shared secret (ECDH against an address, or an
   * arbitrary registered point) from colliding bidirectionally, so two parties never share a tag sequence.
   *
   * The point is obtained either via {@link computeSharedTaggingSecret} (an ECDH key exchange against a sender) or
   * registered directly as a pre-shared secret.
   *
   * @param taggingSecretPoint - The shared tagging secret point (ECDH output, or a directly registered pre-shared secret)
   * @param app - Contract address to silo the secret to
   * @param recipient - Recipient of the log. Defines the "direction of the secret".
   * @returns The secret that can be used along with an index to compute a tag to be included in a log.
   */
  static async computeDirectional(
    taggingSecretPoint: Point,
    app: AztecAddress,
    recipient: AztecAddress,
  ): Promise<AppTaggingSecret> {
    const appSiloedSecret = await appSiloEcdhSharedSecretPoint(taggingSecretPoint, app);
    const directionalAppTaggingSecret = await poseidon2Hash([appSiloedSecret, recipient]);

    return new AppTaggingSecret(directionalAppTaggingSecret, app);
  }

  /**
   * Derives the bare app-siloed tagging secret from a shared secret point via {@link appSiloEcdhSharedSecretPoint},
   * under the given delivery-mode kind.
   */
  static async computeAppSiloed(
    taggingSecretPoint: Point,
    app: AztecAddress,
    kind: AppTaggingSecretKind,
  ): Promise<AppTaggingSecret> {
    return new AppTaggingSecret(await appSiloEcdhSharedSecretPoint(taggingSecretPoint, app), app, kind);
  }

  /**
   * Derives the tagging secret for `(externalAddress, recipient, app)` by performing an ECDH key exchange against
   * `externalAddress` to obtain the shared point, then siloing and directing it via {@link computeDirectional}.
   * Returns undefined if `externalAddress` is not a valid address.
   */
  static async computeViaEcdh(
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

    return AppTaggingSecret.computeDirectional(taggingSecretPoint, app, recipient);
  }

  toString(): string {
    // TODO(F-680): Migrate stored tagging keys and remove the legacy unconstrained format.
    if (this.kind === AppTaggingSecretKind.UNCONSTRAINED) {
      return `${this.secret.toString()}:${this.app.toString()}`;
    }
    return `${this.kind}:${this.secret.toString()}:${this.app.toString()}`;
  }

  static fromString(str: string): AppTaggingSecret {
    const parts = str.split(':');
    if (parts.length === 2) {
      // TODO(F-680): Remove legacy two-part parsing after stored tagging keys are migrated.
      const [secretStr, appStr] = parts;
      return new AppTaggingSecret(Fr.fromString(secretStr), AztecAddress.fromStringUnsafe(appStr));
    }
    if (parts.length === 3) {
      const [kindStr, secretStr, appStr] = parts;
      return new AppTaggingSecret(
        Fr.fromString(secretStr),
        AztecAddress.fromStringUnsafe(appStr),
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

/**
 * Computes the shared tagging secret point between a local address (i.e. one for which the privacy keys are known) and
 * an external one via a Diffie-Hellman key exchange.
 *
 * Returns undefined if `externalAddress` is an invalid address.
 */
export async function computeSharedTaggingSecret(
  localAddress: CompleteAddress,
  localIvsk: Fq,
  externalAddress: AztecAddress,
): Promise<Point | undefined> {
  // An invalid address has no corresponding address point
  if (!(await externalAddress.isValid())) {
    return undefined;
  }

  const externalAddressPoint = await externalAddress.toAddressPoint();

  const localPreaddress = await computePreaddress(await localAddress.publicKeys.hash(), localAddress.partialAddress);
  const localAddressSecret = await computeAddressSecret(localPreaddress, localIvsk);

  // For a given local address A and external address B, the shared tagging secret S is (h_A + ivsk_A) * Addr_Point_B
  // (conceptually, in reality we don't use h_A + ivsk_A directly but rather the actual address secret, which is the
  // same but with an optional sign adjustment to prevent A's address point from having a negative y-coordinate).
  return Grumpkin.mul(externalAddressPoint, localAddressSecret);
}
