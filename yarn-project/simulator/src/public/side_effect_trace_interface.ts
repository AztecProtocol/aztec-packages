import type { Fr } from '@aztec/foundation/fields';
import type { AvmNullifierReadTreeHint, AvmPublicDataReadTreeHint } from '@aztec/stdlib/avm';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractClassIdPreimage, SerializableContractInstance } from '@aztec/stdlib/contract';
import type { PublicCallRequest } from '@aztec/stdlib/kernel';
import type { PublicLog } from '@aztec/stdlib/logs';
import type { NullifierLeafPreimage, PublicDataTreeLeafPreimage } from '@aztec/stdlib/trees';

export interface PublicSideEffectTraceInterface {
  fork(): PublicSideEffectTraceInterface;
  merge(nestedTrace: PublicSideEffectTraceInterface, reverted?: boolean): void;
  getCounter(): number;
  // all "trace*" functions can throw SideEffectLimitReachedError
  tracePublicStorageRead(
    contractAddress: AztecAddress,
    slot: Fr,
    value: Fr,
    leafPreimage?: PublicDataTreeLeafPreimage,
    leafIndex?: Fr,
    path?: Fr[],
  ): void;
  tracePublicStorageWrite(
    contractAddress: AztecAddress,
    slot: Fr, // This is the storage slot not the computed leaf slot
    value: Fr,
    protocolWrite: boolean,
    lowLeafPreimage?: PublicDataTreeLeafPreimage,
    lowLeafIndex?: Fr,
    lowLeafPath?: Fr[],
    newLeafPreimage?: PublicDataTreeLeafPreimage,
    insertionPath?: Fr[],
  ): Promise<void>;
  traceNoteHashCheck(contractAddress: AztecAddress, noteHash: Fr, leafIndex: Fr, exists: boolean, path?: Fr[]): void;
  traceNewNoteHash(uniqueNoteHash: Fr, leafIndex?: Fr, path?: Fr[]): void;
  getNoteHashCount(): number;
  traceNullifierCheck(
    siloedNullifier: Fr,
    exists: boolean,
    lowLeafPreimage?: NullifierLeafPreimage,
    lowLeafIndex?: Fr,
    lowLeafPath?: Fr[],
  ): void;
  traceNewNullifier(
    siloedNullifier: Fr,
    lowLeafPreimage?: NullifierLeafPreimage,
    lowLeafIndex?: Fr,
    lowLeafPath?: Fr[],
    insertionPath?: Fr[],
  ): void;
  traceL1ToL2MessageCheck(
    contractAddress: AztecAddress,
    msgHash: Fr,
    msgLeafIndex: Fr,
    exists: boolean,
    path?: Fr[],
  ): void;
  traceNewL2ToL1Message(contractAddress: AztecAddress, recipient: Fr, content: Fr): void;
  tracePublicLog(contractAddress: AztecAddress, log: Fr[]): void;
  traceGetContractInstance(
    contractAddress: AztecAddress,
    exists: boolean,
    instance?: SerializableContractInstance,
    nullifierMembershipHint?: AvmNullifierReadTreeHint,
    updateMembershipHint?: AvmPublicDataReadTreeHint,
    updatePreimage?: Fr[],
  ): void;
  traceGetBytecode(
    contractAddress: AztecAddress,
    exists: boolean,
    bytecode?: Buffer,
    contractInstance?: SerializableContractInstance,
    contractClass?: ContractClassIdPreimage,
    nullifierMembershipHint?: AvmNullifierReadTreeHint,
    updateMembershipHint?: AvmPublicDataReadTreeHint,
    updatePreimage?: Fr[],
  ): void;
  traceEnqueuedCall(
    /** The call request from private that enqueued this call. */
    publicCallRequest: PublicCallRequest,
    /** The call's calldata */
    calldata: Fr[],
    /** Did the call revert? */
    reverted: boolean,
  ): void;
  getPublicLogs(): PublicLog[];
}
