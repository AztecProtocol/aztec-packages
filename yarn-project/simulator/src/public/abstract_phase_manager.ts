import {
  MerkleTreeId,
  type NestedProcessReturnValues,
  type PublicKernelRequest,
  PublicKernelType,
  type SimulationError,
  type Tx,
  type UnencryptedFunctionL2Logs,
} from '@aztec/circuit-types';
import {
  AztecAddress,
  CallRequest,
  ContractStorageRead,
  ContractStorageUpdateRequest,
  Fr,
  FunctionData,
  Gas,
  type GlobalVariables,
  type Header,
  type KernelCircuitPublicInputs,
  L2ToL1Message,
  LogHash,
  MAX_NEW_L2_TO_L1_MSGS_PER_CALL,
  MAX_NEW_NOTE_HASHES_PER_CALL,
  MAX_NEW_NULLIFIERS_PER_CALL,
  MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_CALL,
  MAX_NULLIFIER_READ_REQUESTS_PER_CALL,
  MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL,
  MAX_PUBLIC_DATA_READS_PER_CALL,
  MAX_PUBLIC_DATA_READS_PER_TX,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  MAX_UNENCRYPTED_LOGS_PER_CALL,
  MembershipWitness,
  NESTED_RECURSIVE_PROOF_LENGTH,
  NoteHash,
  Nullifier,
  PublicCallData,
  type PublicCallRequest,
  PublicCallStackItem,
  PublicCircuitPublicInputs,
  PublicDataRead,
  PublicDataUpdateRequest,
  PublicKernelCircuitPrivateInputs,
  type PublicKernelCircuitPublicInputs,
  PublicKernelData,
  ReadRequest,
  RevertCode,
  VK_TREE_HEIGHT,
  VerificationKeyData,
  makeEmptyProof,
  makeEmptyRecursiveProof,
} from '@aztec/circuits.js';
import { computeVarArgsHash } from '@aztec/circuits.js/hash';
import { arrayNonEmptyLength, padArrayEnd } from '@aztec/foundation/collection';
import { type DebugLogger, createDebugLogger } from '@aztec/foundation/log';
import { type Tuple } from '@aztec/foundation/serialize';
import {
  type PublicExecution,
  type PublicExecutionResult,
  type PublicExecutor,
  accumulateReturnValues,
  collectPublicDataReads,
  isPublicExecutionResult,
} from '@aztec/simulator';
import { type MerkleTreeOperations } from '@aztec/world-state';

import { HintsBuilder } from './hints_builder.js';
import { type PublicKernelCircuitSimulator } from './public_kernel_circuit_simulator.js';
import { lastSideEffectCounter } from './utils.js';

export enum PublicKernelPhase {
  SETUP = 'setup',
  APP_LOGIC = 'app-logic',
  TEARDOWN = 'teardown',
  TAIL = 'tail',
}

export const PhaseIsRevertible: Record<PublicKernelPhase, boolean> = {
  [PublicKernelPhase.SETUP]: false,
  [PublicKernelPhase.APP_LOGIC]: true,
  [PublicKernelPhase.TEARDOWN]: true,
  [PublicKernelPhase.TAIL]: false,
};

// REFACTOR: Unify both enums and move to types or circuit-types.
export function publicKernelPhaseToKernelType(phase: PublicKernelPhase): PublicKernelType {
  switch (phase) {
    case PublicKernelPhase.SETUP:
      return PublicKernelType.SETUP;
    case PublicKernelPhase.APP_LOGIC:
      return PublicKernelType.APP_LOGIC;
    case PublicKernelPhase.TEARDOWN:
      return PublicKernelType.TEARDOWN;
    case PublicKernelPhase.TAIL:
      return PublicKernelType.TAIL;
  }
}

