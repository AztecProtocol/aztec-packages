import {
  AVM_EMITNOTEHASH_BASE_L2_GAS,
  AVM_EMITNULLIFIER_BASE_L2_GAS,
  AVM_SENDL2TOL1MSG_BASE_L2_GAS,
  DA_BYTES_PER_FIELD,
  DA_GAS_PER_BYTE,
  FIXED_AVM_STARTUP_L2_GAS,
  FIXED_DA_GAS,
  FIXED_L2_GAS,
  L2_GAS_PER_CONTRACT_CLASS_LOG,
  L2_GAS_PER_PRIVATE_LOG,
  MAX_CONTRACT_CLASS_LOGS_PER_TX,
  MAX_ENQUEUED_CALLS_PER_TX,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PRIVATE_LOGS_PER_TX,
} from '@aztec/constants';
import { arrayNonEmptyLength, padArrayEnd } from '@aztec/foundation/collection';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractsHash } from '@aztec/protocol-contracts';
import {
  type CircuitSimulator,
  ExecutionError,
  createSimulationError,
  extractCallStack,
  resolveAssertionMessageFromError,
  toACVMWitness,
  witnessMapToFields,
} from '@aztec/simulator/client';
import type { AbiDecoded, FunctionCall } from '@aztec/stdlib/abi';
import { FunctionSelector, FunctionType, decodeFromAbi } from '@aztec/stdlib/abi';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { Gas } from '@aztec/stdlib/gas';
import { computeNoteHashNonce, computeUniqueNoteHash, siloNoteHash, siloNullifier } from '@aztec/stdlib/hash';
import {
  PartialPrivateTailPublicInputsForPublic,
  PartialPrivateTailPublicInputsForRollup,
  type PrivateExecutionStep,
  type PrivateKernelExecutionProofOutput,
  PrivateKernelTailCircuitPublicInputs,
  PrivateToPublicAccumulatedData,
  PrivateToRollupAccumulatedData,
  PublicCallRequest,
  ScopedLogHash,
} from '@aztec/stdlib/kernel';
import { PrivateLog } from '@aztec/stdlib/logs';
import { ScopedL2ToL1Message } from '@aztec/stdlib/messaging';
import { ClientIvcProof } from '@aztec/stdlib/proofs';
import {
  CallContext,
  HashedValues,
  PrivateExecutionResult,
  TxConstantData,
  TxExecutionRequest,
  collectNested,
  getFinalMinRevertibleSideEffectCounter,
} from '@aztec/stdlib/tx';

import type { ContractDataProvider } from '../storage/index.js';
import type { ExecutionDataProvider } from './execution_data_provider.js';
import { ExecutionNoteCache } from './execution_note_cache.js';
import { HashedValuesCache } from './hashed_values_cache.js';
import { Oracle } from './oracle/oracle.js';
import { executePrivateFunction, verifyCurrentClassId } from './oracle/private_execution.js';
import { PrivateExecutionOracle } from './oracle/private_execution_oracle.js';
import { UtilityExecutionOracle } from './oracle/utility_execution_oracle.js';

/**
 * The contract function simulator.
 */
export class ContractFunctionSimulator {
  private log: Logger;

  constructor(
    private executionDataProvider: ExecutionDataProvider,
    private simulator: CircuitSimulator,
  ) {
    this.log = createLogger('simulator');
  }

