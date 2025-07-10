import { Fr } from '@aztec/foundation/fields';
import { BufferReader, numToUInt8, serializeToBuffer } from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

import {
  type ContractArtifact,
  type FunctionAbi,
  type FunctionArtifact,
  FunctionSelector,
  getAllFunctionAbis,
  getDefaultInitializer,
} from '../abi/index.js';
import { AztecAddress } from '../aztec-address/index.js';
import { getContractClassFromArtifact } from '../contract/contract_class.js';
import { PublicKeys } from '../keys/public_keys.js';
import {
  computeContractAddressFromInstance,
  computeInitializationHash,
  computeInitializationHashFromEncodedArgs,
} from './contract_address.js';
import type { ContractInstance, ContractInstanceWithAddress } from './interfaces/contract_instance.js';

const VERSION = 1 as const;

export class SerializableContractInstance {
  public readonly version = VERSION;
  public readonly salt: Fr;
  public readonly deployer: AztecAddress;
  public readonly currentContractClassId: Fr;
  public readonly originalContractClassId: Fr;
  public readonly initializationHash: Fr;
  public readonly publicKeys: PublicKeys;

  constructor(instance: ContractInstance) {
    if (instance.version !== VERSION) {
      throw new Error(`Unexpected contract class version ${instance.version}`);
    }
    this.salt = instance.salt;
    this.deployer = instance.deployer;
    this.currentContractClassId = instance.currentContractClassId;
    this.originalContractClassId = instance.originalContractClassId;
    this.initializationHash = instance.initializationHash;
    this.publicKeys = instance.publicKeys;
  }

  public toBuffer() {
    return serializeToBuffer(
      numToUInt8(this.version),
      this.salt,
      this.deployer,
      this.currentContractClassId,
      this.originalContractClassId,
      this.initializationHash,
      this.publicKeys,
    );
  }

  /** Returns a copy of this object with its address included. */
  withAddress(address: AztecAddress): ContractInstanceWithAddress {
    return { ...this, address };
  }

  static fromBuffer(bufferOrReader: Buffer | BufferReader) {
    const reader = BufferReader.asReader(bufferOrReader);
    return new SerializableContractInstance({
      version: reader.readUInt8() as typeof VERSION,
      salt: reader.readObject(Fr),
      deployer: reader.readObject(AztecAddress),
      currentContractClassId: reader.readObject(Fr),
      originalContractClassId: reader.readObject(Fr),
      initializationHash: reader.readObject(Fr),
      publicKeys: reader.readObject(PublicKeys),
    });
  }

  static async random(opts: Partial<FieldsOf<ContractInstance>> = {}) {
    return new SerializableContractInstance({
      version: VERSION,
      salt: Fr.random(),
      deployer: await AztecAddress.random(),
      currentContractClassId: Fr.random(),
      originalContractClassId: Fr.random(),
      initializationHash: Fr.random(),
      publicKeys: await PublicKeys.random(),
      ...opts,
    });
  }

  static default() {
    return new SerializableContractInstance({
      version: VERSION,
      salt: Fr.zero(),
      deployer: AztecAddress.zero(),
      currentContractClassId: Fr.zero(),
      originalContractClassId: Fr.zero(),
      initializationHash: Fr.zero(),
      publicKeys: PublicKeys.default(),
    });
  }
}

/**
 * Generates a Contract Instance from some instantiation params.
 * @param artifact - The account contract build artifact.
 * @param opts - Options for the contract's instantiation.
 * @returns - The contract instance
 */
export async function getContractInstanceFromInstantiationParams(
  artifact: ContractArtifact,
  opts: {
    constructorArtifact?: FunctionAbi | string;
    constructorArgs?: any[];
    skipArgsDecoding?: boolean;
    salt?: Fr;
    publicKeys?: PublicKeys;
    deployer?: AztecAddress;
  },
): Promise<ContractInstanceWithAddress> {
  const args = opts.constructorArgs ?? [];
  const salt = opts.salt ?? Fr.random();
  const constructorArtifact = getConstructorArtifact(artifact, opts.constructorArtifact);
  const deployer = opts.deployer ?? AztecAddress.ZERO;
  const contractClass = await getContractClassFromArtifact(artifact);
  const initializationHash =
    constructorArtifact && opts?.skipArgsDecoding
      ? await computeInitializationHashFromEncodedArgs(
          await FunctionSelector.fromNameAndParameters(constructorArtifact?.name, constructorArtifact?.parameters),
          args,
        )
      : await computeInitializationHash(constructorArtifact, args);
  const publicKeys = opts.publicKeys ?? PublicKeys.default();

  const instance: ContractInstance = {
    currentContractClassId: contractClass.id,
    originalContractClassId: contractClass.id,
    initializationHash,
    publicKeys,
    salt,
    deployer,
    version: 1,
  };

  return { ...instance, address: await computeContractAddressFromInstance(instance) };
}

function getConstructorArtifact(
  artifact: ContractArtifact,
  requestedConstructorArtifact: FunctionArtifact | FunctionAbi | string | undefined,
): FunctionAbi | undefined {
  if (typeof requestedConstructorArtifact === 'string') {
    const found = getAllFunctionAbis(artifact).find(fn => fn.name === requestedConstructorArtifact);
    if (!found) {
      throw new Error(`No constructor found with name ${requestedConstructorArtifact}`);
    }
    return found;
  }
  // TODO: shouldn't we check that requestedConstructorArtifact exists on artifact before returning?
  return requestedConstructorArtifact ?? getDefaultInitializer(artifact);
}
