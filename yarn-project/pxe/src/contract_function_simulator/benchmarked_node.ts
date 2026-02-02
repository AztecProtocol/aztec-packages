import { Timer } from '@aztec/foundation/timer';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import type { NodeStats, RoundTripStats } from '@aztec/stdlib/tx';

/*
 * Proxy generator for an AztecNode that tracks the time taken for each RPC call and the number of round trips (actual
 * blocking waits for node responses).
 *
 * A round trip is counted when we transition from 0 to 1 in-flight calls, and ends when all concurrent calls complete.
 * This means parallel calls in Promise.all count as a single round trip.
 *
 * Note that batching of RPC calls in `safe_json_rpc_client.ts` could affect the round trip counts but in places we
 * currently use this information we do not even use HTTP as we have direct access to the Aztec Node instance in TS
 * (i.e. not running against external node) so this is not a problem for now.
 *
 * If you want to use this against external node and the info gets skewed by batching you can set the `maxBatchSize`
 * value in `safe_json_rpc_client.ts` to 1 (the main motivation for batching was to get around parallel http requests
 * limits in web browsers which is not a problem when debugging in node.js).
 */
export type BenchmarkedNode = AztecNode & { getStats(): NodeStats };

export class BenchmarkedNodeFactory {
  static create(node: AztecNode): BenchmarkedNode {
    // Per-method call stats
    const perMethod: Partial<Record<keyof AztecNode, { times: number[] }>> = {};

    // Round trip tracking
    let inFlightCount = 0;
    let currentRoundTripTimer: Timer | null = null;
    let currentRoundTripMethods: string[] = [];
    const roundTrips: RoundTripStats = {
      roundTrips: 0,
      totalBlockingTime: 0,
      roundTripDurations: [],
      roundTripMethods: [],
    };

    return new Proxy(node, {
      get(target, prop: keyof BenchmarkedNode) {
        if (prop === 'getStats') {
          return (): NodeStats => {
            return { perMethod, roundTrips };
          };
        } else {
          return function (...args: any[]) {
            // Track per-method stats
            if (!perMethod[prop]) {
              perMethod[prop] = { times: [] };
            }

            // Start of a new round trip batch?
            if (inFlightCount === 0) {
              roundTrips.roundTrips++;
              currentRoundTripTimer = new Timer();
              currentRoundTripMethods = [];
            }
            inFlightCount++;
            currentRoundTripMethods.push(prop);

            const callTimer = new Timer();
            const result = (target[prop] as any).apply(target, args);

            // Handle completion - called when the call finishes (after Promise resolves)
            const handleCompletion = () => {
              const callTime = callTimer.ms();
              perMethod[prop]!.times.push(callTime);

              inFlightCount--;

              // End of round trip batch - all concurrent calls completed
              if (inFlightCount === 0 && currentRoundTripTimer) {
                const roundTripTime = currentRoundTripTimer.ms();
                roundTrips.totalBlockingTime += roundTripTime;
                roundTrips.roundTripDurations.push(roundTripTime);
                roundTrips.roundTripMethods.push(currentRoundTripMethods);
                currentRoundTripTimer = null;
                currentRoundTripMethods = [];
              }
            };

            // If the result is a Promise, chain the completion handler
            if (result && typeof result.then === 'function') {
              return result.then(
                (value: any) => {
                  handleCompletion();
                  return value;
                },
                (error: any) => {
                  handleCompletion();
                  throw error;
                },
              );
            } else {
              // Synchronous method - handle completion immediately
              handleCompletion();
              return result;
            }
          };
        }
      },
    }) as BenchmarkedNode;
  }
}
