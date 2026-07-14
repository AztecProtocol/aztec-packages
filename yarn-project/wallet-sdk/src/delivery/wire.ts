import { SchnorrSignature } from '@aztec/foundation/crypto/schnorr';
import { Fq, Fr } from '@aztec/foundation/curves/bn254';
import { hexSchemaFor, zodFor } from '@aztec/foundation/schemas';
import type { CustomRequest } from '@aztec/pxe/config';
// Import from the constants leaf, not `@aztec/standard-contracts/handshake-registry`, to keep the
// `HandshakeRegistry.json` artifact out of wallet bundles.
import {
  INTERACTIVE_HANDSHAKE_REQUEST_KIND,
  STANDARD_HANDSHAKE_REGISTRY_ADDRESS,
  STANDARD_HANDSHAKE_REGISTRY_CLASS_ID,
} from '@aztec/standard-contracts/handshake-registry/constants';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { PublicKeys } from '@aztec/stdlib/keys';
import { schemas } from '@aztec/stdlib/schemas';

import { z } from 'zod';

/**
 * The registry's interactive-handshake signature request as issued to the sender PXE's `resolveCustomRequest` hook.
 * This full envelope (not the parsed payload) is what crosses the wallet-to-wallet transport, so the recipient can
 * run the complete validation itself instead of trusting the sender's.
 *
 * Declared independently of `@aztec/pxe`'s `CustomRequest`: the envelope is a wire format exchanged between wallet
 * applications on potentially different software versions, so it must not silently track changes to PXE's hook
 * type. The assertions below keep the two mutually assignable and fail the build if they drift apart.
 */
export type InteractiveHandshakeCustomRequest = {
  /** The address of the contract issuing the request. */
  contractAddress: AztecAddress;
  /** The issuing contract's class ID. */
  contractClassId: Fr;
  /** Discriminates the request type. */
  kind: Fr;
  /** Opaque, request-specific arguments. */
  payload: Fr[];
};

/** Compile-time assertion that `_Narrow` is assignable to `Wide`; instantiating it with drifted types fails the build. */
type _AssertAssignable<_Narrow extends Wide, Wide> = never;
/** A sender-side hook can feed PXE's envelope straight into the wire helpers. */
type _PxeEnvelopeFeedsWireFormat = _AssertAssignable<CustomRequest, InteractiveHandshakeCustomRequest>;
/** The wire format claims nothing beyond what PXE's envelope carries. */
type _WireFormatFeedsPxeEnvelope = _AssertAssignable<InteractiveHandshakeCustomRequest, CustomRequest>;

/** Wire schema for {@link InteractiveHandshakeCustomRequest}, the request half of the handshake transport. */
export const InteractiveHandshakeCustomRequestSchema = zodFor<InteractiveHandshakeCustomRequest>()(
  z.object({
    contractAddress: schemas.AztecAddress,
    contractClassId: schemas.Fr,
    kind: schemas.Fr,
    payload: z.array(schemas.Fr),
  }),
);

/**
 * The decoded payload of the registry's interactive-handshake signature request. Note it never carries the sender,
 * so the recipient authorizes the handshake without learning who initiated it.
 */
export type InteractiveHandshakeRequest = {
  /** The account whose authorization is being requested. */
  recipient: AztecAddress;
  /** The chain ID the handshake is bound to. */
  chainId: Fr;
  /** The rollup version the handshake is bound to. */
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
  /** The recipient's partial address, completing the recipient's address preimage. */
  partialAddress: Fr;
  /** The x-coordinate of the recipient's master message-signing public key. */
  mspkX: Fr;
  /** Whether that key's y-coordinate is positive, so the circuit can reconstruct the point from `mspkX`. */
  mspkYIsPositive: boolean;
  /** The schnorr signature over the handshake message. */
  signature: SchnorrSignature;
};

/** Wire schema for {@link RecipientSignature}, the response half of the handshake transport. */
export const RecipientSignatureSchema = zodFor<RecipientSignature>()(
  z.object({
    publicKeys: PublicKeys.schema,
    partialAddress: schemas.Fr,
    mspkX: schemas.Fr,
    mspkYIsPositive: z.boolean(),
    signature: hexSchemaFor(SchnorrSignature),
  }),
);

/**
 * Parses and validates the registry's interactive-handshake signature request.
 *
 * @throws If the request kind is not {@link INTERACTIVE_HANDSHAKE_REQUEST_KIND}, the issuing contract is not the
 * standard HandshakeRegistry (by address and class ID), or the payload does not have the expected shape.
 */
export function parseInteractiveHandshakeRequest(
  request: InteractiveHandshakeCustomRequest,
): InteractiveHandshakeRequest {
  if (!request.kind.equals(INTERACTIVE_HANDSHAKE_REQUEST_KIND)) {
    throw new Error(`Not an interactive-handshake signature request: unexpected kind ${request.kind}`);
  }
  if (!request.contractAddress.equals(STANDARD_HANDSHAKE_REGISTRY_ADDRESS)) {
    throw new Error(
      `Interactive-handshake signature request issued by ${request.contractAddress}, expected the standard HandshakeRegistry at ${STANDARD_HANDSHAKE_REGISTRY_ADDRESS}`,
    );
  }
  if (!request.contractClassId.equals(STANDARD_HANDSHAKE_REGISTRY_CLASS_ID)) {
    throw new Error(
      `Interactive-handshake signature request issued by contract class ${request.contractClassId}, expected the standard HandshakeRegistry class ${STANDARD_HANDSHAKE_REGISTRY_CLASS_ID}`,
    );
  }
  if (request.payload.length !== 4) {
    throw new Error(`Interactive-handshake signature request payload has ${request.payload.length} fields, expected 4`);
  }

  const [recipient, chainId, version, ephPkX] = request.payload;
  return { recipient: new AztecAddress(recipient), chainId, version, ephPkX };
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
