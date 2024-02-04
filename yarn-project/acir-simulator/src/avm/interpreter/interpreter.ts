//import { strict as assert } from 'assert';
//
//import { AvmContractCallResults } from '../avm_message_call_result.js';
//import { Instruction, InstructionExecutionError } from '../opcodes/instruction.js';
//import { AvmContext } from '../avm_context.js';
//
//
////export class AvmSessionExecutor {
//  /**
//   * Run the avm
//   * @returns bool - successful execution will return true
//   *               - reverted execution will return false
//   *               - any other panic will throw
//   */
//  export async function executeAvm(
//    context: AvmContext,
//    instructions: Instruction[] = [],
//  ): Promise<AvmContractCallResults> {
//    assert(instructions.length > 0);
//    // TODO unclear the separation between AvmContext and this
//
//    try {
//      while (!context.machineState.halted) {
//        const instruction = instructions[context.machineState.pc];
//        assert(!!instruction); // This should never happen
//
//        await instruction.execute(context);
//
//        if (context.machineState.pc >= instructions.length) {
//          throw new InvalidProgramCounterError(context.machineState.pc, /*max=*/ instructions.length);
//        }
//      }
//
//      const returnData = context.results.output;
//      if (context.results.reverted) {
//        return AvmContractCallResults.revert(returnData);
//      }
//
//      return AvmContractCallResults.success(returnData);
//    } catch (e) {
//      if (!(e instanceof AvmInterpreterError || e instanceof InstructionExecutionError)) {
//        throw e;
//      }
//
//      // reverts can return data as well
//      const returnData = context.results.output;
//      return AvmContractCallResults.revert(returnData, /*revertReason=*/ e);
//    }
//  }
////}
//
///**
// * Avm-specific errors should derive from this
// */
//export abstract class AvmInterpreterError extends Error {
//  constructor(message: string, ...rest: any[]) {
//    super(message, ...rest);
//    this.name = 'AvmInterpreterError';
//  }
//}
//
///**
// * Error is thrown when the program counter goes to an invalid location.
// * There is no instruction at the provided pc
// */
//export class InvalidProgramCounterError extends AvmInterpreterError {
//  constructor(pc: number, max: number) {
//    super(`Invalid program counter ${pc}, max is ${max}`);
//    this.name = 'InvalidProgramCounterError';
//  }
//}
//