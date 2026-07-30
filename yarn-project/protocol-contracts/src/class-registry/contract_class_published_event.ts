import { CONTRACT_CLASS_PUBLISHED_MAGIC_VALUE } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import { FieldReader } from '@aztec/foundation/serialize';
import { bufferFromFields } from '@aztec/stdlib/abi';
import {
  type ContractClassPublic,
  type ContractClassPublicWithCommitment,
  computePublicBytecodeCommitment,
} from '@aztec/stdlib/contract';
import type { ContractClassLog } from '@aztec/stdlib/logs';

import { ProtocolContractAddress } from '../protocol_contract_data.js';

/** Event emitted from the ContractClassRegistry. */
export class ContractClassPublishedEvent {
  constructor(
    public readonly contractClassId: Fr,
    public readonly version: number,
    public readonly artifactHash: Fr,
    public readonly privateFunctionsRoot: Fr,
    public readonly packedPublicBytecode: Buffer,
  ) {}

  static isContractClassPublishedEvent(log: ContractClassLog) {
    return (
      log.contractAddress.equals(ProtocolContractAddress.ContractClassRegistry) &&
      log.fields.fields[0].toBigInt() === CONTRACT_CLASS_PUBLISHED_MAGIC_VALUE
    );
  }

  static fromLog(log: ContractClassLog) {
    // See how the log is serialized in `noir-projects/fnd/noir-contracts/contracts/protocol/contract_class_registry_contract/src/events/class_published.nr`.
    const fieldsWithoutTag = log.fields.fields.slice(1);
    const reader = new FieldReader(fieldsWithoutTag);
    const contractClassId = reader.readField();
    const version = reader.readField().toNumber();
    const artifactHash = reader.readField();
    const privateFunctionsRoot = reader.readField();
    const bytecodeFields = reader.readFieldArray(fieldsWithoutTag.length - reader.cursor);
    // The fixed-size class log can hold at most this many packed-bytecode bytes (every payload field
    // carries 31 bytes). Bound the declared length to it so a malformed log can't declare a multi-MiB
    // length backed by a tiny payload and force a large allocation during early (pre-proof) validation.
    const maxByteLength = (bytecodeFields.length - 1) * (Fr.SIZE_IN_BYTES - 1);
    const packedPublicBytecode = bufferFromFields(bytecodeFields, maxByteLength);

    return new ContractClassPublishedEvent(
      contractClassId,
      version,
      artifactHash,
      privateFunctionsRoot,
      packedPublicBytecode,
    );
  }

  /** Converts the event to a contract class, without computing or validating the bytecode commitment. */
  toContractClassPublic(): ContractClassPublic {
    return {
      id: this.contractClassId,
      artifactHash: this.artifactHash,
      packedBytecode: this.packedPublicBytecode,
      privateFunctionsRoot: this.privateFunctionsRoot,
      version: this.version as 1,
    };
  }

  /** Converts the event to a contract class with its bytecode commitment (expensive). */
  async toContractClassPublicWithBytecodeCommitment(): Promise<ContractClassPublicWithCommitment> {
    const publicBytecodeCommitment = await computePublicBytecodeCommitment(this.packedPublicBytecode);
    return { ...this.toContractClassPublic(), publicBytecodeCommitment };
  }

  public static extractContractClassEvents(logs: ContractClassLog[]): ContractClassPublishedEvent[] {
    return logs
      .filter((log: ContractClassLog) => ContractClassPublishedEvent.isContractClassPublishedEvent(log))
      .map((log: ContractClassLog) => ContractClassPublishedEvent.fromLog(log));
  }
}
