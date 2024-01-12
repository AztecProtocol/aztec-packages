import { AvmContext } from '../avm_context.js';
import { AvmStateManager } from '../avm_state_manager.js';
import { Instruction } from './instruction.js';

/** - */
export class Return implements Instruction {
  static type: string = 'RETURN';
  static numberOfOperands = 2;

  constructor(private returnOffset: number, private copySize: number) {}

  execute(context: AvmContext, _stateManager: AvmStateManager): void {
    const returnData = context.readMemoryChunk(this.returnOffset, this.returnOffset + this.copySize);
    context.setReturnData(returnData);
  }
}
