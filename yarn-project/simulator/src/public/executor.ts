import { ContractStorageRead, ContractStorageUpdateRequest, GlobalVariables, Header, PublicCircuitPublicInputs, SideEffect, SideEffectLinkedToNoteHash } from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';

import { Oracle, acvm, extractCallStack, extractReturnWitness } from '../acvm/index.js';
import { ExecutionError, createSimulationError } from '../common/errors.js';
import { SideEffectCounter } from '../common/index.js';
import { PackedArgsCache } from '../common/packed_args_cache.js';
import { AcirSimulator } from '../index.js';
import { CommitmentsDB, PublicContractsDB, PublicStateDB } from './db.js';
import { PublicExecution, PublicExecutionResult } from './execution.js';
import { PublicExecutionContext } from './public_execution_context.js';
import { temporaryMapToExecutionEnvironment } from '../avm/temporary_executor.js';
import { HostStorage } from '../avm/journal/host_storage.js';
import { AvmWorldStateJournal, JournalData } from '../avm/journal/index.js';
import { AvmMachineState } from '../avm/avm_machine_state.js';
import { AvmContext } from '../avm/avm_context.js';
import { AvmSimulator } from '../avm/avm_simulator.js';
import { Fr } from '@aztec/bb.js';
import { FunctionL2Logs } from '@aztec/circuit-types';
import { AvmContractCallResults } from '../avm/avm_message_call_result.js';

/**
 * Execute a public function and return the execution result.
 */
export async function executePublicFunction(
  context: PublicExecutionContext,
  acir: Buffer,
  log = createDebugLogger('aztec:simulator:public_execution'),
): Promise<PublicExecutionResult> {
  const execution = context.execution;
  const { contractAddress, functionData } = execution;
  const selector = functionData.selector;
  log(`Executing public external function ${contractAddress.toString()}:${selector}`);

  const initialWitness = context.getInitialWitness();
  const acvmCallback = new Oracle(context);
  const { partialWitness } = await acvm(await AcirSimulator.getSolver(), acir, initialWitness, acvmCallback).catch(
    (err: Error) => {
      throw new ExecutionError(
        err.message,
        {
          contractAddress,
          functionSelector: selector,
        },
        extractCallStack(err),
        { cause: err },
      );
    },
  );

  const returnWitness = extractReturnWitness(acir, partialWitness);
  const {
    returnValues,
    newL2ToL1Msgs,
    newCommitments: newCommitmentsPadded,
    newNullifiers: newNullifiersPadded,
  } = PublicCircuitPublicInputs.fromFields(returnWitness);

  const newL2ToL1Messages = newL2ToL1Msgs.filter(v => !v.isZero());
  const newCommitments = newCommitmentsPadded.filter(v => !v.isEmpty());
  const newNullifiers = newNullifiersPadded.filter(v => !v.isEmpty());

  const { contractStorageReads, contractStorageUpdateRequests } = context.getStorageActionData();
  log(
    `Contract storage reads: ${contractStorageReads
      .map(r => r.toFriendlyJSON() + ` - sec: ${r.sideEffectCounter}`)
      .join(', ')}`,
  );

  const nestedExecutions = context.getNestedExecutions();
  const unencryptedLogs = context.getUnencryptedLogs();

  return {
    execution,
    newCommitments,
    newL2ToL1Messages,
    newNullifiers,
    contractStorageReads,
    contractStorageUpdateRequests,
    returnValues,
    nestedExecutions,
    unencryptedLogs,
  };
}

/**
 * Handles execution of public functions.
 */
export class PublicExecutor {
  constructor(
    private readonly stateDb: PublicStateDB,
    private readonly contractsDb: PublicContractsDB,
    private readonly commitmentsDb: CommitmentsDB,
    private readonly header: Header,
  ) {}

