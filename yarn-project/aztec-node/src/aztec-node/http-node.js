import { Fr, } from '@aztec/circuits.js';
import { createLogger } from '@aztec/foundation/log';
import { SiblingPath } from '@aztec/merkle-tree';
import { ContractData, ContractPublicData, L1ToL2Message, L2Block, L2BlockL2Logs, MerkleTreeId, Tx, } from '@aztec/types';
/**
 * A Http client based implementation of Aztec Node.
 */
export class HttpNode {
    constructor(baseUrl, log = createLogger('aztec:http-node')) {
        this.baseUrl = baseUrl.toString().replace(/\/$/, '');
        this.log = log;
    }
    /**
     * Method to determine if the node is ready to accept transactions.
     * @returns - Flag indicating the readiness for tx submission.
     */
    async isReady() {
        const url = new URL(this.baseUrl);
        const response = await fetch(url.toString());
        const respJson = await response.json();
        return respJson.isReady;
    }
    /**
     * Method to request blocks. Will attempt to return all requested blocks but will return only those available.
     * @param from - The start of the range of blocks to return.
     * @param take - The number of blocks desired.
     * @returns The blocks requested.
     */
    async getBlocks(from, take) {
        const url = new URL(`${this.baseUrl}/get-blocks`);
        url.searchParams.append('from', from.toString());
        if (take !== undefined) {
            url.searchParams.append('take', take.toString());
        }
        const response = await (await fetch(url.toString())).json();
        const blocks = response.blocks;
        if (!blocks) {
            return Promise.resolve([]);
        }
        return Promise.resolve(blocks.map(x => L2Block.decode(Buffer.from(x, 'hex'))));
    }
    /**
     * Method to fetch the current block height.
     * @returns The block height as a number.
     */
    async getBlockHeight() {
        const url = new URL(`${this.baseUrl}/get-block-height`);
        const response = await fetch(url.toString());
        const respJson = await response.json();
        return respJson.blockHeight;
    }
    /**
     * Method to fetch the version of the rollup the node is connected to.
     * @returns The rollup version.
     */
    async getVersion() {
        const url = new URL(`${this.baseUrl}/get-version`);
        const response = await fetch(url.toString());
        const respJson = await response.json();
        return respJson.version;
    }
    /**
     * Method to fetch the chain id of the base-layer for the rollup.
     * @returns The chain id.
     */
    async getChainId() {
        const url = new URL(`${this.baseUrl}/get-chain-id`);
        const response = await fetch(url.toString());
        const respJson = await response.json();
        return respJson.chainId;
    }
    /**
     * Lookup the L2 contract data for this contract.
     * Contains the ethereum portal address and bytecode.
     * @param contractAddress - The contract data address.
     * @returns The complete contract data including portal address & bytecode (if we didn't throw an error).
     */
    async getContractData(contractAddress) {
        const url = new URL(`${this.baseUrl}/contract-data`);
        url.searchParams.append('address', contractAddress.toString());
        const response = await (await fetch(url.toString())).json();
        if (!response || !response.contractData) {
            return undefined;
        }
        const contract = response.contractData;
        return Promise.resolve(ContractPublicData.fromBuffer(Buffer.from(contract, 'hex')));
    }
    /**
     * Gets the `take` amount of logs starting from `from`.
     * @param from - Number of the L2 block to which corresponds the first logs to be returned.
     * @param take - The number of logs to return.
     * @param logType - Specifies whether to return encrypted or unencrypted logs.
     * @returns The requested logs.
     */
    async getLogs(from, take, logType) {
        const url = new URL(`${this.baseUrl}/get-logs`);
        url.searchParams.append('from', from.toString());
        url.searchParams.append('take', take.toString());
        url.searchParams.append('logType', logType.toString());
        const response = await (await fetch(url.toString())).json();
        const logs = response.logs;
        if (!logs) {
            return Promise.resolve([]);
        }
        return Promise.resolve(logs.map(x => L2BlockL2Logs.fromBuffer(Buffer.from(x, 'hex'))));
    }
    /**
     * Lookup the L2 contract info for this contract.
     * Contains the ethereum portal address.
     * @param contractAddress - The contract data address.
     * @returns The contract's address & portal address.
     */
    async getContractInfo(contractAddress) {
        const url = new URL(`${this.baseUrl}/contract-info`);
        url.searchParams.append('address', contractAddress.toString());
        const response = await (await fetch(url.toString())).json();
        if (!response || !response.contractInfo) {
            return undefined;
        }
        const contract = response.contractInfo;
        return Promise.resolve(ContractData.fromBuffer(Buffer.from(contract, 'hex')));
    }
    /**
     * Method to submit a transaction to the p2p pool.
     * @param tx - The transaction to be submitted.
     */
    async sendTx(tx) {
        const url = new URL(`${this.baseUrl}/tx`);
        const init = {};
        init['method'] = 'POST';
        init['body'] = tx.toBuffer();
        await fetch(url, init);
    }
    /**
     * Method to retrieve pending txs.
     * @returns - The pending txs.
     */
    getPendingTxs() {
        return Promise.resolve([]);
    }
    /**
     * Method to retrieve a single pending tx.
     * @param txHash - The transaction hash to return.
     * @returns - The pending tx if it exists.
     */
    async getPendingTxByHash(txHash) {
        const url = new URL(`${this.baseUrl}/get-pending-tx`);
        url.searchParams.append('hash', txHash.toString());
        const response = await fetch(url.toString());
        if (response.status === 404) {
            this.log(`Tx ${txHash.toString()} not found`);
            return undefined;
        }
        const txBuffer = Buffer.from(await (await fetch(url.toString())).arrayBuffer());
        const tx = Tx.fromBuffer(txBuffer);
        return Promise.resolve(tx);
    }
    /**
     * Find the index of the given contract.
     * @param leafValue - The value to search for.
     * @returns The index of the given leaf in the contracts tree or undefined if not found.
     */
    async findContractIndex(leafValue) {
        const url = new URL(`${this.baseUrl}/contract-index`);
        url.searchParams.append('leaf', leafValue.toString('hex'));
        const response = await (await fetch(url.toString())).json();
        if (!response || !response.index) {
            return undefined;
        }
        const index = response.index;
        return Promise.resolve(BigInt(index));
    }
    /**
     * Returns the sibling path for the given index in the contract tree.
     * @param leafIndex - The index of the leaf for which the sibling path is required.
     * @returns The sibling path for the leaf index.
     */
    async getContractPath(leafIndex) {
        const url = new URL(`${this.baseUrl}/contract-path`);
        url.searchParams.append('leaf', leafIndex.toString());
        const response = await (await fetch(url.toString())).json();
        const path = response.path;
        return Promise.resolve(SiblingPath.fromString(path));
    }
    /**
     * Find the index of the given piece of data.
     * @param leafValue - The value to search for.
     * @returns The index of the given leaf in the data tree or undefined if not found.
     */
    async findCommitmentIndex(leafValue) {
        const url = new URL(`${this.baseUrl}/commitment-index`);
        url.searchParams.append('leaf', leafValue.toString('hex'));
        const response = await (await fetch(url.toString())).json();
        if (!response || !response.index) {
            return undefined;
        }
        const index = response.index;
        return Promise.resolve(BigInt(index));
    }
    /**
     * Returns the sibling path for the given index in the data tree.
     * @param leafIndex - The index of the leaf for which the sibling path is required.
     * @returns The sibling path for the leaf index.
     */
    async getDataTreePath(leafIndex) {
        const url = new URL(`${this.baseUrl}/data-path`);
        url.searchParams.append('leaf', leafIndex.toString());
        const response = await (await fetch(url.toString())).json();
        const path = response.path;
        return Promise.resolve(SiblingPath.fromString(path));
    }
    /**
     * Gets a consumed/confirmed L1 to L2 message for the given message key and its index in the merkle tree.
     * @param messageKey - The message key.
     * @returns the message (or throws if not found)
     */
    async getL1ToL2MessageAndIndex(messageKey) {
        const url = new URL(`${this.baseUrl}/l1-l2-message`);
        url.searchParams.append('messageKey', messageKey.toString());
        const response = await (await fetch(url.toString())).json();
        return Promise.resolve({
            message: L1ToL2Message.fromBuffer(Buffer.from(response.message, 'hex')),
            index: BigInt(response.index),
        });
    }
    /**
     * Returns the sibling path for a leaf in the committed l1 to l2 data tree.
     * @param leafIndex - Index of the leaf in the tree.
     * @returns The sibling path.
     */
    async getL1ToL2MessagesTreePath(leafIndex) {
        const url = new URL(`${this.baseUrl}/l1-l2-path`);
        url.searchParams.append('leaf', leafIndex.toString());
        const response = await (await fetch(url.toString())).json();
        const path = response.path;
        return Promise.resolve(SiblingPath.fromString(path));
    }
    /**
     * Gets the storage value at the given contract slot.
     * @param contract - Address of the contract to query.
     * @param slot - Slot to query.
     * @returns Storage value at the given contract slot (or undefined if not found).
     * Note: Aztec's version of `eth_getStorageAt`.
     */
    async getStorageAt(contract, slot) {
        const url = new URL(`${this.baseUrl}/storage-at`);
        url.searchParams.append('address', contract.toString());
        url.searchParams.append('slot', slot.toString());
        const response = await (await fetch(url.toString())).json();
        if (!response || !response.value) {
            return undefined;
        }
        const value = response.value;
        return Promise.resolve(Buffer.from(value, 'hex'));
    }
    /**
     * Returns the current committed roots for the data trees.
     * @returns The current committed roots for the data trees.
     */
    async getTreeRoots() {
        const url = new URL(`${this.baseUrl}/tree-roots`);
        const response = await (await fetch(url.toString())).json();
        const extractRoot = (treeId) => {
            // Buffer.from(...) returns an empty buffer when a hex string is prefixed with "0x"
            const rootHexString = response.roots[treeId].replace(/^0x/, '');
            return Fr.fromBuffer(Buffer.from(rootHexString, 'hex'));
        };
        return {
            [MerkleTreeId.CONTRACT_TREE]: extractRoot(MerkleTreeId.CONTRACT_TREE),
            [MerkleTreeId.PRIVATE_DATA_TREE]: extractRoot(MerkleTreeId.PRIVATE_DATA_TREE),
            [MerkleTreeId.NULLIFIER_TREE]: extractRoot(MerkleTreeId.NULLIFIER_TREE),
            [MerkleTreeId.PUBLIC_DATA_TREE]: extractRoot(MerkleTreeId.PUBLIC_DATA_TREE),
            [MerkleTreeId.L1_TO_L2_MESSAGES_TREE]: extractRoot(MerkleTreeId.L1_TO_L2_MESSAGES_TREE),
            [MerkleTreeId.L1_TO_L2_MESSAGES_ROOTS_TREE]: extractRoot(MerkleTreeId.L1_TO_L2_MESSAGES_ROOTS_TREE),
            [MerkleTreeId.CONTRACT_TREE_ROOTS_TREE]: extractRoot(MerkleTreeId.CONTRACT_TREE_ROOTS_TREE),
            [MerkleTreeId.PRIVATE_DATA_TREE_ROOTS_TREE]: extractRoot(MerkleTreeId.PRIVATE_DATA_TREE_ROOTS_TREE),
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaHR0cC1ub2RlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiaHR0cC1ub2RlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUNBLE9BQU8sRUFHTCxFQUFFLEdBR0gsTUFBTSxvQkFBb0IsQ0FBQztBQUM1QixPQUFPLEVBQVUsWUFBWSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDN0QsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ2pELE9BQU8sRUFDTCxZQUFZLEVBQ1osa0JBQWtCLEVBQ2xCLGFBQWEsRUFFYixPQUFPLEVBQ1AsYUFBYSxFQUViLFlBQVksRUFDWixFQUFFLEdBRUgsTUFBTSxjQUFjLENBQUM7QUFFdEI7O0dBRUc7QUFDSCxNQUFNLE9BQU8sUUFBUTtJQUluQixZQUFZLE9BQWUsRUFBRSxHQUFHLEdBQUcsWUFBWSxDQUFDLGlCQUFpQixDQUFDO1FBQ2hFLElBQUksQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDLFFBQVEsRUFBRSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDckQsSUFBSSxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7SUFDakIsQ0FBQztJQUNEOzs7T0FHRztJQUNJLEtBQUssQ0FBQyxPQUFPO1FBQ2xCLE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNsQyxNQUFNLFFBQVEsR0FBRyxNQUFNLEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUM3QyxNQUFNLFFBQVEsR0FBRyxNQUFNLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUN2QyxPQUFPLFFBQVEsQ0FBQyxPQUFPLENBQUM7SUFDMUIsQ0FBQztJQUVEOzs7OztPQUtHO0lBQ0gsS0FBSyxDQUFDLFNBQVMsQ0FBQyxJQUFZLEVBQUUsSUFBWTtRQUN4QyxNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLElB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