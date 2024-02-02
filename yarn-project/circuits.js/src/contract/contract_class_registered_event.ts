import { toBigIntBE } from '@aztec/foundation/bigint-buffer';
import { Fr } from '@aztec/foundation/fields';

import { CONTRACT_CLASS_REGISTERED_MAGIC_VALUE } from '../constants.gen.js';

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

  static fromLog(log: Buffer) {
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
}
