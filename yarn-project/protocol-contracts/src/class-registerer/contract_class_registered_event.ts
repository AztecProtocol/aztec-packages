import { Fr } from '@aztec/foundation/fields';
import { FieldReader } from '@aztec/foundation/serialize';
import { bufferFromFields } from '@aztec/stdlib/abi';
import {
  type ContractClassPublic,
  computeContractClassId,
  computePublicBytecodeCommitment,
} from '@aztec/stdlib/contract';
import type { ContractClassLog } from '@aztec/stdlib/logs';

import { REGISTERER_CONTRACT_CLASS_REGISTERED_TAG } from '../protocol_contract_data.js';

/** Event emitted from the ContractClassRegisterer. */
export class ContractClassRegisteredEvent {
  constructor(
    public readonly contractClassId: Fr,
    public readonly version: number,
    public readonly artifactHash: Fr,
    public readonly privateFunctionsRoot: Fr,
    public readonly packedPublicBytecode: Buffer,
  ) {}

  static isContractClassRegisteredEvent(log: ContractClassLog) {
    return log.fields.fields[0].equals(REGISTERER_CONTRACT_CLASS_REGISTERED_TAG);
  }

  static fromLog(log: ContractClassLog) {
    const fieldsWithoutTag = log.fields.fields.slice(1);
    const reader = new FieldReader(fieldsWithoutTag);
    const contractClassId = reader.readField();
    const version = reader.readField().toNumber();
    const artifactHash = reader.readField();
    const privateFunctionsRoot = reader.readField();
    const packedPublicBytecode = bufferFromFields(reader.readFieldArray(fieldsWithoutTag.length - reader.cursor));

    return new ContractClassRegisteredEvent(
      contractClassId,
      version,
      artifactHash,
      privateFunctionsRoot,
      packedPublicBytecode,
    );
  }

  async toContractClassPublic(): Promise<ContractClassPublic> {
    const computedClassId = await computeContractClassId({
      artifactHash: this.artifactHash,
      privateFunctionsRoot: this.privateFunctionsRoot,
      publicBytecodeCommitment: await computePublicBytecodeCommitment(this.packedPublicBytecode),
    });

    if (!computedClassId.equals(this.contractClassId)) {
      throw new Error(
        `Invalid contract class id: computed ${computedClassId.toString()} but event broadcasted ${this.contractClassId.toString()}`,
      );
    }

    if (this.version !== 1) {
      throw new Error(`Unexpected contract class version ${this.version}`);
    }

    return {
      id: this.contractClassId,
      artifactHash: this.artifactHash,
      packedBytecode: this.packedPublicBytecode,
      privateFunctionsRoot: this.privateFunctionsRoot,
      version: this.version,
      privateFunctions: [],
      utilityFunctions: [],
    };
  }
}
