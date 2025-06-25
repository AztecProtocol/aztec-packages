import { Timer } from '@aztec/foundation/timer';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import type { NodeStats } from '@aztec/stdlib/tx';

/*
 * Proxy generator for an AztecNode that tracks the time taken for each RPC call.
 */
export type ProxiedNode = AztecNode & { getStats(): NodeStats };

export class ProxiedNodeFactory {
  static create(node: AztecNode) {
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
            const result = await (target[prop] as any).apply(target, args);
            stats[prop].times.push(timer.ms());
            return result;
          };
        }
      },
    }) as ProxiedNode;
  }
}
