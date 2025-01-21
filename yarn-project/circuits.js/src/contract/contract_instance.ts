import {
  type ContractArtifact,
  type FunctionArtifact,
  FunctionSelector,
  getDefaultInitializer,
} from '@aztec/foundation/abi';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, numToUInt8, serializeToBuffer } from '@aztec/foundation/serialize';
import { type FieldsOf } from '@aztec/foundation/types';

import { getContractClassFromArtifact } from '../contract/contract_class.js';
import { computeContractClassId } from '../contract/contract_class_id.js';
import { PublicKeys } from '../types/public_keys.js';
import {
  computeContractAddressFromInstance,
  computeInitializationHash,
  computeInitializationHashFromEncodedArgs,
} from './contract_address.js';
import { type ContractInstance, type ContractInstanceWithAddress } from './interfaces/contract_instance.js';

const VERSION = 1 as const;

export class SerializableContractInstance {
  public readonly version = VERSION;
  public readonly salt: Fr;
  public readonly deployer: AztecAddress;
  public readonly contractClassId: Fr;
  public readonly initializationHash: Fr;
  public readonly publicKeys: PublicKeys;

  constructor(instance: ContractInstance) {
    if (instance.version !== VERSION) {
      throw new Error(`Unexpected contract class version ${instance.version}`);
    }
    this.salt = instance.salt;
    this.deployer = instance.deployer;
    this.contractClassId = instance.contractClassId;
    this.initializationHash = instance.initializationHash;
    this.publicKeys = instance.publicKeys;
  }

  public toBuffer() {
    return serializeToBuffer(
      numToUInt8(this.version),
      this.salt,
      this.deployer,
      this.contractClassId,
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
      contractClassId: reader.readObject(Fr),
      initializationHash: reader.readObject(Fr),
      publicKeys: reader.readObject(PublicKeys),
    });
  }

  static async random(opts: Partial<FieldsOf<ContractInstance>> = {}) {
    return new SerializableContractInstance({
      version: VERSION,
      salt: Fr.random(),
      deployer: await AztecAddress.random(),
      contractClassId: Fr.random(),
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
      contractClassId: Fr.zero(),
      initializationHash: Fr.zero(),
      publicKeys: PublicKeys.default(),
    });
  }
}

/**
 * Generates a Contract Instance from the deployment params.
 * @param artifact - The account contract build artifact.
 * @param opts - Options for the deployment.
 * @returns - The contract instance
 */
export function getContractInstanceFromDeployParams(
  artifact: ContractArtifact,
  opts: {
    constructorArtifact?: FunctionArtifact | string;
    constructorArgs?: any[];
    skipArgsDecoding?: boolean;
    salt?: Fr;
    publicKeys?: PublicKeys;
    deployer?: AztecAddress;
  },
): ContractInstanceWithAddress {
  const args = opts.constructorArgs ?? [];
  const salt = opts.salt ?? Fr.random();
  const constructorArtifact = getConstructorArtifact(artifact, opts.constructorArtifact);
  const deployer = opts.deployer ?? AztecAddress.ZERO;
  const contractClass = getContractClassFromArtifact(artifact);
  const contractClassId = computeContractClassId(contractClass);
  const initializationHash =
    constructorArtifact && opts?.skipArgsDecoding
      ? computeInitializationHashFromEncodedArgs(
          FunctionSelector.fromNameAndParameters(constructorArtifact?.name, constructorArtifact?.parameters),
          args,
        )
      : computeInitializationHash(constructorArtifact, args);
  const publicKeys = opts.publicKeys ?? PublicKeys.default();

  const instance: ContractInstance = {
    contractClassId,
    initializationHash,
    publicKeys,
    salt,
    deployer,
    version: 1,
  };

  return { ...instance, address: computeContractAddressFromInstance(instance) };
}

function getConstructorArtifact(
  artifact: ContractArtifact,
  requestedConstructorArtifact: FunctionArtifact | string | undefined,
): FunctionArtifact | undefined {
  if (typeof requestedConstructorArtifact === 'string') {
    const found = artifact.functions.find(fn => fn.name === requestedConstructorArtifact);
    if (!found) {
      throw new Error(`No constructor found with name ${requestedConstructorArtifact}`);
    }
    return found;
  }
  return requestedConstructorArtifact ?? getDefaultInitializer(artifact);
}