export abstract class AbstractPhaseManager {
  protected hintsBuilder: HintsBuilder;
  protected log: DebugLogger;
  constructor(
    protected db: MerkleTreeOperations,
    protected publicExecutor: PublicExecutor,
    protected publicKernel: PublicKernelCircuitSimulator,
    protected globalVariables: GlobalVariables,
    protected historicalHeader: Header,
    public phase: PublicKernelPhase,
  ) {
    this.hintsBuilder = new HintsBuilder(db);
    this.log = createDebugLogger(`aztec:sequencer:${phase}`);
  }
  /**
   *
   * @param tx - the tx to be processed
   * @param publicKernelPublicInputs - the output of the public kernel circuit for the previous phase
   * @param previousPublicKernelProof - the proof of the public kernel circuit for the previous phase
   */
  abstract handle(
    tx: Tx,
    publicKernelPublicInputs: PublicKernelCircuitPublicInputs,
  ): Promise<{
    /**
     * The collection of public kernel requests
     */
    kernelRequests: PublicKernelRequest[];
    /**
     * the output of the public kernel circuit for this phase
     */
    publicKernelOutput: PublicKernelCircuitPublicInputs;
    /**
     * the final output of the public kernel circuit for this phase
     */
    finalKernelOutput?: KernelCircuitPublicInputs;
    /**
     * revert reason, if any
     */
    revertReason: SimulationError | undefined;
    returnValues: NestedProcessReturnValues[];
    /** Gas used during the execution this particular phase. */
    gasUsed: Gas | undefined;
  }>;

  public static extractEnqueuedPublicCallsByPhase(tx: Tx): Record<PublicKernelPhase, PublicCallRequest[]> {
    const data = tx.data.forPublic;
    if (!data) {
      return {
        [PublicKernelPhase.SETUP]: [],
        [PublicKernelPhase.APP_LOGIC]: [],
        [PublicKernelPhase.TEARDOWN]: [],
        [PublicKernelPhase.TAIL]: [],
      };
    }
    const publicCallsStack = tx.enqueuedPublicFunctionCalls.slice().reverse();
    const nonRevertibleCallStack = data.endNonRevertibleData.publicCallStack.filter(i => !i.isEmpty());
    const revertibleCallStack = data.end.publicCallStack.filter(i => !i.isEmpty());

    const callRequestsStack = publicCallsStack
      .map(call => call.toCallRequest())
      .filter(
        // filter out enqueued calls that are not in the public call stack
        // TODO mitch left a question about whether this is only needed when unit testing
        // with mock data
        call => revertibleCallStack.find(p => p.equals(call)) || nonRevertibleCallStack.find(p => p.equals(call)),
      );

    if (callRequestsStack.length === 0) {
      return {
        [PublicKernelPhase.SETUP]: [],
        [PublicKernelPhase.APP_LOGIC]: [],
        [PublicKernelPhase.TEARDOWN]: [],
        [PublicKernelPhase.TAIL]: [],
      };
    }

    // find the first call that is revertible
    const firstRevertibleCallIndex = callRequestsStack.findIndex(
      c => revertibleCallStack.findIndex(p => p.equals(c)) !== -1,
    );

    const teardownCallStack = tx.publicTeardownFunctionCall.isEmpty() ? [] : [tx.publicTeardownFunctionCall];

    if (firstRevertibleCallIndex === 0) {
      return {
        [PublicKernelPhase.SETUP]: [],
        [PublicKernelPhase.APP_LOGIC]: publicCallsStack,
        [PublicKernelPhase.TEARDOWN]: teardownCallStack,
        [PublicKernelPhase.TAIL]: [],
      };
    } else if (firstRevertibleCallIndex === -1) {
      // there's no app logic, split the functions between setup (many) and teardown (just one function call)
      return {
        [PublicKernelPhase.SETUP]: publicCallsStack,
        [PublicKernelPhase.APP_LOGIC]: [],
        [PublicKernelPhase.TEARDOWN]: teardownCallStack,
        [PublicKernelPhase.TAIL]: [],
      };
    } else {
      return {
        [PublicKernelPhase.SETUP]: publicCallsStack.slice(0, firstRevertibleCallIndex),
        [PublicKernelPhase.APP_LOGIC]: publicCallsStack.slice(firstRevertibleCallIndex),
        [PublicKernelPhase.TEARDOWN]: teardownCallStack,
        [PublicKernelPhase.TAIL]: [],
      };
    }
  }

