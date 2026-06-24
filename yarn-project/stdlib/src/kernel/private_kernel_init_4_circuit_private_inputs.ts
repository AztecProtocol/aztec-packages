import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { ProtocolContracts } from '../tx/protocol_contracts.js';
import { TxRequest } from '../tx/tx_request.js';
import { PrivateCallData } from './private_call_data.js';

/**
 * Input to the batched private kernel init circuit, which processes the first four app calls of a
 * transaction in a single iteration.
 */
export class PrivateKernelInit4CircuitPrivateInputs {
  constructor(
    public txRequest: TxRequest,
    public vkTreeRoot: Fr,
    public protocolContracts: ProtocolContracts,
    public privateCall0: PrivateCallData,
    public privateCall1: PrivateCallData,
    public privateCall2: PrivateCallData,
    public privateCall3: PrivateCallData,
    public isPrivateOnly: boolean,
    public firstNullifierHint: Fr,
    public revertibleCounterHint: number,
  ) {}

  toBuffer() {
    return serializeToBuffer(
      this.txRequest,
      this.vkTreeRoot,
      this.protocolContracts,
      this.privateCall0,
      this.privateCall1,
      this.privateCall2,
      this.privateCall3,
      this.firstNullifierHint,
      this.revertibleCounterHint,
    );
  }

  static fromBuffer(buffer: Buffer | BufferReader): PrivateKernelInit4CircuitPrivateInputs {
    const reader = BufferReader.asReader(buffer);
    return new PrivateKernelInit4CircuitPrivateInputs(
      reader.readObject(TxRequest),
      Fr.fromBuffer(reader),
      reader.readObject(ProtocolContracts),
      reader.readObject(PrivateCallData),
      reader.readObject(PrivateCallData),
      reader.readObject(PrivateCallData),
      reader.readObject(PrivateCallData),
      reader.readBoolean(),
      Fr.fromBuffer(reader),
      reader.readNumber(),
    );
  }
}
