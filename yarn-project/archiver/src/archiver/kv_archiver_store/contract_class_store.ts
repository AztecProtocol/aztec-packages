import { Fr, FunctionSelector, Vector } from '@aztec/circuits.js';
import { BufferReader, numToUInt8, serializeToBuffer } from '@aztec/foundation/serialize';
import { AztecKVStore, AztecMap } from '@aztec/kv-store';
import { ContractClassPublic, ExecutablePrivateFunctionWithMembershipProof } from '@aztec/types/contracts';

/**
 * LMDB implementation of the ArchiverDataStore interface.
 */
export class ContractClassStore {
  #contractClasses: AztecMap<string, Buffer>;

  constructor(private db: AztecKVStore) {
    this.#contractClasses = db.openMap('archiver_contract_classes');
  }

  addContractClass(contractClass: ContractClassPublic): Promise<boolean> {
    return this.#contractClasses.set(contractClass.id.toString(), serializeContractClassPublic(contractClass));
  }

  getContractClass(id: Fr): ContractClassPublic | undefined {
    const contractClass = this.#contractClasses.get(id.toString());
    return contractClass && { ...deserializeContractClassPublic(contractClass), id };
  }

  getContractClassIds(): Fr[] {
    return Array.from(this.#contractClasses.keys()).map(key => Fr.fromString(key));
  }

  async addPrivateFunctions(
    contractClassId: Fr,
    newPrivateFunctions: ExecutablePrivateFunctionWithMembershipProof[],
  ): Promise<boolean> {
    await this.db.transaction(() => {
      const existingClassBuffer = this.#contractClasses.get(contractClassId.toString());
      if (!existingClassBuffer) {
        throw new Error(`Unknown contract class ${contractClassId} when adding private functions to store`);
      }

      const existingClass = deserializeContractClassPublic(existingClassBuffer);
      const existingFns = existingClass.privateFunctions;

      const updatedClass = {
        ...existingClass,
        privateFunctions: [
          ...existingFns,
          ...newPrivateFunctions.filter(newFn => !existingFns.some(f => f.selector.equals(newFn.selector))),
        ],
      };
      void this.#contractClasses.set(contractClassId.toString(), serializeContractClassPublic(updatedClass));
    });
    return Promise.resolve(true);
  }
}

function serializeContractClassPublic(contractClass: Omit<ContractClassPublic, 'id'>): Buffer {
  return serializeToBuffer(
    numToUInt8(contractClass.version),
    contractClass.artifactHash,
    contractClass.publicFunctions.length,
    contractClass.publicFunctions?.map(f =>
      serializeToBuffer(f.selector, f.bytecode.length, f.bytecode, f.isInternal),
    ) ?? [],
    contractClass.privateFunctions.length,
    contractClass.privateFunctions.map(serializePrivateFunction),
    contractClass.packedBytecode.length,
    contractClass.packedBytecode,
    contractClass.privateFunctionsRoot,
  );
}

function serializePrivateFunction(fn: ExecutablePrivateFunctionWithMembershipProof): Buffer {
  const bytecode = Buffer.from(fn.bytecode, 'base64');
  return serializeToBuffer(
    fn.selector,
    fn.vkHash,
    fn.isInternal,
    bytecode.length,
    bytecode,
    fn.functionMetadataHash,
    fn.artifactMetadataHash,
    fn.unconstrainedFunctionsArtifactTreeRoot,
    new Vector(fn.privateFunctionTreeSiblingPath),
    fn.privateFunctionTreeLeafIndex,
    new Vector(fn.artifactTreeSiblingPath),
    fn.artifactTreeLeafIndex,
  );
}

function deserializeContractClassPublic(buffer: Buffer): Omit<ContractClassPublic, 'id'> {
  const reader = BufferReader.asReader(buffer);
  return {
    version: reader.readUInt8() as 1,
    artifactHash: reader.readObject(Fr),
    publicFunctions: reader.readVector({
      fromBuffer: reader => ({
        selector: reader.readObject(FunctionSelector),
        bytecode: reader.readBuffer(),
        isInternal: reader.readBoolean(),
      }),
    }),
    privateFunctions: reader.readVector({ fromBuffer: deserializePrivateFunction }),
    packedBytecode: reader.readBuffer(),
    privateFunctionsRoot: reader.readObject(Fr),
  };
}

function deserializePrivateFunction(buffer: Buffer | BufferReader): ExecutablePrivateFunctionWithMembershipProof {
  const reader = BufferReader.asReader(buffer);
  return {
    selector: reader.readObject(FunctionSelector),
    vkHash: reader.readObject(Fr),
    isInternal: reader.readBoolean(),
    bytecode: reader.readBuffer().toString('base64'),
    functionMetadataHash: reader.readObject(Fr),
    artifactMetadataHash: reader.readObject(Fr),
    unconstrainedFunctionsArtifactTreeRoot: reader.readObject(Fr),
    privateFunctionTreeSiblingPath: reader.readVector(Fr),
    privateFunctionTreeLeafIndex: reader.readNumber(),
    artifactTreeSiblingPath: reader.readVector(Fr),
    artifactTreeLeafIndex: reader.readNumber(),
  };
}
