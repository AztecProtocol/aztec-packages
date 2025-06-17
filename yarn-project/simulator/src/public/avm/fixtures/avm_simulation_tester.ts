import { Fr } from '@aztec/foundation/fields';
import { encodeArguments } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { GasFees } from '@aztec/stdlib/gas';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/interfaces/server';
import { GlobalVariables } from '@aztec/stdlib/tx';
import { NativeWorldStateService } from '@aztec/world-state';

import { SideEffectTrace } from '../../../public/side_effect_trace.js';
import type { AvmContractCallResult } from '../../avm/avm_contract_call_result.js';
import {
  DEFAULT_BLOCK_NUMBER,
  getContractFunctionAbi,
  getFunctionSelector,
  initContext,
  initExecutionEnvironment,
  resolveContractAssertionMessage,
} from '../../avm/fixtures/index.js';
import { SimpleContractDataSource } from '../../fixtures/simple_contract_data_source.js';
import { PublicContractsDB, PublicTreesDB } from '../../public_db_sources.js';
import { PublicPersistableStateManager } from '../../state_manager/state_manager.js';
import { AvmSimulator } from '../avm_simulator.js';
import { BaseAvmSimulationTester } from './base_avm_simulation_tester.js';

const TIMESTAMP = 99833n;
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
    private stateManager: PublicPersistableStateManager,
  ) {
    super(contractDataSource, merkleTrees);
  }

  static async create(): Promise<AvmSimulationTester> {
    const contractDataSource = new SimpleContractDataSource();
    const merkleTrees = await (await NativeWorldStateService.tmp()).fork();
    const treesDB = new PublicTreesDB(merkleTrees);
    const contractsDB = new PublicContractsDB(contractDataSource);
    const trace = new SideEffectTrace();
    const firstNullifier = new Fr(420000);

    const stateManager = PublicPersistableStateManager.create(
      treesDB,
      contractsDB,
      trace,
      /*doMerkleOperations=*/ false,
      firstNullifier,
      DEFAULT_BLOCK_NUMBER,
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
    const fnAbi = getContractFunctionAbi(fnName, contractArtifact);
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
    const persistableState = await this.stateManager.fork();
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
      await this.stateManager.merge(persistableState);
    }
    return result;
  }
}
