import { AppTaggingSecretKind } from '@aztec/stdlib/logs';

import { buildMessageDeliveryTest } from './onchain_delivery_harness.js';

// Pins mode-agnostic handshake reuse: a handshake bootstrapped under one delivery mode must be reused when the other
// mode sends next.
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

  // Reverse direction also pins the constrained sequence to a fresh index 0 after an unconstrained bootstrap; a leaked
  // unconstrained counter would make the first constrained send require a predecessor nullifier that does not exist.
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
