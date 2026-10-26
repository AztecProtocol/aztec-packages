import { Timer } from '@aztec/foundation/timer';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import type { NodeStats } from '@aztec/stdlib/tx';

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
export interface Recording {
  /** A snapshot of the reads seen so far. Safe to call while the recording is still open. */
  stats(): NodeStats;
  /** Closes the recording. Reads served after this are not recorded. Idempotent. */
  stop(): void;
}

/** An {@link AztecNode} wrapper that can report the reads it serves. */
export interface BenchmarkedAztecNode extends AztecNode {
  /**
   * Opens a recording of the reads this wrapper serves, until {@link Recording.stop}. Recordings are independent, so
   * several may run at once: one measuring a whole run sees the same reads as one measuring a single operation.
   *
   * Nothing is measured while none is open, which is what keeps a long-lived wrapper from accumulating a run's worth
   * of timings nobody asked for.
   */
  startRecording(): Recording;
}

/** Wraps `node` so that the reads it answers can be recorded. */
export function withRecording(node: AztecNode): BenchmarkedAztecNode {
  // The stats of every recording currently open
  const open = new Set<NodeStats>();

  // Round trip tracking
  let inFlightCount = 0;
  let currentRoundTripTimer: Timer | null = null;
  let currentRoundTripMethods: string[] = [];

  return new Proxy(node, {
    get(target, prop) {
      if (prop === 'startRecording') {
        return (): Recording => {
          const stats: NodeStats = {
            perMethod: {},
            roundTrips: { roundTrips: 0, totalBlockingTime: 0, roundTripDurations: [], roundTripMethods: [] },
          };
          open.add(stats);
          return {
            // Cloned so a snapshot embedded in an operation's results is not mutated by reads served later.
            stats: () => structuredClone(stats),
            stop: () => open.delete(stats),
          };
        };
      }

      const value = Reflect.get(target, prop);
      if (typeof value !== 'function' || typeof prop !== 'string') {
        return value;
      }

      return (...args: unknown[]) => {
        // With no recording open there is nobody to report to, so the read is left untimed.
        if (open.size === 0) {
          return value.apply(target, args);
        }

        // Start of a new round trip batch?
        if (inFlightCount === 0) {
          currentRoundTripTimer = new Timer();
          currentRoundTripMethods = [];
        }
        inFlightCount++;
        currentRoundTripMethods.push(prop);

        const callTimer = new Timer();
        const result = value.apply(target, args);

        // Handle completion - called when the call finishes (after Promise resolves)
        const handleCompletion = () => {
          const callTime = callTimer.ms();
          for (const stats of open) {
            timesFor(stats, prop).push(callTime);
          }

          inFlightCount--;

          // End of round trip batch - all concurrent calls completed
          if (inFlightCount === 0 && currentRoundTripTimer) {
            const roundTripTime = currentRoundTripTimer.ms();
            for (const { roundTrips } of open) {
              roundTrips.roundTrips++;
              roundTrips.totalBlockingTime += roundTripTime;
              roundTrips.roundTripDurations.push(roundTripTime);
              roundTrips.roundTripMethods.push(currentRoundTripMethods);
            }
            currentRoundTripTimer = null;
            currentRoundTripMethods = [];
          }
        };

        // If the result is a Promise, chain the completion handler
        if (isThenable(result)) {
          return result.then(
            resolved => {
              handleCompletion();
              return resolved;
            },
            error => {
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
    },
  }) as BenchmarkedAztecNode;
}

/** The times `stats` holds for `method`, added on first use. */
function timesFor(stats: NodeStats, method: string) {
  return (stats.perMethod[method as keyof AztecNode] ??= { times: [] }).times;
}

/** Whether completion can be chained onto `value` with `.then`, which a promise from any implementation allows. */
function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof value === 'object' && value !== null && 'then' in value && typeof value.then === 'function';
}
