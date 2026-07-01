import { AppTaggingSecretKind } from '@aztec/stdlib/logs';

import { buildMessageDeliveryTest } from './onchain_delivery_harness.js';

// Regression coverage for mode-agnostic handshake reuse, split out from `onchain.test.ts`. That file only pins that
// each (strategy, mode) cell delivers; this file pins the stronger claim that a handshake bootstrapped under one
// delivery mode is reused, not re-bootstrapped, when the other mode sends next.
describe('automine/delivery/handshake_reuse', () => {
  // one handshake serves both modes. The constrained events bootstrap the handshake; the unconstrained notes
  // reuse it. Reuse bypasses the wallet hook entirely (an existing registry handshake is resolved before the hook is
  // consulted), so the hook returns a handshake for the bootstrapping constrained send but throws if it is ever
  // consulted for the unconstrained send. That makes discovery a durable proof of mode-agnostic reuse: were reuse to
  // regress, the unconstrained note would fall through to the hook and fail loudly instead of being silently
  // re-discovered some other way.
  buildMessageDeliveryTest({
    strategy: 'non-interactive handshake',
    mode: { events: 'constrained', notes: 'unconstrained' },
    senderHook: ({ deliveryMode }) => {
      if (deliveryMode !== AppTaggingSecretKind.CONSTRAINED) {
        throw new Error(
          'cross-mode reuse regressed: the unconstrained send consulted the strategy hook instead of reusing the bootstrapped handshake',
        );
      }
      return Promise.resolve({ type: 'non-interactive-handshake' });
    },
  });

  // the stricter cross-mode direction. The unconstrained events bootstrap the handshake; the constrained
  // notes reuse it. The tripwire makes reuse a hard guarantee: a constrained send that consulted the hook would throw,
  // and the only way to skip the hook is resolving an existing handshake, so a green means the notes reused the
  // bootstrapped handshake. It also pins the constrained sequence to a fresh index 0: index 0 validates against the
  // registry, higher indices assert a predecessor nullifier, so a sender index leaked from the unconstrained counter
  // would make the first note demand a predecessor that was never emitted and fail the actual send.
  // The index is never read here; the circuit rejecting a wrong one is the signal. The forward cell can't catch
  // this because its reusing side is unconstrained, where the index only feeds the tag and the scan tolerates gaps.
  buildMessageDeliveryTest({
    strategy: 'non-interactive handshake',
    mode: { events: 'unconstrained', notes: 'constrained' },
    senderHook: ({ deliveryMode }) => {
      if (deliveryMode !== AppTaggingSecretKind.UNCONSTRAINED) {
        throw new Error(
          'cross-mode reuse regressed: the constrained send consulted the strategy hook instead of reusing the bootstrapped handshake',
        );
      }
      return Promise.resolve({ type: 'non-interactive-handshake' });
    },
  });
});
