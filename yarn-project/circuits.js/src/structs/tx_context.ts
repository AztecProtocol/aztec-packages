import { BufferReader } from '@aztec/foundation/serialize';
import { serializeToBuffer } from '../utils/serialize.js';
import { EthAddress, Fr, AztecAddress } from './index.js';

/**
 * Contract deployment data in a TxContext
 * cpp/src/aztec3/circuits/abis/contract_deployment_data.hpp
 */
export class ContractDeploymentData {
  public portalContractAddress: EthAddress;
  constructor(
    public constructorVkHash: Fr,
    public functionTreeRoot: Fr,
    public contractAddressSalt: Fr,
    // TODO(AD): kludge due to cbind compiler
    portalContractAddress: EthAddress | AztecAddress,
  ) {
    this.portalContractAddress = new EthAddress(portalContractAddress.toBuffer());
  }

  toBuffer() {
    return serializeToBuffer(
      this.constructorVkHash,
      this.functionTreeRoot,
      this.contractAddressSalt,
      this.portalContractAddress,
    );
  }

  public static empty() {
    return new ContractDeploymentData(Fr.ZERO, Fr.ZERO, Fr.ZERO, EthAddress.ZERO);
  }
  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer to read from.
   */
  static fromBuffer(buffer: Buffer | BufferReader): ContractDeploymentData {
    const reader = BufferReader.asReader(buffer);
    return new ContractDeploymentData(
      reader.readFr(),
      reader.readFr(),
      reader.readFr(),
      new EthAddress(reader.readBytes(32)),
    );
  }
}

/**
 * Transaction context.
 * @see cpp/src/aztec3/circuits/abis/tx_context.hpp.
 */
export class TxContext {
  constructor(
    public isFeePaymentTx: boolean,
    public isRebatePaymentTx: boolean,
    public isContractDeploymentTx: boolean,
    public contractDeploymentData: ContractDeploymentData,
  ) {}

  /**
   * Serialize as a buffer.
   * @returns The buffer.
   */
  toBuffer() {
    return serializeToBuffer(
      this.isFeePaymentTx,
      this.isRebatePaymentTx,
      this.isContractDeploymentTx,
      this.contractDeploymentData,
    );
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer to read from.
   */
  static fromBuffer(buffer: Buffer | BufferReader): TxContext {
    const reader = BufferReader.asReader(buffer);
    return new TxContext(
      reader.readBoolean(),
      reader.readBoolean(),
      reader.readBoolean(),
      reader.readObject(ContractDeploymentData),
    );
  }

  static empty() {
    return new TxContext(false, false, true, ContractDeploymentData.empty());
  }
}
