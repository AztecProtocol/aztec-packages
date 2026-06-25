import type { ResolveTaggingSecretStrategy, TaggingSecretStrategy } from '@aztec/pxe/server';
import { AppTaggingSecretKind } from '@aztec/stdlib/logs';

/**
 * Builds the {@link ResolveTaggingSecretStrategy} hook TXE exposes to private execution: an explicit strategy is used
 * verbatim, otherwise a mode-aware default:
 *
 * - constrained delivery -> non-interactive handshake
 * - unconstrained delivery -> address-derived
 */
export function testDefaultTaggingSecretStrategyHook(
  explicit: TaggingSecretStrategy | undefined,
): ResolveTaggingSecretStrategy {
  if (explicit) {
    return () => Promise.resolve(explicit);
  }
  return ({ deliveryMode }) =>
    Promise.resolve(
      deliveryMode === AppTaggingSecretKind.CONSTRAINED
        ? { type: 'non-interactive-handshake' }
        : { type: 'address-derived' },
    );
}
