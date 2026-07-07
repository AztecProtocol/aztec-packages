import { Fr } from '@aztec/foundation/curves/bn254';
import { Point } from '@aztec/foundation/curves/grumpkin';
import { DEFAULT_TAGGING_SECRET_STRATEGY, type TaggingSecretStrategy } from '@aztec/pxe/server';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { AppTaggingSecretKind } from '@aztec/stdlib/logs';

import { makeResolveTaggingSecretStrategyHook } from './tagging_secret_strategy.js';

describe('makeResolveTaggingSecretStrategyHook', () => {
  it('returns undefined when no TXE strategy is configured', () => {
    expect(makeResolveTaggingSecretStrategyHook(new Map())).toBeUndefined();
  });

  it('selects a strategy by delivery mode', async () => {
    const unconstrained: TaggingSecretStrategy = { type: 'arbitrary-secret', secret: await Point.random() };
    const constrained: TaggingSecretStrategy = { type: 'interactive-handshake' };
    const hook = makeResolveTaggingSecretStrategyHook(
      new Map<AppTaggingSecretKind, TaggingSecretStrategy>([
        [AppTaggingSecretKind.UNCONSTRAINED, unconstrained],
        [AppTaggingSecretKind.CONSTRAINED, constrained],
      ]),
    );

    await expect(hook?.(makeRequest(AppTaggingSecretKind.UNCONSTRAINED))).resolves.toBe(unconstrained);
    await expect(hook?.(makeRequest(AppTaggingSecretKind.CONSTRAINED))).resolves.toBe(constrained);
  });

  it('defaults an unset mode wto PXE default strategy when another mode is configured', async () => {
    const unconstrained = { type: 'address-derived' as const };
    const hook = makeResolveTaggingSecretStrategyHook(new Map([[AppTaggingSecretKind.UNCONSTRAINED, unconstrained]]));

    await expect(hook?.(makeRequest(AppTaggingSecretKind.UNCONSTRAINED))).resolves.toBe(unconstrained);
    await expect(hook?.(makeRequest(AppTaggingSecretKind.CONSTRAINED))).resolves.toEqual(
      DEFAULT_TAGGING_SECRET_STRATEGY,
    );
  });
});

function makeRequest(deliveryMode: AppTaggingSecretKind) {
  return {
    contractAddress: AztecAddress.ZERO,
    contractClassId: Fr.ZERO,
    sender: AztecAddress.ZERO,
    recipient: AztecAddress.ZERO,
    deliveryMode,
  };
}
