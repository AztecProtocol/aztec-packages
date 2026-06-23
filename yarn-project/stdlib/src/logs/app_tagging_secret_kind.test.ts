import { AppTaggingSecretKind, appTaggingSecretKindFromDeliveryMode } from './app_tagging_secret_kind.js';

// The on-chain delivery mode discriminants are defined in Noir (aztec::messages::delivery::OnchainDeliveryMode) and
// mirrored here. This test pins the mapping so a Noir/TS drift surfaces as a failure rather than silently mis-tagging.
// A follow-up makes the discriminants a single generated source.
const ONCHAIN_UNCONSTRAINED_DELIVERY_MODE = 2;
const ONCHAIN_CONSTRAINED_DELIVERY_MODE = 3;

describe('AppTaggingSecretKind', () => {
  it('maps the on-chain delivery mode discriminants to kinds', () => {
    expect(appTaggingSecretKindFromDeliveryMode(ONCHAIN_UNCONSTRAINED_DELIVERY_MODE)).toEqual(
      AppTaggingSecretKind.UNCONSTRAINED,
    );
    expect(appTaggingSecretKindFromDeliveryMode(ONCHAIN_CONSTRAINED_DELIVERY_MODE)).toEqual(
      AppTaggingSecretKind.CONSTRAINED,
    );
  });
});
