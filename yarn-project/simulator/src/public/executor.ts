import { UnencryptedFunctionL2Logs } from '@aztec/circuit-types';
import {
  Fr,
  Gas,
  type GlobalVariables,
  type Header,
  type Nullifier,
  PublicCircuitPublicInputs,
  type TxContext,
} from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';

import { spawn } from 'child_process';
import { assert } from 'console';
import fs from 'fs/promises';
import path from 'path';

import { Oracle, acvm, extractCallStack, witnessMapToFields } from '../acvm/index.js';
import { AvmContext } from '../avm/avm_context.js';
import { AvmMachineState } from '../avm/avm_machine_state.js';
import { AvmSimulator } from '../avm/avm_simulator.js';
import { HostStorage } from '../avm/journal/host_storage.js';
import { AvmPersistableStateManager } from '../avm/journal/index.js';
import { ExecutionError, createSimulationError } from '../common/errors.js';
import { SideEffectCounter } from '../common/index.js';
import { PackedValuesCache } from '../common/packed_values_cache.js';
import { type CommitmentsDB, type PublicContractsDB, type PublicStateDB } from './db.js';
import { type PublicExecution, type PublicExecutionResult, checkValidStaticCall } from './execution.js';
import { PublicExecutionContext } from './public_execution_context.js';
import {
  convertAvmResultsToPxResult,
  createAvmExecutionEnvironment,
  decompressBytecodeIfCompressed,
  isAvmBytecode,
} from './transitional_adaptors.js';

/**
 * Execute a public function and return the execution result.
 */
export async function executePublicFunction(
  context: PublicExecutionContext,
  nested: boolean,
): Promise<PublicExecutionResult> {
  const bytecode = await context.contractsDb.getBytecode(
    context.execution.contractAddress,
    context.execution.functionSelector,
  );
  if (!bytecode) {
    throw new Error(
      `Bytecode not found for ${context.execution.contractAddress}:${context.execution.functionSelector}`,
    );
  }

  if (await isAvmBytecode(bytecode)) {
    return await executeTopLevelPublicFunctionAvm(context, bytecode);
  } else {
    return await executePublicFunctionAcvm(context, bytecode, nested);
  }
}

/**
 * Execute a top-level public function call (the first call in an enqueued-call/execution-request) in the AVM.
 * Translate the results back to the PublicExecutionResult format.
 */
async function executeTopLevelPublicFunctionAvm(
  executionContext: PublicExecutionContext,
  bytecode: Buffer,
): Promise<PublicExecutionResult> {
  const address = executionContext.execution.contractAddress;
  const selector = executionContext.execution.functionSelector;
  const startGas = executionContext.availableGas;
  const log = createDebugLogger('aztec:simulator:public_execution');
  log.verbose(`[AVM] Executing public external function ${address.toString()}:${selector}.`);

  // Temporary code to construct the AVM context
  // These data structures will permeate across the simulator when the public executor is phased out
  const hostStorage = new HostStorage(
    executionContext.stateDb,
    executionContext.contractsDb,
    executionContext.commitmentsDb,
  );

  // TODO(6207): add sideEffectCounter to persistableState construction
  // or modify the PersistableStateManager to manage rollbacks across enqueued-calls and transactions.
  const worldStateJournal = new AvmPersistableStateManager(hostStorage);
  const startSideEffectCounter = executionContext.execution.callContext.sideEffectCounter;
  for (const nullifier of executionContext.pendingNullifiers) {
    worldStateJournal.nullifiers.cache.appendSiloed(nullifier.value);
  }
  // All the subsequent side effects will have a counter larger than the call's start counter.
  worldStateJournal.trace.accessCounter = startSideEffectCounter + 1;

  const executionEnv = createAvmExecutionEnvironment(
    executionContext.execution,
    executionContext.header,
    executionContext.globalVariables,
    executionContext.gasSettings,
    executionContext.transactionFee,
  );

  const machineState = new AvmMachineState(startGas);
  const avmContext = new AvmContext(worldStateJournal, executionEnv, machineState);
  const simulator = new AvmSimulator(avmContext);

  const avmResult = await simulator.executeBytecode(bytecode);

  // Commit the journals state to the DBs since this is a top-level execution.
  // Observe that this will write all the state changes to the DBs, not only the latest for each slot.
  // However, the underlying DB keep a cache and will only write the latest state to disk.
  await avmContext.persistableState.publicStorage.commitToDB();

  log.verbose(
    `[AVM] ${address.toString()}:${selector} returned, reverted: ${avmResult.reverted}, reason: ${
      avmResult.revertReason
    }.`,
  );

  return convertAvmResultsToPxResult(
    avmResult,
    startSideEffectCounter,
    executionContext.execution,
    startGas,
    avmContext,
  );
}

