// A minimal version of the public processor - that does not have the fluff

import { MerkleTreeId, PublicDataWrite, Tx, type TxValidator, type WorldStateSynchronizer } from "@aztec/circuit-types";
import { AztecAddress, Gas, getNonEmptyItems, type GlobalVariables, type Header, MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX, MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, NoteHash, type Nullifier, NULLIFIER_SUBTREE_HEIGHT, PUBLIC_DATA_SUBTREE_HEIGHT, PublicDataTreeLeaf, PublicDataUpdateRequest, type ScopedNoteHash, type ScopedNullifier } from "@aztec/circuits.js";
import { type MerkleTreeOperations } from "@aztec/world-state";
import { WorldStateDB } from "./public_db_sources.js";
import { PublicExecutor } from "./executor.js";
import { type TelemetryClient } from "@aztec/telemetry-client";
import { type PublicExecutionResult } from "./execution.js";
import { type ContractDataSource } from "@aztec/types/contracts";
import { padArrayEnd } from "@aztec/foundation/collection";
import { Fr } from "@aztec/foundation/fields";
import { siloNoteHash, siloNullifier } from "@aztec/circuits.js/hash";
import { buffer } from "stream/consumers";
import { makeTuple } from "@aztec/foundation/array";
import { OrderedMap } from "@aztec/foundation/collection";


export class LightPublicProcessorFactory {
    constructor(
        private worldStateSynchronizer: WorldStateSynchronizer,
        private contractDataSource: ContractDataSource,
        private telemetryClient: TelemetryClient
    ) {}