  /**
   * Runs a private function.
   * @param request - The transaction request.
   * @param entryPointArtifact - The artifact of the entry point function.
   * @param contractAddress - The address of the contract (should match request.origin)
   * @param msgSender - The address calling the function. This can be replaced to simulate a call from another contract
   * or a specific account.
   * @param senderForTags - The address that is used as a tagging sender when emitting private logs. Returned from
   * the `privateGetSenderForTags` oracle.
   * @param scopes - The accounts whose notes we can access in this call. Currently optional and will default to all.
   * @returns The result of the execution.
   */
  public async run(
    request: TxExecutionRequest,
    contractAddress: AztecAddress,
    selector: FunctionSelector,
    msgSender = AztecAddress.fromField(Fr.MAX_FIELD_VALUE),
    senderForTags?: AztecAddress,
    scopes?: AztecAddress[],
  ): Promise<PrivateExecutionResult> {
    const simulatorSetupTimer = new Timer();
    const anchorBlockHeader = await this.executionDataProvider.getAnchorBlockHeader();

    await verifyCurrentClassId(contractAddress, this.executionDataProvider);

    const entryPointArtifact = await this.executionDataProvider.getFunctionArtifact(contractAddress, selector);

    if (entryPointArtifact.functionType !== FunctionType.PRIVATE) {
      throw new Error(`Cannot run ${entryPointArtifact.functionType} function as private`);
    }

    if (request.origin !== contractAddress) {
      this.log.warn(
        `Request origin does not match contract address in simulation. Request origin: ${request.origin}, contract address: ${contractAddress}`,
      );
    }

    // reserve the first side effect for the tx hash (inserted by the private kernel)
    const startSideEffectCounter = 1;

    const callContext = new CallContext(
      msgSender,
      contractAddress,
      await FunctionSelector.fromNameAndParameters(entryPointArtifact.name, entryPointArtifact.parameters),
      entryPointArtifact.isStatic,
    );

    const txRequestHash = await request.toTxRequest().hash();
    const noteCache = new ExecutionNoteCache(txRequestHash);

    const privateExecutionOracle = new PrivateExecutionOracle(
      request.firstCallArgsHash,
      request.txContext,
      callContext,
      anchorBlockHeader,
      request.authWitnesses,
      request.capsules,
      HashedValuesCache.create(request.argsOfCalls),
      noteCache,
      this.executionDataProvider,
      0, // totalPublicArgsCount
      startSideEffectCounter,
      undefined, // log
      scopes,
      senderForTags,
      this.simulator,
    );

    const setupTime = simulatorSetupTimer.ms();

    try {
      // Note: any nested private function calls are made recursively within this
      // function call. So this execution result is the result of executing _all_
      // private functions of this tx (the results of those executions are contained
      // within executionResult.nestedExecutionResults).
      const executionResult = await executePrivateFunction(
        this.simulator,
        privateExecutionOracle,
        entryPointArtifact,
        contractAddress,
        request.functionSelector,
      );
      const simulatorTeardownTimer = new Timer();
      const { usedTxRequestHashForNonces } = noteCache.finish();
      const firstNullifierHint = usedTxRequestHashForNonces ? Fr.ZERO : noteCache.getAllNullifiers()[0];

      const publicCallRequests = collectNested([executionResult], r =>
        r.publicInputs.publicCallRequests
          .getActiveItems()
          .map(r => r.inner)
          .concat(r.publicInputs.publicTeardownCallRequest.isEmpty() ? [] : [r.publicInputs.publicTeardownCallRequest]),
      );
      const publicFunctionsCalldata = await Promise.all(
        publicCallRequests.map(async r => {
          const calldata = await privateExecutionOracle.privateLoadFromExecutionCache(r.calldataHash);
          return new HashedValues(calldata, r.calldataHash);
        }),
      );

      const teardownTime = simulatorTeardownTimer.ms();

      // Add simulator overhead to topmost call in the stack
      if (executionResult.profileResult) {
        executionResult.profileResult.timings.witgen += setupTime + teardownTime;
      }

      // Not to be confused with a PrivateCallExecutionResult. This is a superset
      // of the PrivateCallExecutionResult, containing also firstNullifierHint
      // and publicFunctionsCalldata.
      return new PrivateExecutionResult(executionResult, firstNullifierHint, publicFunctionsCalldata);
    } catch (err) {
      throw createSimulationError(err instanceof Error ? err : new Error('Unknown error during private execution'));
    }
  }

