// import { AvmContext } from "../avm_context.js";
import { Fr } from "@aztec/foundation/fields";
import { AvmContext } from "../avm_context.js";
import { Opcode } from "../opcodes/index.js";

// Function that will take in the opcode the interpreter state and the world state - then execute it 

export class AvmInterpreter {
  
  private opcodes: Opcode[] = [];
  private context: AvmContext;
  // private journal: ContractStorageActionsCollector;

  constructor(context: AvmContext, bytecode: Opcode[]) {
    this.context = context;
    this.opcodes = bytecode;
  }

  public static new(context: AvmContext, bytecode: Opcode[]) {
    return new AvmInterpreter(context, bytecode);
  }

  public static fromOpcodes(opcodes: Opcode[]) {
    // No calldata here -> decide which order around this should go
    const context = new AvmContext([]);
    const interpreter = new AvmInterpreter(context, opcodes);
    interpreter.opcodes = opcodes;
    return interpreter;
  }

  /**
   * Run the avm
   * @returns bool - successful execution will return true
   *               - reverted execution will return false
   *               - any other panic will throw
   */
  run(): boolean {
    try {
      for (const opcode of this.opcodes) {
       opcode.execute(this.context);
      }
      
      return true;
    } catch (e) {
      // TODO: This should only accept AVM defined errors, anything else SHOULD be thrown upstream
      return false;
    }
  }

  /** 
   * Get the return data from avm execution
   * TODO: this should fail if the code has not been executed
   *  - maybe move the return in run into a variable and track it
   */
  returnData(): Fr[] {
    return this.context.getReturnData();
  }
}

