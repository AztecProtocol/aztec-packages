import { DomainSeparator } from '@aztec/constants';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto/poseidon';
import { Schnorr } from '@aztec/foundation/crypto/schnorr';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { GrumpkinScalar } from '@aztec/foundation/curves/grumpkin';
// Import from the constants leaf, not `@aztec/standard-contracts/handshake-registry`, to keep the
// `HandshakeRegistry.json` artifact out of wallet bundles.
import { STANDARD_HANDSHAKE_REGISTRY_ADDRESS } from '@aztec/standard-contracts/handshake-registry/constants';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { CompleteAddress } from '@aztec/stdlib/contract';
import { derivePublicKeyFromSecretKey } from '@aztec/stdlib/keys';

import type { InteractiveHandshakeRequest, RecipientSignature } from './wire.js';

/**
 * Produces the recipient's signed authorization for an interactive handshake, signing with the master
 * message-signing secret key.
 */
export async function signInteractiveHandshake(
  request: InteractiveHandshakeRequest,
  completeAddress: CompleteAddress,
  masterMessageSigningSecretKey: GrumpkinScalar,
): Promise<RecipientSignature> {
  const mspk = await derivePublicKeyFromSecretKey(masterMessageSigningSecretKey);
  const [mspkX, mspkYIsPositive] = mspk.toXAndSign();

  const message = await computeInteractiveHandshakeSignatureMessage({
    chainId: request.chainId,
    version: request.version,
    registry: STANDARD_HANDSHAKE_REGISTRY_ADDRESS,
    ephPkX: request.ephPkX,
  });
  const signature = await new Schnorr().constructSignature(message, masterMessageSigningSecretKey);

  return {
    publicKeys: completeAddress.publicKeys,
    partialAddress: completeAddress.partialAddress,
    mspkX,
    mspkYIsPositive,
    signature,
  };
}

/**
 * The message an interactive-handshake authorization signs: the handshake's ephemeral key and chain context under
 * `DomainSeparator.INTERACTIVE_HANDSHAKE_SIGNATURE`, exactly as the registry recomputes it in-circuit.
 */
function computeInteractiveHandshakeSignatureMessage(args: {
  /** The chain ID bound into the signed message. */
  chainId: Fr;
  /** The rollup version bound into the signed message. */
  version: Fr;
  /** The registry address bound into the signed message. */
  registry: AztecAddress;
  /** The x-coordinate of the handshake's ephemeral public key. */
  ephPkX: Fr;
}): Promise<Fr> {
  return poseidon2HashWithSeparator(
    [args.chainId, args.version, args.registry, args.ephPkX],
    DomainSeparator.INTERACTIVE_HANDSHAKE_SIGNATURE,
  );
}
