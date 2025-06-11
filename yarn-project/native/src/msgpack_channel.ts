import { Fr } from '@aztec/foundation/fields';
import { MessageHeader, TypedMessage } from '@aztec/foundation/message';

import { Encoder, addExtension } from 'msgpackr';
import { isAnyArrayBuffer } from 'util/types';

export interface MessageReceiver {
  call(msg: Buffer | Uint8Array): Promise<Buffer | Uint8Array>;
}

export type RoundtripDuration = {
  encodingUs: number;
  callUs: number;
  decodingUs: number;
  totalUs: number;
};

// small extension to pack an NodeJS Fr instance to a representation that the C++ code can understand
// this only works for writes. Unpacking from C++ can't create Fr instances because the data is passed
// as raw, untagged, buffers. On the NodeJS side we don't know what the buffer represents
// Adding a tag would be a solution, but it would have to be done on both sides and it's unclear where else
// C++ fr instances are sent/received/stored.
addExtension({
  Class: Fr,
  write: fr => fr.toBuffer(),
});

type MessageBody<T extends number> = { [K in T]: object | void };

export class MsgpackChannel<
  M extends number = number,
  Req extends MessageBody<M> = any,
  Resp extends MessageBody<M> = any,
> {
  /** A long-lived msgpack encoder */
  private encoder = new Encoder({
    // always encode JS objects as MessagePack maps
    // this makes it compatible with other MessagePack decoders
    useRecords: false,
    int64AsType: 'bigint',
  });

  private msgId = 1;

  public constructor(private dest: MessageReceiver) {}

  public async sendMessage<T extends M>(
    msgType: T,
    body: Req[T],
  ): Promise<{ duration: RoundtripDuration; response: Resp[T] }> {
    const duration: RoundtripDuration = {
      callUs: 0,
      totalUs: 0,
      decodingUs: 0,
      encodingUs: 0,
    };

    const start = process.hrtime.bigint();
    const requestId = this.msgId++;

    const request = new TypedMessage(msgType, new MessageHeader({ requestId }), body);
    const encodedRequest = this.encoder.encode(request);
    const encodingEnd = process.hrtime.bigint();
    duration.encodingUs = Number((encodingEnd - start) / 1000n);

    const encodedResponse = await this.dest.call(encodedRequest);
    const callEnd = process.hrtime.bigint();
    duration.callUs = Number((callEnd - encodingEnd) / 1000n);

    const buf = Buffer.isBuffer(encodedResponse)
      ? encodedResponse
      : isAnyArrayBuffer(encodedResponse)
        ? Buffer.from(encodedResponse)
        : encodedResponse;

    if (!Buffer.isBuffer(buf)) {
      throw new TypeError(
        'Invalid encoded response: expected Buffer or ArrayBuffer, got ' +
          (encodedResponse === null ? 'null' : typeof encodedResponse),
      );
    }

    const decodedResponse = this.encoder.unpack(buf);
    if (!TypedMessage.isTypedMessageLike(decodedResponse)) {
      throw new TypeError(
        'Invalid response: expected TypedMessageLike, got ' +
          (decodedResponse === null ? 'null' : typeof decodedResponse),
      );
    }

    const response = TypedMessage.fromMessagePack<T, Resp[T]>(decodedResponse);
    const decodingEnd = process.hrtime.bigint();
    duration.decodingUs = Number((decodingEnd - callEnd) / 1000n);

    if (response.header.requestId !== request.header.messageId) {
      throw new Error(
        'Response ID does not match request: ' + response.header.requestId + ' != ' + request.header.messageId,
      );
    }

    if (response.msgType !== request.msgType) {
      throw new Error('Invalid response message type: ' + response.msgType + ' != ' + response.msgType);
    }

    duration.totalUs = Number((process.hrtime.bigint() - start) / 1000n);

    return { duration, response: response.value };
  }
}
