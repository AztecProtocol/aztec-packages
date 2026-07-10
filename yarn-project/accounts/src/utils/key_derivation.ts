import { poseidon2Hash } from '@aztec/foundation/crypto/poseidon';
import { sha256ToField } from '@aztec/foundation/crypto/sha256';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { GrumpkinScalar } from '@aztec/foundation/curves/grumpkin';

const SIGNING_KEY_TO_SECRET_KEY_SEPARATOR = sha256ToField([Buffer.from('@aztec/accounts/signing_key_to_secret_key')]);

/**
 * Derives the privacy secret key (the seed for the viewing/nullifier keyset that PXE holds) from the account's signing
 * key. The signing key is the ownership root the user controls; the privacy keyset hangs off it through this one-way
 * hash, so a value handled by PXE can never be used to recover the signing key.
 */
export function deriveSecretKeyFromSigningKey(signingKey: GrumpkinScalar): Promise<Fr> {
  return poseidon2Hash([SIGNING_KEY_TO_SECRET_KEY_SEPARATOR, signingKey.hi, signingKey.lo]);
}
