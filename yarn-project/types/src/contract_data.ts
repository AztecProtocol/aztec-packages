import {
  CompleteAddress,
  FUNCTION_SELECTOR_NUM_BYTES,
  Fr,
  FunctionSelector,
  PartialAddress,
  Point,
  PublicKey,
} from '@aztec/circuits.js';
import { BufferReader, serializeToBuffer } from '@aztec/circuits.js/utils';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { randomBytes } from '@aztec/foundation/crypto';
import { EthAddress } from '@aztec/foundation/eth-address';
import { numToInt32BE, serializeBufferArrayToVector } from '@aztec/foundation/serialize';

export { BufferReader } from '@aztec/circuits.js/utils';

/**
 * Used for retrieval of contract data (A3 address, portal contract address, bytecode).
 */
export interface ContractDataSource {
  /**
   * Get the extended contract data for this contract.
   * @param contractAddress - The contract data address.
   * @returns The extended contract data or undefined if not found.
   */
  getExtendedContractData(contractAddress: AztecAddress): Promise<ExtendedContractData | undefined>;

  /**
   * Lookup the L2 contract base info for this contract.
   * NOTE: This works for all Aztec contracts and will only return contractAddress / portalAddress.
   * @param contractAddress - The contract data address.
   * @returns The aztec & ethereum portal address (if found).
   */
  getContractData(contractAddress: AztecAddress): Promise<ContractData | undefined>;

  /**
   * Gets extended contract data for all contracts deployed in L2 block.
   * @param blockNumber - The block number.
   * @returns Extended contract data of contracts deployed in L2 block.
   */
  getExtendedContractDataInBlock(blockNumber: number): Promise<ExtendedContractData[]>;

  /**
   * Lookup contract data in an L2 block.
   * @param blockNumber - The block number.
   * @returns Portal contract address info of contracts deployed in L2 block.
   */
  getContractDataInBlock(blockNumber: number): Promise<ContractData[] | undefined>;

  /**
   * Returns a contract's encoded public function, given its function selector.
   * @param address - The contract aztec address.
   * @param selector - The function's selector.
   * @returns The function's data.
   */
  getPublicFunction(address: AztecAddress, selector: FunctionSelector): Promise<EncodedContractFunction | undefined>;
}

/**
 * Represents encoded contract function.
 */
export class EncodedContractFunction {
  constructor(
    /**
     * The function selector.
     */
    public selector: FunctionSelector,
    /**
     * Whether the function is internal.
     */
    public isInternal: boolean,
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
    return serializeToBuffer(this.selector, this.isInternal, bytecodeBuf);
  }

  /**
   * Deserializes a contract function object from an encoded buffer.
   * @param buffer - The encoded buffer.
   * @returns The deserialized contract function.
   */
  static fromBuffer(buffer: Buffer | BufferReader): EncodedContractFunction {
    const reader = BufferReader.asReader(buffer);
    const fnSelector = FunctionSelector.fromBuffer(reader.readBytes(FUNCTION_SELECTOR_NUM_BYTES));
    const isInternal = reader.readBoolean();
    return new EncodedContractFunction(fnSelector, isInternal, reader.readBuffer());
  }

  /**
   * Creates a random contract function.
   * @returns A random contract function.
   */
  static random(): EncodedContractFunction {
    return new EncodedContractFunction(FunctionSelector.fromBuffer(randomBytes(4)), false, randomBytes(64));
  }
}

/**
 * A contract data blob, containing L1 and L2 addresses, public functions' bytecode, partial address and public key.
 */
export class ExtendedContractData {
  /** The contract's encoded ACIR code. This should become Brillig code once implemented. */
  public bytecode: Buffer;

  constructor(
    /** The base contract data: aztec & portal addresses. */
    public contractData: ContractData,
    /** ABIs of public functions. */
    private publicFunctions: EncodedContractFunction[],
    /** Partial addresses of the contract. */
    public readonly partialAddress: PartialAddress,
    /** Public keys of the contract. */
    public readonly publicKey: PublicKey,
  ) {
    this.bytecode = serializeBufferArrayToVector(publicFunctions.map(fn => fn.toBuffer()));
  }

  /**
   * Gets the public function data or undefined.
   * @param selector - The function selector of the function to fetch.
   * @returns The public function data (if found).
   */
  public getPublicFunction(selector: FunctionSelector): EncodedContractFunction | undefined {
    return this.publicFunctions.find(fn => fn.selector.equals(selector));
  }

  /**
   * Serializes this instance into a buffer, using 20 bytes for the eth address.
   * @returns Encoded buffer.
   */
  public toBuffer(): Buffer {
    const contractDataBuf = this.contractData.toBuffer();
    return serializeToBuffer(contractDataBuf, this.bytecode, this.partialAddress, this.publicKey);
  }

  /**
   * Serializes this instance into a string.
   * @returns Encoded string.
   */
  public toString(): string {
    return this.toBuffer().toString('hex');
  }

  /**
   * Gets the complete address.
   * @returns The complete address.
   */
  public getCompleteAddress(): CompleteAddress {
    return new CompleteAddress(this.contractData.contractAddress, this.publicKey, this.partialAddress);
  }

  /**
   * Deserializes a contract data object from an encoded buffer, using 20 bytes for the eth address.
   * @param buffer - Byte array resulting from calling toBuffer.
   * @returns Deserialized instance.
   */
  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    const contractData = reader.readObject(ContractData);
    const publicFns = reader.readVector(EncodedContractFunction);
    const partialAddress = reader.readObject(Fr);
    const publicKey = reader.readObject(Point);
    return new ExtendedContractData(contractData, publicFns, partialAddress, publicKey);
  }

  /**
   * Deserializes a contract data object from an encoded string, using 20 bytes for the eth address.
   * @param str - String resulting from calling toString.
   * @returns Deserialized instance.
   */
  static fromString(str: string) {
    return ExtendedContractData.fromBuffer(Buffer.from(str, 'hex'));
  }

  /**
   * Generate ContractData with random addresses.
   * @returns A random ExtendedContractData object.
   */
  static random(): ExtendedContractData {
    return new ExtendedContractData(
      ContractData.random(),
      [EncodedContractFunction.random(), EncodedContractFunction.random()],
      Fr.random(),
      Point.random(),
    );
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
    return serializeToBuffer(this.contractAddress, this.portalContractAddress.toBuffer20());
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
