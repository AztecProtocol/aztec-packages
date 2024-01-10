
// Decisions:
// 1. At this current time the avm should not handle getting state itself or anything like that 
//    - it will purely run as an interpreter and the code / starting state will be given to it on init
// 2. Anything that is a constant 
//    - e.g. will go in its own relevant file -> there is no need to have it in the interpreter file

// import { AvmContext } from "./avm_context.js";
// import { Add, Mul, Opcode, Sub } from "./opcodes/index.js";


// // First steps
// // 1. Implement the basic opcodes and do it without state

// // AVM
// // The avm itself is responsible for 
// // - Triggering a call 
// // - Creating an interpreter to handle the call 
// // - Getting the journal of state changes from the interpreter 
// // - Applying the state changes through the state manager interface
// class Avm {

//     // The interpreter is responsible for executing 
//     private interpreter: AvmInterpreter;
//     private stateManager: AvmStateManager;
    
//     // TODO: should this buffer go inside the avm or else where
//     constructor(private context: AvmContext) {

//     }
// }


