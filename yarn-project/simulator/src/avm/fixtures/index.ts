import { isNoirCallStackUnresolved } from '@aztec/circuit-types';
import { GasFees, GlobalVariables, MAX_L2_GAS_PER_ENQUEUED_CALL } from '@aztec/circuits.js';
import { type FunctionArtifact, FunctionSelector } from '@aztec/foundation/abi';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { AvmTestContractArtifact } from '@aztec/noir-contracts.js';

import { strict as assert } from 'assert';
import { mock } from 'jest-mock-extended';
import merge from 'lodash.merge';

import { type WorldStateDB, resolveAssertionMessageFromRevertData, traverseCauseChain } from '../../index.js';
import { type PublicSideEffectTraceInterface } from '../../public/side_effect_trace_interface.js';
import { AvmContext } from '../avm_context.js';
import { AvmExecutionEnvironment } from '../avm_execution_environment.js';
import { AvmMachineState } from '../avm_machine_state.js';
import { Field, Uint8, Uint32, Uint64 } from '../avm_memory_types.js';
import { type AvmEphemeralForest } from '../avm_tree.js';
import { type AvmRevertReason } from '../errors.js';
import { AvmPersistableStateManager } from '../journal/journal.js';
import { NullifierManager } from '../journal/nullifiers.js';
import { PublicStorage } from '../journal/public_storage.js';

/**
 * Create a new AVM context with default values.
 */
export function initContext(overrides?: {
  persistableState?: AvmPersistableStateManager;
  env?: AvmExecutionEnvironment;
  machineState?: AvmMachineState;
}): AvmContext {
  return new AvmContext(
    overrides?.persistableState || initPersistableStateManager(),
    overrides?.env || initExecutionEnvironment(),
    overrides?.machineState || initMachineState(),
  );
}

/** Creates an empty state manager with mocked host storage. */
export function initPersistableStateManager(overrides?: {
  worldStateDB?: WorldStateDB;
  trace?: PublicSideEffectTraceInterface;
  publicStorage?: PublicStorage;
  nullifiers?: NullifierManager;
  doMerkleOperations?: boolean;
  merkleTrees?: AvmEphemeralForest;
}): AvmPersistableStateManager {
  const worldStateDB = overrides?.worldStateDB || mock<WorldStateDB>();
  return new AvmPersistableStateManager(
    worldStateDB,
    overrides?.trace || mock<PublicSideEffectTraceInterface>(),
    overrides?.publicStorage || new PublicStorage(worldStateDB),
    overrides?.nullifiers || new NullifierManager(worldStateDB),
    overrides?.doMerkleOperations || false,
    overrides?.merkleTrees || mock<AvmEphemeralForest>(),
  );
}

/**
 * Create an empty instance of the Execution Environment where all values are zero, unless overridden in the overrides object
 */
export function initExecutionEnvironment(overrides?: Partial<AvmExecutionEnvironment>): AvmExecutionEnvironment {
  return new AvmExecutionEnvironment(
    overrides?.address ?? AztecAddress.zero(),
    overrides?.sender ?? AztecAddress.zero(),
    overrides?.contractCallDepth ?? Fr.zero(),
    overrides?.transactionFee ?? Fr.zero(),
    overrides?.globals ?? GlobalVariables.empty(),
    overrides?.isStaticCall ?? false,
    overrides?.calldata ?? [],
  );
}

/**
 * Create an empty instance of the Execution Environment where all values are zero, unless overridden in the overrides object
 */
export function initGlobalVariables(overrides?: Partial<GlobalVariables>): GlobalVariables {
  return new GlobalVariables(
    overrides?.chainId ?? Fr.zero(),
    overrides?.version ?? Fr.zero(),
    overrides?.blockNumber ?? Fr.zero(),
    overrides?.slotNumber ?? Fr.zero(),
    overrides?.timestamp ?? Fr.zero(),
    overrides?.coinbase ?? EthAddress.ZERO,
    overrides?.feeRecipient ?? AztecAddress.zero(),
    overrides?.gasFees ?? GasFees.empty(),
  );
}

/**
 * Create an empty instance of the Machine State where all values are set to a large enough amount, unless overridden in the overrides object
 */
export function initMachineState(overrides?: Partial<AvmMachineState>): AvmMachineState {
  return AvmMachineState.fromState({
    l2GasLeft: overrides?.l2GasLeft ?? MAX_L2_GAS_PER_ENQUEUED_CALL,
    daGasLeft: overrides?.daGasLeft ?? 1e8,
  });
}

/**
 * Create a new object with all the same properties as the original, except for the ones in the overrides object.
 */
export function allSameExcept(original: any, overrides: any): any {
  return merge({}, original, overrides);
}

export function randomMemoryBytes(length: number): Uint8[] {
  return [...Array(length)].map(_ => new Uint8(Math.floor(Math.random() * 255)));
}

export function randomMemoryUint32s(length: number): Uint32[] {
  return [...Array(length)].map(_ => new Uint32(Math.floor(Math.random() * 255)));
}

export function randomMemoryUint64s(length: number): Uint64[] {
  return [...Array(length)].map(_ => new Uint64(Math.floor(Math.random() * 255)));
}

export function randomMemoryFields(length: number): Field[] {
  return [...Array(length)].map(_ => new Field(Fr.random()));
}

export function getAvmTestContractFunctionSelector(functionName: string): FunctionSelector {
  const artifact = AvmTestContractArtifact.functions.find(f => f.name === functionName)!;
  assert(!!artifact, `Function ${functionName} not found in AvmTestContractArtifact`);
  const params = artifact.parameters;
  return FunctionSelector.fromNameAndParameters(artifact.name, params);
}

export function getAvmTestContractArtifact(functionName: string): FunctionArtifact {
  const artifact = AvmTestContractArtifact.functions.find(f => f.name === functionName)!;
  assert(
    !!artifact?.bytecode,
    `No bytecode found for function ${functionName}. Try re-running bootstrap.sh on the repository root.`,
  );
  return artifact;
}

export function getAvmTestContractBytecode(functionName: string): Buffer {
  const artifact = getAvmTestContractArtifact(functionName);
  return artifact.bytecode;
}

export function resolveAvmTestContractAssertionMessage(
  functionName: string,
  revertReason: AvmRevertReason,
  output: Fr[],
): string | undefined {
  traverseCauseChain(revertReason, cause => {
    revertReason = cause as AvmRevertReason;
  });

  const functionArtifact = AvmTestContractArtifact.functions.find(f => f.name === functionName);
  if (!functionArtifact || !revertReason.noirCallStack || !isNoirCallStackUnresolved(revertReason.noirCallStack)) {
    return undefined;
  }

  return resolveAssertionMessageFromRevertData(output, functionArtifact);
}
