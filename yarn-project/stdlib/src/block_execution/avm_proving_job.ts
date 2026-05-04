import { AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED } from '@aztec/constants';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import type { FieldsOf } from '@aztec/foundation/types';

import { AvmCircuitInputs } from '../avm/avm.js';
import { AvmCircuitPublicInputs } from '../avm/avm_circuit_public_inputs.js';
import { RecursiveProof } from '../proofs/recursive_proof.js';
import { PublicBaseRollupHints } from '../rollup/base_rollup_hints.js';

/**
 * Per-tx data the execution agent attaches to a public-tx AVM proving job and the
 * proving agent passes through unchanged into the proving job's result. Lets the
 * orchestrator drive the public base rollup without re-running execution against its
 * own world-state fork.
 */
export class BlockExecutionTxData {
  constructor(
    /**
     * Pre-computed base-rollup hints (membership witnesses, sibling paths) for this
     * tx, against the agent's fork after every prior tx in the block has been applied.
     */
    public readonly baseRollupHints: PublicBaseRollupHints,
    /**
     * Public inputs of the AVM circuit for this tx. The orchestrator uses these to
     * build `PublicTxBaseRollupPrivateInputs` once the AVM proof itself arrives.
     */
    public readonly avmCircuitPublicInputs: AvmCircuitPublicInputs,
  ) {}

  static from(fields: FieldsOf<BlockExecutionTxData>): BlockExecutionTxData {
    return new BlockExecutionTxData(...BlockExecutionTxData.getFields(fields));
  }

  static getFields(fields: FieldsOf<BlockExecutionTxData>) {
    return [fields.baseRollupHints, fields.avmCircuitPublicInputs] as const;
  }

  toBuffer(): Buffer {
    return serializeToBuffer(this.baseRollupHints, this.avmCircuitPublicInputs);
  }

  static fromBuffer(buffer: Buffer | BufferReader): BlockExecutionTxData {
    const reader = BufferReader.asReader(buffer);
    return new BlockExecutionTxData(
      reader.readObject(PublicBaseRollupHints),
      reader.readObject(AvmCircuitPublicInputs),
    );
  }

  toString(): string {
    return bufferToHex(this.toBuffer());
  }

  static fromString(str: string): BlockExecutionTxData {
    return BlockExecutionTxData.fromBuffer(hexToBuffer(str));
  }

  toJSON() {
    return this.toBuffer();
  }

  static get schema() {
    return bufferSchemaFor(BlockExecutionTxData);
  }
}

/**
 * Inputs to a public-tx AVM proving job. Wraps the `AvmCircuitInputs` (which the
 * AVM proving agent feeds into the circuit) plus optional execution-agent passenger
 * data (`BlockExecutionTxData`) needed by the orchestrator on the result side.
 *
 * The legacy `addTxs` path constructs these with `executionTxData` undefined and
 * does not use the passenger field. The execution-offload path attaches the data
 * so the orchestrator can drive the public base rollup without its own fork.
 */
export class AvmProvingInputs {
  constructor(
    public readonly avmCircuitInputs: AvmCircuitInputs,
    public readonly executionTxData?: BlockExecutionTxData,
  ) {}

  static fromAvmCircuitInputs(avmCircuitInputs: AvmCircuitInputs): AvmProvingInputs {
    return new AvmProvingInputs(avmCircuitInputs, undefined);
  }

  toBuffer(): Buffer {
    // AvmCircuitInputs serializes via JSON (not BufferReader-compatible), so we
    // length-prefix it as an opaque sub-buffer.
    const avmInputsBuf = this.avmCircuitInputs.toBuffer();
    const hasExtras = this.executionTxData !== undefined ? 1 : 0;
    if (this.executionTxData) {
      return serializeToBuffer(avmInputsBuf.length, avmInputsBuf, hasExtras, this.executionTxData);
    }
    return serializeToBuffer(avmInputsBuf.length, avmInputsBuf, hasExtras);
  }

  static fromBuffer(buffer: Buffer | BufferReader): AvmProvingInputs {
    const reader = BufferReader.asReader(buffer);
    const avmInputsLen = reader.readNumber();
    const avmInputsBuf = reader.readBytes(avmInputsLen);
    const avmCircuitInputs = AvmCircuitInputs.fromBuffer(avmInputsBuf);
    const hasExtras = reader.readNumber();
    const executionTxData = hasExtras === 1 ? reader.readObject(BlockExecutionTxData) : undefined;
    return new AvmProvingInputs(avmCircuitInputs, executionTxData);
  }

  toString(): string {
    return bufferToHex(this.toBuffer());
  }

  static fromString(str: string): AvmProvingInputs {
    return AvmProvingInputs.fromBuffer(hexToBuffer(str));
  }

  toJSON() {
    return this.toBuffer();
  }

  static get schema() {
    return bufferSchemaFor(AvmProvingInputs);
  }
}

/**
 * Result of a public-tx AVM proving job. Wraps the AVM proof and (when the inputs
 * carried it) the execution-agent passenger data passed through by the proving agent.
 */
export class AvmProvingResult {
  constructor(
    public readonly proof: RecursiveProof<typeof AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED>,
    public readonly executionTxData?: BlockExecutionTxData,
  ) {}

  static fromProof(proof: RecursiveProof<typeof AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED>): AvmProvingResult {
    return new AvmProvingResult(proof, undefined);
  }

  toBuffer(): Buffer {
    const hasExtras = this.executionTxData !== undefined ? 1 : 0;
    if (this.executionTxData) {
      return serializeToBuffer(this.proof, hasExtras, this.executionTxData);
    }
    return serializeToBuffer(this.proof, hasExtras);
  }

  static fromBuffer(buffer: Buffer | BufferReader): AvmProvingResult {
    const reader = BufferReader.asReader(buffer);
    const proof = RecursiveProof.fromBuffer(reader, AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED);
    const hasExtras = reader.readNumber();
    const executionTxData = hasExtras === 1 ? reader.readObject(BlockExecutionTxData) : undefined;
    return new AvmProvingResult(proof, executionTxData);
  }

  toString(): string {
    return bufferToHex(this.toBuffer());
  }

  static fromString(str: string): AvmProvingResult {
    return AvmProvingResult.fromBuffer(hexToBuffer(str));
  }

  toJSON() {
    return this.toBuffer();
  }

  static get schema() {
    return bufferSchemaFor(AvmProvingResult);
  }
}
