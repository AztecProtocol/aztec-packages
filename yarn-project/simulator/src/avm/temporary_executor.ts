
import { GlobalVariables, Header } from '@aztec/circuits.js';
import {Fr} from "@aztec/foundation/fields";

import { createSimulationError } from '../common/errors.js';
import { SideEffectCounter } from '../common/index.js';
import { PackedArgsCache } from '../common/packed_args_cache.js';
import { CommitmentsDB, PublicContractsDB, PublicStateDB } from '../public/db.js';
import { PublicExecution, PublicExecutionResult } from '../public/execution.js';
import { PublicExecutionContext } from '../public/public_execution_context.js';
import { AvmExecutionEnvironment } from './avm_execution_environment.js';

export function temporaryMapToExecutionEnvironment(current: PublicExecution, globalVariables: GlobalVariables) : AvmExecutionEnvironment{
  // TODO: need to temporarily include functionSelector in here
  return new AvmExecutionEnvironment(
    current.contractAddress,
    current.callContext.storageContractAddress,
    current.callContext.msgSender, // TODO: origin is not available
    current.callContext.msgSender,
    current.callContext.portalContractAddress,
    /*feePerL1Gas=*/Fr.zero(),
    /*feePerL2Gas=*/Fr.zero(),
    /*feePerDaGas=*/Fr.zero(),
    /*contractCallDepth=*/Fr.zero(),
    globalVariables,
    current.callContext.isStaticCall,
    current.callContext.isDelegateCall,
    current.args,
    current.functionData.selector
  )
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
    // TODO currently using the existing public function infrastructure to get this over the line
    
    // TODO: create context from public execution -> then trigger the simulator ( function selector is required here )
    // - trigger execution of the thing
    // - only execute things that DO NOT HAVE A SIDE EFFECTS AT THIS POINT IN TIME 
    // - this means that we can use the public kernel without much effort

    // const simulator = new AvmSimulator

    const selector = execution.functionData.selector;
    const bytecode = await this.contractsDb.getBytecode(execution.contractAddress, selector);
    if (!bytecode) {
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
      return await executeAvmFunction(context, bytecode);
    } catch (err) {
      throw createSimulationError(err instanceof Error ? err : new Error('Unknown error during public execution'));
    }
  }
}
