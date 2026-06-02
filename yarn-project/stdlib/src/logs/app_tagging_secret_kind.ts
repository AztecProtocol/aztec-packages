export const AppTaggingSecretKind = {
  UNCONSTRAINED: 'unconstrained',
  CONSTRAINED: 'constrained',
} as const;

export type AppTaggingSecretKind = (typeof AppTaggingSecretKind)[keyof typeof AppTaggingSecretKind];