  protected extractEnqueuedPublicCalls(tx: Tx): PublicCallRequest[] {
    const calls = AbstractPhaseManager.extractEnqueuedPublicCallsByPhase(tx)[this.phase];

    return calls;
  }

  // REFACTOR: Do not return an array and instead return a struct with similar shape to that returned by `handle`
  protected async processEnqueuedPublicCalls(
    tx: Tx,
    previousPublicKernelOutput: PublicKernelCircuitPublicInputs,
  ): Promise<
    [
      PublicKernelCircuitPrivateInputs[],
      PublicKernelCircuitPublicInputs,
      UnencryptedFunctionL2Logs[],
      SimulationError | undefined,
      NestedProcessReturnValues[],
      Gas,
    ]
  > {
    let kernelOutput = previousPublicKernelOutput;
    const publicKernelInputs: PublicKernelCircuitPrivateInputs[] = [];

    const enqueuedCalls = this.extractEnqueuedPublicCalls(tx);

    if (!enqueuedCalls || !enqueuedCalls.length) {
      return [[], kernelOutput, [], undefined, [], Gas.empty()];
    }

    const newUnencryptedFunctionLogs: UnencryptedFunctionL2Logs[] = [];

    // Transaction fee is zero for all phases except teardown
    const transactionFee = this.getTransactionFee(tx, previousPublicKernelOutput);

    // TODO(#1684): Should multiple separately enqueued public calls be treated as
    // separate public callstacks to be proven by separate public kernel sequences
    // and submitted separately to the base rollup?

    let gasUsed = Gas.empty();

    const enqueuedCallResults = [];

    for (const enqueuedCall of enqueuedCalls) {
      const executionStack: (PublicExecution | PublicExecutionResult)[] = [enqueuedCall];

      // Keep track of which result is for the top/enqueued call
      let enqueuedExecutionResult: PublicExecutionResult | undefined;

      while (executionStack.length) {
        const current = executionStack.pop()!;
        const isExecutionRequest = !isPublicExecutionResult(current);
        // TODO(6052): Extract correct new counter from nested calls
        const sideEffectCounter = lastSideEffectCounter(tx) + 1;
        const availableGas = this.getAvailableGas(tx, kernelOutput);
        const pendingNullifiers = this.getSiloedPendingNullifiers(kernelOutput);

        const result = isExecutionRequest
          ? await this.publicExecutor.simulate(
              current,
              this.globalVariables,
              availableGas,
              tx.data.constants.txContext,
              pendingNullifiers,
              transactionFee,
              sideEffectCounter,
            )
          : current;

        // Sanity check for a current upstream assumption.
        // Consumers of the result seem to expect "reverted <=> revertReason !== undefined".
        const functionSelector = result.execution.functionSelector.toString();
        if (result.reverted && !result.revertReason) {
          throw new Error(
            `Simulation of ${result.execution.contractAddress.toString()}:${functionSelector} reverted with no reason.`,
          );
        }

        // Accumulate gas used in this execution
        gasUsed = gasUsed.add(Gas.from(result.startGasLeft).sub(Gas.from(result.endGasLeft)));

        if (result.reverted && !PhaseIsRevertible[this.phase]) {
          this.log.debug(
            `Simulation error on ${result.execution.contractAddress.toString()}:${functionSelector} with reason: ${
              result.revertReason
            }`,
          );
          throw result.revertReason;
        }

        if (isExecutionRequest) {
          newUnencryptedFunctionLogs.push(result.allUnencryptedLogs);
        }

        this.log.debug(
          `Running public kernel circuit for ${result.execution.contractAddress.toString()}:${functionSelector}`,
        );
        executionStack.push(...result.nestedExecutions);
        const callData = await this.getPublicCallData(result, isExecutionRequest);

        const circuitResult = await this.runKernelCircuit(kernelOutput, callData);
        kernelOutput = circuitResult[1];

        // Capture the inputs to the kernel circuit for later proving
        publicKernelInputs.push(circuitResult[0]);

        // sanity check. Note we can't expect them to just be equal, because e.g.
        // if the simulator reverts in app logic, it "resets" and result.reverted will be false when we run teardown,
        // but the kernel carries the reverted flag forward. But if the simulator reverts, so should the kernel.
        if (result.reverted && kernelOutput.revertCode.isOK()) {
          throw new Error(
            `Public kernel circuit did not revert on ${result.execution.contractAddress.toString()}:${functionSelector}, but simulator did.`,
          );
        }

        // We know the phase is revertible due to the above check.
        // So safely return the revert reason and the kernel output (which has had its revertible side effects dropped)
        if (result.reverted) {
          this.log.debug(
            `Reverting on ${result.execution.contractAddress.toString()}:${functionSelector} with reason: ${
              result.revertReason
            }`,
          );
          // TODO(@spalladino): Check gasUsed is correct. The AVM should take care of setting gasLeft to zero upon a revert.
          return [[], kernelOutput, [], result.revertReason, [], gasUsed];
        }

        if (!enqueuedExecutionResult) {
          enqueuedExecutionResult = result;
        }

        enqueuedCallResults.push(accumulateReturnValues(enqueuedExecutionResult));
      }
      // HACK(#1622): Manually patches the ordering of public state actions
      // TODO(#757): Enforce proper ordering of public state actions
      this.patchPublicStorageActionOrdering(kernelOutput, enqueuedExecutionResult!);
    }

    return [publicKernelInputs, kernelOutput, newUnencryptedFunctionLogs, undefined, enqueuedCallResults, gasUsed];
  }

