import type { Fr } from '@aztec/foundation/fields';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { PublicCallRequest } from '@aztec/stdlib/kernel';
import type { PublicLog } from '@aztec/stdlib/logs';

export interface PublicSideEffectTraceInterface {
  fork(): PublicSideEffectTraceInterface;
  merge(nestedTrace: PublicSideEffectTraceInterface, reverted?: boolean): void;
  getCounter(): number;
  // all "trace*" functions can throw SideEffectLimitReachedError
  tracePublicStorageWrite(
    contractAddress: AztecAddress,
    slot: Fr, // This is the storage slot not the computed leaf slot
    value: Fr,
    protocolWrite: boolean,
  ): Promise<void>;
  traceNewNoteHash(uniqueNoteHash: Fr): void;
  getNoteHashCount(): number;
  traceNewNullifier(siloedNullifier: Fr): void;
  traceNewL2ToL1Message(contractAddress: AztecAddress, recipient: Fr, content: Fr): void;
  tracePublicLog(contractAddress: AztecAddress, log: Fr[]): void;
  traceGetContractClass(contractClassId: Fr, exists: boolean): void;
  traceEnqueuedCall(publicCallRequest: PublicCallRequest): void;
  getPublicLogs(): PublicLog[];
}
