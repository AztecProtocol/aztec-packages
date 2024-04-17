// All code in this file needs to die once the public executor is phased out in favor of the AVM.
import { CallContext, FunctionData, Gas, GasSettings, type GlobalVariables, type Header } from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';

import { type AvmContext } from '../avm/avm_context.js';
import { AvmExecutionEnvironment } from '../avm/avm_execution_environment.js';
import { AvmContractCallResults } from '../avm/avm_message_call_result.js';
import { Mov } from '../avm/opcodes/memory.js';
import { PackedValuesCache, SideEffectCounter } from '../index.js';
import { type PublicExecution, type PublicExecutionResult } from './execution.js';
import { PublicExecutionContext } from './public_execution_context.js';

/**
 * Convert a PublicExecution(Environment) object to an AvmExecutionEnvironment
 */
export function createAvmExecutionEnvironment(
  current: PublicExecution,
  header: Header,
  globalVariables: GlobalVariables,
  gasSettings: GasSettings,
  transactionFee: Fr,
): AvmExecutionEnvironment {
  return new AvmExecutionEnvironment(
    current.contractAddress,
    current.callContext.storageContractAddress,
    current.callContext.msgSender,
    globalVariables.gasFees.feePerL2Gas,
    globalVariables.gasFees.feePerDaGas,
    /*contractCallDepth=*/ Fr.zero(),
    header,
    globalVariables,
    current.callContext.isStaticCall,
    current.callContext.isDelegateCall,
    current.args,
    gasSettings,
    transactionFee,
    current.functionData.selector,
  );
}

export function createPublicExecutionContext(avmContext: AvmContext, calldata: Fr[]): PublicExecutionContext {
  const sideEffectCounter = avmContext.persistableState.trace.accessCounter;
  const callContext = CallContext.from({
    msgSender: avmContext.environment.sender,
    storageContractAddress: avmContext.environment.storageAddress,
    functionSelector: avmContext.environment.temporaryFunctionSelector,
    isDelegateCall: avmContext.environment.isDelegateCall,
    isStaticCall: avmContext.environment.isStaticCall,
    sideEffectCounter: sideEffectCounter,
  });
  const functionData = new FunctionData(avmContext.environment.temporaryFunctionSelector, /*isPrivate=*/ false);
  const execution: PublicExecution = {
    contractAddress: avmContext.environment.address,
    callContext,
    args: calldata,
    functionData,
  };
  const packedArgs = PackedValuesCache.create([]);

  return new PublicExecutionContext(
    execution,
    avmContext.environment.header,
    avmContext.environment.globals,
    packedArgs,
    new SideEffectCounter(sideEffectCounter),
    avmContext.persistableState.hostStorage.publicStateDb,
    avmContext.persistableState.hostStorage.contractsDb,
    avmContext.persistableState.hostStorage.commitmentsDb,
    Gas.from(avmContext.machineState.gasLeft),
    avmContext.environment.transactionFee,
    avmContext.environment.gasSettings,
  );
}

export function convertPublicExecutionResult(res: PublicExecutionResult): AvmContractCallResults {
  return new AvmContractCallResults(res.reverted, res.returnValues, res.revertReason);
}

export function updateAvmContextFromPublicExecutionResult(ctx: AvmContext, result: PublicExecutionResult): void {
  for (const updateRequest of result.contractStorageUpdateRequests) {
    // We need to manually populate the cache.
    ctx.persistableState.publicStorage.write(
      ctx.environment.storageAddress,
      updateRequest.storageSlot,
      updateRequest.newValue,
    );
  }
}
// TODO: store result's new nullifiers to PersistableState's cache?

const AVM_MAGIC_SUFFIX = Buffer.from([
  Mov.opcode, // opcode
  0x00, // indirect
  ...Buffer.from('000018ca', 'hex'), // srcOffset
  ...Buffer.from('000018ca', 'hex'), // dstOffset
]);

export function markBytecodeAsAvm(bytecode: Buffer): Buffer {
  return Buffer.concat([bytecode, AVM_MAGIC_SUFFIX]);
}

export function isAvmBytecode(bytecode: Buffer): boolean {
  const magicSize = AVM_MAGIC_SUFFIX.length;
  return bytecode.subarray(-magicSize).equals(AVM_MAGIC_SUFFIX);
}
