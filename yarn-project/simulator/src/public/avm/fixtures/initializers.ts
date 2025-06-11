import { MAX_L2_GAS_PER_TX_PUBLIC_PORTION } from '@aztec/constants';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { GasFees } from '@aztec/stdlib/gas';
import { GlobalVariables } from '@aztec/stdlib/tx';

import { mock } from 'jest-mock-extended';

import type { PublicContractsDB, PublicTreesDB } from '../../public_db_sources.js';
import type { PublicSideEffectTraceInterface } from '../../side_effect_trace_interface.js';
import { NullifierManager } from '../../state_manager/nullifiers.js';
import { PublicStorage } from '../../state_manager/public_storage.js';
import { PublicPersistableStateManager } from '../../state_manager/state_manager.js';
import { AvmContext } from '../avm_context.js';
import { AvmExecutionEnvironment } from '../avm_execution_environment.js';
import { AvmMachineState } from '../avm_machine_state.js';
import { AvmSimulator } from '../avm_simulator.js';
import { DEFAULT_BLOCK_NUMBER } from './utils.js';

/**
 * Create a new AVM context with default values.
 */
export function initContext(overrides?: {
  persistableState?: PublicPersistableStateManager;
  env?: AvmExecutionEnvironment;
  machineState?: AvmMachineState;
}): AvmContext {
  const ctx = new AvmContext(
    overrides?.persistableState || initPersistableStateManager(),
    overrides?.env || initExecutionEnvironment(),
    overrides?.machineState || initMachineState(),
  );
  ctx.provideSimulator = AvmSimulator.build;
  return ctx;
}

/** Creates an empty state manager with mocked host storage. */
export function initPersistableStateManager(overrides?: {
  treesDB?: PublicTreesDB;
  contractsDB?: PublicContractsDB;
  trace?: PublicSideEffectTraceInterface;
  publicStorage?: PublicStorage;
  nullifiers?: NullifierManager;
  doMerkleOperations?: boolean;
  firstNullifier?: Fr;
  blockNumber?: number;
}): PublicPersistableStateManager {
  const treesDB = overrides?.treesDB || mock<PublicTreesDB>();
  return new PublicPersistableStateManager(
    treesDB,
    overrides?.contractsDB || mock<PublicContractsDB>(),
    overrides?.trace || mock<PublicSideEffectTraceInterface>(),
    overrides?.firstNullifier || new Fr(27),
    overrides?.blockNumber || DEFAULT_BLOCK_NUMBER,
    overrides?.doMerkleOperations || false,
    overrides?.publicStorage,
    overrides?.nullifiers,
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
    overrides?.clientInitiatedSimulation ?? true, // default to true for testing even though internal default is false
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
    l2GasLeft: overrides?.l2GasLeft ?? MAX_L2_GAS_PER_TX_PUBLIC_PORTION,
    daGasLeft: overrides?.daGasLeft ?? 1e8,
  });
}
