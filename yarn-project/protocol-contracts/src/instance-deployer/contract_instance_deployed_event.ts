import { type ContractInstanceWithAddress, type PrivateLog, PublicKeys } from '@aztec/circuits.js';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader } from '@aztec/foundation/serialize';

import { DEPLOYER_CONTRACT_INSTANCE_DEPLOYED_TAG } from '../protocol_contract_data.js';

/** Event emitted from the ContractInstanceDeployer. */
export class ContractInstanceDeployedEvent {
  constructor(
    public readonly address: AztecAddress,
    public readonly version: number,
    public readonly salt: Fr,
    public readonly contractClassId: Fr,
    public readonly initializationHash: Fr,
    public readonly publicKeys: PublicKeys,
    public readonly deployer: AztecAddress,
  ) {}

  static isContractInstanceDeployedEvent(log: PrivateLog) {
    return log.fields[0].equals(DEPLOYER_CONTRACT_INSTANCE_DEPLOYED_TAG);
  }

  static fromLog(log: PrivateLog) {
    const bufferWithoutTag = log.toBuffer().subarray(32);
    const reader = new BufferReader(bufferWithoutTag);
    const address = reader.readObject(AztecAddress);
    const version = reader.readObject(Fr).toNumber();
    const salt = reader.readObject(Fr);
    const contractClassId = reader.readObject(Fr);
    const initializationHash = reader.readObject(Fr);
    const publicKeys = reader.readObject(PublicKeys);
    const deployer = reader.readObject(AztecAddress);

    return new ContractInstanceDeployedEvent(
      address,
      version,
      salt,
      contractClassId,
      initializationHash,
      publicKeys,
      deployer,
    );
  }

  toContractInstance(): ContractInstanceWithAddress {
    if (this.version !== 1) {
      throw new Error(`Unexpected contract instance version ${this.version}`);
    }

    return {
      address: this.address,
      version: this.version,
      contractClassId: this.contractClassId,
      initializationHash: this.initializationHash,
      publicKeys: this.publicKeys,
      salt: this.salt,
      deployer: this.deployer,
    };
  }
}
