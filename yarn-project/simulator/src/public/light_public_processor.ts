// A minimal version of the public processor - that does not have the fluff

import { MerkleTreeId, PublicDataWrite, Tx, TxValidator, WorldStateSynchronizer } from "@aztec/circuit-types";
import { AztecAddress, Gas, getNonEmptyItems, GlobalVariables, Header, MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX, MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, NoteHash, Nullifier, NULLIFIER_SUBTREE_HEIGHT, PUBLIC_DATA_SUBTREE_HEIGHT, PublicDataTreeLeaf, PublicDataUpdateRequest, ScopedNullifier } from "@aztec/circuits.js";
import { MerkleTreeOperations } from "@aztec/world-state";
import { WorldStateDB } from "./public_db_sources.js";
import { PublicExecutor } from "./executor.js";
import { TelemetryClient } from "@aztec/telemetry-client";
import { PublicExecutionResult } from "./execution.js";
import { ContractDataSource } from "@aztec/types/contracts";
import { padArrayEnd } from "@aztec/foundation/collection";
import { Fr } from "@aztec/foundation/fields";
import { siloNoteHash, siloNullifier } from "@aztec/circuits.js/hash";
import { buffer } from "stream/consumers";
import { makeTuple } from "@aztec/foundation/array";

export class LightPublicProcessorFactory {
    constructor(
        private worldStateSynchronizer: WorldStateSynchronizer,
        private contractDataSource: ContractDataSource,
        private telemetryClient: TelemetryClient
    ) {}

    // TODO: using the same interface as the orther public processor factory
    // But can probably do alot better here in debt cleanup
    public async createWithSyncedState(
        targetBlockNumber: number,
        maybeHistoricalHeader: Header | undefined,
        globalVariables: GlobalVariables,
        txValidator: TxValidator
    ) {
        // TODO: should this be here?
        // TODO: is this safe?
        // Make sure the world state synchronizer is synced
        await this.worldStateSynchronizer.syncImmediate(targetBlockNumber);

        const merkleTrees = await this.worldStateSynchronizer.ephemeralFork();

        // TODO(md): we need to first make sure that we are synced
        const historicalHeader = maybeHistoricalHeader ?? merkleTrees.getInitialHeader();
        const worldStateDB = new WorldStateDB(merkleTrees, this.contractDataSource);

        return new LightPublicProcessor(merkleTrees, worldStateDB, globalVariables, historicalHeader, txValidator, this.telemetryClient);
    }
}


export class InvalidTransactionsFound extends Error {
    constructor() {
        super("Double spend tx found");
    }
}

/**
 * A variant of the public processor that does not run the kernel circuits
 */
