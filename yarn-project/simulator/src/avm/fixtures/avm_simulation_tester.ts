import type { MerkleTreeWriteOperations } from '@aztec/circuit-types/interfaces/server';
import { GasFees, GlobalVariables } from '@aztec/circuits.js';
import { encodeArguments } from '@aztec/circuits.js/abi';
import type { AztecAddress } from '@aztec/circuits.js/aztec-address';
import { Fr } from '@aztec/foundation/fields';
import { NativeWorldStateService } from '@aztec/world-state';

import type { AvmContractCallResult } from '../../avm/avm_contract_call_result.js';
import {
  getContractFunctionArtifact,
  getFunctionSelector,
  initContext,
  initExecutionEnvironment,
  resolveContractAssertionMessage,
} from '../../avm/fixtures/index.js';
import { WorldStateDB } from '../../public/public_db_sources.js';
import { SideEffectTrace } from '../../public/side_effect_trace.js';
import { AvmPersistableStateManager, AvmSimulator } from '../../server.js';
import { BaseAvmSimulationTester } from './base_avm_simulation_tester.js';
import { SimpleContractDataSource } from './simple_contract_data_source.js';

const TIMESTAMP = new Fr(99833);
const DEFAULT_GAS_FEES = new GasFees(2, 3);

/**
 * A test class that extends the BaseAvmSimulationTester to enable real-app testing of the core AvmSimulator.
 * It provides an interface for simulating one top-level call at a time and maintains state between
 * subsequent top-level calls.
 */
export class AvmSimulationTester extends BaseAvmSimulationTester {
  constructor(
    contractDataSource: SimpleContractDataSource,
    merkleTrees: MerkleTreeWriteOperations,
    private stateManager: AvmPersistableStateManager,
  ) {
    super(contractDataSource, merkleTrees);
  }

  static async create(): Promise<AvmSimulationTester> {
    const contractDataSource = new SimpleContractDataSource();
    const merkleTrees = await (await NativeWorldStateService.tmp()).fork();
    const worldStateDB = new WorldStateDB(merkleTrees, contractDataSource);
    const trace = new SideEffectTrace();
    const firstNullifier = new Fr(420000);
    // FIXME: merkle ops should work, but I'm seeing frequent (but inconsistent) bytecode retrieval
    // failures on 2nd call to simulateCall with merkle ops on
    const stateManager = await AvmPersistableStateManager.create(
      worldStateDB,
      trace,
      /*doMerkleOperations=*/ false,
      firstNullifier,
    );
    return new AvmSimulationTester(contractDataSource, merkleTrees, stateManager);
  }

  /**
   * Simulate a top-level contract call.
   */
  async simulateCall(
    sender: AztecAddress,
    address: AztecAddress,
    fnName: string,
    args: any[],
    isStaticCall = false,
  ): Promise<AvmContractCallResult> {
    const contractArtifact = await this.contractDataSource.getContractArtifact(address);
    if (!contractArtifact) {
      throw new Error(`Contract not found at address: ${address}`);
    }
    const fnSelector = await getFunctionSelector(fnName, contractArtifact);
    const fnAbi = getContractFunctionArtifact(fnName, contractArtifact);
    const encodedArgs = encodeArguments(fnAbi!, args);
    const calldata = [fnSelector.toField(), ...encodedArgs];

    const globals = GlobalVariables.empty();
    globals.timestamp = TIMESTAMP;
    globals.gasFees = DEFAULT_GAS_FEES;

    const environment = initExecutionEnvironment({
      calldata,
      globals,
      address,
      sender,
      isStaticCall,
    });
    const persistableState = this.stateManager.fork();
    const context = initContext({ env: environment, persistableState });

    // First we simulate (though it's not needed in this simple case).
    const simulator = new AvmSimulator(context);
    const result = await simulator.execute();
    if (result.reverted) {
      this.logger.error(`Error in ${fnName}:`);
      this.logger.error(
        resolveContractAssertionMessage(fnName, result.revertReason!, result.output, contractArtifact)!,
      );
    } else {
      this.logger.info(`Simulation of function ${fnName} succeeded!`);
      this.stateManager.merge(persistableState);
    }
    return result;
  }
}
