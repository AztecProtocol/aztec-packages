import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { ProtocolContracts } from '../tx/protocol_contracts.js';
import { TxRequest } from '../tx/tx_request.js';
import { PrivateCallData } from './private_call_data.js';

/**
 * Input to the private kernel circuit - initial call.
 */
export class PrivateKernelInitCircuitPrivateInputs {
  constructor(
    /**
     * The transaction request which led to the creation of these inputs.
     */
    public txRequest: TxRequest,
    /**
     * The root of the vk tree.
     */
    public vkTreeRoot: Fr,
    /**
     * The protocol contracts.
     */
    public protocolContracts: ProtocolContracts,
    /**
     * Private calldata corresponding to this iteration of the kernel.
     */
    public privateCall: PrivateCallData,
    /**
     * Wether this tx will make public calls or not.
     */
    public isPrivateOnly: boolean,
    /**
     * A hint to what will be the first nullifier of the transaction, used for nonce generation.
     */
    public firstNullifierHint: Fr,
  ) {}

  /**
   * Serialize this as a buffer.
   * @returns The buffer.
   */
  toBuffer() {
    return serializeToBuffer(
      this.txRequest,
      this.vkTreeRoot,
      this.protocolContracts,
      this.privateCall,
      this.firstNullifierHint,
    );
  }

  /**
   * Deserializes from a buffer or reader.
   * @param buffer - Buffer or reader to read from.
   * @returns The deserialized instance.
   */
  static fromBuffer(buffer: Buffer | BufferReader): PrivateKernelInitCircuitPrivateInputs {
    const reader = BufferReader.asReader(buffer);
    return new PrivateKernelInitCircuitPrivateInputs(
      reader.readObject(TxRequest),
      Fr.fromBuffer(reader),
      reader.readObject(ProtocolContracts),
      reader.readObject(PrivateCallData),
      reader.readBoolean(),
      Fr.fromBuffer(reader),
    );
  }
}
