

// import { AvmContext } from "../avm_context.js";
import { AvmContext } from "../avm_context.js";
import { Opcode } from "../opcodes/index.js";

// Function that will take in the opcode the interpreter state and the world state - then execute it 

class AvmInterpreter {
  
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

  run() {
    for (const opcode of this.opcodes) {
      opcode.execute(this.context);
    }
  }
}

