import { Fr } from '@aztec/foundation/curves/bn254';
import { Point } from '@aztec/foundation/curves/grumpkin';
import { DEFAULT_TAGGING_SECRET_STRATEGY, type TaggingSecretStrategy } from '@aztec/pxe/server';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { AppTaggingSecretKind } from '@aztec/stdlib/logs';

import { toSingle } from '../utils/encoding.js';
import { makeResolveTaggingSecretStrategyHook } from './tagging_secret_strategy.js';
import { callTxeHandler } from './txe_oracle_registry.js';

describe('makeResolveTaggingSecretStrategyHook', () => {
  it('returns undefined when no TXE strategy is configured', () => {
    expect(makeResolveTaggingSecretStrategyHook(new Map())).toBeUndefined();
  });

  it('selects a strategy by delivery mode', async () => {
    const unconstrained: TaggingSecretStrategy = { type: 'arbitrary-secret', secret: await Point.random() };
    const constrained: TaggingSecretStrategy = { type: 'non-interactive-handshake' };
    const hook = makeResolveTaggingSecretStrategyHook(
      new Map<AppTaggingSecretKind, TaggingSecretStrategy>([
        [AppTaggingSecretKind.UNCONSTRAINED, unconstrained],
        [AppTaggingSecretKind.CONSTRAINED, constrained],
      ]),
    );

    await expect(hook?.(makeRequest(AppTaggingSecretKind.UNCONSTRAINED))).resolves.toBe(unconstrained);
    await expect(hook?.(makeRequest(AppTaggingSecretKind.CONSTRAINED))).resolves.toBe(constrained);
  });

  it('defaults an unset mode to PXE default strategy when another mode is configured', async () => {
    const unconstrained = { type: 'address-derived' as const };
    const hook = makeResolveTaggingSecretStrategyHook(new Map([[AppTaggingSecretKind.UNCONSTRAINED, unconstrained]]));

    await expect(hook?.(makeRequest(AppTaggingSecretKind.UNCONSTRAINED))).resolves.toBe(unconstrained);
    await expect(hook?.(makeRequest(AppTaggingSecretKind.CONSTRAINED))).resolves.toEqual(
      DEFAULT_TAGGING_SECRET_STRATEGY,
    );
  });

  it('deserializes the mode-aware TXE oracle setter', async () => {
    const received = await callTxeHandler({
      oracle: 'aztec_txe_setTaggingSecretStrategy',
      inputs: [toSingle(2), toSingle(1), toSingle(2), toSingle(5), toSingle(6)],
      handler: ([deliveryMode, strategy]) => {
        expect(deliveryMode).toBe(AppTaggingSecretKind.UNCONSTRAINED);
        expect(strategy.isSome()).toBe(true);
        if (!strategy.isSome()) {
          throw new Error('Expected tagging secret strategy');
        }
        expect(strategy.value.type).toBe('arbitrary-secret');
        expect(
          strategy.value.type === 'arbitrary-secret' && strategy.value.secret.equals(new Point(new Fr(5), new Fr(6))),
        ).toBeTruthy();
      },
    });

    expect(received.values).toEqual([]);
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