  // docs:start:execute_utility_function
  /**
   * Runs a utility function.
   * @param call - The function call to execute.
   * @param authwits - Authentication witnesses required for the function call.
   * @param scopes - Optional array of account addresses whose notes can be accessed in this call. Defaults to all
   * accounts if not specified.
   * @returns A decoded ABI value containing the function's return data.
   */
  public async runUtility(call: FunctionCall, authwits: AuthWitness[], scopes?: AztecAddress[]): Promise<AbiDecoded> {
    await verifyCurrentClassId(call.to, this.executionDataProvider);

    const entryPointArtifact = await this.executionDataProvider.getFunctionArtifact(call.to, call.selector);

    if (entryPointArtifact.functionType !== FunctionType.UTILITY) {
      throw new Error(`Cannot run ${entryPointArtifact.functionType} function as utility`);
    }

    const oracle = new UtilityExecutionOracle(call.to, authwits, [], this.executionDataProvider, undefined, scopes);

    try {
      this.log.verbose(`Executing utility function ${entryPointArtifact.name}`, {
        contract: call.to,
        selector: call.selector,
      });

      const initialWitness = toACVMWitness(0, call.args);
      const acirExecutionResult = await this.simulator
        .executeUserCircuit(initialWitness, entryPointArtifact, new Oracle(oracle).toACIRCallback())
        .catch((err: Error) => {
          err.message = resolveAssertionMessageFromError(err, entryPointArtifact);
          throw new ExecutionError(
            err.message,
            {
              contractAddress: call.to,
              functionSelector: call.selector,
            },
            extractCallStack(err, entryPointArtifact.debug),
            { cause: err },
          );
        });

      const returnWitness = witnessMapToFields(acirExecutionResult.returnWitness);
      this.log.verbose(`Utility simulation for ${call.to}.${call.selector} completed`);
      return decodeFromAbi(entryPointArtifact.returnTypes, returnWitness);
    } catch (err) {
      throw createSimulationError(err instanceof Error ? err : new Error('Unknown error during private execution'));
    }
  }
  // docs:end:execute_utility_function

  getStats() {
    return this.executionDataProvider.getStats();
  }
}

class OrderedSideEffect<T> {
  sideEffect: T;
  counter: number;

  constructor(sideEffect: T, counter: number) {
    this.sideEffect = sideEffect;
    this.counter = counter;
  }
}

/**
 * Generates the final public inputs of the tail kernel circuit, an empty ClientIVC proof
 * and the execution steps for a `PrivateExecutionResult` as if it had been
 * processed by the private kernel prover. This skips many of the checks performed by the kernels
 * (allowing state overrides) and is much faster, while still generating a valid
 * output that can be sent to the node for public simulation
 * @param privateExecutionResult - The result of the private execution.
 * @param nonceGenerator - A nonce generator for note hashes. According to the protocol rules,
 * it can either be the first nullifier in the tx or the hash of the initial tx request if there are none.
 * @param contractDataProvider - A provider for contract data in order to get function names and debug info.
 * @returns The simulated proving result.
 */
