import { Fr } from '@aztec/foundation/fields';

import { AvmContext } from './avm_context.js';
import { AvmStateManager } from './avm_state_manager.js';
import { AvmInterpreter } from './interpreter/index.js';
import { interpretBytecode } from './opcodes/from_bytecode.js';
import { Instruction } from './opcodes/index.js';

/**
 * Avm Executor manages the execution of the AVM
 *
 * It stores a state manager
 */
export class AvmExecutor {
  private stateManager: AvmStateManager;

  constructor(stateManager: AvmStateManager) {
    this.stateManager = stateManager;
  }

  /**
   * Call a contract with the given calldata
   *
   * - We get the contract from storage
   * - We interpret the bytecode
   * - We run the interpreter
   *
   * @param contractAddress -
   * @param calldata -
   */
  public call(contractAddress: Fr, calldata: Fr[]): Fr[] {
    // NOTE: the following is mocked as getPublicBytecode does not exist yet
    // const bytecode = stateManager.journal.hostStorage.contractsDb.getBytecode(contractAddress);
    const bytecode = Buffer.from('0x01000100020003');

    const instructions: Instruction[] = interpretBytecode(bytecode);

    const context = new AvmContext(calldata);
    const interpreter = new AvmInterpreter(context, this.stateManager, instructions);

    // TODO: combine the two?
    interpreter.run();
    const returnData = interpreter.returnData();

    // TODO: Do something with state hand off of a successful call
    return returnData;
  }
}
