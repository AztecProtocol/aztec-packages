import { AztecAddress, EthAddress } from '@aztec/foundation';
import { BufferReader, serializeToBuffer } from '@aztec/circuits.js/utils';

export { BufferReader } from '@aztec/circuits.js/utils';

/**
 * Used for retrieval of contract data (A3 address, portal contract address, bytecode)
 */
export interface ContractDataSource {
  /**
   * Lookup the L2 contract data for this contract.
   * Contains information such as the ethereum portal address and bytecode.
   * @param contractAddress - The contract data address.
   * @returns The portal address (if found).
   */
  getL2ContractData(contractAddress: AztecAddress): Promise<ContractData | undefined>;

  /**
   * Lookup all contract data in an L2 block.
   * @param blockNumber - The block number
   */
  getL2ContractDataInBlock(blockNumber: number): Promise<ContractData>[];
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
   * Deserializes a contract data object from an encoded buffer, using 20 bytes for the eth address.
   * @param buffer - Byte array resulting from calling toBuffer.
   * @returns Deserialized instance.
   */
  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new ContractData(
      AztecAddress.fromBuffer(reader),
      new EthAddress(reader.readBytes(EthAddress.SIZE_IN_BYTES)),
    );
  }

  /**
   * Generate ContractData with random addresses.
   * @returns ContractData.
   */
  static random() {
    return new ContractData(AztecAddress.random(), EthAddress.random());
  }
}