export async function generateSimulatedProvingResult(
  privateExecutionResult: PrivateExecutionResult,
  nonceGenerator: Fr,
  contractDataProvider: ContractDataProvider,
): Promise<PrivateKernelExecutionProofOutput<PrivateKernelTailCircuitPublicInputs>> {
  const siloedNoteHashes: OrderedSideEffect<Fr>[] = [];
  const nullifiers: OrderedSideEffect<Fr>[] = [];
  const taggedPrivateLogs: OrderedSideEffect<PrivateLog>[] = [];
  const l2ToL1Messages: OrderedSideEffect<ScopedL2ToL1Message>[] = [];
  const contractClassLogsHashes: OrderedSideEffect<ScopedLogHash>[] = [];
  const publicCallRequests: OrderedSideEffect<PublicCallRequest>[] = [];
  const executionSteps: PrivateExecutionStep[] = [];

  let publicTeardownCallRequest;

  const executions = [privateExecutionResult.entrypoint];

  while (executions.length !== 0) {
    const execution = executions.shift()!;
    executions.unshift(...execution!.nestedExecutionResults);

    const { contractAddress } = execution.publicInputs.callContext;

    const noteHashesFromExecution = await Promise.all(
      execution.publicInputs.noteHashes
        .getActiveItems()
        .filter(noteHash => !noteHash.isEmpty())
        .map(
          async noteHash =>
            new OrderedSideEffect(await siloNoteHash(contractAddress, noteHash.value), noteHash.counter),
        ),
    );

    const nullifiersFromExecution = await Promise.all(
      execution.publicInputs.nullifiers
        .getActiveItems()
        .map(
          async nullifier =>
            new OrderedSideEffect(await siloNullifier(contractAddress, nullifier.value), nullifier.counter),
        ),
    );

    const privateLogsFromExecution = await Promise.all(
      execution.publicInputs.privateLogs.getActiveItems().map(async metadata => {
        metadata.log.fields[0] = await poseidon2Hash([contractAddress, metadata.log.fields[0]]);
        return new OrderedSideEffect(metadata.log, metadata.counter);
      }),
    );

    siloedNoteHashes.push(...noteHashesFromExecution);
    taggedPrivateLogs.push(...privateLogsFromExecution);
    nullifiers.push(...nullifiersFromExecution);
    l2ToL1Messages.push(
      ...execution.publicInputs.l2ToL1Msgs
        .getActiveItems()
        .map(message => new OrderedSideEffect(message.message.scope(contractAddress), message.counter)),
    );
    contractClassLogsHashes.push(
      ...execution.publicInputs.contractClassLogsHashes
        .getActiveItems()
        .map(
          contractClassLogHash =>
            new OrderedSideEffect(contractClassLogHash.logHash.scope(contractAddress), contractClassLogHash.counter),
        ),
    );
    publicCallRequests.push(
      ...execution.publicInputs.publicCallRequests
        .getActiveItems()
        .map(callRequest => new OrderedSideEffect(callRequest.inner, callRequest.counter)),
    );

    if (publicTeardownCallRequest !== undefined && !execution.publicInputs.publicTeardownCallRequest.isEmpty()) {
      throw new Error('Trying to set multiple teardown requests');
    }

    publicTeardownCallRequest = execution.publicInputs.publicTeardownCallRequest.isEmpty()
      ? publicTeardownCallRequest
      : execution.publicInputs.publicTeardownCallRequest;

    executionSteps.push({
      functionName: await contractDataProvider.getDebugFunctionName(
        execution.publicInputs.callContext.contractAddress,
        execution.publicInputs.callContext.functionSelector,
      ),
      timings: execution.profileResult?.timings ?? { witgen: 0, oracles: {} },
      bytecode: execution.acir,
      vk: execution.vk,
      witness: execution.partialWitness,
    });
  }

  const constantData = new TxConstantData(
    privateExecutionResult.entrypoint.publicInputs.anchorBlockHeader,
    privateExecutionResult.entrypoint.publicInputs.txContext,
    getVKTreeRoot(),
    protocolContractsHash,
  );

  const hasPublicCalls = privateExecutionResult.publicFunctionCalldata.length !== 0;
  let inputsForRollup;
  let inputsForPublic;
  let gasUsed;

  const sortByCounter = <T>(a: OrderedSideEffect<T>, b: OrderedSideEffect<T>) => a.counter - b.counter;
  const getEffect = <T>(orderedSideEffect: OrderedSideEffect<T>) => orderedSideEffect.sideEffect;

  const isPrivateOnlyTx = privateExecutionResult.publicFunctionCalldata.length === 0;
  const minRevertibleSideEffectCounter = getFinalMinRevertibleSideEffectCounter(privateExecutionResult);

  const [nonRevertibleNullifiers, revertibleNullifiers] = splitOrderedSideEffects(
    nullifiers.sort(sortByCounter),
    minRevertibleSideEffectCounter,
  );
  if (nonRevertibleNullifiers.length > 0 && !nonRevertibleNullifiers[0].equals(nonceGenerator)) {
    throw new Error('The first non revertible nullifier should be equal to the nonce generator. This is a bug!');
  } else {
    nonRevertibleNullifiers.unshift(nonceGenerator);
  }

  if (isPrivateOnlyTx) {
    // We must make the note hashes unique by using the
    // nonce generator and their index in the tx.
    const uniqueNoteHashes = await Promise.all(
      siloedNoteHashes.sort(sortByCounter).map(async (orderedSideEffect, i) => {
        const siloedNoteHash = orderedSideEffect.sideEffect;
        const nonce = await computeNoteHashNonce(nonceGenerator, i);
        const uniqueNoteHash = await computeUniqueNoteHash(nonce, siloedNoteHash);
        return uniqueNoteHash;
      }),
    );
    const accumulatedDataForRollup = new PrivateToRollupAccumulatedData(
      padArrayEnd(uniqueNoteHashes, Fr.ZERO, MAX_NOTE_HASHES_PER_TX),
      padArrayEnd(nonRevertibleNullifiers.concat(revertibleNullifiers), Fr.ZERO, MAX_NULLIFIERS_PER_TX),
      padArrayEnd(
        l2ToL1Messages.sort(sortByCounter).map(getEffect),
        ScopedL2ToL1Message.empty(),
        MAX_L2_TO_L1_MSGS_PER_TX,
      ),
      padArrayEnd(taggedPrivateLogs.sort(sortByCounter).map(getEffect), PrivateLog.empty(), MAX_PRIVATE_LOGS_PER_TX),
      padArrayEnd(
        contractClassLogsHashes.sort(sortByCounter).map(getEffect),
        ScopedLogHash.empty(),
        MAX_CONTRACT_CLASS_LOGS_PER_TX,
      ),
    );
    gasUsed = meterGasUsed(accumulatedDataForRollup);
    inputsForRollup = new PartialPrivateTailPublicInputsForRollup(accumulatedDataForRollup);
  } else {
    const [nonRevertibleNoteHashes, revertibleNoteHashes] = splitOrderedSideEffects(
      siloedNoteHashes.sort(sortByCounter),
      minRevertibleSideEffectCounter,
    );
    const [nonRevertibleL2ToL1Messages, revertibleL2ToL1Messages] = splitOrderedSideEffects(
      l2ToL1Messages.sort(sortByCounter),
      minRevertibleSideEffectCounter,
    );
    const [nonRevertibleTaggedPrivateLogs, revertibleTaggedPrivateLogs] = splitOrderedSideEffects(
      taggedPrivateLogs,
      minRevertibleSideEffectCounter,
    );
    const [nonRevertibleContractClassLogHashes, revertibleContractClassLogHashes] = splitOrderedSideEffects(
      contractClassLogsHashes.sort(sortByCounter),
      minRevertibleSideEffectCounter,
    );
    const [nonRevertiblePublicCallRequests, revertiblePublicCallRequests] = splitOrderedSideEffects(
      publicCallRequests.sort(sortByCounter),
      minRevertibleSideEffectCounter,
    );

    const nonRevertibleData = new PrivateToPublicAccumulatedData(
      padArrayEnd(nonRevertibleNoteHashes, Fr.ZERO, MAX_NOTE_HASHES_PER_TX),
      padArrayEnd(nonRevertibleNullifiers, Fr.ZERO, MAX_NULLIFIERS_PER_TX),
      padArrayEnd(nonRevertibleL2ToL1Messages, ScopedL2ToL1Message.empty(), MAX_L2_TO_L1_MSGS_PER_TX),
      padArrayEnd(nonRevertibleTaggedPrivateLogs, PrivateLog.empty(), MAX_PRIVATE_LOGS_PER_TX),
      padArrayEnd(nonRevertibleContractClassLogHashes, ScopedLogHash.empty(), MAX_CONTRACT_CLASS_LOGS_PER_TX),
      padArrayEnd(nonRevertiblePublicCallRequests, PublicCallRequest.empty(), MAX_ENQUEUED_CALLS_PER_TX),
    );

    const revertibleData = new PrivateToPublicAccumulatedData(
      padArrayEnd(revertibleNoteHashes, Fr.ZERO, MAX_NOTE_HASHES_PER_TX),
      padArrayEnd(revertibleNullifiers, Fr.ZERO, MAX_NULLIFIERS_PER_TX),
      padArrayEnd(revertibleL2ToL1Messages, ScopedL2ToL1Message.empty(), MAX_L2_TO_L1_MSGS_PER_TX),
      padArrayEnd(revertibleTaggedPrivateLogs, PrivateLog.empty(), MAX_PRIVATE_LOGS_PER_TX),
      padArrayEnd(revertibleContractClassLogHashes, ScopedLogHash.empty(), MAX_CONTRACT_CLASS_LOGS_PER_TX),
      padArrayEnd(revertiblePublicCallRequests, PublicCallRequest.empty(), MAX_ENQUEUED_CALLS_PER_TX),
    );
    gasUsed = meterGasUsed(revertibleData).add(meterGasUsed(nonRevertibleData));
    if (publicTeardownCallRequest) {
      gasUsed.add(privateExecutionResult.entrypoint.publicInputs.txContext.gasSettings.teardownGasLimits);
    }

    inputsForPublic = new PartialPrivateTailPublicInputsForPublic(
      nonRevertibleData,
      revertibleData,
      publicTeardownCallRequest ?? PublicCallRequest.empty(),
    );
  }

  const publicInputs = new PrivateKernelTailCircuitPublicInputs(
    constantData,
    /*gasUsed=*/ gasUsed.add(Gas.from({ l2Gas: FIXED_L2_GAS, daGas: FIXED_DA_GAS })),
    /*feePayer=*/ AztecAddress.zero(),
    /*includeByTimestamp=*/ 0n,
    hasPublicCalls ? inputsForPublic : undefined,
    !hasPublicCalls ? inputsForRollup : undefined,
  );

  return {
    publicInputs,
    clientIvcProof: ClientIvcProof.empty(),
    executionSteps: executionSteps,
  };
}

