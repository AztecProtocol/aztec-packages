import { Fr } from '@aztec/foundation/fields';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, bigintToUInt64BE, serializeToBuffer } from '@aztec/foundation/serialize';

import { AztecAddress } from '../aztec-address/index.js';
import { TxConstantData } from '../tx/tx_constant_data.js';
import type { UInt64 } from '../types/shared.js';
import { PrivateAccumulatedData } from './private_accumulated_data.js';
import { PrivateValidationRequests } from './private_validation_requests.js';
import { PublicCallRequest } from './public_call_request.js';

/**
 * Public inputs to the inner private kernel circuit
 */
export class PrivateKernelCircuitPublicInputs {
  constructor(
    /**
     * Data which is not modified by the circuits.
     */
    public constants: TxConstantData,
    /**
     * The side effect counter that non-revertible side effects are all beneath.
     */
    public minRevertibleSideEffectCounter: Fr,
    /**
     * Validation requests accumulated from public functions.
     */
    public validationRequests: PrivateValidationRequests,
    /**
     * Data accumulated from both public and private circuits.
     */
    public end: PrivateAccumulatedData,
    /**
     * The call request for the public teardown function
     */
    public publicTeardownCallRequest: PublicCallRequest,
    /**
     * The address of the fee payer for the transaction
     */
    public feePayer: AztecAddress,
    /**
     * The timestamp by which the transaction must be included in a block.
     */
    public includeByTimestamp: UInt64,
    /**
     * Wether this is a private only tx or not
     */
    public isPrivateOnly: boolean,
    /**
     * The nullifier that will be used for nonce generation
     */
    public claimedFirstNullifier: Fr,
  ) {}

  static get schema() {
    return bufferSchemaFor(PrivateKernelCircuitPublicInputs);
  }

  toJSON() {
    return this.toBuffer();
  }

  toBuffer() {
    return serializeToBuffer(
      this.constants,
      this.minRevertibleSideEffectCounter,
      this.validationRequests,
      this.end,
      this.publicTeardownCallRequest,
      this.feePayer,
      bigintToUInt64BE(this.includeByTimestamp),
      this.isPrivateOnly,
      this.claimedFirstNullifier,
    );
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer or reader to read from.
   * @returns A new instance of PrivateKernelInnerCircuitPublicInputs.
   */
  static fromBuffer(buffer: Buffer | BufferReader): PrivateKernelCircuitPublicInputs {
    const reader = BufferReader.asReader(buffer);
    return new PrivateKernelCircuitPublicInputs(
      reader.readObject(TxConstantData),
      reader.readObject(Fr),
      reader.readObject(PrivateValidationRequests),
      reader.readObject(PrivateAccumulatedData),
      reader.readObject(PublicCallRequest),
      reader.readObject(AztecAddress),
      reader.readUInt64(),
      reader.readBoolean(),
      reader.readObject(Fr),
    );
  }

  static empty() {
    return new PrivateKernelCircuitPublicInputs(
      TxConstantData.empty(),
      Fr.zero(),
      PrivateValidationRequests.empty(),
      PrivateAccumulatedData.empty(),
      PublicCallRequest.empty(),
      AztecAddress.ZERO,
      0n,
      false,
      Fr.zero(),
    );
  }
}
