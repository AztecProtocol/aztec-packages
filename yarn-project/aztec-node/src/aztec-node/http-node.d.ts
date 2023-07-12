/// <reference types="node" resolution-mode="require"/>
import { AztecNode } from '@aztec/aztec-node';
import { AztecAddress, CONTRACT_TREE_HEIGHT, Fr, L1_TO_L2_MSG_TREE_HEIGHT, PRIVATE_DATA_TREE_HEIGHT } from '@aztec/circuits.js';
import { Logger } from '@aztec/foundation/log';
import { SiblingPath } from '@aztec/merkle-tree';
import { ContractData, ContractPublicData, L1ToL2MessageAndIndex, L2Block, L2BlockL2Logs, LogType, MerkleTreeId, Tx, TxHash } from '@aztec/types';
/**
 * A Http client based implementation of Aztec Node.
 */
export declare class HttpNode implements AztecNode {
    private baseUrl;
    private log;
    constructor(baseUrl: string, log?: Logger);
    /**
     * Method to determine if the node is ready to accept transactions.
     * @returns - Flag indicating the readiness for tx submission.
     */
    isReady(): Promise<boolean>;
    /**
     * Method to request blocks. Will attempt to return all requested blocks but will return only those available.
     * @param from - The start of the range of blocks to return.
     * @param take - The number of blocks desired.
     * @returns The blocks requested.
     */
    getBlocks(from: number, take: number): Promise<L2Block[]>;
    /**
     * Method to fetch the current block height.
     * @returns The block height as a number.
     */
    getBlockHeight(): Promise<number>;
    /**
     * Method to fetch the version of the rollup the node is connected to.
     * @returns The rollup version.
     */
    getVersion(): Promise<number>;
    /**
     * Method to fetch the chain id of the base-layer for the rollup.
     * @returns The chain id.
     */
    getChainId(): Promise<number>;
    /**
     * Lookup the L2 contract data for this contract.
     * Contains the ethereum portal address and bytecode.
     * @param contractAddress - The contract data address.
     * @returns The complete contract data including portal address & bytecode (if we didn't throw an error).
     */
    getContractData(contractAddress: AztecAddress): Promise<ContractPublicData | undefined>;
    /**
     * Gets the `take` amount of logs starting from `from`.
     * @param from - Number of the L2 block to which corresponds the first logs to be returned.
     * @param take - The number of logs to return.
     * @param logType - Specifies whether to return encrypted or unencrypted logs.
     * @returns The requested logs.
     */
    getLogs(from: number, take: number, logType: LogType): Promise<L2BlockL2Logs[]>;
    /**
     * Lookup the L2 contract info for this contract.
     * Contains the ethereum portal address.
     * @param contractAddress - The contract data address.
     * @returns The contract's address & portal address.
     */
    getContractInfo(contractAddress: AztecAddress): Promise<ContractData | undefined>;
    /**
     * Method to submit a transaction to the p2p pool.
     * @param tx - The transaction to be submitted.
     */
    sendTx(tx: Tx): Promise<void>;
    /**
     * Method to retrieve pending txs.
     * @returns - The pending txs.
     */
    getPendingTxs(): Promise<Tx[]>;
    /**
     * Method to retrieve a single pending tx.
     * @param txHash - The transaction hash to return.
     * @returns - The pending tx if it exists.
     */
    getPendingTxByHash(txHash: TxHash): Promise<Tx | undefined>;
    /**
     * Find the index of the given contract.
     * @param leafValue - The value to search for.
     * @returns The index of the given leaf in the contracts tree or undefined if not found.
     */
    findContractIndex(leafValue: Buffer): Promise<bigint | undefined>;
    /**
     * Returns the sibling path for the given index in the contract tree.
     * @param leafIndex - The index of the leaf for which the sibling path is required.
     * @returns The sibling path for the leaf index.
     */
    getContractPath(leafIndex: bigint): Promise<SiblingPath<typeof CONTRACT_TREE_HEIGHT>>;
    /**
     * Find the index of the given piece of data.
     * @param leafValue - The value to search for.
     * @returns The index of the given leaf in the data tree or undefined if not found.
     */
    findCommitmentIndex(leafValue: Buffer): Promise<bigint | undefined>;
    /**
     * Returns the sibling path for the given index in the data tree.
     * @param leafIndex - The index of the leaf for which the sibling path is required.
     * @returns The sibling path for the leaf index.
     */
    getDataTreePath(leafIndex: bigint): Promise<SiblingPath<typeof PRIVATE_DATA_TREE_HEIGHT>>;
    /**
     * Gets a consumed/confirmed L1 to L2 message for the given message key and its index in the merkle tree.
     * @param messageKey - The message key.
     * @returns the message (or throws if not found)
     */
    getL1ToL2MessageAndIndex(messageKey: Fr): Promise<L1ToL2MessageAndIndex>;
    /**
     * Returns the sibling path for a leaf in the committed l1 to l2 data tree.
     * @param leafIndex - Index of the leaf in the tree.
     * @returns The sibling path.
     */
    getL1ToL2MessagesTreePath(leafIndex: bigint): Promise<SiblingPath<typeof L1_TO_L2_MSG_TREE_HEIGHT>>;
    /**
     * Gets the storage value at the given contract slot.
     * @param contract - Address of the contract to query.
     * @param slot - Slot to query.
     * @returns Storage value at the given contract slot (or undefined if not found).
     * Note: Aztec's version of `eth_getStorageAt`.
     */
    getStorageAt(contract: AztecAddress, slot: bigint): Promise<Buffer | undefined>;
    /**
     * Returns the current committed roots for the data trees.
     * @returns The current committed roots for the data trees.
     */
    getTreeRoots(): Promise<Record<MerkleTreeId, Fr>>;
}
//# sourceMappingURL=http-node.d.ts.map