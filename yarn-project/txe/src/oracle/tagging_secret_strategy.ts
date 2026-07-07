import {
  DEFAULT_TAGGING_SECRET_STRATEGY,
  type ResolveTaggingSecretStrategy,
  type TaggingSecretStrategy,
} from '@aztec/pxe/server';
import type { AppTaggingSecretKind } from '@aztec/stdlib/logs';

/** The tagging secret strategies a TXE test has configured, keyed by delivery mode. Absence means "not configured". */
export type TXETaggingSecretStrategies = Map<AppTaggingSecretKind, TaggingSecretStrategy>;

/**
 * Builds the `resolveTaggingSecretStrategy` hook backing the `aztec_txe_setTaggingSecretStrategies` oracle. Returns
 * `undefined` when no strategy is configured, so PXE's own no-hook default path is exercised. When at least one mode
 * is configured, modes without an entry resolve to {@link DEFAULT_TAGGING_SECRET_STRATEGY}, matching what PXE would
 * apply without a hook.
 */
export function makeResolveTaggingSecretStrategyHook(
  strategies: TXETaggingSecretStrategies,
): ResolveTaggingSecretStrategy | undefined {
  if (strategies.size === 0) {
    return undefined;
  }

  return ({ deliveryMode }) => Promise.resolve(strategies.get(deliveryMode) ?? DEFAULT_TAGGING_SECRET_STRATEGY);
}
