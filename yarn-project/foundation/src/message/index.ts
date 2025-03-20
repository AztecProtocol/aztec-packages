export type MessageHeaderInit = {
  /** The message ID. Optional, if not set defaults to 0 */
  messageId?: number;
  /** Identifies the original request. Optional */
  requestId?: number;
};

export class MessageHeader {
  /** An number to identify this message */
  public readonly messageId: number;
  /** If this message is a response to a request, the messageId of the request */
  public readonly requestId: number;

  constructor({ messageId, requestId }: MessageHeaderInit) {
    this.messageId = messageId ?? 0;
    this.requestId = requestId ?? 0;
  }

  static fromMessagePack(data: object): MessageHeader {
    return new MessageHeader(data as MessageHeaderInit);
  }
}

interface TypedMessageLike {
  msgType: number;
  header: {
    messageId?: number;
    requestId?: number;
  };
  value: any;
}

export class TypedMessage<T, B> {
  public constructor(public readonly msgType: T, public readonly header: MessageHeader, public readonly value: B) {}

  static fromMessagePack<T, B>(data: TypedMessageLike): TypedMessage<T, B> {
    return new TypedMessage<T, B>(data['msgType'] as T, MessageHeader.fromMessagePack(data['header']), data['value']);
  }

  static isTypedMessageLike(obj: any): obj is TypedMessageLike {
    return typeof obj === 'object' && obj !== null && 'msgType' in obj && 'header' in obj && 'value' in obj;
  }
}
