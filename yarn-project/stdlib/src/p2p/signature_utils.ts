import { Buffer32 } from '@aztec/foundation/buffer';
import { keccak256 } from '@aztec/foundation/crypto/keccak';
import { tryRecoverAddress } from '@aztec/foundation/crypto/secp256k1-signer';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { Signature } from '@aztec/foundation/eth-signature';
import { type BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { type TypedDataDefinition, hashTypedData } from 'viem';
import { z } from 'zod';

import type { ZodFor } from '../schemas/index.js';

export type CoordinationSignatureType =
  | 'BlockProposal'
  | 'CheckpointProposal'
  | 'CheckpointAttestation'
  | 'AttestationsAndSigners'
  | 'SignedTxs';

export type CoordinationSignatureContext = {
  chainId: number;
  rollupAddress: EthAddress;
};

export const EMPTY_COORDINATION_SIGNATURE_CONTEXT: CoordinationSignatureContext = {
  chainId: 0,
  rollupAddress: EthAddress.ZERO,
};

export const coordinationSignatureContextSchema: ZodFor<CoordinationSignatureContext> = z.object({
  chainId: z.number(),
  rollupAddress: EthAddress.schema,
});

export interface Signable {
  readonly primaryType: CoordinationSignatureType;
  readonly signatureContext: CoordinationSignatureContext;
  getPayloadToSign(): Buffer;
}

export function coordinationSignatureContextEquals(
  a: CoordinationSignatureContext,
  b: CoordinationSignatureContext,
): boolean {
  return a.chainId === b.chainId && a.rollupAddress.equals(b.rollupAddress);
}

export function serializeCoordinationSignatureContext(ctx: CoordinationSignatureContext): Buffer {
  return serializeToBuffer([ctx.chainId, ctx.rollupAddress]);
}

export function readCoordinationSignatureContext(reader: BufferReader): CoordinationSignatureContext {
  const chainId = reader.readNumber();
  const rollupAddress = reader.readObject(EthAddress);
  return { chainId, rollupAddress };
}

/**
 * Returns true if the signable carries a context matching the node's expected context.
 * Use this at the P2P ingress boundary to reject foreign-chain messages cheaply before
 * performing any signature recovery.
 */
export function hasValidSignatureContext(signable: Signable, expected: CoordinationSignatureContext): boolean {
  return coordinationSignatureContextEquals(signable.signatureContext, expected);
}

const COORDINATION_SIGNATURE_NAME = 'Aztec Rollup';
const COORDINATION_SIGNATURE_VERSION = '1';

const EIP712_DOMAIN_FIELDS = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
] as const;

const COORDINATION_SIGNATURE_TYPES = {
  EIP712Domain: EIP712_DOMAIN_FIELDS,
  BlockProposal: [{ name: 'payloadHash', type: 'bytes32' }],
  CheckpointProposal: [{ name: 'payloadHash', type: 'bytes32' }],
  CheckpointAttestation: [{ name: 'payloadHash', type: 'bytes32' }],
  AttestationsAndSigners: [{ name: 'payloadHash', type: 'bytes32' }],
  SignedTxs: [{ name: 'payloadHash', type: 'bytes32' }],
} as const;

export function getCoordinationSignatureTypedDataForPayloadHash(
  payloadHash: Buffer32,
  type: CoordinationSignatureType,
  context: CoordinationSignatureContext,
): TypedDataDefinition {
  return {
    domain: {
      name: COORDINATION_SIGNATURE_NAME,
      version: COORDINATION_SIGNATURE_VERSION,
      chainId: context.chainId,
      verifyingContract: context.rollupAddress.toString() as `0x${string}`,
    },
    types: COORDINATION_SIGNATURE_TYPES,
    primaryType: type,
    message: {
      payloadHash: payloadHash.toString() as `0x${string}`,
    },
  };
}

export function getCoordinationSignatureTypedData(signable: Signable): TypedDataDefinition {
  const payloadHash = getHashedSignaturePayload(signable);
  return getCoordinationSignatureTypedDataForPayloadHash(payloadHash, signable.primaryType, signable.signatureContext);
}

export function getHashedSignaturePayloadTypedData(signable: Signable): Buffer32 {
  return Buffer32.fromString(hashTypedData(getCoordinationSignatureTypedData(signable)));
}

export function recoverCoordinationSigner(signable: Signable, signature: Signature): EthAddress | undefined {
  const digest = getHashedSignaturePayloadTypedData(signable);
  return tryRecoverAddress(digest, signature, { allowYParityAsV: true });
}

export function getHashedSignaturePayload(s: Signable): Buffer32 {
  return Buffer32.fromBuffer(keccak256(s.getPayloadToSign()));
}
