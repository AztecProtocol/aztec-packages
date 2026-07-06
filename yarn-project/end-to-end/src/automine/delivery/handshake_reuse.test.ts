import { AppTaggingSecretKind } from '@aztec/stdlib/logs';

import { buildMessageDeliveryTest } from './onchain_delivery_harness.js';

// Regression coverage for mode-agnostic handshake reuse. That file only pins that
// each (strategy, mode) cell delivers; this file pins the stronger claim that a handshake bootstrapped under one
// delivery mode is reused, not re-bootstrapped, when the other mode sends next.
describe('handshake_reuse', () => {
  const forwardHookCalls: AppTaggingSecretKind[] = [];
  buildMessageDeliveryTest({
    strategy: 'non-interactive handshake',
    mode: { events: 'constrained', notes: 'unconstrained' },
    senderHook: ({ deliveryMode }) => {
      forwardHookCalls.push(deliveryMode);
      return Promise.resolve({ type: 'non-interactive-handshake' });
    },
    additionalTests: () => {
      it('the strategy hook fires exactly once, to bootstrap the handshake on the first constrained send', () => {
        expect(forwardHookCalls).toHaveLength(1);
        expect(forwardHookCalls[0]).toBe(AppTaggingSecretKind.CONSTRAINED);
      });
    },
  });

  // the stricter cross-mode direction: the unconstrained events bootstrap the handshake; the constrained notes reuse
  // it. This also pins the constrained sequence to a fresh index 0: index 0 validates against the registry, higher
  // indices assert a predecessor nullifier, so a sender index leaked from the unconstrained counter would make the
  // first note demand a predecessor that was never emitted and fail the actual send during delivery, before the
  // hook-call assertion below ever runs.
  const reverseHookCalls: AppTaggingSecretKind[] = [];
  buildMessageDeliveryTest({
    strategy: 'non-interactive handshake',
    mode: { events: 'unconstrained', notes: 'constrained' },
    senderHook: ({ deliveryMode }) => {
      reverseHookCalls.push(deliveryMode);
      return Promise.resolve({ type: 'non-interactive-handshake' });
    },
    additionalTests: () => {
      it('the strategy hook fires exactly once, to bootstrap the handshake on the first unconstrained send', () => {
        expect(reverseHookCalls).toHaveLength(1);
        expect(reverseHookCalls[0]).toBe(AppTaggingSecretKind.UNCONSTRAINED);
      });
    },
  });
});
