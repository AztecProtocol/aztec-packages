import { AztecAddress, Fr, PublicKeys } from '@aztec/aztec.js';
import type { ProtocolContract } from '@aztec/protocol-contracts';
import { type ContractArtifact, type FunctionArtifact, FunctionSelector } from '@aztec/stdlib/abi';
import type { ContractClassIdPreimage, ContractClassWithId, ContractInstanceWithAddress } from '@aztec/stdlib/contract';

/**
 * Serializes an array of ProtocolContracts for worker thread communication.
 */
export function serializeProtocolContracts(contracts: ProtocolContract[]): string {
  const serializable = contracts.map(contract => ({
    instance: contractInstanceToBuffer(contract.instance).toString('base64'),
    artifact: contractArtifactToBuffer(contract.artifact).toString('base64'),
    address: contract.address.toBuffer().toString('base64'),
    contractClass: {
      // ContractClassWithId fields
      id: contract.contractClass.id.toBuffer().toString('base64'),
      version: contract.contractClass.version,
      artifactHash: contract.contractClass.artifactHash.toBuffer().toString('base64'),
      privateFunctions: contract.contractClass.privateFunctions.map(fn => ({
        selector: fn.selector.toBuffer().toString('base64'),
        vkHash: fn.vkHash.toBuffer().toString('base64'),
      })),
      packedBytecode: contract.contractClass.packedBytecode.toString('base64'),
      // ContractClassIdPreimage fields
      privateFunctionsRoot: contract.contractClass.privateFunctionsRoot.toBuffer().toString('base64'),
      publicBytecodeCommitment: contract.contractClass.publicBytecodeCommitment.toBuffer().toString('base64'),
    },
  }));

  return JSON.stringify(serializable);
}

/**
 * Deserializes ProtocolContracts from the serialized format.
 */
export function deserializeProtocolContracts(serialized: string): ProtocolContract[] {
  const data = JSON.parse(serialized);

  return data.map((contract: any) => ({
    instance: bufferToContractInstance(Buffer.from(contract.instance, 'base64')),
    artifact: bufferToContractArtifact(Buffer.from(contract.artifact, 'base64')),
    address: AztecAddress.fromBuffer(Buffer.from(contract.address, 'base64')),
    contractClass: {
      // ContractClassWithId fields
      id: Fr.fromBuffer(Buffer.from(contract.contractClass.id, 'base64')),
      version: contract.contractClass.version,
      artifactHash: Fr.fromBuffer(Buffer.from(contract.contractClass.artifactHash, 'base64')),
      privateFunctions: contract.contractClass.privateFunctions.map((fn: any) => ({
        selector: FunctionSelector.fromBuffer(Buffer.from(fn.selector, 'base64')),
        vkHash: Fr.fromBuffer(Buffer.from(fn.vkHash, 'base64')),
      })),
      packedBytecode: Buffer.from(contract.contractClass.packedBytecode, 'base64'),
      // ContractClassIdPreimage fields
      privateFunctionsRoot: Fr.fromBuffer(Buffer.from(contract.contractClass.privateFunctionsRoot, 'base64')),
      publicBytecodeCommitment: Fr.fromBuffer(Buffer.from(contract.contractClass.publicBytecodeCommitment, 'base64')),
    } as ContractClassWithId & ContractClassIdPreimage,
  }));
}

/**
 * Serializes a ContractArtifact to a Buffer for worker thread communication.
 * Converts all class instances (Fr, AztecAddress, etc.) to buffers.
 */
export function contractArtifactToBuffer(artifact: ContractArtifact): Buffer {
  // Convert to a plain object with buffers instead of class instances
  const serializable = {
    name: artifact.name,
    functions: artifact.functions.map(fn => ({
      ...fn,
      // FunctionArtifact already has bytecode as Buffer
      // Other fields are strings or plain objects
    })),
    nonDispatchPublicFunctions: artifact.nonDispatchPublicFunctions,
    outputs: artifact.outputs,
    // Store any other fields as-is
    ...Object.fromEntries(
      Object.entries(artifact).filter(
        ([key]) => !['name', 'functions', 'nonDispatchPublicFunctions', 'outputs'].includes(key),
      ),
    ),
  };

  // Serialize to JSON then to Buffer
  return Buffer.from(JSON.stringify(serializable));
}

