import type { GrumpkinScalar } from '@aztec/foundation/curves/grumpkin';
import type { PublicKey } from '@aztec/stdlib/keys';

/**
 * The four master privacy secret keys the key store holds for an account: the nullifier-hiding, incoming-viewing,
 * outgoing-viewing, and tagging keys.
 */
export type AccountPrivacySecretKeys = {
  masterNullifierHidingSecretKey: GrumpkinScalar;
  masterIncomingViewingSecretKey: GrumpkinScalar;
  masterOutgoingViewingSecretKey: GrumpkinScalar;
  masterTaggingSecretKey: GrumpkinScalar;
};

/**
 * The keys needed to register an account: the four privacy secret keys the key store holds, plus the *public*
 * message-signing and fallback keys. The message-signing and fallback secret keys are withheld from the key store (and
 * hence from PXE, which embeds it), since it is not trusted to hold them: only their public keys are needed (to
 * reconstruct the account's address).
 */
export type AccountPrivacyKeys = AccountPrivacySecretKeys & {
  masterMessageSigningPublicKey: PublicKey;
  masterFallbackPublicKey: PublicKey;
};