  /** Returns all pending private and public nullifiers.  */
  private getSiloedPendingNullifiers(ko: PublicKernelCircuitPublicInputs) {
    return [...ko.end.newNullifiers, ...ko.endNonRevertibleData.newNullifiers].filter(n => !n.isEmpty());
  }

  protected getAvailableGas(tx: Tx, previousPublicKernelOutput: PublicKernelCircuitPublicInputs) {
    return tx.data.constants.txContext.gasSettings
      .getLimits() // No need to subtract teardown limits since they are already included in end.gasUsed
      .sub(previousPublicKernelOutput.end.gasUsed)
      .sub(previousPublicKernelOutput.endNonRevertibleData.gasUsed);
  }

  protected getTransactionFee(_tx: Tx, _previousPublicKernelOutput: PublicKernelCircuitPublicInputs) {
    return Fr.ZERO;
  }

  protected async runKernelCircuit(
    previousOutput: PublicKernelCircuitPublicInputs,
    callData: PublicCallData,
  ): Promise<[PublicKernelCircuitPrivateInputs, PublicKernelCircuitPublicInputs]> {
    return await this.getKernelCircuitOutput(previousOutput, callData);
  }

  protected async getKernelCircuitOutput(
    previousOutput: PublicKernelCircuitPublicInputs,
    callData: PublicCallData,
  ): Promise<[PublicKernelCircuitPrivateInputs, PublicKernelCircuitPublicInputs]> {
    const previousKernel = this.getPreviousKernelData(previousOutput);

    // We take a deep copy (clone) of these inputs to be passed to the prover
    const inputs = new PublicKernelCircuitPrivateInputs(previousKernel, callData);
    switch (this.phase) {
      case PublicKernelPhase.SETUP:
        return [inputs.clone(), await this.publicKernel.publicKernelCircuitSetup(inputs)];
      case PublicKernelPhase.APP_LOGIC:
        return [inputs.clone(), await this.publicKernel.publicKernelCircuitAppLogic(inputs)];
      case PublicKernelPhase.TEARDOWN:
        return [inputs.clone(), await this.publicKernel.publicKernelCircuitTeardown(inputs)];
      default:
        throw new Error(`No public kernel circuit for inputs`);
    }
  }