/**
 * Deserializes a Buffer back to a ContractArtifact.
 */
export function bufferToContractArtifact(buffer: Buffer): ContractArtifact {
  const serialized = JSON.parse(buffer.toString());

  // Restore Buffer fields that may have been serialized as objects
  return {
    ...serialized,
    functions: serialized.functions.map((fn: any) => ({
      ...fn,
      bytecode: Buffer.from(fn.bytecode),
    })) as FunctionArtifact[],
  };
}

/**
 * Serializes a ContractInstanceWithAddress to a Buffer for worker thread communication.
 * Converts all class instances (Fr, AztecAddress, PublicKeys) to buffers.
 */
export function contractInstanceToBuffer(instance: ContractInstanceWithAddress): Buffer {
  const serializable = {
    address: instance.address.toBuffer(),
    version: instance.version,
    salt: instance.salt.toBuffer(),
    deployer: instance.deployer.toBuffer(),
    currentContractClassId: instance.currentContractClassId.toBuffer(),
    originalContractClassId: instance.originalContractClassId.toBuffer(),
    initializationHash: instance.initializationHash.toBuffer(),
    publicKeys: instance.publicKeys.toBuffer(),
  };

  return Buffer.from(
    JSON.stringify(serializable, (key, value) => {
      // Convert Buffer to hex string for JSON serialization
      if (Buffer.isBuffer(value)) {
        return { type: 'Buffer', data: value.toString('hex') };
      }
      return value;
    }),
  );
}

/**
 * Deserializes a Buffer back to a ContractInstanceWithAddress.
 */
export function bufferToContractInstance(buffer: Buffer): ContractInstanceWithAddress {
  const serialized = JSON.parse(buffer.toString(), (key, value) => {
    // Restore Buffers from hex strings
    if (value && typeof value === 'object' && value.type === 'Buffer') {
      return Buffer.from(value.data, 'hex');
    }
    return value;
  });

  return {
    address: AztecAddress.fromBuffer(serialized.address),
    version: serialized.version,
    salt: Fr.fromBuffer(serialized.salt),
    deployer: AztecAddress.fromBuffer(serialized.deployer),
    currentContractClassId: Fr.fromBuffer(serialized.currentContractClassId),
    originalContractClassId: Fr.fromBuffer(serialized.originalContractClassId),
    initializationHash: Fr.fromBuffer(serialized.initializationHash),
    publicKeys: PublicKeys.fromBuffer(serialized.publicKeys),
  };
}

/**
 * Serializes ForeignCallArgs that may contain ContractArtifact and ContractInstanceWithAddress.
 * Replaces class instances with serializable markers and buffers.
 */
export function serializeForeignCallArgs(args: any[]): any[] {
  return args.map(arg => {
    // Check if it's a ContractArtifact (has functions array and outputs)
    if (arg && typeof arg === 'object' && 'functions' in arg && 'outputs' in arg) {
      return {
        __type: 'ContractArtifact',
        data: contractArtifactToBuffer(arg).toString('base64'),
      };
    }
    // Check if it's a ContractInstanceWithAddress (has address and publicKeys)
    if (arg && typeof arg === 'object' && 'address' in arg && 'publicKeys' in arg) {
      return {
        __type: 'ContractInstance',
        data: contractInstanceToBuffer(arg).toString('base64'),
      };
    }
    // Return as-is for strings and arrays (ForeignCallSingle/Array)
    return arg;
  });
}

/**
 * Deserializes ForeignCallArgs back from the serialized format.
 */
export function deserializeForeignCallArgs(args: any[]): any[] {
  return args.map(arg => {
    if (arg && typeof arg === 'object' && '__type' in arg) {
      const buffer = Buffer.from(arg.data, 'base64');
      switch (arg.__type) {
        case 'ContractArtifact':
          return bufferToContractArtifact(buffer);
        case 'ContractInstance':
          return bufferToContractInstance(buffer);
      }
    }
    return arg;
  });
}
