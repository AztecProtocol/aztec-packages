import { AztecNode } from '@aztec/aztec-node';
import { KernelCircuitPublicInputs, SignedTxRequest, UInt8Vector } from '@aztec/circuits.js';
import { AztecAddress, createDebugLogger } from '@aztec/foundation';
import { SiblingPath } from '@aztec/merkle-tree';
import { ContractData, ContractPublicData, L2Block, Tx, TxHash, UnverifiedData } from '@aztec/types';

const logger = createDebugLogger('aztec:http_node');

function txToJson(tx: Tx) {
  return {
    data: tx?.data?.toBuffer().toString('hex'),
    unverified: tx?.unverifiedData?.toBuffer().toString('hex'),
    txRequest: tx?.txRequest?.toBuffer().toString('hex'),
    proof: tx?.proof?.toBuffer().toString('hex'),
  };
}

function txFromJson(json: any) {
  const publicInputs = json.data ? KernelCircuitPublicInputs.fromBuffer(Buffer.from(json.data, 'hex')) : undefined;
  const unverified = json.unverified ? UnverifiedData.fromBuffer(Buffer.from(json.unverified, 'hex')) : undefined;
  const txRequest = json.txRequest ? SignedTxRequest.fromBuffer(Buffer.from(json.txRequest, 'hex')) : undefined;
  const proof = json.proof ? Buffer.from(json.proof, 'hex') : undefined;
  return Tx.create(publicInputs, proof == undefined ? undefined : new UInt8Vector(proof), unverified, txRequest);
}

export class HttpNode implements AztecNode {
  private baseUrl: string;
  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.toString().replace(/\/$/, '');
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
   * Method to fetch the current block height
   * @returns The block height as a number.
   */
  async getBlockHeight(): Promise<number> {
    const url = new URL(`${this.baseUrl}/get-block-height`);
    const response = await fetch(url.toString());
    const respJson = await response.json();
    return respJson.blockHeight;
  }

  /**
   * Lookup the L2 contract data for this contract.
   * Contains the ethereum portal address and bytecode.
   * @param contractAddress - The contract data address.
   * @returns The complete contract data including portal address & bytecode (if we didn't throw an error).
   */
  async getContractData(contractAddress: AztecAddress): Promise<ContractPublicData | undefined> {
    try {
      const url = new URL(`${this.baseUrl}/contract-data`);
      url.searchParams.append('address', contractAddress.toString());
      const response = await (await fetch(url.toString())).json();
      const contract = response.contractData as string;
      return Promise.resolve(ContractPublicData.fromBuffer(Buffer.from(contract, 'hex')));
    } catch (err) {
      console.log(err);
    }
  }

  /**
   * Lookup the L2 contract info for this contract.
   * Contains the ethereum portal address .
   * @param contractAddress - The contract data address.
   * @returns The contract's address & portal address.
   */
  async getContractInfo(contractAddress: AztecAddress): Promise<ContractData | undefined> {
    try {
      const url = new URL(`${this.baseUrl}/contract-info`);
      url.searchParams.append('address', contractAddress.toString());
      const response = await (await fetch(url.toString())).json();
      const contract = response.contractInfo as string;
      return Promise.resolve(ContractData.fromBuffer(Buffer.from(contract, 'hex')));
    } catch (err) {
      console.log(err);
    }
  }

  /**
   * Gets the `take` amount of unverified data starting from `from`.
   * @param from - Number of the L2 block to which corresponds the first `unverifiedData` to be returned.
   * @param take - The number of `unverifiedData` to return.
   * @returns The requested `unverifiedData`.
   */
  async getUnverifiedData(from: number, take: number): Promise<UnverifiedData[]> {
    const url = new URL(`${this.baseUrl}/get-unverified`);
    url.searchParams.append('from', from.toString());
    if (take !== undefined) {
      url.searchParams.append('take', take.toString());
    }
    const response = await (await fetch(url.toString())).json();
    const unverified = response.unverified as string[];

    if (!unverified) {
      return Promise.resolve([]);
    }
    return Promise.resolve(unverified.map(x => UnverifiedData.fromBuffer(Buffer.from(x, 'hex'))));
  }

  /**
   * Method to submit a transaction to the p2p pool.
   * @param tx - The transaction to be submitted.
   */
  async sendTx(tx: Tx): Promise<void> {
    const url = new URL(`${this.baseUrl}/tx`);
    const json = txToJson(tx);
    const init: RequestInit = {};
    init['method'] = 'POST';
    init['body'] = JSON.stringify(json);
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
   * Method to retrieve a single pending tx
   * @param txHash - The transaction hash to return.
   * @returns - The pending tx if it exists
   */
  async getPendingTxByHash(txHash: TxHash): Promise<Tx | undefined> {
    const url = new URL(`${this.baseUrl}/get-pending-tx`);
    url.searchParams.append('hash', txHash.toString());
    const response = await (await fetch(url.toString())).json();
    return Promise.resolve(txFromJson(response));
  }

  async findContractIndex(leafValue: Buffer): Promise<bigint | undefined> {
    try {
      const url = new URL(`${this.baseUrl}/contract-index`);
      url.searchParams.append('leaf', leafValue.toString('hex'));
      const response = await (await fetch(url.toString())).json();
      const index = response.index as string;
      return Promise.resolve(BigInt(index));
    } catch (err) {
      console.log(err);
    }
  }

  async getContractPath(leafIndex: bigint): Promise<SiblingPath> {
    try {
      const url = new URL(`${this.baseUrl}/contract-path`);
      url.searchParams.append('leaf', leafIndex.toString());
      const response = await (await fetch(url.toString())).json();
      const path = response.path as string;
      return Promise.resolve(SiblingPath.fromString(path));
    } catch (err) {
      console.log(err);
      throw err;
    }
  }

  async getDataTreePath(leafIndex: bigint): Promise<SiblingPath> {
    try {
      const url = new URL(`${this.baseUrl}/data-path`);
      url.searchParams.append('leaf', leafIndex.toString());
      const response = await (await fetch(url.toString())).json();
      const path = response.path as string;
      const sibling = SiblingPath.fromString(path);
      return Promise.resolve(sibling);
    } catch (err) {
      console.log(err);
      throw err;
    }
  }

  /**
   * Gets the storage value at the given contract slot.
   * @param contract - Address of the contract to query
   * @param slot - Slot to query
   * @returns Storage value at the given contract slot (or undefined if not found).
   * Note: Aztec's version of `eth_getStorageAt`
   */
  async getStorageAt(contract: AztecAddress, slot: bigint): Promise<Buffer | undefined> {
    try {
      const url = new URL(`${this.baseUrl}/storage-at`);
      url.searchParams.append('address', contract.toString());
      url.searchParams.append('slot', slot.toString());
      const response = await (await fetch(url.toString())).json();
      const value = response.value as string;
      return Promise.resolve(Buffer.from(value, 'hex'));
    } catch (err) {
      console.log(err);
    }
  }
}