async function executePublicFunctionAcvm(
  context: PublicExecutionContext,
  acir: Buffer,
  nested: boolean,
): Promise<PublicExecutionResult> {
  const execution = context.execution;
  const { contractAddress, functionSelector } = execution;
  const log = createDebugLogger('aztec:simulator:public_execution');
  log.verbose(`[ACVM] Executing public external function ${contractAddress.toString()}:${functionSelector}.`);

  const initialWitness = context.getInitialWitness();
  const acvmCallback = new Oracle(context);

  const { partialWitness, returnWitnessMap, reverted, revertReason } = await (async () => {
    try {
      const result = await acvm(acir, initialWitness, acvmCallback);
      return {
        partialWitness: result.partialWitness,
        returnWitnessMap: result.returnWitness,
        reverted: false,
        revertReason: undefined,
      };
    } catch (err_) {
      const err = err_ as Error;
      const ee = new ExecutionError(
        err.message,
        {
          contractAddress,
          functionSelector,
        },
        extractCallStack(err),
        { cause: err },
      );

      if (nested) {
        // If we're nested, throw the error so the parent can handle it
        throw ee;
      } else {
        return {
          partialWitness: undefined,
          returnWitnessMap: undefined,
          reverted: true,
          revertReason: createSimulationError(ee),
        };
      }
    }
  })();

  if (reverted) {
    return {
      execution,
      returnValues: [],
      newNoteHashes: [],
      newL2ToL1Messages: [],
      // TODO (side effects) get these values in the revert case from the vm
      startSideEffectCounter: Fr.ZERO,
      endSideEffectCounter: Fr.ZERO,
      newNullifiers: [],
      nullifierReadRequests: [],
      nullifierNonExistentReadRequests: [],
      contractStorageReads: [],
      contractStorageUpdateRequests: [],
      nestedExecutions: [],
      unencryptedLogsHashes: [],
      unencryptedLogs: UnencryptedFunctionL2Logs.empty(),
      allUnencryptedLogs: UnencryptedFunctionL2Logs.empty(),
      reverted,
      revertReason,
      startGasLeft: context.availableGas,
      endGasLeft: Gas.empty(),
      transactionFee: context.transactionFee,
    };
  }

  if (!partialWitness) {
    throw new Error('No partial witness returned from ACVM');
  }

  const returnWitness = witnessMapToFields(returnWitnessMap);
  const {
    returnsHash,
    nullifierReadRequests: nullifierReadRequestsPadded,
    nullifierNonExistentReadRequests: nullifierNonExistentReadRequestsPadded,
    newL2ToL1Msgs,
    newNoteHashes: newNoteHashesPadded,
    newNullifiers: newNullifiersPadded,
    startSideEffectCounter,
    endSideEffectCounter,
    unencryptedLogsHashes: unencryptedLogsHashesPadded,
  } = PublicCircuitPublicInputs.fromFields(returnWitness);
  const returnValues = await context.unpackReturns(returnsHash);

  const nullifierReadRequests = nullifierReadRequestsPadded.filter(v => !v.isEmpty());
  const nullifierNonExistentReadRequests = nullifierNonExistentReadRequestsPadded.filter(v => !v.isEmpty());
  const newL2ToL1Messages = newL2ToL1Msgs.filter(v => !v.isEmpty());
  const newNoteHashes = newNoteHashesPadded.filter(v => !v.isEmpty());
  const newNullifiers = newNullifiersPadded.filter(v => !v.isEmpty());
  const unencryptedLogsHashes = unencryptedLogsHashesPadded.filter(v => !v.isEmpty());

  const { contractStorageReads, contractStorageUpdateRequests } = context.getStorageActionData();

  log.debug(
    `Contract storage reads: ${contractStorageReads
      .map(r => r.toFriendlyJSON() + ` - sec: ${r.sideEffectCounter}`)
      .join(', ')}`,
  );
  log.debug(
    `Contract storage update requests: ${contractStorageUpdateRequests
      .map(r => r.toFriendlyJSON() + ` - sec: ${r.sideEffectCounter}`)
      .join(', ')}`,
  );

  const nestedExecutions = context.getNestedExecutions();
  const unencryptedLogs = context.getUnencryptedLogs();
  const allUnencryptedLogs = context.getAllUnencryptedLogs();

  // TODO(palla/gas): We should be loading these values from the returned PublicCircuitPublicInputs
  const startGasLeft = context.availableGas;
  const endGasLeft = context.availableGas; // No gas consumption in non-AVM

  return {
    execution,
    newNoteHashes,
    newL2ToL1Messages,
    newNullifiers,
    startSideEffectCounter,
    endSideEffectCounter,
    nullifierReadRequests,
    nullifierNonExistentReadRequests,
    contractStorageReads,
    contractStorageUpdateRequests,
    returnValues,
    nestedExecutions,
    unencryptedLogsHashes,
    unencryptedLogs,
    allUnencryptedLogs,
    reverted: false,
    revertReason: undefined,
    startGasLeft,
    endGasLeft,
    transactionFee: context.transactionFee,
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

  private readonly log = createDebugLogger('aztec:simulator:public_executor');
  /**
   * Executes a public execution request.
   * @param execution - The execution to run.
   * @param globalVariables - The global variables to use.
   * @returns The result of the run plus all nested runs.
   */
  public async simulate(
    execution: PublicExecution,
    globalVariables: GlobalVariables,
    availableGas: Gas,
    txContext: TxContext,
    pendingNullifiers: Nullifier[],
    transactionFee: Fr = Fr.ZERO,
    sideEffectCounter: number = 0,
  ): Promise<PublicExecutionResult> {
    // Functions can request to pack arguments before calling other functions.
    // We use this cache to hold the packed arguments.
    const packedArgs = PackedValuesCache.create([]);

    const context = new PublicExecutionContext(
      execution,
      this.header,
      globalVariables,
      packedArgs,
      new SideEffectCounter(sideEffectCounter),
      this.stateDb,
      this.contractsDb,
      this.commitmentsDb,
      availableGas,
      transactionFee,
      txContext.gasSettings,
      pendingNullifiers,
    );

    const executionResult = await executePublicFunction(context, /*nested=*/ false);

    if (executionResult.execution.callContext.isStaticCall) {
      checkValidStaticCall(
        executionResult.newNoteHashes,
        executionResult.newNullifiers,
        executionResult.contractStorageUpdateRequests,
        executionResult.newL2ToL1Messages,
        executionResult.unencryptedLogs,
      );
    }

    return executionResult;
  }

  /**
   * These functions are currently housed in the temporary executor as it relies on access to
   * oracles like the contractsDB and this is the least intrusive way to achieve this.
   * When we remove this executor(tracking issue #4792) and have an interface that is compatible with the kernel circuits,
   * this will be moved to sequencer-client/prover.
   */

  /**
   * Generates a proof for an associated avm execution. This is currently only used for testing purposes,
   * as proof generation is not fully complete in the AVM yet.
   * @param execution - The execution to run.
   * @returns An AVM proof and the verification key.
   */
  public async getAvmProof(avmExecution: PublicExecution): Promise<Buffer[]> {
    // The paths for the barretenberg binary and the write path are hardcoded for now.
    const bbPath = path.resolve('../../barretenberg/cpp');
    const artifactsPath = path.resolve('target');

    // Create the directory if it does not exist
    await fs.rm(artifactsPath, { recursive: true, force: true });
    await fs.mkdir(artifactsPath, { recursive: true });

    const calldataPath = path.join(artifactsPath, 'calldata.bin');
    const bytecodePath = path.join(artifactsPath, 'avm_bytecode.bin');
    const proofPath = path.join(artifactsPath, 'proof');

    const { args, functionSelector, contractAddress } = avmExecution;
    let bytecode = await this.contractsDb.getBytecode(contractAddress, functionSelector);
    assert(!!bytecode, `Bytecode not found for ${contractAddress}:${functionSelector}`);
    // This should be removed once we do bytecode validation.
    bytecode = await decompressBytecodeIfCompressed(bytecode!);
    // Write call data and bytecode to files.
    await fs.writeFile(
      calldataPath,
      args.map(c => c.toBuffer()),
    );
    await fs.writeFile(bytecodePath, bytecode!);

    const bbExec = path.join(bbPath, 'build', 'bin', 'bb');
    const bbArgs = ['avm_prove', '-b', bytecodePath, '-d', calldataPath, '-o', proofPath];
    this.log.debug(`calling '${bbExec} ${bbArgs.join(' ')}'`);
    const bbBinary = spawn(bbExec, bbArgs);

    // The binary writes the proof and the verification key to the write path.
    return new Promise((resolve, reject) => {
      let stdout: string = '';
      let stderr: string = '';

      bbBinary.on('close', () => {
        this.log.verbose(`Proof generation complete. Reading proof and vk from ${proofPath}.`);
        return resolve(Promise.all([fs.readFile(proofPath), fs.readFile(path.join(artifactsPath, 'vk'))]));
      });

      // Catch stdout.
      bbBinary.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
      bbBinary.stdout.on('end', () => {
        if (stdout.length > 0) {
          this.log.debug(`stdout: ${stdout}`);
        }
      });

      // Catch stderr.
      bbBinary.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
      bbBinary.stderr.on('end', () => {
        if (stderr.length > 0) {
          this.log.warn(`stderr: ${stderr}`);
        }
      });

      // Catch and propagate errors from spawning
      bbBinary.on('error', err => {
        reject(err);
      });
    });
  }

  /**
   * Verifies an AVM proof. This function is currently only used for testing purposes, as verification
   * is not fully complete in the AVM yet.
   * @param vk - The verification key to use.
   * @param proof - The proof to verify.
   * @returns True if the proof is valid, false otherwise.
   */
  async verifyAvmProof(vk: Buffer, proof: Buffer): Promise<boolean> {
    // The relative paths for the barretenberg binary and the write path are hardcoded for now.
    const bbPath = path.resolve('../../barretenberg/cpp');
    const artifactsPath = path.resolve('./target');

    const vkPath = path.join(artifactsPath, 'vk');
    const proofPath = path.join(artifactsPath, 'proof');

    // Write the verification key and the proof to files.
    await fs.writeFile(vkPath, vk);
    await fs.writeFile(proofPath, proof);

    const bbExec = path.join(bbPath, 'build', 'bin', 'bb');
    const bbArgs = ['avm_verify', '-p', proofPath];
    this.log.debug(`calling '${bbPath} ${bbArgs.join(' ')}'`);
    const bbBinary = spawn(bbExec, bbArgs);

    // The binary prints to stdout 1 if the proof is valid and 0 if it is not.
    return new Promise((resolve, reject) => {
      let result = Buffer.alloc(0);
      bbBinary.stdout.on('data', data => {
        result += data;
      });
      bbBinary.on('close', () => {
        resolve(result.toString() === '1');
      });
      // Catch and propagate errors from spawning
      bbBinary.on('error', err => {
        reject(err);
      });
    });
  }
}
