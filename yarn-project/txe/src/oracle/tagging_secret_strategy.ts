import type { ResolveTaggingSecretStrategy, TaggingSecretStrategy } from '@aztec/pxe/server';
import { AppTaggingSecretKind } from '@aztec/stdlib/logs';

export type TXETaggingSecretStrategy =
  | TaggingSecretStrategy
  | {
      type: 'by-delivery-mode';
      unconstrained: TaggingSecretStrategy;
      constrained: TaggingSecretStrategy;
    };

export function makeResolveTaggingSecretStrategyHook(
  strategy: TXETaggingSecretStrategy | undefined,
): ResolveTaggingSecretStrategy | undefined {
  if (strategy === undefined) {
    return undefined;
  }

  if (strategy.type !== 'by-delivery-mode') {
    return () => Promise.resolve(strategy);
  }

  return ({ deliveryMode }) =>
    Promise.resolve(
      deliveryMode === AppTaggingSecretKind.UNCONSTRAINED ? strategy.unconstrained : strategy.constrained,
    );
}
