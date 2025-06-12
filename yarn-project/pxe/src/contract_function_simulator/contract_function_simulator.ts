import {
  MAX_CONTRACT_CLASS_LOGS_PER_TX,
  MAX_ENQUEUED_CALLS_PER_TX,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PRIVATE_LOGS_PER_TX,
} from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
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
import { Gas, GasFees } from '@aztec/stdlib/gas';
import { computeNoteHashNonce, computeUniqueNoteHash, siloNoteHash } from '@aztec/stdlib/hash';
import {
  PartialPrivateTailPublicInputsForPublic,
  PartialPrivateTailPublicInputsForRollup,
  type PrivateExecutionStep,
  type PrivateKernelExecutionProofOutput,
  PrivateKernelTailCircuitPublicInputs,
  PrivateToPublicAccumulatedData,
  PrivateToRollupAccumulatedData,
  PublicCallRequest,
  RollupValidationRequests,
  ScopedLogHash,
} from '@aztec/stdlib/kernel';
import { PrivateLog } from '@aztec/stdlib/logs';
import { ScopedL2ToL1Message } from '@aztec/stdlib/messaging';
import { ClientIvcProof } from '@aztec/stdlib/proofs';
import {
  CallContext,
  GlobalVariables,
  HashedValues,
  PrivateExecutionResult,
  TxConstantData,
  TxExecutionRequest,
  collectNested,
} from '@aztec/stdlib/tx';