function splitOrderedSideEffects<T>(effects: OrderedSideEffect<T>[], minRevertibleSideEffectCounter: number) {
  const revertibleSideEffects: T[] = [];
  const nonRevertibleSideEffects: T[] = [];
  effects.forEach(effect => {
    if (effect.counter < minRevertibleSideEffectCounter) {
      nonRevertibleSideEffects.push(effect.sideEffect);
    } else {
      revertibleSideEffects.push(effect.sideEffect);
    }
  });
  return [nonRevertibleSideEffects, revertibleSideEffects];
}

function meterGasUsed(data: PrivateToRollupAccumulatedData | PrivateToPublicAccumulatedData) {
  let meteredDAFields = 0;
  let meteredL2Gas = 0;

  const numNoteHashes = arrayNonEmptyLength(data.noteHashes, hash => hash.isEmpty());
  meteredDAFields += numNoteHashes;
  meteredL2Gas += numNoteHashes * AVM_EMITNOTEHASH_BASE_L2_GAS;

  const numNullifiers = arrayNonEmptyLength(data.nullifiers, nullifier => nullifier.isEmpty());
  meteredDAFields += numNullifiers;
  meteredL2Gas += numNullifiers * AVM_EMITNULLIFIER_BASE_L2_GAS;

  const numL2toL1Messages = arrayNonEmptyLength(data.l2ToL1Msgs, msg => msg.isEmpty());
  meteredDAFields += numL2toL1Messages;
  meteredL2Gas += numL2toL1Messages * AVM_SENDL2TOL1MSG_BASE_L2_GAS;

  const numPrivatelogs = arrayNonEmptyLength(data.privateLogs, log => log.isEmpty());
  // Every private log emits its length as an additional field
  meteredDAFields += data.privateLogs.reduce((acc, log) => (!log.isEmpty() ? acc + log.emittedLength + 1 : acc), 0);
  meteredL2Gas += numPrivatelogs * L2_GAS_PER_PRIVATE_LOG;

  const numContractClassLogs = arrayNonEmptyLength(data.contractClassLogsHashes, log => log.isEmpty());
  // Every contract class log emits its length and contract address as additional fields
  meteredDAFields += data.contractClassLogsHashes.reduce(
    (acc, log) => (!log.isEmpty() ? acc + log.logHash.length + 2 : acc),
    0,
  );
  meteredL2Gas += numContractClassLogs * L2_GAS_PER_CONTRACT_CLASS_LOG;

  const meteredDAGas = meteredDAFields * DA_BYTES_PER_FIELD * DA_GAS_PER_BYTE;

  if ((data as PrivateToPublicAccumulatedData).publicCallRequests) {
    const dataForPublic = data as PrivateToPublicAccumulatedData;

    const numPublicCallRequests = arrayNonEmptyLength(dataForPublic.publicCallRequests, req => req.isEmpty());
    meteredL2Gas += numPublicCallRequests * FIXED_AVM_STARTUP_L2_GAS;
  }
  return Gas.from({ l2Gas: meteredL2Gas, daGas: meteredDAGas });
}
