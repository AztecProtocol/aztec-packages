import {
  type ContractClassPublic,
  PUBLIC_DISPATCH_SELECTOR,
  type PublicFunction,
  computeContractClassId,
  computePublicBytecodeCommitment,
} from '@aztec/circuits.js';
import { FunctionSelector, bufferFromFields } from '@aztec/foundation/abi';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader } from '@aztec/foundation/serialize';

import chunk from 'lodash.chunk';

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

  static isContractClassRegisteredEvent(log: Buffer) {
    return log.subarray(0, 32).equals(REGISTERER_CONTRACT_CLASS_REGISTERED_TAG.toBuffer());
  }

  static fromLog(log: Buffer) {
    const reader = new BufferReader(log.subarray(32));
    const contractClassId = reader.readObject(Fr);
    const version = reader.readObject(Fr).toNumber();
    const artifactHash = reader.readObject(Fr);
    const privateFunctionsRoot = reader.readObject(Fr);
    const packedPublicBytecode = bufferFromFields(
      chunk(reader.readToEnd(), Fr.SIZE_IN_BYTES).map(Buffer.from).map(Fr.fromBuffer),
    );

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
