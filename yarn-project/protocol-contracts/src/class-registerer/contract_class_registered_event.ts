import {
  type ContractClassPublic,
  type PublicFunction,
  computeContractClassId,
  computePublicBytecodeCommitment,
} from '@aztec/circuits.js';
import { FunctionSelector, bufferFromFields } from '@aztec/circuits.js/abi';
import { type ContractClassLog } from '@aztec/circuits.js/logs';
import { PUBLIC_DISPATCH_SELECTOR } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { FieldReader } from '@aztec/foundation/serialize';

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
    return log.fields[0].equals(REGISTERER_CONTRACT_CLASS_REGISTERED_TAG);
  }

  static fromLog(log: ContractClassLog) {
    const reader = new FieldReader(log.fields.slice(1));
    const contractClassId = reader.readField();
    const version = reader.readField().toNumber();
    const artifactHash = reader.readField();
    const privateFunctionsRoot = reader.readField();
    const packedPublicBytecode = bufferFromFields(reader.readFieldArray(log.fields.slice(1).length - reader.cursor));

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

    // TODO(https://github.com/AztecProtocol/aztec-packages/issues/8985): Remove public functions.
    const publicFunctions: PublicFunction[] = [];
    if (this.packedPublicBytecode.length > 0) {
      publicFunctions.push({
        selector: FunctionSelector.fromField(new Fr(PUBLIC_DISPATCH_SELECTOR)),
        bytecode: this.packedPublicBytecode,
      });
    }

    return {
      id: this.contractClassId,
      artifactHash: this.artifactHash,
      packedBytecode: this.packedPublicBytecode,
      privateFunctionsRoot: this.privateFunctionsRoot,
      publicFunctions: publicFunctions,
      version: this.version,
      privateFunctions: [],
      unconstrainedFunctions: [],
    };
  }
}
