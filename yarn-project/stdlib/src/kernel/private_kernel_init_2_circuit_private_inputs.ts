import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { ProtocolContracts } from '../tx/protocol_contracts.js';
import { TxRequest } from '../tx/tx_request.js';
import { PrivateCallData } from './private_call_data.js';

/**
 * Input to the batched private kernel init circuit, which processes the first two app calls of a
 * transaction in a single iteration.
 */
export class PrivateKernelInit2CircuitPrivateInputs {
  constructor(
    public txRequest: TxRequest,
    public vkTreeRoot: Fr,
    public protocolContracts: ProtocolContracts,
    public privateCall0: PrivateCallData,
    public privateCall1: PrivateCallData,
    public isPrivateOnly: boolean,
    public revertibleCounterHint: number,
  ) {}

  toBuffer() {
    return serializeToBuffer(
      this.txRequest,
      this.vkTreeRoot,
      this.protocolContracts,
      this.privateCall0,
      this.privateCall1,
      this.revertibleCounterHint,
    );
  }

  static fromBuffer(buffer: Buffer | BufferReader): PrivateKernelInit2CircuitPrivateInputs {
    const reader = BufferReader.asReader(buffer);
    return new PrivateKernelInit2CircuitPrivateInputs(
      reader.readObject(TxRequest),
      Fr.fromBuffer(reader),
      reader.readObject(ProtocolContracts),
      reader.readObject(PrivateCallData),
      reader.readObject(PrivateCallData),
      reader.readBoolean(),
      reader.readNumber(),
    );
  }
}
