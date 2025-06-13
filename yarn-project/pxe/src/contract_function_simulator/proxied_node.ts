import type { Fr } from '@aztec/foundation/fields';
import { Timer } from '@aztec/foundation/timer';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import type { NodeStats } from '@aztec/stdlib/tx';

/*
 * Proxy for an AztecNode that tracks the time taken for each RPC call.
 */
export type ProxiedNode = AztecNode & { getStats(): NodeStats };

export type NodeOverrides = {
  publicStorage: Map<string, /* AztecAddress as string */ Map<string, /* Slot as string */ Fr>>;
};

export class ProxiedNodeFactory {
  static create(node: AztecNode, overrides?: NodeOverrides) {
    const stats: Partial<Record<keyof AztecNode, { times: number[] }>> = {};
    return new Proxy(node, {
      get(target, prop: keyof ProxiedNode) {
        if (prop === 'getStats') {
          return () => {
            return stats;
          };
        } else {
          return async function (...args: any[]) {
            if (!stats[prop]) {
              stats[prop] = { times: [] };
            }
            const timer = new Timer();
            let result;
            if (
              prop === 'getPublicStorageAt' &&
              overrides?.publicStorage.has(args[1].toString()) &&
              overrides.publicStorage.get(args[1].toString())!.has(args[2].toString())
            ) {
              result = overrides.publicStorage.get(args[1].toString())!.get(args[2].toString())!;
            } else {
              result = await (target[prop] as any).apply(target, args);
            }
            stats[prop].times.push(timer.ms());
            return result;
          };
        }
      },
    }) as ProxiedNode;
  }
}