  protected getPreviousKernelData(previousOutput: PublicKernelCircuitPublicInputs): PublicKernelData {
    // The proof and verification key are not used in simulation
    const vk = VerificationKeyData.makeFake();
    const proof = makeEmptyRecursiveProof(NESTED_RECURSIVE_PROOF_LENGTH);
    const vkIndex = 0;
    const vkSiblingPath = MembershipWitness.random(VK_TREE_HEIGHT).siblingPath;
    return new PublicKernelData(previousOutput, proof, vk, vkIndex, vkSiblingPath);
  }

  protected async getPublicCallStackItem(result: PublicExecutionResult, isExecutionRequest = false) {
    const publicDataTreeInfo = await this.db.getTreeInfo(MerkleTreeId.PUBLIC_DATA_TREE);
    this.historicalHeader.state.partial.publicDataTree.root = Fr.fromBuffer(publicDataTreeInfo.root);

    const callStackPreimages = await this.getPublicCallStackPreimages(result);
    const publicCallStackHashes = padArrayEnd(
      callStackPreimages.map(c => c.hash()),
      Fr.ZERO,
      MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL,
    );

    const publicCircuitPublicInputs = PublicCircuitPublicInputs.from({
      callContext: result.execution.callContext,
      proverAddress: AztecAddress.ZERO,
      argsHash: computeVarArgsHash(result.execution.args),
      newNoteHashes: padArrayEnd(result.newNoteHashes, NoteHash.empty(), MAX_NEW_NOTE_HASHES_PER_CALL),
      newNullifiers: padArrayEnd(result.newNullifiers, Nullifier.empty(), MAX_NEW_NULLIFIERS_PER_CALL),
      newL2ToL1Msgs: padArrayEnd(result.newL2ToL1Messages, L2ToL1Message.empty(), MAX_NEW_L2_TO_L1_MSGS_PER_CALL),
      startSideEffectCounter: result.startSideEffectCounter,
      endSideEffectCounter: result.endSideEffectCounter,
      returnsHash: computeVarArgsHash(result.returnValues),
      nullifierReadRequests: padArrayEnd(
        result.nullifierReadRequests,
        ReadRequest.empty(),
        MAX_NULLIFIER_READ_REQUESTS_PER_CALL,
      ),
      nullifierNonExistentReadRequests: padArrayEnd(
        result.nullifierNonExistentReadRequests,
        ReadRequest.empty(),
        MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_CALL,
      ),
      contractStorageReads: padArrayEnd(
        result.contractStorageReads,
        ContractStorageRead.empty(),
        MAX_PUBLIC_DATA_READS_PER_CALL,
      ),
      contractStorageUpdateRequests: padArrayEnd(
        result.contractStorageUpdateRequests,
        ContractStorageUpdateRequest.empty(),
        MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL,
      ),
      publicCallStackHashes,
      unencryptedLogsHashes: padArrayEnd(result.unencryptedLogsHashes, LogHash.empty(), MAX_UNENCRYPTED_LOGS_PER_CALL),
      historicalHeader: this.historicalHeader,
      globalVariables: this.globalVariables,
      startGasLeft: Gas.from(result.startGasLeft),
      endGasLeft: Gas.from(result.endGasLeft),
      transactionFee: result.transactionFee,
      // TODO(@just-mitch): need better mapping from simulator to revert code.
      revertCode: result.reverted ? RevertCode.APP_LOGIC_REVERTED : RevertCode.OK,
    });

    return new PublicCallStackItem(
      result.execution.contractAddress,
      new FunctionData(result.execution.functionSelector, false),
      publicCircuitPublicInputs,
      isExecutionRequest,
    );
  }

  protected async getPublicCallStackPreimages(result: PublicExecutionResult): Promise<PublicCallStackItem[]> {
    const nested = result.nestedExecutions;
    if (nested.length > MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL) {
      throw new Error(
        `Public call stack size exceeded (max ${MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL}, got ${nested.length})`,
      );
    }

    return await Promise.all(nested.map(n => this.getPublicCallStackItem(n)));
  }