  /**
   * Executes a public execution request.
   * @param execution - The execution to run.
   * @param globalVariables - The global variables to use.
   * @returns The result of the run plus all nested runs.
   */
  public async simulate(execution: PublicExecution, globalVariables: GlobalVariables): Promise<PublicExecutionResult> {
    const selector = execution.functionData.selector;
    const acir = await this.contractsDb.getBytecode(execution.contractAddress, selector);
    if (!acir) {
      throw new Error(`Bytecode not found for ${execution.contractAddress}:${selector}`);
    }

    // Functions can request to pack arguments before calling other functions.
    // We use this cache to hold the packed arguments.
    const packedArgs = PackedArgsCache.create([]);

    const sideEffectCounter = new SideEffectCounter();

    const context = new PublicExecutionContext(
      execution,
      this.header,
      globalVariables,
      packedArgs,
      sideEffectCounter,
      this.stateDb,
      this.contractsDb,
      this.commitmentsDb,
    );

    try {
      return await executePublicFunction(context, acir);
    } catch (err) {
      throw createSimulationError(err instanceof Error ? err : new Error('Unknown error during public execution'));
    }
  }

  /**
   * Executes a public execution request in the avm.
   * @param execution - The execution to run.
   * @param globalVariables - The global variables to use.
   * @returns The result of the run plus all nested runs.
   */
  public async simulateAvm(execution: PublicExecution, globalVariables: GlobalVariables): Promise<PublicExecutionResult> {
    const hostStorage = new HostStorage(this.stateDb, this.contractsDb, this.commitmentsDb);
    const worldStateJournal = new AvmWorldStateJournal(hostStorage);
    const executionEnv = temporaryMapToExecutionEnvironment(execution, globalVariables);
    const machineState = new AvmMachineState(0, 0, 0);

    const context = new AvmContext(worldStateJournal, executionEnv, machineState);
    const simulator = new AvmSimulator(context);


    // TODO: deal with the return result
    const result = await simulator.execute();
    console.log('result', result);

    const newWorldState = context.worldState.flush();

    return temporaryMapAvmReturnTypes(execution, newWorldState, result);
  }
}


function temporaryMapAvmReturnTypes(execution: PublicExecution, newWorldState: JournalData, result: AvmContractCallResults): PublicExecutionResult{
    const newCommitments = newWorldState.newNoteHashes.map(noteHash => new SideEffect(noteHash, Fr.zero()));
    
    // TODO: do the hashing to compress the new messages correctly
    const newL2ToL1Messages = newWorldState.newL1Messages.map(() => Fr.zero());
    
    // TODO: HAHAHAHAHAHAHAHAHAHAHAHAHAHA - THEY ARE SORTED HAHAH
    const contractStorageReads: ContractStorageRead[] = [];
    const reduceStorageReadRequests = (contractAddress: bigint, storageReads: Map<bigint, Fr[]>) => {
      return storageReads.forEach((innerArray, key) => {
        innerArray.forEach(value => {
          contractStorageReads.push(new ContractStorageRead(new Fr(key), new Fr(value), 0));
        })
      })
    };
    newWorldState.storageReads.forEach((storageMap: Map<bigint, Fr[]>, address: bigint) => reduceStorageReadRequests(address, storageMap));

    const contractStorageUpdateRequests: ContractStorageUpdateRequest[] = [];
    const reduceStorageUpdateRequests = (contractAddress: bigint, storageUpdateRequests: Map<bigint, Fr[]>) => {
      return storageUpdateRequests.forEach((innerArray, key) => {
        innerArray.forEach(value => {
          contractStorageUpdateRequests.push(new ContractStorageUpdateRequest(new Fr(key),/*TODO: old value not supported */ Fr.zero(), new Fr(value), 0));
        })
      })
    }
    newWorldState.storageWrites.forEach((storageMap: Map<bigint, Fr[]>, address: bigint) => reduceStorageUpdateRequests(address, storageMap));

    const returnValues = result.output;

    // TODO: NOT SUPPORTED YET
    // Disabled.
    const nestedExecutions: PublicExecutionResult[] = [];
    const newNullifiers: SideEffectLinkedToNoteHash[] = [];
    const unencryptedLogs = FunctionL2Logs.empty();

  return {
    execution,
    newCommitments,
    newL2ToL1Messages,
    newNullifiers,
    contractStorageReads,
    contractStorageUpdateRequests,
    returnValues,
    nestedExecutions,
    unencryptedLogs,
  };
}