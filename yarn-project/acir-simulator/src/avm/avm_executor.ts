
// Decisions:
// 1. At this current time the avm should not handle getting state itself or anything like that 
//    - it will purely run as an interpreter and the code / starting state will be given to it on init
// 2. Anything that is a constant 
//    - e.g. will go in its own relevant file -> there is no need to have it in the interpreter file

import { AvmInterpreter } from "./interpreter/index.js";
import { AvmContext } from "./avm_context.js";

import {Fr} from "@aztec/foundation/fields";
import { interpretBytecode } from "./opcodes/from_bytecode.js";
import { Opcode } from "./opcodes/opcode.js";
import { AvmStateManager } from "./avm_state_manager.js";

export class AvmExecutor {
    private stateManager: AvmStateManager;
    
    constructor(stateManager: AvmStateManager) {
        this.stateManager = stateManager;
    }

    public call(contractAddress: Fr, calldata: Fr[]): Fr[] {
        // NOTE: the following is mocked as getPublicBytecode does not exist yet
        // const bytecode = stateManager.journal.hostStorage.contractsDb.getBytecode(contractAddress);
        const bytecode = Buffer.from("0x01000100020003");

        const opcodes: Opcode[] = interpretBytecode(bytecode);

        const context = new AvmContext(calldata);
        const interpreter = new AvmInterpreter(context, this.stateManager, opcodes);

        // TODO: combine the two?
        interpreter.run();
        const returnData = interpreter.returnData();

        // TODO: Do something with state hand off of a successful call
        return returnData;
    }
}