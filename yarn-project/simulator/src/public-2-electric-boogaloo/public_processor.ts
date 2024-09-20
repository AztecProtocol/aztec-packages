// A minimal version of the public processor - that does not have the fluff

import { Tx } from "@aztec/circuit-types";
import { Gas, GlobalVariables, Header, Nullifier } from "@aztec/circuits.js";
import { ContractDataSource } from "@aztec/types/contracts";
import { MerkleTreeOperations } from "@aztec/world-state";
import { WorldStateDB } from "../public/public_db_sources.js";
import { PublicExecutor } from "../public/executor.js";
import { TelemetryClient } from "@aztec/telemetry-client";
import { PublicExecutionResult } from "../public/execution.js";
import { ResetSimulatedArtifacts } from "@aztec/noir-protocol-circuits-types";




export class PublicProcessor2 {

    public publicExecutor: PublicExecutor;


    // State
    private blockGasLeft: Gas;
    private pendingNullifiers: Nullifier[];

    constructor(
        private merkleTrees: MerkleTreeOperations,
        private worldStateDB: WorldStateDB,
        private globalVariables: GlobalVariables,
        // TODO(md): check if thies can be inferred
        private historicalHeader: Header,
        private telemetryClient: TelemetryClient
    ) {
        this.publicExecutor = new PublicExecutor(worldStateDB, historicalHeader, telemetryClient);

        // TODO: this will be the total gas limit available for a block
        this.blockGasLeft = Gas.empty();
        this.pendingNullifiers = [];

    }


    public async process(txs: Tx[]) {
        txs = txs.map(tx => Tx.clone(tx));

        // TODO: maybe there is some extra validation to make sure that we do not overrun
        // the checks that the kernel should have been doing?
        // If not we add them to the vm execution

        for (const tx of txs) {
            // We always apply the private part of a transaction
            await this.applyPrivateStateUpdates(tx);

            // If the transaction has public calls, we then apply the public state upates
            if (tx.hasPublicCalls()) {
                await this.executePublicCalls(tx);
            }
        }

    }

    public async applyPrivateStateUpdates(tx: Tx) {

    }

    // NOTES:
    // - gas accounting needs to be done here and

    // - maybe make another transaction context that stores the gas for a trnsactions

    public async executePublicCalls(tx: Tx) {
        // Transactions are split up into a number of parts
        // 1. Non revertible calls - these run with the public kernel setup
        //                         - This includes fee payment transactions
        // 2. Public Calls - These are the the noir code that are enqueued in the tx by the users
        //                 - This runs with the public kernel app logic
        // 3. Teardown Call - This is the public teardown call that does fee refunds
        //                  - This runs with the public kernel teardown
        const nonRevertibleCalls = tx.getNonRevertiblePublicExecutionRequests();
        const publicCalls = tx.getRevertiblePublicExecutionRequests();
        const teardownCall = tx.getPublicTeardownExecutionRequest()!;

        // TODO: there is some other stuff done in the public processor
        // rationalise it and find out where else it can be done
        const transactionGas = tx.data.constants.txContext.gasSettings.getLimits();

        // TODO: Check is trnasaction gas updated where it should?

        // Execute the non revertible calls
        for (const call of nonRevertibleCalls) {
            const res = await this.publicExecutor.simulate(call, this.globalVariables, transactionGas, tx.data.constants.txContext, this.pendingNullifiers);

            if (!this.temporaryDidCallOrNestedCallRevert(res)) {
                console.log("non revertible call succeeded");
                this.addNullifiers(res.nullifiers);
                this.worldStateDB.checkpoint();
            } else {
                console.log(" call or nested call failed");
                this.worldStateDB.rollbackToCommit();

                // TODO: When this part fails, we want skip to some cleanup part
                // This probably explains the interesting control flow
                return;
            }
        }

        console.log("not returning")
        for (const call of publicCalls) {
            // Execute the non revertible calls
            const res = await this.publicExecutor.simulate(call, this.globalVariables, transactionGas, tx.data.constants.txContext, this.pendingNullifiers);

            // TODO: tidy this up and below
            if (!this.temporaryDidCallOrNestedCallRevert(res)) {
                this.addNullifiers(res.nullifiers);
            } else {
                // Similarly, if a teardown call fails, it will revert
                // back to the setup state
                this.worldStateDB.rollbackToCheckpoint();
            }
        }

        if (teardownCall) {
            const res = await this.publicExecutor.simulate(teardownCall, this.globalVariables, transactionGas, tx.data.constants.txContext, this.pendingNullifiers);

            if (!this.temporaryDidCallOrNestedCallRevert(res)) {
                this.addNullifiers(res.nullifiers);
            } else {
                // Similarly, if a teardown call fails, it will revert
                // back to the setup state
                this.worldStateDB.rollbackToCheckpoint();
            }
        }

        // TODO(md): think about bringing the journal model into this
        this.worldStateDB.commit();

        // On success lower the block gas left -- add a check!!!
        this.blockGasLeft = this.blockGasLeft.sub(transactionGas);
    }

    addNullifiers(nullifiers: Nullifier[]) {
        this.pendingNullifiers.push(...nullifiers);
    }

    checkpointOrRollback(reverted: boolean) {
        if (reverted) {
            this.worldStateDB.rollbackToCheckpoint();
        } else {
            this.worldStateDB.checkpoint();
        }
    }

    // This is a temporary method, in our current kernel model,
    // nested calls will trigger an entire execution reversion
    // if any nested call reverts
    temporaryDidCallOrNestedCallRevert(result: PublicExecutionResult) {
        if (result.revertReason) {
            return true;
        }
        if (result.nestedExecutions.length > 0) {
            for (const nested of result.nestedExecutions) {
                if (this.temporaryDidCallOrNestedCallRevert(nested)) {
                    return true;
                }
            }
        }
        return false;
    }
}
