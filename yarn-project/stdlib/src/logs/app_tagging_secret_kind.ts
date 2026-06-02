export const AppTaggingSecretKind = {
  UNCONSTRAINED: 'unconstrained',
  CONSTRAINED: 'constrained',
} as const;

export type AppTaggingSecretKind = (typeof AppTaggingSecretKind)[keyof typeof AppTaggingSecretKind];

const ONCHAIN_UNCONSTRAINED_DELIVERY_MODE = 2;
const ONCHAIN_CONSTRAINED_DELIVERY_MODE = 3;

export function appTaggingSecretKindFromDeliveryMode(deliveryMode: number): AppTaggingSecretKind {
  switch (deliveryMode) {
    case ONCHAIN_UNCONSTRAINED_DELIVERY_MODE:
      return AppTaggingSecretKind.UNCONSTRAINED;
    case ONCHAIN_CONSTRAINED_DELIVERY_MODE:
      return AppTaggingSecretKind.CONSTRAINED;
    default:
      throw new Error(`Unrecognized delivery mode for tagging: ${deliveryMode}`);
  }
}
