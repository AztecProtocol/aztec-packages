import type { ViemPublicDebugClient } from '@aztec/ethereum';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { Logger } from '@aztec/foundation/log';
import { type ZodFor, schemas } from '@aztec/foundation/schemas';
import { withHexPrefix } from '@aztec/foundation/string';

import type { Hex } from 'viem';
import { z } from 'zod';

import type { CallInfo } from './types.js';

/** Zod schema for trace action from trace_transaction */
const traceActionSchema = z.object({
  from: schemas.HexStringWith0x,
  to: schemas.HexStringWith0x.optional(),
  callType: z.string(),
  gas: schemas.HexStringWith0x.optional(),
  input: schemas.HexStringWith0x.optional(),
  value: schemas.HexStringWith0x.optional(),
});

/** Zod schema for trace result from trace_transaction */
const traceResultSchema = z.object({
  gasUsed: schemas.HexStringWith0x.optional(),
  output: schemas.HexStringWith0x.optional(),
});

/** Zod schema for a single trace from trace_transaction */
export const traceSchema = z.object({
  action: traceActionSchema,
  result: traceResultSchema.optional(),
  error: z.string().optional(),
  subtraces: z.number(),
  traceAddress: z.array(z.number()),
  type: z.string(),
});

/** Type for trace_transaction response */
type TraceTransaction = z.infer<typeof traceSchema>;

/** Zod schema for the full trace_transaction response (array of traces) */
export const traceTransactionResponseSchema: ZodFor<TraceTransaction[]> = z.array(traceSchema);

/**
 * Traces a transaction and extracts all CALL operations to a specific contract and function selector.
 * Uses the trace_transaction RPC method which returns a flat array of traces.
 *
 * @param client - The Viem public debug client
 * @param txHash - The transaction hash to trace
 * @param targetAddress - The contract address to filter for
 * @param functionSelector - The 4-byte function selector to filter for (with or without 0x prefix)
 * @returns Array of CallInfo objects containing from, gasUsed, input, and value for matching calls
 */
export async function getSuccessfulCallsFromTrace(
  client: ViemPublicDebugClient,
  txHash: Hex,
  targetAddress: EthAddress,
  functionSelector: string,
  logger?: Logger,
): Promise<CallInfo[]> {
  // Normalize inputs for comparison
  const normalizedTarget = targetAddress.toString().toLowerCase();
  const normalizedSelector = withHexPrefix(functionSelector.toLowerCase());

  // Call trace_transaction (no options needed)
  const rawTrace = await client.request({
    method: 'trace_transaction',
    params: [txHash],
  });

  if (rawTrace === null || rawTrace === undefined) {
    throw new Error(`Failed to retrieve trace_transaction for ${txHash}`);
  }

  logger?.trace(`Retrieved trace_transaction for ${txHash}`, { trace: rawTrace });

  // Validate the response with zod
  const traces = traceTransactionResponseSchema.parse(rawTrace);

  const results: CallInfo[] = [];

  // Build a set of trace addresses that errored - we should skip their descendants
  // A trace address is the path in the trace tree, represented as an array of indices
  const erroredTraceAddresses = new Set<string>();
  for (const trace of traces) {
    if (trace.error) {
      erroredTraceAddresses.add(JSON.stringify(trace.traceAddress));
    }
  }

  // Helper to check if a trace is a descendant of an errored trace
  function isDescendantOfError(traceAddress: number[]): boolean {
    // Check all possible ancestor paths
    for (let i = 1; i < traceAddress.length; i++) {
      const ancestorAddress = traceAddress.slice(0, i);
      if (erroredTraceAddresses.has(JSON.stringify(ancestorAddress))) {
        return true;
      }
    }
    return false;
  }

  // Process each trace
  for (const trace of traces) {
    // Skip if this has an error or is a descendant of an errored trace
    if (trace.error || isDescendantOfError(trace.traceAddress)) {
      continue;
    }

    // Check if this is a CALL type trace to the target address with matching selector and result
    if (
      trace.type === 'call' &&
      trace.action.callType.toLowerCase() === 'call' &&
      trace.action.to?.toLowerCase() === normalizedTarget &&
      trace.action.input?.toLowerCase().startsWith(normalizedSelector) &&
      trace.result
    ) {
      results.push({
        from: EthAddress.fromString(trace.action.from),
        gasUsed: trace.result.gasUsed === undefined ? undefined : BigInt(trace.result.gasUsed),
        input: trace.action.input,
        value: trace.action.value ? BigInt(trace.action.value) : 0n,
      });
    }
  }

  return results;
}
