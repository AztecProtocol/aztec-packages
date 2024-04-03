// All code in this file needs to die once the public executor is phased out in favor of the AVM.
import { UnencryptedFunctionL2Logs, UnencryptedL2Log } from '@aztec/circuit-types';
import {
  CallContext,
  ContractStorageRead,
  ContractStorageUpdateRequest,
  FunctionData,
  type GlobalVariables,
  Header,
  L2ToL1Message,
  ReadRequest,
  SideEffect,
  SideEffectLinkedToNoteHash,
} from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';

import { type AvmContext } from '../avm/avm_context.js';
import { AvmExecutionEnvironment } from '../avm/avm_execution_environment.js';
import { AvmContractCallResults } from '../avm/avm_message_call_result.js';
import { type JournalData } from '../avm/journal/journal.js';
import { Mov } from '../avm/opcodes/memory.js';
import { createSimulationError } from '../common/errors.js';
import { PackedArgsCache, SideEffectCounter } from '../index.js';
import { type PublicExecution, type PublicExecutionResult } from './execution.js';
import { PublicExecutionContext } from './public_execution_context.js';

/**
 * Convert a PublicExecution(Environment) object to an AvmExecutionEnvironment
 *
 * @param current
 * @param globalVariables
 * @returns
 */
export function createAvmExecutionEnvironment(
  current: PublicExecution,
  header: Header,
  globalVariables: GlobalVariables,
): AvmExecutionEnvironment {
  return new AvmExecutionEnvironment(
    current.contractAddress,
    current.callContext.storageContractAddress,
    current.callContext.msgSender, // TODO: origin is not available
    current.callContext.msgSender,
    current.callContext.portalContractAddress,
    /*feePerL1Gas=*/ Fr.zero(),
    /*feePerL2Gas=*/ Fr.zero(),
    /*feePerDaGas=*/ Fr.zero(),
    /*contractCallDepth=*/ Fr.zero(),
    header,
    globalVariables,
    current.callContext.isStaticCall,
    current.callContext.isDelegateCall,
    current.args,
    current.functionData.selector,
  );
}

export function createPublicExecutionContext(avmContext: AvmContext, calldata: Fr[]): PublicExecutionContext {
  const callContext = CallContext.from({
    msgSender: avmContext.environment.sender,
    storageContractAddress: avmContext.environment.storageAddress,
    portalContractAddress: avmContext.environment.portal,
    functionSelector: avmContext.environment.temporaryFunctionSelector,
    isDelegateCall: avmContext.environment.isDelegateCall,
    isStaticCall: avmContext.environment.isStaticCall,
    sideEffectCounter: 1, // FIXME
  });
  const functionData = new FunctionData(avmContext.environment.temporaryFunctionSelector, /*isPrivate=*/ false);
  const execution: PublicExecution = {
    contractAddress: avmContext.environment.address,
    callContext,
    args: calldata,
    functionData,
  };
  const packedArgs = PackedArgsCache.create([]);

  const context = new PublicExecutionContext(
    execution,
    avmContext.environment.header,
    avmContext.environment.globals,
    packedArgs,
    new SideEffectCounter(0),
    avmContext.persistableState.hostStorage.publicStateDb,
    avmContext.persistableState.hostStorage.contractsDb,
    avmContext.persistableState.hostStorage.commitmentsDb,
  );

  return context;
}

/**
 * Convert the result of an AVM contract call to a PublicExecutionResult for the public kernel
 *
 * @param execution
 * @param newWorldState
 * @param result
 * @returns
 */
