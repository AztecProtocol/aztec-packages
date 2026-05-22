import type { AztecNode } from '@aztec/aztec.js/node';
import { TxSimulationResultWithAppOffset } from '@aztec/aztec.js/wallet';
import { MAX_ENQUEUED_CALLS_PER_CALL } from '@aztec/constants';
import type { ChainInfo } from '@aztec/entrypoints/interfaces';
import { makeTuple } from '@aztec/foundation/array';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { Tuple } from '@aztec/foundation/serialize';
import type { ContractNameResolver } from '@aztec/pxe/client/lazy';
import { displayDebugLogs } from '@aztec/pxe/client/lazy';
import { generateSimulatedProvingResult } from '@aztec/pxe/simulator';
import { type FunctionCall, FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { GasSettings } from '@aztec/stdlib/gas';
import {
  ClaimedLengthArray,
  CountedPublicCallRequest,
  PrivateCircuitPublicInputs,
  PublicCallRequest,
} from '@aztec/stdlib/kernel';
import { ChonkProof } from '@aztec/stdlib/proofs';
import {
  type BlockHeader,
  type ExecutionPayload,
  HashedValues,
  PrivateCallExecutionResult,
  PrivateExecutionResult,
  PublicSimulationOutput,
  type SimulationOverrides,
  Tx,
  TxContext,
  TxSimulationResult,
} from '@aztec/stdlib/tx';

/**
 * Splits an execution payload into a leading prefix of public static calls
 * (eligible for direct node simulation) and the remaining calls.
 *
 * Only a leading run of public static calls is eligible for optimization.
 * Any non-public-static call may enqueue public state mutations
 * (e.g. private calls can enqueue public calls), so all calls that follow
 * must go through the normal simulation path to see the correct state.
 *
 */
export function extractOptimizablePublicStaticCalls(payload: ExecutionPayload): {
  /** Leading public static calls eligible for direct node simulation. */
  optimizableCalls: FunctionCall[];
  /** All remaining calls. */
  remainingCalls: FunctionCall[];
} {
  const splitIndex = payload.calls.findIndex(call => !call.isPublicStatic());
  const boundary = splitIndex === -1 ? payload.calls.length : splitIndex;
  return {
    optimizableCalls: payload.calls.slice(0, boundary),
    remainingCalls: payload.calls.slice(boundary),
  };
}

/**
 * Simulates a batch of public static calls by bypassing account entrypoint and private execution,
 * directly constructing a minimal Tx and calling node.simulatePublicCalls.
 *
 * @param node - The Aztec node to simulate on.
 * @param publicStaticCalls - Array of public static function calls (max MAX_ENQUEUED_CALLS_PER_CALL).
 * @param from - The account address making the calls.
 * @param chainInfo - Chain information (chainId and version).
 * @param gasSettings - Gas settings for the transaction.
 * @param blockHeader - Block header to use as anchor.
 * @param skipFeeEnforcement - Whether to skip fee enforcement during simulation.
 * @param getContractName - Resolver for contract names (used for debug log display).
 * @param overrides - Optional pre-simulation overrides applied to the ephemeral fork and contract DB.
 * @returns TxSimulationResult with public return values.
 */
async function simulateBatchViaNode(
  node: AztecNode,
  publicStaticCalls: FunctionCall[],
  from: AztecAddress,
  chainInfo: ChainInfo,
  gasSettings: GasSettings,
  blockHeader: BlockHeader,
  skipFeeEnforcement: boolean,
  getContractName: ContractNameResolver,
  overrides?: SimulationOverrides,
): Promise<TxSimulationResult> {
  const txContext = new TxContext(chainInfo.chainId, chainInfo.version, gasSettings);

  const publicFunctionCalldata: HashedValues[] = [];
  for (const call of publicStaticCalls) {
    const calldata = await HashedValues.fromCalldata([call.selector.toField(), ...call.args]);
    publicFunctionCalldata.push(calldata);
  }

  const publicCallRequests = makeTuple(MAX_ENQUEUED_CALLS_PER_CALL, i => {
    const call = publicStaticCalls[i];
    if (!call) {
      return CountedPublicCallRequest.empty();
    }
    const publicCallRequest = new PublicCallRequest(from, call.to, call.isStatic, publicFunctionCalldata[i]!.hash);
    // Counter starts at 1 (minRevertibleSideEffectCounter) so all calls are revertible
    return new CountedPublicCallRequest(publicCallRequest, i + 1);
  });

  const publicCallRequestsArray: ClaimedLengthArray<CountedPublicCallRequest, typeof MAX_ENQUEUED_CALLS_PER_CALL> =
    new ClaimedLengthArray(
      publicCallRequests as Tuple<CountedPublicCallRequest, typeof MAX_ENQUEUED_CALLS_PER_CALL>,
      publicStaticCalls.length,
    );

  const publicInputs = PrivateCircuitPublicInputs.from({
    ...PrivateCircuitPublicInputs.empty(),
    anchorBlockHeader: blockHeader,
    txContext: txContext,
    publicCallRequests: publicCallRequestsArray,
    startSideEffectCounter: new Fr(0),
    endSideEffectCounter: new Fr(publicStaticCalls.length + 1),
  });

  // Minimal entrypoint structure — no real private execution, just public call requests
  const emptyEntrypoint = new PrivateCallExecutionResult(
    Buffer.alloc(0),
    Buffer.alloc(0),
    new Map(),
    publicInputs,
    [],
    new Map(),
    [],
    [],
    [],
    [],
    [],
  );

  const privateResult = new PrivateExecutionResult(emptyEntrypoint, Fr.random(), publicFunctionCalldata);

  const provingResult = await generateSimulatedProvingResult(
    privateResult,
    (_contractAddress: AztecAddress, _functionSelector: FunctionSelector) => Promise.resolve(''),
    node,
    1, // minRevertibleSideEffectCounter
  );

  provingResult.publicInputs.feePayer = from;

  const tx = await Tx.create({
    data: provingResult.publicInputs,
    chonkProof: ChonkProof.empty(),
    contractClassLogFields: [],
    publicFunctionCalldata: publicFunctionCalldata,
  });

  const publicOutput = await node.simulatePublicCalls(tx, skipFeeEnforcement, overrides);

  if (publicOutput.revertReason) {
    throw publicOutput.revertReason;
  }

  // Display debug logs from the public simulation.
  await displayDebugLogs(publicOutput.debugLogs, getContractName);

  return new TxSimulationResult(privateResult, provingResult.publicInputs, publicOutput, undefined);
}

/**
 * Simulates public static calls by splitting them into batches of MAX_ENQUEUED_CALLS_PER_CALL
 * and sending each batch directly to the node.
 *
 * @param node - The Aztec node to simulate on.
 * @param publicStaticCalls - Array of public static function calls to optimize.
 * @param from - The account address making the calls.
 * @param chainInfo - Chain information (chainId and version).
 * @param gasSettings - Gas settings for the transaction.
 * @param blockHeader - Block header to use as anchor.
 * @param skipFeeEnforcement - Whether to skip fee enforcement during simulation.
 * @param getContractName - Resolver for contract names (used for debug log display).
 * @param overrides - Optional pre-simulation overrides applied to the ephemeral fork and contract DB.
 * @returns Array of TxSimulationResult, one per batch.
 */
export async function simulateViaNode(
  node: AztecNode,
  publicStaticCalls: FunctionCall[],
  from: AztecAddress,
  chainInfo: ChainInfo,
  gasSettings: GasSettings,
  blockHeader: BlockHeader,
  skipFeeEnforcement: boolean = true,
  getContractName: ContractNameResolver,
  overrides?: SimulationOverrides,
): Promise<TxSimulationResult[]> {
  const batches: FunctionCall[][] = [];

  for (let i = 0; i < publicStaticCalls.length; i += MAX_ENQUEUED_CALLS_PER_CALL) {
    batches.push(publicStaticCalls.slice(i, i + MAX_ENQUEUED_CALLS_PER_CALL));
  }

  const results: TxSimulationResult[] = [];

  for (const batch of batches) {
    const result = await simulateBatchViaNode(
      node,
      batch,
      from,
      chainInfo,
      gasSettings,
      blockHeader,
      skipFeeEnforcement,
      getContractName,
      overrides,
    );
    results.push(result);
  }

  return results;
}

/**
 * Merges simulation results from the optimized (public static) and normal paths.
 * Since optimized calls are always a leading prefix, return values are simply
 * concatenated: optimized first, then normal.
 * Stats are taken from the normal result only (the optimized path doesn't produce them).
 *
 * @param optimizedResults - Results from optimized public static call batches.
 * @param normalResult - Result from normal simulation (null if all calls were optimized).
 * @returns A single TxSimulationResult with return values in original call order.
 */
export function buildMergedSimulationResult(
  optimizedResults: TxSimulationResult[],
  normalResult: TxSimulationResultWithAppOffset | null,
): TxSimulationResultWithAppOffset {
  const optimizedReturnValues = optimizedResults.flatMap(r => r.publicOutput?.publicReturnValues ?? []);
  const normalReturnValues = normalResult?.publicOutput?.publicReturnValues ?? [];
  const allReturnValues = [...optimizedReturnValues, ...normalReturnValues];

  const baseResult: TxSimulationResult = normalResult ?? optimizedResults[0];

  const mergedPublicOutput: PublicSimulationOutput | undefined = baseResult.publicOutput
    ? {
        ...baseResult.publicOutput,
        publicReturnValues: allReturnValues,
      }
    : undefined;

  const merged = new TxSimulationResult(
    baseResult.privateExecutionResult,
    baseResult.publicInputs,
    mergedPublicOutput,
    normalResult?.stats,
  );
  return TxSimulationResultWithAppOffset.fromResultAndOffset(merged, normalResult?.appCallOffset ?? 0);
}
