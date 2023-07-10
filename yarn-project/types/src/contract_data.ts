import { AztecAddress } from '@aztec/foundation/aztec-address';
import { EthAddress } from '@aztec/foundation/eth-address';
import { numToInt32BE } from '@aztec/foundation/serialize';
import { randomBytes } from '@aztec/foundation/crypto';
import { serializeBufferArrayToVector } from '@aztec/foundation/serialize';
import { BufferReader, serializeToBuffer } from '@aztec/circuits.js/utils';
import { FUNCTION_SELECTOR_NUM_BYTES } from '@aztec/circuits.js';

export { BufferReader } from '@aztec/circuits.js/utils';

/**
 * Used for retrieval of contract data (A3 address, portal contract address, bytecode).
 */
export interface ContractDataSource {
  /**
   * Lookup the L2 contract data for this contract.
   * Contains information such as the ethereum portal address and bytecode.
   * NOTE: This method works only for contracts that have public function bytecode.
   * @param contractAddress - The contract data address.
   * @returns The full contract information (if found).
   */
  getL2ContractPublicData(contractAddress: AztecAddress): Promise<ContractPublicData | undefined>;

  /**
   * Lookup the L2 contract base info for this contract.
   * NOTE: This works for all Aztec contracts and will only return contractAddres / portalAddress.
   * @param contractAddress - The contract data address.
   * @returns The aztec & etehereum portal address (if found).
   */
  getL2ContractInfo(contractAddress: AztecAddress): Promise<ContractData | undefined>;

  /**
   * Lookup all contract public data in an L2 block.
   * @param blockNumber - The block number.
   * @returns Public data of contracts deployed in L2 block, including public function bytecode.
   */
  getL2ContractPublicDataInBlock(blockNumber: number): Promise<ContractPublicData[]>;

  /**
   * Lookup contract info in an L2 block.
   * @param blockNumber - The block number.
   * @returns Portal contract address info of contracts deployed in L2 block.
   */
  getL2ContractInfoInBlock(blockNumber: number): Promise<ContractData[] | undefined>;

  /**
   * Returns a contract's encoded public function, given its function selector.
   * @param address - The contract aztec address.
   * @param functionSelector - The function's selector.
   * @returns The function's data.
   */
  getPublicFunction(address: AztecAddress, functionSelector: Buffer): Promise<EncodedContractFunction | undefined>;
}

/**
 * Represents encoded contract function.
 */
export class EncodedContractFunction {
  constructor(
    /**
     * The function selector.
     */
    public functionSelector: Buffer,
    /**
     * The function bytecode.
     */
    public bytecode: Buffer,
  ) {}

  /**
   * Serializes this instance into a buffer.
   * @returns Encoded buffer.
   */
  toBuffer(): Buffer {
    const bytecodeBuf = Buffer.concat([numToInt32BE(this.bytecode.length), this.bytecode]);
    return serializeToBuffer(this.functionSelector, bytecodeBuf);
  }

  /**
   * Deserializes a contract function object from an encoded buffer.
   * @param buffer - The encoded buffer.
   * @returns The deserialized contract function.
   */
  static fromBuffer(buffer: Buffer | BufferReader): EncodedContractFunction {
    const reader = BufferReader.asReader(buffer);
    const fnSelector = reader.readBytes(FUNCTION_SELECTOR_NUM_BYTES);
    return new EncodedContractFunction(fnSelector, reader.readBuffer());
  }

  /**
   * Creates a random contract function.
   * @returns A random contract function.
   */
  static random(): EncodedContractFunction {
    return new EncodedContractFunction(randomBytes(4), randomBytes(64));
  }
}

/**
 * A contract data blob, containing L1 and L2 addresses, as well as public functions' bytecode.
 */
export class ContractPublicData {
  /**
   * The contract's encoded ACIR code. This should become Brilling code once implemented.
   */
  public bytecode: Buffer;
  constructor(
    /**
     * The base contract data: aztec & portal addresses.
     */
    public contractData: ContractData,

    /**
     * ABIs of public functions.
     */
    public publicFunctions: EncodedContractFunction[],
  ) {
    if (!publicFunctions.length) {
      throw Error('No public functions provided for ContractPublicData.');
    }
    this.bytecode = serializeBufferArrayToVector(publicFunctions.map(fn => fn.toBuffer()));
  }

  /**
   * Serializes this instance into a buffer, using 20 bytes for the eth address.
   * @returns Encoded buffer.
   */
  public toBuffer(): Buffer {
    const contractDataBuf = this.contractData.toBuffer();
    return serializeToBuffer(contractDataBuf, this.bytecode);
  }

  /**
   * Serializes this instance into a string.
   * @returns Encoded string.
   */
  public toString(): string {
    return this.toBuffer().toString('hex');
  }

  /**
   * Deserializes a contract data object from an encoded buffer, using 20 bytes for the eth address.
   * @param buffer - Byte array resulting from calling toBuffer.
   * @returns Deserialized instance.
   */
  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    // const aztecAddr = AztecAddress.fromBuffer(reader);
    // const ethAddr = new EthAddress(reader.readBytes(EthAddress.SIZE_IN_BYTES));
    const contractData = reader.readObject(ContractData);
    const publicFns = reader.readVector(EncodedContractFunction);
    return new ContractPublicData(contractData, publicFns);
  }

  /**
   * Deserializes a contract data object from an encoded string, using 20 bytes for the eth address.
   * @param str - String resulting from calling toString.
   * @returns Deserialized instance.
   */
  static fromString(str: string) {
    return ContractPublicData.fromBuffer(Buffer.from(str, 'hex'));
  }

  /**
   * Generate ContractData with random addresses.
   * @returns A random ContractPublicData object.
   */
  static random(): ContractPublicData {
    return new ContractPublicData(ContractData.random(), [
      EncodedContractFunction.random(),
      EncodedContractFunction.random(),
    ]);
  }
}

/**
 * A contract data blob, containing L1 and L2 addresses.
 */
export class ContractData {
  constructor(
    /**
     * The L2 address of the contract, as a field element (32 bytes).
     */
    public contractAddress: AztecAddress,
    /**
     * The L1 address of the contract, (20 bytes).
     */
    public portalContractAddress: EthAddress,
  ) {}

  /**
   * Serializes this instance into a buffer, using 20 bytes for the eth address.
   * @returns Encoded buffer.
   */
  public toBuffer(): Buffer {
    return serializeToBuffer(this.contractAddress, this.portalContractAddress.toBuffer());
  }

  /**
   * Serializes this instance into a string, using 20 bytes for the eth address.
   * @returns Encoded string.
   */
  public toString(): string {
    return this.toBuffer().toString('hex');
  }

  /**
   * Deserializes a contract data object from an encoded buffer, using 20 bytes for the eth address.
   * @param buffer - Byte array resulting from calling toBuffer.
   * @returns Deserialized instance.
   */
  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    const aztecAddr = AztecAddress.fromBuffer(reader);
    const ethAddr = new EthAddress(reader.readBytes(EthAddress.SIZE_IN_BYTES));
    return new ContractData(aztecAddr, ethAddr);
  }

  /**
   * Deserializes a contract data object from an encoded string, using 20 bytes for the eth address.
   * @param str - String resulting from calling toString.
   * @returns Deserialized instance.
   */
  static fromString(str: string) {
    return ContractData.fromBuffer(Buffer.from(str, 'hex'));
  }

  /**
   * Generate ContractData with random addresses.
   * @returns ContractData.
   */
  static random(): ContractData {
    return new ContractData(AztecAddress.random(), EthAddress.random());
  }
}
