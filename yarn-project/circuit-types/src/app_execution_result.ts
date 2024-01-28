import { PrivateCallStackItem, PublicCallRequest, ReadRequestMembershipWitness } from '@aztec/circuits.js';
import { FunctionL2Logs } from '@aztec/circuit-types';
import { ExecutionResult, NoteAndSlot, ACVMField } from './execution_result.js';

/**
 * The result of executing a private function.
 */
export class AppExecutionResult {
    constructor(
        /** The verification key. */
        public readonly vk: Buffer,
        /** The call stack item. */
        public readonly callStackItem: PrivateCallStackItem,
        /** The partially filled-in read request membership witnesses for commitments being read. */
        public readonly readRequestPartialWitnesses: ReadRequestMembershipWitness[],
        /** The notes created in the executed function. */
        public readonly newNotes: NoteAndSlot[],
        /** The nested executions. */
        public readonly nestedExecutions: AppExecutionResult[],
        /** Enqueued public function execution requests to be picked up by the sequencer. */
        public readonly enqueuedPublicFunctionCalls: PublicCallRequest[],
        /** Encrypted logs emitted during execution of this function call. */
        public readonly encryptedLogs: FunctionL2Logs,
        /** Unencrypted logs emitted during execution of this function call. */
        public readonly unencryptedLogs: FunctionL2Logs,
    ) { };

    /**
     * Convert an AppExecutionResult to an ExecutionResult usable by the Kernel Circuit Prover
     * @dev removes return values as this is intended to be used with functions that don't call other functions for now
     * @dev removes partial witnesses as these are confidential and not needed for kernel circuit proving
     * @dev removes nested executions as this is intended to be used with functions that don't call other functions for now
     * @dev acir and vkey should be maintained out of channel
     * 
     * @returns - partially mocked execution result (sufficient for Kernel Circuit Proving)
     */
    public toExecutionResult(): ExecutionResult {
        return {
            acir: Buffer.from([0x00]),
            vk: this.vk,
            partialWitness: new Map<number, ACVMField>(),
            callStackItem: this.callStackItem,
            readRequestPartialWitnesses: this.readRequestPartialWitnesses,
            newNotes: this.newNotes,
            returnValues: [],
            nestedExecutions: this.nestedExecutions.map(ne => ne.toExecutionResult()),
            enqueuedPublicFunctionCalls: this.enqueuedPublicFunctionCalls,
            encryptedLogs: this.encryptedLogs,
            unencryptedLogs: this.unencryptedLogs
        };
    }

    /**
     * Chops unnecessary data from ExecutionResult for use in state channel app circuit building
     * @dev see toExecutionResult for info on removed fields
     * 
     * @param result - the execution result to remove some fields from
     * @returns - the execution result with some fields removed (i.e. AppExecutionResult)
     */
    public static fromExecutionResult(result: ExecutionResult): AppExecutionResult {
        return new AppExecutionResult(
            result.vk,
            result.callStackItem,
            result.readRequestPartialWitnesses,
            result.newNotes,
            result.nestedExecutions.map(ne => AppExecutionResult.fromExecutionResult(ne)),
            result.enqueuedPublicFunctionCalls,
            result.encryptedLogs,
            result.unencryptedLogs
        );
    }

    public toJSON(): object {
        return {
            vk: this.vk.toString('hex'),
            callStackItem: this.callStackItem.toBuffer().toString('hex'),
            readRequestPartialWitnesses: this.readRequestPartialWitnesses.map(rr => rr.toBuffer().toString('hex')),
            newNotes: this.newNotes.map(nn => {
                return {
                    note: nn.note.toString(),
                    storageSlot: nn.storageSlot.toString(),
                }
            }),
            nestedExecutions: this.nestedExecutions.map(ne => ne.toJSON()),
            enqueuedPublicFunctionCalls: this.enqueuedPublicFunctionCalls.map(ec => ec.toBuffer().toString('hex')),
            encryptedLogs: this.encryptedLogs.toJSON(),
            unencryptedLogs: this.unencryptedLogs.toJSON(),
        }
    }

    public static fromJSON(obj: any): AppExecutionResult {
        return new AppExecutionResult(
            Buffer.from(obj.vk, 'hex'),
            PrivateCallStackItem.fromBuffer(Buffer.from(obj.callStackItem, 'hex')),
            obj.readRequestPartialWitnesses.map((rr: string) => ReadRequestMembershipWitness.fromBuffer(Buffer.from(rr, 'hex'))),
            obj.newNotes.map((nn: any) => {
                return {
                    note: nn.note.toString(),
                    storageSlot: nn.storageSlot.toString(),
                }
            }),
            obj.nestedExecutions.map((ne: any) => AppExecutionResult.fromJSON(ne)),
            obj.enqueuedPublicFunctionCalls.map((ec: string) => PublicCallRequest.fromBuffer(Buffer.from(ec, 'hex'))),
            FunctionL2Logs.fromJSON(obj.encryptedLogs),
            FunctionL2Logs.fromJSON(obj.unencryptedLogs),
        );

    }
}