  protected getBytecodeHash(_result: PublicExecutionResult) {
    // TODO: Determine how to calculate bytecode hash. Circuits just check it isn't zero for now.
    // See https://github.com/AztecProtocol/aztec3-packages/issues/378
    const bytecodeHash = new Fr(1n);
    return Promise.resolve(bytecodeHash);
  }

  /**
   * Calculates the PublicCircuitOutput for this execution result along with its proof,
   * and assembles a PublicCallData object from it.
   * @param result - The execution result.
   * @param preimages - The preimages of the callstack items.
   * @param isExecutionRequest - Whether the current callstack item should be considered a public fn execution request.
   * @returns A corresponding PublicCallData object.
   */
  protected async getPublicCallData(result: PublicExecutionResult, isExecutionRequest = false) {
    const bytecodeHash = await this.getBytecodeHash(result);
    const callStackItem = await this.getPublicCallStackItem(result, isExecutionRequest);
    const publicCallRequests = (await this.getPublicCallStackPreimages(result)).map(c =>
      c.toCallRequest(callStackItem.publicInputs.callContext),
    );
    const publicCallStack = padArrayEnd(publicCallRequests, CallRequest.empty(), MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL);
    return new PublicCallData(callStackItem, publicCallStack, makeEmptyProof(), bytecodeHash);
  }

  // HACK(#1622): this is a hack to fix ordering of public state in the call stack. Since the private kernel
  // cannot keep track of side effects that happen after or before a nested call, we override the public
  // state actions it emits with whatever we got from the simulator. As a sanity check, we at least verify
  // that the elements are the same, so we are only tweaking their ordering.
  // See yarn-project/end-to-end/src/e2e_ordering.test.ts
  // See https://github.com/AztecProtocol/aztec-packages/issues/1616
  // TODO(#757): Enforce proper ordering of public state actions
  /**
   * Patch the ordering of storage actions output from the public kernel.
   * @param publicInputs - to be patched here: public inputs to the kernel iteration up to this point
   * @param execResult - result of the top/first execution for this enqueued public call
   */
  private patchPublicStorageActionOrdering(
    publicInputs: PublicKernelCircuitPublicInputs,
    execResult: PublicExecutionResult,
  ) {
    const { publicDataReads } = publicInputs.validationRequests;

    // Convert ContractStorage* objects to PublicData* objects and sort them in execution order.
    // Note, this only pulls simulated reads/writes from the current phase,
    // so the returned result will be a subset of the public kernel output.

    const simPublicDataReads = collectPublicDataReads(execResult);

    // We only want to reorder the items from the public inputs of the
    // most recently processed top/enqueued call.

    const numReadsInKernel = arrayNonEmptyLength(publicDataReads, f => f.isEmpty());
    const numReadsBeforeThisEnqueuedCall = numReadsInKernel - simPublicDataReads.length;
    publicInputs.validationRequests.publicDataReads = padArrayEnd(
      [
        // do not mess with items from previous top/enqueued calls in kernel output
        ...publicInputs.validationRequests.publicDataReads.slice(0, numReadsBeforeThisEnqueuedCall),
        ...simPublicDataReads,
      ],
      PublicDataRead.empty(),
      MAX_PUBLIC_DATA_READS_PER_TX,
    );
  }
}

export function removeRedundantPublicDataWrites(
  writes: Tuple<PublicDataUpdateRequest, typeof MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX>,
) {
  const lastWritesMap = new Map<string, boolean>();
  const patch = <N extends number>(requests: Tuple<PublicDataUpdateRequest, N>) =>
    requests.filter(write => {
      const leafSlot = write.leafSlot.toString();
      const exists = lastWritesMap.get(leafSlot);
      lastWritesMap.set(leafSlot, true);
      return !exists;
    });

  return padArrayEnd(
    patch(writes.reverse()).reverse(),
    PublicDataUpdateRequest.empty(),
    MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  );
}
