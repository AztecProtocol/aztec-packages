import { toBigIntBE } from '@aztec/foundation/bigint-buffer';
import { Fr } from '@aztec/foundation/fields';
import { ContractClassPublic } from '@aztec/types/contracts';

import { CONTRACT_CLASS_REGISTERED_MAGIC_VALUE } from '../constants.gen.js';
import { computeContractClassId, computePublicBytecodeCommitment } from './contract_class_id.js';
import { unpackBytecode } from './public_bytecode.js';

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
    return toBigIntBE(log.subarray(0, 32)) == CONTRACT_CLASS_REGISTERED_MAGIC_VALUE;
  }

  static fromLogData(log: Buffer) {
    const contractClassId = Fr.fromBuffer(log.subarray(32, 64));
    const version = log.readUInt32BE(64);
    const artifactHash = Fr.fromBuffer(log.subarray(68, 100));
    const privateFunctionsRoot = Fr.fromBuffer(log.subarray(100, 132));
    const packedPublicBytecode = log.subarray(132);

    return new ContractClassRegisteredEvent(
      contractClassId,
      version,
      artifactHash,
      privateFunctionsRoot,
      packedPublicBytecode,
    );
  }

  toContractClassPublic(): ContractClassPublic {
    const computedClassId = computeContractClassId({
      artifactHash: this.artifactHash,
      privateFunctionsRoot: this.privateFunctionsRoot,
      publicBytecodeCommitment: computePublicBytecodeCommitment(this.packedPublicBytecode),
    });

    if (computedClassId.equals(this.contractClassId)) {
      throw new Error(
        `Invalid contract class id: computed ${computedClassId.toString()} but event broadcasted ${this.contractClassId.toString()}`,
      );
    }

    return {
      id: this.contractClassId,
      artifactHash: this.artifactHash,
      packedBytecode: this.packedPublicBytecode,
      privateFunctionsRoot: this.privateFunctionsRoot,
      publicFunctions: unpackBytecode(this.packedPublicBytecode),
      version: 1,
    };
  }
}
