/**
 * In-memory discriminator for [`AppTaggingSecret`](./app_tagging_secret.js). Not part of the persisted string or wire
 * shape - the `c:` prefix in `toString()` still encodes the constrained case on disk.
 */
export const AppTaggingSecretKind = {
  UNCONSTRAINED: 'unconstrained',
  CONSTRAINED: 'constrained',
} as const;

export type AppTaggingSecretKind = (typeof AppTaggingSecretKind)[keyof typeof AppTaggingSecretKind];