export class LightPublicProcessor {

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
        private txValidator: TxValidator,
        private telemetryClient: TelemetryClient
    ) {
        this.publicExecutor = new PublicExecutor(worldStateDB, historicalHeader, telemetryClient);

        // TODO: this will be the total gas limit available for a block
        this.blockGasLeft = Gas.empty();
        this.pendingNullifiers = [];

    }

    // NOTE: does not have the archive
    public async getTreeSnapshots() {
        return Promise.all([
            this.merkleTrees.getTreeInfo(MerkleTreeId.NULLIFIER_TREE),
            this.merkleTrees.getTreeInfo(MerkleTreeId.NOTE_HASH_TREE),
            this.merkleTrees.getTreeInfo(MerkleTreeId.PUBLIC_DATA_TREE),
            this.merkleTrees.getTreeInfo(MerkleTreeId.L1_TO_L2_MESSAGE_TREE),
        ]);
    }

    // Execution invariants
    // If any of the public calls are invalid, then we need to roll them back
    public async process(txs: Tx[]) {
        // TODO(md): Note these will need to padded to a power of 2
        txs = txs.map(tx => Tx.clone(tx));

        // TODO: maybe there is some extra validation to make sure that we do not overrun
        // the checks that the kernel should have been doing?
        // If not we add them to the vm execution
        console.log("validating txs");
        // TODO(md): skiping tx validation for now as validator is not well defined
        // const [_, invalidTxs] = await this.txValidator.validateTxs(txs);

        // // If any of the transactions are invalid, we throw an error
        // if (invalidTxs.length > 0) {
        //     console.log("invalid txs found");
        //     throw new InvalidTransactionsFound();
        // }
        for (const tx of txs) {
            if (tx.hasPublicCalls()) {
                const publicExecutionResults = await this.executePublicCalls(tx);
                    // TODO: handle this
                if (!publicExecutionResults) {
                    throw new Error("Public execution results are undefined");
                }

                // TODO: throw if this is not defined
                if (tx.data.forPublic) {
                    // tODO: put this in a function
                    const {nullifiers, newNoteHashes, publicDataWrites} = publicExecutionResults;
                    const {nullifiers: nonRevertibleNullifiers, noteHashes: nonRevertibleNoteHashes, publicDataUpdateRequests: nonRevertiblePublicDataUpdateRequests} = tx.data.forPublic!.endNonRevertibleData;
                    const {nullifiers: txNullifiers, noteHashes: txNoteHashes, publicDataUpdateRequests: txPublicDataUpdateRequests} = tx.data.forPublic!.end;

                    const nonEmptyTxNullifiers = getNonEmptyItems(txNullifiers).map(n => n.value);
                    const nonEmptyNonRevertibleNullifiers = getNonEmptyItems(nonRevertibleNullifiers).map(n => n.value);
                    const publicNullifiers = nullifiers.map(n => siloNullifier(n.contractAddress, n.value));

                    const nonEmptyTxNoteHashes = getNonEmptyItems(txNoteHashes).map(n => siloNoteHash(n.contractAddress, n.noteHash.value));
                    const nonEmptyNonRevertibleNoteHashes = getNonEmptyItems(nonRevertibleNoteHashes).map(n => siloNoteHash(n.contractAddress, n.noteHash.value));
                    const publicNoteHashes = newNoteHashes.map(n => n.value);

                    const nonEmptyTxPublicDataUpdateRequests = txPublicDataUpdateRequests.filter(p => !p.isEmpty());
                    const nonEmptyNonRevertiblePublicDataUpdateRequests = nonRevertiblePublicDataUpdateRequests.filter(p => !p.isEmpty());
                    const nonEmptyPublicDataWrites = publicDataWrites.filter(p => !p.isEmpty());

                    const allNullifiers = padArrayEnd([...nonEmptyNonRevertibleNullifiers, ...nonEmptyTxNullifiers, ...publicNullifiers], Fr.ZERO, MAX_NULLIFIERS_PER_TX).map(n => n.toBuffer());
                    const allNoteHashes = padArrayEnd([...nonEmptyNonRevertibleNoteHashes, ...nonEmptyTxNoteHashes, ...publicNoteHashes], Fr.ZERO, MAX_NOTE_HASHES_PER_TX);
                    const allPublicDataUpdateRequests = padArrayEnd([...nonEmptyNonRevertiblePublicDataUpdateRequests, ...nonEmptyTxPublicDataUpdateRequests, ...nonEmptyPublicDataWrites], PublicDataUpdateRequest.empty(), MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX);

                    // TODO: refactor this
                    const allPublicDataWrites = allPublicDataUpdateRequests.map(
                        ({ leafSlot, newValue }) => new PublicDataTreeLeaf(leafSlot, newValue),
                    );

                    // TODO: i think im going to need to silo these
                    await this.merkleTrees.appendLeaves(MerkleTreeId.NOTE_HASH_TREE, allNoteHashes);
                    await this.merkleTrees.batchInsert(MerkleTreeId.NULLIFIER_TREE, allNullifiers, NULLIFIER_SUBTREE_HEIGHT);

                    console.log("number of public data writes", allPublicDataWrites.length);
                    console.log("all public data writes", getNonEmptyItems(allPublicDataWrites));
                    const beingWritten = allPublicDataWrites.map(x => x.toBuffer());
                    await this.merkleTrees.batchInsert(MerkleTreeId.PUBLIC_DATA_TREE, beingWritten, PUBLIC_DATA_SUBTREE_HEIGHT);

                }
            } else {
                // console.log("root before", await this.merkleTrees.getTreeInfo(MerkleTreeId.NULLIFIER_TREE));
                await this.applyPrivateStateUpdates(tx);

                // Apply empty public data writes
                console.log("applying empty public data writes");
                const emptyPublicDataWrites = makeTuple(MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, () => PublicDataTreeLeaf.empty());
                await this.merkleTrees.batchInsert(MerkleTreeId.PUBLIC_DATA_TREE, emptyPublicDataWrites.map(x => x.toBuffer()), PUBLIC_DATA_SUBTREE_HEIGHT);
                // console.log("root after", await this.merkleTrees.getTreeInfo(MerkleTreeId.NULLIFIER_TREE));
                // console.log("applied private state updates");
            }
        }

    }

    // Ok: this is going to be done in the larger light block builder????
    // Theres no point in doing it here
    // If the public part fails, then we need to rollback the trees here
    // Can the public part use commitments that have just been created?

    // There is an assumption based on how the block builder works, that the transactions
    // provided here CANNOT revert, else they are not added to the block as the kernels
    // will fail
    // This will change whenever the vm is changed to be able to revert
    public async applyPrivateStateUpdates(tx: Tx) {
        // TODO(md): do the last block number check???

        // TODO: read this from forPublic or forRollup???
        // We could probably run this after if the tx reverts
        // Does the rollup currently insert reverted transactions??
        let insertionPromises: Promise<any>[] = [];
        if (tx.data.forRollup) {
            // TODO: do we insert all or just non empty??
            const {nullifiers, noteHashes} = tx.data.forRollup.end;
            if (nullifiers) {
                // TODO: note this returns a few things for the circuits to use
                insertionPromises.push(this.merkleTrees.batchInsert(MerkleTreeId.NULLIFIER_TREE, nullifiers.map(n => n.toBuffer()), NULLIFIER_SUBTREE_HEIGHT));
            }

            if (noteHashes) {
                insertionPromises.push(this.merkleTrees.appendLeaves(MerkleTreeId.NOTE_HASH_TREE, noteHashes));
            }
        }

        await Promise.all(insertionPromises);
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
        await this.worldStateDB.addNewContracts(tx);

        const nonRevertibleCalls = tx.getNonRevertiblePublicExecutionRequests();
        const publicCalls = tx.getRevertiblePublicExecutionRequests();
        const teardownCall = tx.getPublicTeardownExecutionRequest()!;

        // TODO(md): use exceptions to manage differing control flow of reverts

        // TODO: there is some other stuff done in the public processor
        // rationalise it and find out where else it can be done
        const transactionGas = tx.data.constants.txContext.gasSettings.getLimits();

        // Store the successful results for db insertions
        // TODO: do we write the new state updates inbetween the calls?
        const publicExecutionResults: PublicExecutionResult[] = [];

        // TODO: Check is trnasaction gas updated where it should?

        // Execute the non revertible calls

        for (const call of nonRevertibleCalls) {
            const res = await this.publicExecutor.simulate(call, this.globalVariables, transactionGas, tx.data.constants.txContext, this.pendingNullifiers);

            if (!this.temporaryDidCallOrNestedCallRevert(res)) {
                console.log("non revertible call succeeded");
                this.addNullifiers(res.nullifiers);
                publicExecutionResults.push(res);
                this.worldStateDB.checkpoint();
            } else {
                console.log("non revertible call or nested call failed");
                await this.worldStateDB.removeNewContracts(tx);
                await this.worldStateDB.rollbackToCommit();

                // TODO: When this part fails, we want skip to some cleanup part
                // This probably explains the interesting control flow
                return;
            }
        }

        for (const call of publicCalls) {
            // Execute the non revertible calls
            const res = await this.publicExecutor.simulate(call, this.globalVariables, transactionGas, tx.data.constants.txContext, this.pendingNullifiers);

            // TODO: tidy this up and below
            if (!this.temporaryDidCallOrNestedCallRevert(res)) {
                this.addNullifiers(res.nullifiers);
                publicExecutionResults.push(res);
            } else {
                // Similarly, if a teardown call fails, it will revert
                // back to the setup state
                await this.worldStateDB.removeNewContracts(tx);
                await this.worldStateDB.rollbackToCheckpoint();
            }
        }

        if (teardownCall) {
            const res = await this.publicExecutor.simulate(teardownCall, this.globalVariables, transactionGas, tx.data.constants.txContext, this.pendingNullifiers);

            if (!this.temporaryDidCallOrNestedCallRevert(res)) {
                this.addNullifiers(res.nullifiers);
                publicExecutionResults.push(res);
            } else {
                // Similarly, if a teardown call fails, it will revert
                // back to the setup state
                await this.worldStateDB.removeNewContracts(tx);
                await this.worldStateDB.rollbackToCheckpoint();
            }
        }

        // TODO(md): think about bringing the journal model into this
        await this.worldStateDB.commit();

        // On success lower the block gas left -- add a check!!!
        this.blockGasLeft = this.blockGasLeft.sub(transactionGas);


        return this.aggregatePublicExecutionResults(publicExecutionResults);
    }

    // This is just getting the private state updates after executing them
    // TODO(md): think about these
    aggregatePublicExecutionResults(results: PublicExecutionResult[]) {
        let nullifiers: ScopedNullifier[] = [];
        let newNoteHashes: NoteHash[] = [];
        let publicDataWrites: PublicDataUpdateRequest[] = [];

        for (const res of results) {
            // TODO: I assume that these will need to be ordered by their side effect counter
            nullifiers.push(...getNonEmptyItems(res.nullifiers).map(n => n.scope(res.executionRequest.contractAddress)));
            newNoteHashes.push(...getNonEmptyItems(res.noteHashes));
            publicDataWrites.push(...getNonEmptyItems(res.contractStorageUpdateRequests).map(req => PublicDataUpdateRequest.fromContractStorageUpdateRequest(res.executionRequest.contractAddress, req)));

            // TODO: do for the nested executions
            // for (const nested of res.nestedExecutions) {
            //     nullifiers.push(...getNonEmptyItems(nested.nullifiers).map(n => n.scope(nested.executionRequest.contractAddress)));
            //     newNoteHashes.push(...getNonEmptyItems(nested.noteHashes));
            // publicDataWrites.push(...getNonEmptyItems(nested.contractStorageUpdateRequests).map(req => PublicDataUpdateRequest.fromContractStorageUpdateRequest(nested.executionRequest.contractAddress, req)));
            // }
        }


        const returning =  {
            nullifiers,
            newNoteHashes,
            publicDataWrites
        };
        console.log("after public execution new nullifiers", returning.nullifiers.filter(n => !n.isEmpty()).map(n => siloNullifier(n.contractAddress, n.value).toBuffer()));
        console.log("after public execution new note hashes", returning.newNoteHashes.filter(n => !n.isEmpty()).map(n => n.toBuffer()));
        return returning;
    }

    addNullifiers(nullifiers: Nullifier[]) {
        this.pendingNullifiers.push(...nullifiers);
    }

    async checkpointOrRollback(reverted: boolean): Promise<void> {
        if (reverted) {
            await this.worldStateDB.rollbackToCheckpoint();
        } else {
            await this.worldStateDB.checkpoint();
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
