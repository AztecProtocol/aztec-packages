import { Fr } from '@aztec/foundation/fields';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import { type FieldsOf } from '@aztec/foundation/types';

import { RECURSIVE_ROLLUP_HONK_PROOF_LENGTH } from '../../constants.gen.js';
import { BlockHeader } from '../block_header.js';
import { RecursiveProof } from '../recursive_proof.js';
import { VerificationKeyAsFields } from '../verification_key.js';

export class PrivateKernelEmptyInputData {
  constructor(
    public readonly header: BlockHeader,
    public readonly chainId: Fr,
    public readonly version: Fr,
    public readonly vkTreeRoot: Fr,
    public readonly protocolContractTreeRoot: Fr,
  ) {}

  toBuffer(): Buffer {
    return serializeToBuffer(this.header, this.chainId, this.version, this.vkTreeRoot, this.protocolContractTreeRoot);
  }

  toString(): string {
    return bufferToHex(this.toBuffer());
  }

  static fromBuffer(buf: Buffer) {
    const reader = BufferReader.asReader(buf);
    return new PrivateKernelEmptyInputData(
      reader.readObject(BlockHeader),
      reader.readObject(Fr),
      reader.readObject(Fr),
      reader.readObject(Fr),
      reader.readObject(Fr),
    );
  }

  static fromString(str: string): PrivateKernelEmptyInputData {
    return PrivateKernelEmptyInputData.fromBuffer(hexToBuffer(str));
  }

  static from(fields: FieldsOf<PrivateKernelEmptyInputData>) {
    return new PrivateKernelEmptyInputData(
      fields.header,
      fields.chainId,
      fields.version,
      fields.vkTreeRoot,
      fields.protocolContractTreeRoot,
    );
  }

  /** Returns a buffer representation for JSON serialization. */
  toJSON() {
    return this.toBuffer();
  }

  /** Creates an instance from a hex string. */
  static get schema() {
    return bufferSchemaFor(PrivateKernelEmptyInputData);
  }
}

export class PrivateKernelEmptyInputs {
  constructor(
    public readonly emptyNested: EmptyNestedData,
    public readonly header: BlockHeader,
    public readonly chainId: Fr,
    public readonly version: Fr,
    public readonly vkTreeRoot: Fr,
    public readonly protocolContractTreeRoot: Fr,
  ) {}

  toBuffer(): Buffer {
    return serializeToBuffer(
      this.emptyNested,
      this.header,
      this.chainId,
      this.version,
      this.vkTreeRoot,
      this.protocolContractTreeRoot,
    );
  }

  static from(fields: FieldsOf<PrivateKernelEmptyInputs>) {
    return new PrivateKernelEmptyInputs(
      fields.emptyNested,
      fields.header,
      fields.chainId,
      fields.version,
      fields.vkTreeRoot,
      fields.protocolContractTreeRoot,
    );
  }

  static fromBuffer(buf: Buffer | BufferReader): PrivateKernelEmptyInputs {
    const reader = BufferReader.asReader(buf);
    return new PrivateKernelEmptyInputs(
      reader.readObject(EmptyNestedData),
      reader.readObject(BlockHeader),
      reader.readObject(Fr),
      reader.readObject(Fr),
      reader.readObject(Fr),
      reader.readObject(Fr),
    );
  }
}

export class EmptyNestedCircuitInputs {
  toBuffer(): Buffer {
    return Buffer.alloc(0);
  }
}

export class EmptyNestedData {
  constructor(
    public readonly proof: RecursiveProof<typeof RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>,
    public readonly vk: VerificationKeyAsFields,
  ) {}

  toBuffer(): Buffer {
    return serializeToBuffer(this.proof, this.vk);
  }

  static fromBuffer(buf: Buffer | BufferReader): EmptyNestedData {
    const reader = BufferReader.asReader(buf);
    const recursiveProof = reader.readObject(RecursiveProof);

    if (recursiveProof.proof.length !== RECURSIVE_ROLLUP_HONK_PROOF_LENGTH) {
      throw new TypeError(
        `Invalid proof length. Expected: ${RECURSIVE_ROLLUP_HONK_PROOF_LENGTH} got: ${recursiveProof.proof.length}`,
      );
    }

    return new EmptyNestedData(
      recursiveProof as RecursiveProof<typeof RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>,
      reader.readObject(VerificationKeyAsFields),
    );
  }
}
