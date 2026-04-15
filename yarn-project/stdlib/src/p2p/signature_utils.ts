import { Buffer32 } from '@aztec/foundation/buffer';
import { keccak256 } from '@aztec/foundation/crypto/keccak';
import { makeEthSignDigest, tryRecoverAddress } from '@aztec/foundation/crypto/secp256k1-signer';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { Signature } from '@aztec/foundation/eth-signature';

import { type TypedDataDefinition, hashTypedData } from 'viem';

export enum SignatureDomainSeparator {
  blockProposal = 0,
  checkpointAttestation = 1,
  attestationsAndSigners = 2,
  checkpointProposal = 3,
  signedTxs = 4,
}

export interface Signable {
  getPayloadToSign(domainSeparator: SignatureDomainSeparator): Buffer;
}

export type CoordinationSignatureContext = {
  chainId: number;
  rollupAddress: EthAddress;
};

type CoordinationSignatureType =
  | 'BlockProposal'
  | 'CheckpointProposal'
  | 'CheckpointAttestation'
  | 'AttestationsAndSigners';

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
} as const;

function getCoordinationSignatureType(domainSeparator: SignatureDomainSeparator): CoordinationSignatureType {
  switch (domainSeparator) {
    case SignatureDomainSeparator.blockProposal:
      return 'BlockProposal';
    case SignatureDomainSeparator.checkpointProposal:
      return 'CheckpointProposal';
    case SignatureDomainSeparator.checkpointAttestation:
      return 'CheckpointAttestation';
    case SignatureDomainSeparator.attestationsAndSigners:
      return 'AttestationsAndSigners';
    case SignatureDomainSeparator.signedTxs:
      throw new Error('SignedTxs does not use the coordination EIP-712 signature domain');
  }
}

export function getCoordinationSignatureContextKey(context: CoordinationSignatureContext): string {
  return `${context.chainId}:${context.rollupAddress.toString()}`;
}

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

export function getCoordinationSignatureTypedData(
  signable: Signable,
  domainSeparator: SignatureDomainSeparator,
  context: CoordinationSignatureContext,
): TypedDataDefinition {
  const payloadHash = getHashedSignaturePayload(signable, domainSeparator);
  return getCoordinationSignatureTypedDataForPayloadHash(
    payloadHash,
    getCoordinationSignatureType(domainSeparator),
    context,
  );
}

export function getHashedSignaturePayloadTypedData(
  signable: Signable,
  domainSeparator: SignatureDomainSeparator,
  context: CoordinationSignatureContext,
): Buffer32 {
  return Buffer32.fromString(hashTypedData(getCoordinationSignatureTypedData(signable, domainSeparator, context)));
}

export function recoverCoordinationSigner(
  signable: Signable,
  domainSeparator: SignatureDomainSeparator,
  signature: Signature,
  context: CoordinationSignatureContext,
): EthAddress | undefined {
  const digest = getHashedSignaturePayloadTypedData(signable, domainSeparator, context);
  return tryRecoverAddress(digest, signature, { allowYParityAsV: true });
}

/**
 * Get the hashed payload for the signature of the `Signable`
 * @param s - The `Signable` to sign
 * @returns The hashed payload for the signature of the `Signable`
 */
export function getHashedSignaturePayload(s: Signable, domainSeparator: SignatureDomainSeparator): Buffer32 {
  return Buffer32.fromBuffer(keccak256(s.getPayloadToSign(domainSeparator)));
}

/**
 * Get the hashed payload for the signature of the `Signable` as an Ethereum signed message EIP-712
 * @param s - the `Signable` to sign
 * @returns The hashed payload for the signature of the `Signable` as an Ethereum signed message
 */
export function getHashedSignaturePayloadEthSignedMessage(
  s: Signable,
  domainSeparator: SignatureDomainSeparator,
): Buffer32 {
  const payload = getHashedSignaturePayload(s, domainSeparator);
  return makeEthSignDigest(payload);
}
