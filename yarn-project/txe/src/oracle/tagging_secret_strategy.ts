import type { ResolveTaggingSecretStrategy, TaggingSecretStrategy } from '@aztec/pxe/server';
import { AppTaggingSecretKind } from '@aztec/stdlib/logs';

export type TXETaggingSecretStrategies = Map<AppTaggingSecretKind, TaggingSecretStrategy>;

export function makeResolveTaggingSecretStrategyHook(
  strategies: TXETaggingSecretStrategies,
): ResolveTaggingSecretStrategy | undefined {
  if (strategies.size === 0) {
    return undefined;
  }

  return ({ deliveryMode }) => Promise.resolve(strategies.get(deliveryMode) ?? { type: 'non-interactive-handshake' });
}
