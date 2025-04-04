import { Fr } from '@aztec/foundation/fields';
import { toArray } from '@aztec/foundation/iterable';
import { BufferReader, numToUInt8, serializeToBuffer } from '@aztec/foundation/serialize';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import { FunctionSelector } from '@aztec/stdlib/abi';
import type {
  ContractClassPublic,
  ContractClassPublicWithBlockNumber,
  ExecutablePrivateFunctionWithMembershipProof,
  UtilityFunctionWithMembershipProof,
} from '@aztec/stdlib/contract';
import { Vector } from '@aztec/stdlib/types';

/**
 * LMDB implementation of the ArchiverDataStore interface.
 */
export class ContractClassStore {
  #contractClasses: AztecAsyncMap<string, Buffer>;
  #bytecodeCommitments: AztecAsyncMap<string, Buffer>;

  constructor(private db: AztecAsyncKVStore) {
    this.#contractClasses = db.openMap('archiver_contract_classes');
    this.#bytecodeCommitments = db.openMap('archiver_bytecode_commitments');
  }

  async addContractClass(
    contractClass: ContractClassPublic,
    bytecodeCommitment: Fr,
    blockNumber: number,
  ): Promise<void> {
    await this.#contractClasses.setIfNotExists(
      contractClass.id.toString(),
      serializeContractClassPublic({ ...contractClass, l2BlockNumber: blockNumber }),
    );
    await this.#bytecodeCommitments.setIfNotExists(contractClass.id.toString(), bytecodeCommitment.toBuffer());
  }

  async deleteContractClasses(contractClass: ContractClassPublic, blockNumber: number): Promise<void> {
    const restoredContractClass = await this.#contractClasses.getAsync(contractClass.id.toString());
    if (restoredContractClass && deserializeContractClassPublic(restoredContractClass).l2BlockNumber >= blockNumber) {
      await this.#contractClasses.delete(contractClass.id.toString());
      await this.#bytecodeCommitments.delete(contractClass.id.toString());
    }
  }

  async getContractClass(id: Fr): Promise<ContractClassPublic | undefined> {
    const contractClass = await this.#contractClasses.getAsync(id.toString());
    return contractClass && { ...deserializeContractClassPublic(contractClass), id };
  }

  async getBytecodeCommitment(id: Fr): Promise<Fr | undefined> {
    const value = await this.#bytecodeCommitments.getAsync(id.toString());
    return value === undefined ? undefined : Fr.fromBuffer(value);
  }

  async getContractClassIds(): Promise<Fr[]> {
    return (await toArray(this.#contractClasses.keysAsync())).map(key => Fr.fromHexString(key));
  }

  async addFunctions(
    contractClassId: Fr,
    newPrivateFunctions: ExecutablePrivateFunctionWithMembershipProof[],
    newUtilityFunctions: UtilityFunctionWithMembershipProof[],
  ): Promise<boolean> {
    await this.db.transactionAsync(async () => {
      const existingClassBuffer = await this.#contractClasses.getAsync(contractClassId.toString());
      if (!existingClassBuffer) {
        throw new Error(`Unknown contract class ${contractClassId} when adding private functions to store`);
      }

      const existingClass = deserializeContractClassPublic(existingClassBuffer);
      const { privateFunctions: existingPrivateFns, utilityFunctions: existingUtilityFns } = existingClass;

      const updatedClass: Omit<ContractClassPublicWithBlockNumber, 'id'> = {
        ...existingClass,
        privateFunctions: [
          ...existingPrivateFns,
          ...newPrivateFunctions.filter(newFn => !existingPrivateFns.some(f => f.selector.equals(newFn.selector))),
        ],
        utilityFunctions: [
          ...existingUtilityFns,
          ...newUtilityFunctions.filter(newFn => !existingUtilityFns.some(f => f.selector.equals(newFn.selector))),
        ],
      };
      await this.#contractClasses.set(contractClassId.toString(), serializeContractClassPublic(updatedClass));
    });

    return true;
  }
}

function serializeContractClassPublic(contractClass: Omit<ContractClassPublicWithBlockNumber, 'id'>): Buffer {
  return serializeToBuffer(
    contractClass.l2BlockNumber,
    numToUInt8(contractClass.version),
    contractClass.artifactHash,
    contractClass.privateFunctions.length,
    contractClass.privateFunctions.map(serializePrivateFunction),
    contractClass.utilityFunctions.length,
    contractClass.utilityFunctions.map(serializeUtilityFunction),
    contractClass.packedBytecode.length,
    contractClass.packedBytecode,
    contractClass.privateFunctionsRoot,
  );
}

function serializePrivateFunction(fn: ExecutablePrivateFunctionWithMembershipProof): Buffer {
  return serializeToBuffer(
    fn.selector,
    fn.vkHash,
    fn.bytecode.length,
    fn.bytecode,
    fn.functionMetadataHash,
    fn.artifactMetadataHash,
    fn.utilityFunctionsTreeRoot,
    new Vector(fn.privateFunctionTreeSiblingPath),
    fn.privateFunctionTreeLeafIndex,
    new Vector(fn.artifactTreeSiblingPath),
    fn.artifactTreeLeafIndex,
  );
}

function serializeUtilityFunction(fn: UtilityFunctionWithMembershipProof): Buffer {
  return serializeToBuffer(
    fn.selector,
    fn.bytecode.length,
    fn.bytecode,
    fn.functionMetadataHash,
    fn.artifactMetadataHash,
    fn.privateFunctionsArtifactTreeRoot,
    new Vector(fn.artifactTreeSiblingPath),
    fn.artifactTreeLeafIndex,
  );
}

function deserializeContractClassPublic(buffer: Buffer): Omit<ContractClassPublicWithBlockNumber, 'id'> {
  const reader = BufferReader.asReader(buffer);
  return {
    l2BlockNumber: reader.readNumber(),
    version: reader.readUInt8() as 1,
    artifactHash: reader.readObject(Fr),
    privateFunctions: reader.readVector({ fromBuffer: deserializePrivateFunction }),
    utilityFunctions: reader.readVector({ fromBuffer: deserializeUtilityFunction }),
    packedBytecode: reader.readBuffer(),
    privateFunctionsRoot: reader.readObject(Fr),
  };
}

function deserializePrivateFunction(buffer: Buffer | BufferReader): ExecutablePrivateFunctionWithMembershipProof {
  const reader = BufferReader.asReader(buffer);
  return {
    selector: reader.readObject(FunctionSelector),
    vkHash: reader.readObject(Fr),
    bytecode: reader.readBuffer(),
    functionMetadataHash: reader.readObject(Fr),
    artifactMetadataHash: reader.readObject(Fr),
    utilityFunctionsTreeRoot: reader.readObject(Fr),
    privateFunctionTreeSiblingPath: reader.readVector(Fr),
    privateFunctionTreeLeafIndex: reader.readNumber(),
    artifactTreeSiblingPath: reader.readVector(Fr),
    artifactTreeLeafIndex: reader.readNumber(),
  };
}

function deserializeUtilityFunction(buffer: Buffer | BufferReader): UtilityFunctionWithMembershipProof {
  const reader = BufferReader.asReader(buffer);
  return {
    selector: reader.readObject(FunctionSelector),
    bytecode: reader.readBuffer(),
    functionMetadataHash: reader.readObject(Fr),
    artifactMetadataHash: reader.readObject(Fr),
    privateFunctionsArtifactTreeRoot: reader.readObject(Fr),
    artifactTreeSiblingPath: reader.readVector(Fr),
    artifactTreeLeafIndex: reader.readNumber(),
  };
}
