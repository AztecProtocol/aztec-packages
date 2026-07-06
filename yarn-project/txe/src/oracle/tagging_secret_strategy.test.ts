import { Fr } from '@aztec/foundation/curves/bn254';
import { Point } from '@aztec/foundation/curves/grumpkin';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { AppTaggingSecretKind } from '@aztec/stdlib/logs';

import { makeResolveTaggingSecretStrategyHook } from './tagging_secret_strategy.js';
import { callTxeHandler } from './txe_oracle_registry.js';

describe('makeResolveTaggingSecretStrategyHook', () => {
  it('returns undefined when no TXE strategy is configured', () => {
    expect(makeResolveTaggingSecretStrategyHook(undefined)).toBeUndefined();
  });

  it('returns a static strategy for every delivery mode', async () => {
    const strategy = { type: 'non-interactive-handshake' as const };
    const hook = makeResolveTaggingSecretStrategyHook(strategy);

    await expect(hook?.(makeRequest(AppTaggingSecretKind.UNCONSTRAINED))).resolves.toBe(strategy);
    await expect(hook?.(makeRequest(AppTaggingSecretKind.CONSTRAINED))).resolves.toBe(strategy);
  });

  it('selects a strategy by delivery mode', async () => {
    const unconstrained = { type: 'address-derived' as const };
    const constrained = { type: 'arbitrary-secret' as const, secret: await Point.random() };
    const hook = makeResolveTaggingSecretStrategyHook({
      type: 'by-delivery-mode',
      unconstrained,
      constrained,
    });

    await expect(hook?.(makeRequest(AppTaggingSecretKind.UNCONSTRAINED))).resolves.toBe(unconstrained);
    await expect(hook?.(makeRequest(AppTaggingSecretKind.CONSTRAINED))).resolves.toBe(constrained);
  });

  it('deserializes the mode-aware TXE oracle setter', async () => {
    const received = await callTxeHandler({
      oracle: 'aztec_txe_setTaggingSecretStrategiesByDeliveryMode',
      inputs: [field(2), field(5), field(6), field(1), field(0), field(0)],
      handler: ([unconstrained, constrained]) => {
        expect(unconstrained.type).toBe('arbitrary-secret');
        expect(
          unconstrained.type === 'arbitrary-secret' && unconstrained.secret.equals(new Point(new Fr(5), new Fr(6))),
        ).toBeTruthy();
        expect(constrained).toEqual({ type: 'non-interactive-handshake' });
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

function field(value: number) {
  return new Fr(value).toString().replace(/^0x/, '');
}
