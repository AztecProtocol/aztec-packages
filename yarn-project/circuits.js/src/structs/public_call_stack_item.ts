import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, serializeToBuffer, serializeToFields } from '@aztec/foundation/serialize';
import { FieldsOf } from '@aztec/foundation/types';

import { computePublicCallStackItemHash } from '../abis/abis.js';
import { CallRequest, CallerContext } from './call_request.js';
import { FunctionData } from './function_data.js';
import { PublicCircuitPublicInputs } from './public_circuit_public_inputs.js';

/**
 * Call stack item on a public call.
 */
export class PublicCallStackItem {
  constructor(
    /**
     * Address of the contract on which the function is invoked.
     */
    public contractAddress: AztecAddress,
    /**
     * Data identifying the function being called.
     */
    public functionData: FunctionData,
    /**
     * Public inputs to the public kernel circuit.
     */
    public publicInputs: PublicCircuitPublicInputs,
    /**
     * Whether the current callstack item should be considered a public fn execution request.
     */
    public isExecutionRequest: boolean,
  ) {}

  static getFields(fields: FieldsOf<PublicCallStackItem>) {
    return [fields.contractAddress, fields.functionData, fields.publicInputs, fields.isExecutionRequest] as const;
  }

  toBuffer() {
    return serializeToBuffer(...PublicCallStackItem.getFields(this));
  }

  toFields(): Fr[] {
    return serializeToFields(...PublicCallStackItem.getFields(this));
  }

  /**
   * Deserializes from a buffer or reader.
   * @param buffer - Buffer or reader to read from.
   * @returns The deserialized instance.
   */
  static fromBuffer(buffer: Buffer | BufferReader): PublicCallStackItem {
    const reader = BufferReader.asReader(buffer);
    return new PublicCallStackItem(
      reader.readObject(AztecAddress),
      reader.readObject(FunctionData),
      reader.readObject(PublicCircuitPublicInputs),
      reader.readBoolean(),
    );
  }

  static fromFields(fields: Fr[] | FieldReader): PublicCallStackItem {
    const reader = FieldReader.asReader(fields);

    const contractAddress = AztecAddress.fromFields(reader);
    const functionData = FunctionData.fromFields(reader);
    const publicInputs = PublicCircuitPublicInputs.fromFields(reader);
    const isExecutionRequest = reader.readBoolean();

    return new PublicCallStackItem(contractAddress, functionData, publicInputs, isExecutionRequest);
  }

  /**
   * Returns a new instance of PublicCallStackItem with zero contract address, function data and public inputs.
   * @returns A new instance of PublicCallStackItem with zero contract address, function data and public inputs.
   */
  public static empty(): PublicCallStackItem {
    return new PublicCallStackItem(
      AztecAddress.ZERO,
      FunctionData.empty({ isPrivate: false }),
      PublicCircuitPublicInputs.empty(),
      false,
    );
  }

  isEmpty() {
    return this.contractAddress.isZero() && this.functionData.isEmpty() && this.publicInputs.isEmpty();
  }

  /**
   * Computes this call stack item hash.
   * @returns Hash.
   */
  public hash() {
    return computePublicCallStackItemHash(this);
  }

  /**
   * Creates a new CallRequest with values of the calling contract.
   * @returns A CallRequest instance with the contract address, caller context, and the hash of the call stack item.
   */
  public toCallRequest() {
    if (this.isEmpty()) {
      return CallRequest.empty();
    }

    const callContext = this.publicInputs.callContext;
    const callerContext = callContext.isDelegateCall
      ? new CallerContext(callContext.msgSender, callContext.storageContractAddress)
      : CallerContext.empty();
    // todo: populate side effect counters correctly
    return new CallRequest(this.hash(), callContext.msgSender, callerContext, Fr.ZERO, Fr.ZERO);
  }
}
