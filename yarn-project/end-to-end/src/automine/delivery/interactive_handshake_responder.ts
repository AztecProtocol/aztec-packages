import { AztecAddress, type CompleteAddress } from '@aztec/aztec.js/addresses';
import { DomainSeparator } from '@aztec/constants';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto/poseidon';
import { Schnorr, type SchnorrSignature } from '@aztec/foundation/crypto/schnorr';
import { Fq, Fr } from '@aztec/foundation/curves/bn254';
import type { GrumpkinScalar } from '@aztec/foundation/curves/grumpkin';
import type { CustomRequest } from '@aztec/pxe/config';
import {
  INTERACTIVE_HANDSHAKE_REQUEST_KIND,
  STANDARD_HANDSHAKE_REGISTRY_ADDRESS,
} from '@aztec/standard-contracts/handshake-registry/constants';
import { type PublicKeys, derivePublicKeyFromSecretKey } from '@aztec/stdlib/keys';

/**
 * The decoded payload of the registry's interactive-handshake signature request. Note it never carries the sender,
 * so the recipient authorizes the handshake without learning who initiated it.
 */
export type InteractiveHandshakeRequest = {
  /** The account whose authorization is being requested. */
  recipient: AztecAddress;
  chainId: Fr;
  version: Fr;
  /** The x-coordinate of the handshake's ephemeral public key (its y-coordinate is positive by construction). */
  ephPkX: Fr;
};

/**
 * The recipient's signed authorization for an interactive handshake. Mirrors the registry contract's
 * `RecipientSignature` struct field for field.
 */
export type RecipientSignature = {
  /** The recipient's master public keys, bound in-circuit to the recipient's address via `partialAddress`. */
  publicKeys: PublicKeys;
  partialAddress: Fr;
  /** The x-coordinate of the recipient's master message-signing public key. */
  mspkX: Fr;
  /** Whether that key's y-coordinate is positive, so the circuit can reconstruct the point from `mspkX`. */
  mspkYIsPositive: boolean;
  /** The schnorr signature over the handshake message. */
  signature: SchnorrSignature;
};

/**
 * Parses and validates the registry's interactive-handshake signature request.
 *
 * @throws If the request kind is not {@link INTERACTIVE_HANDSHAKE_REQUEST_KIND}, the issuing contract is not the
 * standard HandshakeRegistry, or the payload does not have the expected shape.
 */
export function parseInteractiveHandshakeRequest(request: CustomRequest): InteractiveHandshakeRequest {
  if (!request.kind.equals(INTERACTIVE_HANDSHAKE_REQUEST_KIND)) {
    throw new Error(`Not an interactive-handshake signature request: unexpected kind ${request.kind}`);
  }
  if (!request.contractAddress.equals(STANDARD_HANDSHAKE_REGISTRY_ADDRESS)) {
    throw new Error(
      `Interactive-handshake signature request issued by ${request.contractAddress}, expected the standard HandshakeRegistry at ${STANDARD_HANDSHAKE_REGISTRY_ADDRESS}`,
    );
  }
  if (request.payload.length !== 4) {
    throw new Error(`Interactive-handshake signature request payload has ${request.payload.length} fields, expected 4`);
  }

  const [recipient, chainId, version, ephPkX] = request.payload;
  return { recipient: new AztecAddress(recipient), chainId, version, ephPkX };
}

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

/** Serializes a {@link RecipientSignature} to the field layout the registry's in-circuit deserialization expects. */
export function recipientSignatureToFields(recipientSignature: RecipientSignature): Fr[] {
  const s = Fq.fromBuffer(recipientSignature.signature.s);
  const e = Fq.fromBuffer(recipientSignature.signature.e);
  return [
    ...recipientSignature.publicKeys.toFields(),
    recipientSignature.partialAddress,
    recipientSignature.mspkX,
    new Fr(recipientSignature.mspkYIsPositive),
    s.lo,
    s.hi,
    e.lo,
    e.hi,
  ];
}

/**
 * The message an interactive-handshake authorization signs: the handshake's ephemeral key and chain context under
 * `DomainSeparator.INTERACTIVE_HANDSHAKE_SIGNATURE`, exactly as the registry recomputes it in-circuit.
 */
function computeInteractiveHandshakeSignatureMessage(args: {
  chainId: Fr;
  version: Fr;
  registry: AztecAddress;
  ephPkX: Fr;
}): Promise<Fr> {
  return poseidon2HashWithSeparator(
    [args.chainId, args.version, args.registry, args.ephPkX],
    DomainSeparator.INTERACTIVE_HANDSHAKE_SIGNATURE,
  );
}
