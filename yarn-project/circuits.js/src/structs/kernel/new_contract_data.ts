import { AztecAddress } from '@aztec/foundation/aztec-address';
import { pedersenHash } from '@aztec/foundation/crypto';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { GeneratorIndex } from '../../constants.gen.js';
import { FieldsOf } from '@aztec/foundation/types';

/**
 * The information assembled after the contract deployment was processed by the private kernel circuit.
 *
 * Note: Not to be confused with `ContractDeploymentData`.
 */
export class NewContractData {
  constructor(
    /**
     * Aztec address of the contract.
     */
    public contractAddress: AztecAddress,
    /**
     * Ethereum address of the portal contract on L1.
     */
    public portalContractAddress: EthAddress,
    /**
     * Contract class id.
     */
    public contractClassId: Fr,
  ) {}

  static getFields(fields: FieldsOf<NewContractData>) {
    return [fields.contractAddress, fields.portalContractAddress, fields.contractClassId] as const;
  }

  toBuffer() {
    return serializeToBuffer(...NewContractData.getFields(this));
  }

  /**
   * Computes a contract leaf of the given contract.
   * @param cd - The contract data of the deployed contract.
   * @returns The contract leaf.
   */
  computeLeaf(): Fr {
    if (this.isEmpty()) {
      return new Fr(0);
    }
    return Fr.fromBuffer(pedersenHash(NewContractData.getFields(this).map(f => f.toBuffer()), GeneratorIndex.CONTRACT_LEAF));
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer or reader to read from.
   * @returns The deserialized `NewContractData`.
   */
  static fromBuffer(buffer: Buffer | BufferReader): NewContractData {
    const reader = BufferReader.asReader(buffer);
    return new NewContractData(reader.readObject(AztecAddress), reader.readObject(EthAddress), Fr.fromBuffer(reader));
  }

  static empty() {
    return new NewContractData(AztecAddress.ZERO, EthAddress.ZERO, Fr.ZERO);
  }

  /**
   * Checks if the data is empty.
   * @returns True if the data operation is empty, false otherwise.
   */
  isEmpty(): boolean {
    return this.contractAddress.isZero() && this.portalContractAddress.isZero() && this.contractClassId.isZero();
  }
}