import type { ContractDataProvider, SyncDataProvider } from '../storage/index.js';
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
   * @param msgSender - The address calling the function. This can be replaced to simulate a call from another contract or a specific account.
   * @param scopes - The accounts whose notes we can access in this call. Currently optional and will default to all.
   * @returns The result of the execution.
   */
  public async run(
    request: TxExecutionRequest,
    contractAddress: AztecAddress,
    selector: FunctionSelector,
    msgSender = AztecAddress.fromField(Fr.MAX_FIELD_VALUE),
    skipClassVerification = false,
    scopes?: AztecAddress[],
  ): Promise<PrivateExecutionResult> {
    const simulatorSetupTimer = new Timer();
    const header = await this.executionDataProvider.getBlockHeader();

    if (!skipClassVerification) {
      await verifyCurrentClassId(contractAddress, this.executionDataProvider);
    }
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
      header,
      request.authWitnesses,
      request.capsules,
      HashedValuesCache.create(request.argsOfCalls),
      noteCache,
      this.executionDataProvider,
      this.simulator,
      /*totalPublicArgsCount=*/ 0,
      startSideEffectCounter,
      undefined,
      scopes,
    );

    const setupTime = simulatorSetupTimer.ms();

    try {
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

      const publicCallRequests = collectNested([executionResult], r => [
        ...r.publicInputs.publicCallRequests.map(r => r.inner),
        r.publicInputs.publicTeardownCallRequest,
      ]).filter(r => !r.isEmpty());
      const publicFunctionsCalldata = await Promise.all(
        publicCallRequests.map(async r => {
          const calldata = await privateExecutionOracle.loadFromExecutionCache(r.calldataHash);
          return new HashedValues(calldata, r.calldataHash);
        }),
      );

      const teardownTime = simulatorTeardownTimer.ms();

      // Add simulator overhead to topmost call in the stack
      if (executionResult.profileResult) {
        executionResult.profileResult.timings.witgen += setupTime + teardownTime;
      }

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
  public async runUtility(
    call: FunctionCall,
    authwits: AuthWitness[],
    scopes?: AztecAddress[],
    skipClassVerification = false,
  ): Promise<AbiDecoded> {
    if (!skipClassVerification) {
      await verifyCurrentClassId(call.to, this.executionDataProvider);
    }
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

export async function generateSimulatedProvingResult(
  privateExecutionResult: PrivateExecutionResult,
  contractDataProvider: ContractDataProvider,
  syncDataProvider: SyncDataProvider,
): Promise<PrivateKernelExecutionProofOutput<PrivateKernelTailCircuitPublicInputs>> {
  const uniqueNoteHashes: Fr[] = [];
  const nullifiers: Fr[] = [];
  const taggedPrivateLogs: PrivateLog[] = [];
  const l2ToL1Messages: ScopedL2ToL1Message[] = [];
  const contractClassLogsHashes: ScopedLogHash[] = [];
  const publicCallRequests: PublicCallRequest[] = [];
  const executionSteps: PrivateExecutionStep[] = [];

  let publicTeardownCallRequest;

  let noteHashIndexInTx = 0;
  const executions = [privateExecutionResult.entrypoint];

  while (executions.length !== 0) {
    const execution = executions.shift()!;
    executions.unshift(...execution!.nestedExecutions);

    const { contractAddress } = execution.publicInputs.callContext;

    const noteHashesFromExecution = await Promise.all(
      execution.publicInputs.noteHashes
        .filter(noteHash => !noteHash.isEmpty())
        .map(async noteHash => {
          const nonce = await computeNoteHashNonce(privateExecutionResult.firstNullifier, noteHashIndexInTx++);
          const siloedNoteHash = await siloNoteHash(contractAddress, noteHash.value);

          // We could defer this to the public processor, and pass this in as non-revertible.
          return computeUniqueNoteHash(nonce, siloedNoteHash);
        }),
    );

    const privateLogsFromExecution = await Promise.all(
      execution.publicInputs.privateLogs
        .filter(privateLog => !privateLog.isEmpty())
        .map(async metadata => {
          metadata.log.fields[0] = await poseidon2Hash([contractAddress, metadata.log.fields[0]]);

          return metadata.log;
        }),
    );

    uniqueNoteHashes.push(...noteHashesFromExecution);
    taggedPrivateLogs.push(...privateLogsFromExecution);
    nullifiers.push(
      ...execution.publicInputs.nullifiers.filter(nullifier => !nullifier.isEmpty()).map(nullifier => nullifier.value),
    );
    l2ToL1Messages.push(
      ...execution.publicInputs.l2ToL1Msgs
        .filter(l2ToL1Message => !l2ToL1Message.isEmpty())
        .map(message => message.message.scope(contractAddress)),
    );
    contractClassLogsHashes.push(
      ...execution.publicInputs.contractClassLogsHashes
        .filter(contractClassLogsHash => !contractClassLogsHash.isEmpty())
        .map(message => message.logHash.scope(contractAddress)),
    );
    publicCallRequests.push(
      ...execution.publicInputs.publicCallRequests
        .filter(publicCallRequest => !publicCallRequest.isEmpty())
        .map(callRequest => callRequest.inner),
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

  const blockHeader = await syncDataProvider.getBlockHeader();

  const constantData = new TxConstantData(
    blockHeader,
    privateExecutionResult.entrypoint.publicInputs.txContext,
    Fr.zero(),
    Fr.zero(),
  );

  const hasPublicCalls = privateExecutionResult.publicFunctionCalldata.length !== 0;
  let inputsForRollup;
  let inputsForPublic;

  // Private only
  if (privateExecutionResult.publicFunctionCalldata.length === 0) {
    const accumulatedDataForRollup = new PrivateToRollupAccumulatedData(
      padArrayEnd(uniqueNoteHashes, Fr.ZERO, MAX_NOTE_HASHES_PER_TX),
      padArrayEnd(nullifiers, Fr.ZERO, MAX_NULLIFIERS_PER_TX),
      padArrayEnd(l2ToL1Messages, ScopedL2ToL1Message.empty(), MAX_L2_TO_L1_MSGS_PER_TX),
      padArrayEnd(taggedPrivateLogs, PrivateLog.empty(), MAX_PRIVATE_LOGS_PER_TX),
      padArrayEnd(contractClassLogsHashes, ScopedLogHash.empty(), MAX_CONTRACT_CLASS_LOGS_PER_TX),
    );

    inputsForRollup = new PartialPrivateTailPublicInputsForRollup(accumulatedDataForRollup);
  } else {
    const accumulatedDataForPublic = new PrivateToPublicAccumulatedData(
      padArrayEnd(uniqueNoteHashes, Fr.ZERO, MAX_NOTE_HASHES_PER_TX),
      padArrayEnd(nullifiers, Fr.ZERO, MAX_NULLIFIERS_PER_TX),
      padArrayEnd(l2ToL1Messages, ScopedL2ToL1Message.empty(), MAX_L2_TO_L1_MSGS_PER_TX),
      padArrayEnd(taggedPrivateLogs, PrivateLog.empty(), MAX_PRIVATE_LOGS_PER_TX),
      padArrayEnd(contractClassLogsHashes, ScopedLogHash.empty(), MAX_CONTRACT_CLASS_LOGS_PER_TX),
      padArrayEnd(publicCallRequests, PublicCallRequest.empty(), MAX_ENQUEUED_CALLS_PER_TX),
    );

    inputsForPublic = new PartialPrivateTailPublicInputsForPublic(
      // We are using non-revertible because we set the first nullifier to be used as a nonce generator, otherwise the tx hash is manually calculated.
      // nonrevertible
      accumulatedDataForPublic,
      // revertible
      PrivateToPublicAccumulatedData.empty(),
      publicTeardownCallRequest ?? PublicCallRequest.empty(),
    );
  }

  const publicInputs = new PrivateKernelTailCircuitPublicInputs(
    constantData,
    RollupValidationRequests.empty(),
    /*gasUsed=*/ new Gas(0, 0),
    /*feePayer=*/ AztecAddress.zero(),
    hasPublicCalls ? inputsForPublic : undefined,
    !hasPublicCalls ? inputsForRollup : undefined,
  );

  return {
    publicInputs,
    clientIvcProof: ClientIvcProof.empty(),
    vk: privateExecutionResult.entrypoint.vk,
    executionSteps: executionSteps,
  };
}
