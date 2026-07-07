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

  it('defaults an unset mode to PXE default strategy when another mode is configured', async () => {
    const unconstrained = { type: 'address-derived' as const };
    const hook = makeResolveTaggingSecretStrategyHook(new Map([[AppTaggingSecretKind.UNCONSTRAINED, unconstrained]]));

    await expect(hook?.(makeRequest(AppTaggingSecretKind.UNCONSTRAINED))).resolves.toBe(unconstrained);
    await expect(hook?.(makeRequest(AppTaggingSecretKind.CONSTRAINED))).resolves.toEqual(
      DEFAULT_TAGGING_SECRET_STRATEGY,
    );
  });

  it('deserializes the per-mode TXE oracle setter', async () => {
    const received = await callTxeHandler({
      oracle: 'aztec_txe_setTaggingSecretStrategies',
      inputs: [
        // Unconstrained mode: some(arbitrary-secret with point (5, 6)).
        toSingle(1),
        toSingle(2),
        toSingle(5),
        toSingle(6),
        // Constrained mode: some(interactive-handshake).
        toSingle(1),
        toSingle(4),
        toSingle(0),
        toSingle(0),
      ],
      handler: ([unconstrainedStrategy, constrainedStrategy]) => {
        if (!constrainedStrategy.isSome()) {
          throw new Error('Expected a constrained-mode tagging secret strategy');
        }
        expect(constrainedStrategy.value).toEqual({ type: 'interactive-handshake' });
        if (!unconstrainedStrategy.isSome()) {
          throw new Error('Expected an unconstrained-mode tagging secret strategy');
        }
        const strategy = unconstrainedStrategy.value;
        if (strategy.type !== 'arbitrary-secret') {
          throw new Error(`Expected an arbitrary-secret strategy, got '${strategy.type}'`);
        }
        expect(strategy.secret.equals(new Point(new Fr(5), new Fr(6)))).toBe(true);
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
