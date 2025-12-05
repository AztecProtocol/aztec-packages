import type { DebugCallTrace, ViemPublicDebugClient } from '@aztec/ethereum';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { Logger } from '@aztec/foundation/log';
import { type ZodFor, schemas } from '@aztec/foundation/schemas';
import { withHexPrefix } from '@aztec/foundation/string';

import type { Hex } from 'viem';
import { z } from 'zod';

import type { CallInfo } from './types.js';

/** Zod schema for validating call trace from debug_traceTransaction */
export const callTraceSchema: ZodFor<DebugCallTrace> = z.lazy(() =>
  z.object({
    from: schemas.HexStringWith0x,
    to: schemas.HexStringWith0x.optional(),
    type: z.string(),
    input: schemas.HexStringWith0x.optional(),
    output: schemas.HexStringWith0x.optional(),
    gas: schemas.HexStringWith0x,
    gasUsed: schemas.HexStringWith0x,
    value: schemas.HexStringWith0x.optional(),
    error: z.string().optional(),
    calls: z.array(callTraceSchema).optional(),
  }),
);

/**
 * Traces a transaction and extracts all CALL operations to a specific contract and function selector.
 *
 * @param client - The Viem public client
 * @param txHash - The transaction hash to trace
 * @param targetAddress - The contract address to filter for
 * @param functionSelector - The 4-byte function selector to filter for (with or without 0x prefix)
 * @returns Array of CallInfo objects containing from, gasUsed, input, and value for matching calls
 */
export async function getSuccessfulCallsFromDebug(
  client: ViemPublicDebugClient,
  txHash: Hex,
  targetAddress: EthAddress,
  functionSelector: string,
  logger?: Logger,
): Promise<CallInfo[]> {
  // Normalize inputs for comparison
  const normalizedTarget = targetAddress.toString().toLowerCase();
  const normalizedSelector = withHexPrefix(functionSelector.toLowerCase());

  // Call debug_traceTransaction with callTracer
  // Using 'any' here because debug_traceTransaction is not in viem's standard RPC types
  const rawTrace = await client.request({
    method: 'debug_traceTransaction',
    params: [txHash, { tracer: 'callTracer' }],
  });

  logger?.trace(`Retrieved debug_traceTransaction for ${txHash}`, { trace: rawTrace });

  // Validate the response with zod
  const trace = callTraceSchema.parse(rawTrace);

  const results: CallInfo[] = [];

  /**
   * Recursively traverse the call trace tree
   */
  function traverseCalls(callTrace: DebugCallTrace) {
    // Skip calls that have errors, and all its descendants
    if (callTrace.error) {
      return;
    }

    // Check if this is a CALL (not DELEGATECALL or STATICCALL) to the target address with matching selector
    if (
      callTrace.type.toUpperCase() === 'CALL' &&
      callTrace.to?.toLowerCase() === normalizedTarget &&
      callTrace.input?.toLowerCase().startsWith(normalizedSelector)
    ) {
      results.push({
        from: EthAddress.fromString(callTrace.from),
        gasUsed: BigInt(callTrace.gasUsed),
        input: callTrace.input,
        value: callTrace.value ? BigInt(callTrace.value) : 0n,
      });
    }

    // Recursively process nested calls
    for (const nestedCall of callTrace.calls ?? []) {
      traverseCalls(nestedCall);
    }
  }

  // Start traversal from the root trace
  traverseCalls(trace);

  return results;
}