export function convertAvmResults(
  execution: PublicExecution,
  newWorldState: JournalData,
  result: AvmContractCallResults,
): PublicExecutionResult {
  const contractStorageReads: ContractStorageRead[] = [];
  const reduceStorageReadRequests = (contractAddress: bigint, storageReads: Map<bigint, Fr[]>) => {
    return storageReads.forEach((innerArray, key) => {
      innerArray.forEach(value => {
        contractStorageReads.push(new ContractStorageRead(new Fr(key), new Fr(value), 0));
      });
    });
  };
  newWorldState.storageReads.forEach((storageMap: Map<bigint, Fr[]>, address: bigint) =>
    reduceStorageReadRequests(address, storageMap),
  );

  const contractStorageUpdateRequests: ContractStorageUpdateRequest[] = [];
  const reduceStorageUpdateRequests = (contractAddress: bigint, storageUpdateRequests: Map<bigint, Fr[]>) => {
    return storageUpdateRequests.forEach((innerArray, key) => {
      innerArray.forEach(value => {
        contractStorageUpdateRequests.push(new ContractStorageUpdateRequest(new Fr(key), new Fr(value), 0));
      });
    });
  };
  newWorldState.storageWrites.forEach((storageMap: Map<bigint, Fr[]>, address: bigint) =>
    reduceStorageUpdateRequests(address, storageMap),
  );

  const newNoteHashes = newWorldState.newNoteHashes.map(noteHash => new SideEffect(noteHash, Fr.zero()));
  const nullifierReadRequests: ReadRequest[] = newWorldState.nullifierChecks
    .filter(nullifier => nullifier.exists)
    .map(nullifier => new ReadRequest(nullifier.nullifier, nullifier.counter.toNumber()));
  const nullifierNonExistentReadRequests: ReadRequest[] = newWorldState.nullifierChecks
    .filter(nullifier => !nullifier.exists)
    .map(nullifier => new ReadRequest(nullifier.nullifier, nullifier.counter.toNumber()));
  const newNullifiers: SideEffectLinkedToNoteHash[] = newWorldState.newNullifiers.map(
    (nullifier, i) => new SideEffectLinkedToNoteHash(nullifier, Fr.zero(), new Fr(i + 1)),
  );
  const unencryptedLogs: UnencryptedFunctionL2Logs = new UnencryptedFunctionL2Logs(
    newWorldState.newLogs.map(log => new UnencryptedL2Log(log.contractAddress, log.selector, log.data)),
  );
  const newL2ToL1Messages = newWorldState.newL1Messages.map(m => new L2ToL1Message(m.recipient, m.content));

  const returnValues = result.output;

  // TODO: Support nested executions.
  const nestedExecutions: PublicExecutionResult[] = [];
  // TODO keep track of side effect counters
  const startSideEffectCounter = Fr.ZERO;
  const endSideEffectCounter = Fr.ZERO;

  return {
    execution,
    nullifierReadRequests,
    nullifierNonExistentReadRequests,
    newNoteHashes,
    newL2ToL1Messages,
    startSideEffectCounter,
    endSideEffectCounter,
    newNullifiers,
    contractStorageReads,
    contractStorageUpdateRequests,
    returnValues,
    nestedExecutions,
    unencryptedLogs,
    reverted: result.reverted,
    revertReason: result.revertReason ? createSimulationError(result.revertReason) : undefined,
  };
}

export function convertPublicExecutionResult(res: PublicExecutionResult): AvmContractCallResults {
  return new AvmContractCallResults(res.reverted, res.returnValues, res.revertReason);
}

export function adjustAvmContextFromPublicExecutionResult(ctx: AvmContext, result: PublicExecutionResult): void {
  for (const readRequest of result.contractStorageReads) {
    ctx.persistableState.trace.tracePublicStorageRead(
      ctx.environment.address,
      readRequest.storageSlot,
      readRequest.currentValue,
    );
  }

  for (const updateRequest of result.contractStorageUpdateRequests) {
    ctx.persistableState.trace.tracePublicStorageWrite(
      ctx.environment.address,
      updateRequest.storageSlot,
      updateRequest.newValue,
    );
  }

  for (const nullifier of result.newNullifiers) {
    ctx.persistableState.trace.traceNewNullifier(nullifier.noteHash, nullifier.counter);
  }

  for (const noteHash of result.newNoteHashes) {
    ctx.persistableState.trace.traceNewNoteHash(ctx.environment.address, noteHash.value);
  }

  for (const message of result.newL2ToL1Messages) {
    ctx.persistableState.newL1Messages.push(message);
  }

  for (const log of result.unencryptedLogs.logs) {
    ctx.persistableState.newLogs.push(new UnencryptedL2Log(log.contractAddress, log.selector, log.data));
  }
}

export function isAvmBytecode(bytecode: Buffer): boolean {
  const magicBuf = Buffer.from([
    Mov.opcode, // opcode
    0x00, // indirect
    ...Buffer.from('000018ca', 'hex'), // srcOffset
    ...Buffer.from('000018ca', 'hex'), // dstOffset
  ]);
  const magicSize = magicBuf.length;
  return bytecode.subarray(-magicSize).equals(magicBuf);
}