    public async createWithSyncedState(
        targetBlockNumber: number,
        maybeHistoricalHeader: Header | undefined,
        globalVariables: GlobalVariables,
        txValidator: TxValidator
    ) {
        // Make sure the world state synchronizer is synced
        await this.worldStateSynchronizer.syncImmediate(targetBlockNumber);

        // We will sync again whenever the block is created this could be an inefficiency
        const merkleTrees = await this.worldStateSynchronizer.ephemeralFork();
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

export type NewStateUpdates = {
    nullifiers: Fr[];
    noteHashes: Fr[];
    publicDataWrites: PublicDataUpdateRequest[];
}

/**
 * A variant of the public processor that does not run the kernel circuits
 *
 * TODO(make issues):
 * - Gas accounting is not complete - https://github.com/AztecProtocol/aztec-packages/issues/8962
 * - Calculating the state root (archive) is not complete - https://github.com/AztecProtocol/aztec-packages/issues/8961
 */
export class LightPublicProcessor {

    public publicExecutor: PublicExecutor;

    // State
    // TODO(md): not used
    private blockGasLeft: Gas;
    private pendingNullifiers: Nullifier[];

    constructor(
        private merkleTrees: MerkleTreeOperations,
        private worldStateDB: WorldStateDB,
        private globalVariables: GlobalVariables,
        private historicalHeader: Header,
        private txValidator: TxValidator,
        private telemetryClient: TelemetryClient
    ) {
        this.publicExecutor = new PublicExecutor(worldStateDB, historicalHeader, telemetryClient);

        // TODO: this will be the total gas limit available for a block
        this.blockGasLeft = Gas.empty();
        this.pendingNullifiers = [];
    }

    addNullifiers(nullifiers: Nullifier[]) {
        this.pendingNullifiers.push(...nullifiers);
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

    /**
     * Process a list of transactions
     *
     * If any of the transactions are invalid, then we throw an error
     * @param txs - The transactions to process
     */
    public async process(txs: Tx[]) {
        // TODO(md): do we need dummy transactions?
        txs = txs.map(tx => Tx.clone(tx));

        this.validateTransactions(txs);

        for (const tx of txs) {
            if (tx.hasPublicCalls()) {
                await this.executeEnqueuedCallsAndApplyStateUpdates(tx);
            } else {
                await this.applyPrivateStateUpdates(tx);

                // TODO(md): do i need to do this?
                // Apply empty public data writes
                const emptyPublicDataWrites = makeTuple(MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, () => PublicDataTreeLeaf.empty());
                await this.merkleTrees.batchInsert(MerkleTreeId.PUBLIC_DATA_TREE, emptyPublicDataWrites.map(x => x.toBuffer()), PUBLIC_DATA_SUBTREE_HEIGHT);
            }
        }

    }

    validateTransactions(txs: Tx[]) {
        // TODO: Run tx validator checks
        // const [_, invalidTxs] = await this.txValidator.validateTxs(txs);

        // TODO(md): check the last valid block number is close

        // If any of the transactions are invalid, we throw an error
        // if (invalidTxs.length > 0) {
        //     console.log("invalid txs found");
        //     throw new InvalidTransactionsFound();
    }


    async executeEnqueuedCallsAndApplyStateUpdates(tx: Tx) {
        const publicExecutionResults = await this.executePublicCalls(tx);

        // The transaction has reverted in setup - the block should fail
        if (!publicExecutionResults) {
            throw new Error("Reverted in setup");
        }

        if (tx.data.forPublic) {
            const stateUpdates = this.accumulateTransactionAndExecutedStateUpdates(tx, publicExecutionResults);
            await this.writeStateUpdates(stateUpdates);
        } else {
            throw new Error("Public transaction did have public data");
        }
    }

    /**
     * Take the state updates from each of the transactions and merge them together
     *
     * 1. Non Revertible calls come first
     * 2. Private updates come second
     * 3. Public updates come third
     */
    accumulateTransactionAndExecutedStateUpdates(tx: Tx, publicExecutionResults: NewStateUpdates) {
        const {nullifiers, noteHashes, publicDataWrites} = publicExecutionResults;
        const {nullifiers: nonRevertibleNullifiers, noteHashes: nonRevertibleNoteHashes, publicDataUpdateRequests: nonRevertiblePublicDataUpdateRequests} = tx.data.forPublic!.endNonRevertibleData;
        const {nullifiers: txNullifiers, noteHashes: txNoteHashes, publicDataUpdateRequests: txPublicDataUpdateRequests} = tx.data.forPublic!.end;

        const nonEmptyNonRevertibleNullifiers = getNonEmptyItems(nonRevertibleNullifiers).map(n => n.value);
        const nonEmptyTxNullifiers = getNonEmptyItems(txNullifiers).map(n => n.value);
        const publicNullifiers = getNonEmptyItems(nullifiers);

        const nonEmptyNonRevertibleNoteHashes = getNonEmptyItems(nonRevertibleNoteHashes).map(n => n.value);
        const nonEmptyTxNoteHashes = getNonEmptyItems(txNoteHashes).map(n => n.value);
        const publicNoteHashes = getNonEmptyItems(noteHashes);

        const nonEmptyTxPublicDataUpdateRequests = txPublicDataUpdateRequests.filter(p => !p.isEmpty());
        const nonEmptyNonRevertiblePublicDataUpdateRequests = nonRevertiblePublicDataUpdateRequests.filter(p => !p.isEmpty());
        const nonEmptyPublicDataWrites = publicDataWrites.filter(p => !p.isEmpty());

        const allNullifiers = padArrayEnd([...nonEmptyNonRevertibleNullifiers, ...nonEmptyTxNullifiers, ...publicNullifiers], Fr.ZERO, MAX_NULLIFIERS_PER_TX);
        const allNoteHashes = padArrayEnd([...nonEmptyNonRevertibleNoteHashes, ...nonEmptyTxNoteHashes, ...publicNoteHashes], Fr.ZERO, MAX_NOTE_HASHES_PER_TX);
        const allPublicDataUpdateRequests = [...nonEmptyNonRevertiblePublicDataUpdateRequests, ...nonEmptyTxPublicDataUpdateRequests, ...nonEmptyPublicDataWrites];

        return {
            nullifiers: allNullifiers,
            noteHashes: allNoteHashes,
            publicDataWrites: allPublicDataUpdateRequests
        }
    }

    async writeStateUpdates(stateUpdates: NewStateUpdates) {
        const {nullifiers, noteHashes, publicDataWrites} = stateUpdates;

        // Convert public state toto the tree leaves
        const allPublicDataWrites = publicDataWrites.map(
            ({ leafSlot, newValue }) => new PublicDataTreeLeaf(leafSlot, newValue),
        );

        await this.merkleTrees.appendLeaves(MerkleTreeId.NOTE_HASH_TREE, noteHashes);
        await this.merkleTrees.batchInsert(MerkleTreeId.NULLIFIER_TREE, nullifiers.map(n => n.toBuffer()), NULLIFIER_SUBTREE_HEIGHT);
        await this.merkleTrees.batchInsert(MerkleTreeId.PUBLIC_DATA_TREE, allPublicDataWrites.map(x => x.toBuffer()), PUBLIC_DATA_SUBTREE_HEIGHT);
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

        // TODO(md): gas
        const transactionGas = tx.data.constants.txContext.gasSettings.getLimits();

        // Store the successful results for db insertions
        const nonRevertiblePublicExecutionResults: PublicExecutionResult[] = [];
        const publicExecutionResults: PublicExecutionResult[] = [];

        const publicKernelOutput = tx.data.toPublicKernelCircuitPublicInputs();
        let startSideEffectCounter = publicKernelOutput.endSideEffectCounter + 1;

        // Execute the non revertible calls
        for (const call of nonRevertibleCalls) {
            const res = await this.publicExecutor.simulate(call, this.globalVariables, transactionGas, tx.data.constants.txContext, this.pendingNullifiers, Fr.ZERO, startSideEffectCounter);
            startSideEffectCounter = Number(res.endSideEffectCounter.toBigInt()) + 1;

            if (!this.temporaryDidCallOrNestedCallRevert(res)) {
                this.addNullifiers(res.nullifiers);
                nonRevertiblePublicExecutionResults.push(res);
                this.worldStateDB.checkpoint();
            } else {
                await this.worldStateDB.removeNewContracts(tx);
                await this.worldStateDB.rollbackToCommit();

                // TODO: When this part fails, we want skip to some cleanup part
                // This probably explains the interesting control flow
                return;
            }
        }

        for (const call of publicCalls) {
            // Execute the non revertible calls
            const res = await this.publicExecutor.simulate(call, this.globalVariables, transactionGas, tx.data.constants.txContext, this.pendingNullifiers, Fr.ZERO, startSideEffectCounter);
            startSideEffectCounter = Number(res.endSideEffectCounter.toBigInt()) + 1;

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
            const res = await this.publicExecutor.simulate(teardownCall, this.globalVariables, transactionGas, tx.data.constants.txContext, this.pendingNullifiers, Fr.ZERO, startSideEffectCounter);

            if (!this.temporaryDidCallOrNestedCallRevert(res)) {
                this.addNullifiers(res.nullifiers);
                publicExecutionResults.push(res);
            } else {
                // Similarly, if a public calls fail, it will revert
                // back to the setup state
                await this.worldStateDB.removeNewContracts(tx);
                await this.worldStateDB.rollbackToCheckpoint();
            }
        }

        await this.worldStateDB.commit();

        return this.aggregateResults(nonRevertiblePublicExecutionResults, publicExecutionResults);
    }

    // TODO: dont think splitting these up actually matters
    aggregateResults(nonRevertibleResults: PublicExecutionResult[], revertibleResults: PublicExecutionResult[]) {
        const nonRevertibleNestedExecutions = nonRevertibleResults.flatMap(res => this.collectNestedExecutions(res));
        const nonRevertible =  this.aggregatePublicExecutionResults(nonRevertibleNestedExecutions);

        const revertibleNestedExecutions = revertibleResults.flatMap(res => this.collectNestedExecutions(res));
        const revertible = this.aggregatePublicExecutionResults(revertibleNestedExecutions);

        return {
            nullifiers: [...nonRevertible.nullifiers, ...revertible.nullifiers],
            noteHashes: [...nonRevertible.newNoteHashes, ...revertible.newNoteHashes],
            publicDataWrites: [...nonRevertible.publicDataWrites, ...revertible.publicDataWrites]
        }
    }

    // This is just getting the private state updates after executing them
    // TODO(md): think about these
    aggregatePublicExecutionResults(results: PublicExecutionResult[]) {
        const txCallNewNullifiers: ScopedNullifier[][] = [];
        const txCallNewNoteHashes: ScopedNoteHash[][] = [];
        const txCallPublicDataWrites: PublicDataUpdateRequest[][] = [];

        for (const res of results) {
            const enqueuedCallNewNullifiers = [];
            const enqueuedCallNewNoteHashes = [];
            let enqueuedCallPublicDataWrites = [];

            // Scope the nullifiers, note hashes and public data writes to the contract address
            enqueuedCallNewNullifiers.push(...getNonEmptyItems(res.nullifiers).map(n => n.scope(res.executionRequest.contractAddress)));
            enqueuedCallNewNoteHashes.push(...getNonEmptyItems(res.noteHashes).map(n => n.scope(res.executionRequest.contractAddress)));
            enqueuedCallPublicDataWrites.push(...getNonEmptyItems(res.contractStorageUpdateRequests).map(req => PublicDataUpdateRequest.fromContractStorageUpdateRequest(res.executionRequest.contractAddress, req)));

            txCallNewNullifiers.push(enqueuedCallNewNullifiers);
            txCallNewNoteHashes.push(enqueuedCallNewNoteHashes);
            txCallPublicDataWrites.push(enqueuedCallPublicDataWrites);
        }

        // Reverse
        let newNullifiers = txCallNewNullifiers.flat();
        let newNoteHashes = txCallNewNoteHashes.flat();
        const newPublicDataWrites = txCallPublicDataWrites.flat();

        // Squash data writes
        let uniquePublicDataWrites = this.removeDuplicatesFromStart(newPublicDataWrites);

        const returning =  {
            nullifiers: newNullifiers.map(n => siloNullifier(n.contractAddress, n.value)),
            newNoteHashes: newNoteHashes.map(n => siloNoteHash(n.contractAddress, n.value)),
            publicDataWrites: uniquePublicDataWrites
        };
        return returning;
    }

    collectNestedExecutions(result: PublicExecutionResult) {
        const nestedExecutions: PublicExecutionResult[] = [];
        for (const res of result.nestedExecutions) {
            nestedExecutions.push(...this.collectNestedExecutions(res));
        }
        return [result, ...nestedExecutions];
    }



    // There is an assumption based on how the block builder works, that the transactions
    // provided here CANNOT revert, else they are not added to the block as the kernels
    // will fail
    // This will change whenever the vm is changed to be able to revert
    public async applyPrivateStateUpdates(tx: Tx) {
        const insertionPromises: Promise<any>[] = [];
        if (tx.data.forRollup) {
            const {nullifiers, noteHashes} = tx.data.forRollup.end;
            if (nullifiers) {
                insertionPromises.push(this.merkleTrees.batchInsert(MerkleTreeId.NULLIFIER_TREE, nullifiers.map(n => n.toBuffer()), NULLIFIER_SUBTREE_HEIGHT));
            }

            if (noteHashes) {
                insertionPromises.push(this.merkleTrees.appendLeaves(MerkleTreeId.NOTE_HASH_TREE, noteHashes));
            }
        }

        await Promise.all(insertionPromises);
    }

    /**
     * Remove duplicates keeping the oldest item, where duplicates are defined by the leaf slot and side effect counter
     * @param items
     * @returns
     */
    removeDuplicatesFromStart(items: PublicDataUpdateRequest[]) {
        const slotMap: OrderedMap<bigint, PublicDataUpdateRequest> = new OrderedMap();

        for (const obj of items) {
          const { leafSlot, sideEffectCounter } = obj;

          if (!slotMap.has(leafSlot.toBigInt())) {
            slotMap.set(leafSlot.toBigInt(), obj);
          }
          if (sideEffectCounter > slotMap.get(leafSlot.toBigInt())!.sideEffectCounter) {
            // Remove the first instance
            slotMap.delete(leafSlot.toBigInt());
            slotMap.set(leafSlot.toBigInt(), obj);
          }
        }

        return Array.from(slotMap.values());
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
