import {
  AztecAddress,
  CONTRACT_TREE_HEIGHT,
  Fr,
  L1_TO_L2_MSG_TREE_HEIGHT,
  PRIVATE_DATA_TREE_HEIGHT,
} from '@aztec/circuits.js';
import { DebugLogger, createDebugLogger } from '@aztec/foundation/log';
import {
  AztecNode,
  ContractData,
  ContractPublicData,
  L1ToL2Message,
  L1ToL2MessageAndIndex,
  L2Block,
  L2BlockL2Logs,
  LogType,
  MerkleTreeId,
  SiblingPath,
  Tx,
  TxHash,
} from '@aztec/types';

/**
 * A Http client based implementation of Aztec Node.
 */
export class HttpNode implements AztecNode {
  private baseUrl: string;
  private log: DebugLogger;

  constructor(baseUrl: string, log = createDebugLogger('aztec:http-node')) {
    this.baseUrl = baseUrl.toString().replace(/\/$/, '');
    this.log = log;
  }
  /**
   * Method to determine if the node is ready to accept transactions.
   * @returns - Flag indicating the readiness for tx submission.
   */
  public async isReady(): Promise<boolean> {
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
  async getBlocks(from: number, take: number): Promise<L2Block[]> {
    const url = new URL(`${this.baseUrl}/get-blocks`);
    url.searchParams.append('from', from.toString());
    if (take !== undefined) {
      url.searchParams.append('take', take.toString());
    }
    const response = await (await fetch(url.toString())).json();
    const blocks = response.blocks as string[];
    if (!blocks) {
      return Promise.resolve([]);
    }
    return Promise.resolve(blocks.map(x => L2Block.decode(Buffer.from(x, 'hex'))));
  }

  /**
   * Method to fetch the current block height.
   * @returns The block height as a number.
   */
  async getBlockHeight(): Promise<number> {
    const url = new URL(`${this.baseUrl}/get-block-height`);
    const response = await fetch(url.toString());
    const respJson = await response.json();
    return respJson.blockHeight;
  }

  /**
   * Method to fetch the version of the rollup the node is connected to.
   * @returns The rollup version.
   */
  public async getVersion(): Promise<number> {
    const url = new URL(`${this.baseUrl}/get-version`);
    const response = await fetch(url.toString());
    const respJson = await response.json();
    return respJson.version;
  }

  /**
   * Method to fetch the chain id of the base-layer for the rollup.
   * @returns The chain id.
   */
  public async getChainId(): Promise<number> {
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
  async getContractData(contractAddress: AztecAddress): Promise<ContractPublicData | undefined> {
    const url = new URL(`${this.baseUrl}/contract-data`);
    url.searchParams.append('address', contractAddress.toString());
    const response = await (await fetch(url.toString())).json();
    if (!response || !response.contractData) {
      return undefined;
    }
    const contract = response.contractData as string;
    return Promise.resolve(ContractPublicData.fromBuffer(Buffer.from(contract, 'hex')));
  }

  /**
   * Gets the `take` amount of logs starting from `from`.
   * @param from - Number of the L2 block to which corresponds the first logs to be returned.
   * @param take - The number of logs to return.
   * @param logType - Specifies whether to return encrypted or unencrypted logs.
   * @returns The requested logs.
   */
  public async getLogs(from: number, take: number, logType: LogType): Promise<L2BlockL2Logs[]> {
    const url = new URL(`${this.baseUrl}/get-logs`);

    url.searchParams.append('from', from.toString());
    url.searchParams.append('take', take.toString());
    url.searchParams.append('logType', logType.toString());

    const response = await (await fetch(url.toString())).json();
    const logs = response.logs as string[];

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
  async getContractInfo(contractAddress: AztecAddress): Promise<ContractData | undefined> {
    const url = new URL(`${this.baseUrl}/contract-info`);
    url.searchParams.append('address', contractAddress.toString());
    const response = await (await fetch(url.toString())).json();
    if (!response || !response.contractInfo) {
      return undefined;
    }
    const contract = response.contractInfo as string;
    return Promise.resolve(ContractData.fromBuffer(Buffer.from(contract, 'hex')));
  }

  /**
   * Method to submit a transaction to the p2p pool.
   * @param tx - The transaction to be submitted.
   */
  async sendTx(tx: Tx): Promise<void> {
    const url = new URL(`${this.baseUrl}/tx`);
    const init: RequestInit = {};
    init['method'] = 'POST';
    init['body'] = tx.toBuffer();
    await fetch(url, init);
  }

  /**
   * Method to retrieve pending txs.
   * @returns - The pending txs.
   */
  getPendingTxs(): Promise<Tx[]> {
    return Promise.resolve([]);
  }

  /**
   * Method to retrieve a single pending tx.
   * @param txHash - The transaction hash to return.
   * @returns - The pending tx if it exists.
   */
  async getPendingTxByHash(txHash: TxHash): Promise<Tx | undefined> {
    const url = new URL(`${this.baseUrl}/get-pending-tx`);
    url.searchParams.append('hash', txHash.toString());
    const response = await fetch(url.toString());
    if (response.status === 404) {
      this.log.info(`Tx ${txHash.toString()} not found`);
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
  async findContractIndex(leafValue: Buffer): Promise<bigint | undefined> {
    const url = new URL(`${this.baseUrl}/contract-index`);
    url.searchParams.append('leaf', leafValue.toString('hex'));
    const response = await (await fetch(url.toString())).json();
    if (!response || !response.index) {
      return undefined;
    }
    const index = response.index as string;
    return Promise.resolve(BigInt(index));
  }

  /**
   * Returns the sibling path for the given index in the contract tree.
   * @param leafIndex - The index of the leaf for which the sibling path is required.
   * @returns The sibling path for the leaf index.
   */
  async getContractPath(leafIndex: bigint): Promise<SiblingPath<typeof CONTRACT_TREE_HEIGHT>> {
    const url = new URL(`${this.baseUrl}/contract-path`);
    url.searchParams.append('leaf', leafIndex.toString());
    const response = await (await fetch(url.toString())).json();
    const path = response.path as string;
    return Promise.resolve(SiblingPath.fromString(path));
  }

  /**
   * Find the index of the given piece of data.
   * @param leafValue - The value to search for.
   * @returns The index of the given leaf in the data tree or undefined if not found.
   */
  async findCommitmentIndex(leafValue: Buffer): Promise<bigint | undefined> {
    const url = new URL(`${this.baseUrl}/commitment-index`);
    url.searchParams.append('leaf', leafValue.toString('hex'));
    const response = await (await fetch(url.toString())).json();
    if (!response || !response.index) {
      return undefined;
    }
    const index = response.index as string;
    return Promise.resolve(BigInt(index));
  }

  /**
   * Returns the sibling path for the given index in the data tree.
   * @param leafIndex - The index of the leaf for which the sibling path is required.
   * @returns The sibling path for the leaf index.
   */
  async getDataTreePath(leafIndex: bigint): Promise<SiblingPath<typeof PRIVATE_DATA_TREE_HEIGHT>> {
    const url = new URL(`${this.baseUrl}/data-path`);
    url.searchParams.append('leaf', leafIndex.toString());
    const response = await (await fetch(url.toString())).json();
    const path = response.path as string;
    return Promise.resolve(SiblingPath.fromString(path));
  }

  /**
   * Gets a consumed/confirmed L1 to L2 message for the given message key and its index in the merkle tree.
   * @param messageKey - The message key.
   * @returns the message (or throws if not found)
   */
  async getL1ToL2MessageAndIndex(messageKey: Fr): Promise<L1ToL2MessageAndIndex> {
    const url = new URL(`${this.baseUrl}/l1-l2-message`);
    url.searchParams.append('messageKey', messageKey.toString());
    const response = await (await fetch(url.toString())).json();
    return Promise.resolve({
      message: L1ToL2Message.fromBuffer(Buffer.from(response.message as string, 'hex')),
      index: BigInt(response.index as string),
    });
  }

  /**
   * Returns the sibling path for a leaf in the committed l1 to l2 data tree.
   * @param leafIndex - Index of the leaf in the tree.
   * @returns The sibling path.
   */
  async getL1ToL2MessagesTreePath(leafIndex: bigint): Promise<SiblingPath<typeof L1_TO_L2_MSG_TREE_HEIGHT>> {
    const url = new URL(`${this.baseUrl}/l1-l2-path`);
    url.searchParams.append('leaf', leafIndex.toString());
    const response = await (await fetch(url.toString())).json();
    const path = response.path as string;
    return Promise.resolve(SiblingPath.fromString(path));
  }

  /**
   * Gets the storage value at the given contract slot.
   * @param contract - Address of the contract to query.
   * @param slot - Slot to query.
   * @returns Storage value at the given contract slot (or undefined if not found).
   * Note: Aztec's version of `eth_getStorageAt`.
   */
  async getStorageAt(contract: AztecAddress, slot: bigint): Promise<Buffer | undefined> {
    const url = new URL(`${this.baseUrl}/storage-at`);
    url.searchParams.append('address', contract.toString());
    url.searchParams.append('slot', slot.toString());
    const response = await (await fetch(url.toString())).json();
    if (!response || !response.value) {
      return undefined;
    }
    const value = response.value as string;
    return Promise.resolve(Buffer.from(value, 'hex'));
  }

  /**
   * Returns the current committed roots for the data trees.
   * @returns The current committed roots for the data trees.
   */
  async getTreeRoots(): Promise<Record<MerkleTreeId, Fr>> {
    const url = new URL(`${this.baseUrl}/tree-roots`);
    const response = await (await fetch(url.toString())).json();

    const extractRoot = (treeId: MerkleTreeId) => {
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
      [MerkleTreeId.BLOCKS_TREE]: extractRoot(MerkleTreeId.BLOCKS_TREE),
    };
  }
}
