import { AztecAddress } from '@aztec/foundation/aztec-address';
import { toBigIntBE } from '@aztec/foundation/bigint-buffer';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader } from '@aztec/foundation/serialize';

import { DEPLOYER_CONTRACT_ADDRESS, DEPLOYER_CONTRACT_INSTANCE_DEPLOYED_MAGIC_VALUE } from '../../constants.gen.js';
import { PublicKeys } from '../../types/public_keys.js';
import { type ContractInstanceWithAddress } from '../interfaces/contract_instance.js';

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

  static isContractInstanceDeployedEvent(log: Buffer) {
    return toBigIntBE(log.subarray(0, 32)) == DEPLOYER_CONTRACT_INSTANCE_DEPLOYED_MAGIC_VALUE;
  }

  // We store the contract instance deployed event log in enc logs, contract_instance_deployer_contract/src/main.nr
  static fromLogs(logs: { maskedContractAddress: Fr; data: Buffer }[]) {
    return logs
      .filter(log => ContractInstanceDeployedEvent.isContractInstanceDeployedEvent(log.data))
      .filter(log =>
        AztecAddress.fromField(log.maskedContractAddress).equals(
          AztecAddress.fromBigInt(BigInt(DEPLOYER_CONTRACT_ADDRESS)),
        ),
      )
      .map(log => ContractInstanceDeployedEvent.fromLogData(log.data));
  }

  static fromLogData(log: Buffer) {
    if (!this.isContractInstanceDeployedEvent(log)) {
      const magicValue = DEPLOYER_CONTRACT_INSTANCE_DEPLOYED_MAGIC_VALUE.toString(16);
      throw new Error(`Log data for ContractInstanceDeployedEvent is not prefixed with magic value 0x${magicValue}`);
    }
    const reader = new BufferReader(log.subarray(32));
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
