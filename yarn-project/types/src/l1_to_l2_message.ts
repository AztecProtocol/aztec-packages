import { BufferReader, serializeToBuffer } from '@aztec/circuits.js/utils';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';

/**
 * Interface of classes allowing for the retrieval of L1 to L2 messages.
 */
export interface L1ToL2MessageSource {
  /**
   * Gets up to `limit` amount of pending L1 to L2 messages, sorted by fee
   * @param limit - The maximum number of messages to return (by default NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).
   * @returns The requested L1 to L2 messages' keys.
   */
  getPendingL1ToL2Messages(limit?: number): Promise<Fr[]>;

  /**
   * Gets the confirmed L1 to L2 message with the given message key.
   * i.e. message that has already been consumed by the sequencer and published in an L2 Block
   * @param messageKey - The message key.
   * @returns The confirmed L1 to L2 message (throws if not found)
   */
  getConfirmedL1ToL2Message(messageKey: Fr): Promise<L1ToL2Message>;
}

/**
 * L1AndL2Message and Index (in the merkle tree) as one type
 */
export type L1ToL2MessageAndIndex = {
  /**
   * The message.
   */
  message: L1ToL2Message;
  /**
   * the index in the L1 to L2 Message tree.
   */
  index: bigint;
};

/**
 * The format of an L1 to L2 Message.
 */
export class L1ToL2Message {
  constructor(
    /**
     * The sender of the message on L1.
     */
    public readonly sender: L1Actor,
    /**
     * The recipient of the message on L2.
     */
    public readonly recipient: L2Actor,
    /**
     * The message content.
     */
    public readonly content: Fr,
    /**
     * The hash of the spending secret.
     */
    public readonly secretHash: Fr,
    /**
     * The deadline for the message.
     */
    public readonly deadline: number,
    /**
     * The fee for the message.
     */
    public readonly fee: number,
    /**
     * The entry key for the message - optional.
     */
    public readonly entryKey?: Fr,
  ) {}

  /**
   * Returns each element within its own field so that it can be consumed by an acvm oracle call.
   * @returns The message as an array of fields (in order).
   */
  toFieldArray(): Fr[] {
    return [
      ...this.sender.toFieldArray(),
      ...this.recipient.toFieldArray(),
      this.content,
      this.secretHash,
      new Fr(BigInt(this.deadline)),
      new Fr(BigInt(this.fee)),
    ];
  }

  toBuffer(): Buffer {
    return serializeToBuffer(this.sender, this.recipient, this.content, this.secretHash, this.deadline, this.fee);
  }

  static fromBuffer(buffer: Buffer | BufferReader): L1ToL2Message {
    const reader = BufferReader.asReader(buffer);
    const sender = reader.readObject(L1Actor);
    const recipient = reader.readObject(L2Actor);
    const content = reader.readFr();
    const secretHash = reader.readFr();
    const deadline = reader.readNumber();
    const fee = reader.readNumber();
    return new L1ToL2Message(sender, recipient, content, secretHash, deadline, fee);
  }

  static empty(): L1ToL2Message {
    return new L1ToL2Message(L1Actor.empty(), L2Actor.empty(), Fr.ZERO, Fr.ZERO, 0, 0);
  }

  static random(): L1ToL2Message {
    return new L1ToL2Message(
      L1Actor.random(),
      L2Actor.random(),
      Fr.random(),
      Fr.random(),
      Math.floor(Math.random() * 1000),
      Math.floor(Math.random() * 1000),
    );
  }
}

/**
 * The sender of an L1 to L2 message.
 */
export class L1Actor {
  constructor(
    /**
     * The sender of the message.
     */
    public readonly sender: EthAddress,
    /**
     * The chain id on which the message was sent.
     */
    public readonly chainId: number,
  ) {}

  static empty() {
    return new L1Actor(EthAddress.ZERO, 0);
  }

  toFieldArray(): Fr[] {
    return [this.sender.toField(), new Fr(BigInt(this.chainId))];
  }

  toBuffer(): Buffer {
    return serializeToBuffer(this.sender, this.chainId);
  }

  static fromBuffer(buffer: Buffer | BufferReader): L1Actor {
    const reader = BufferReader.asReader(buffer);
    const ethAddr = new EthAddress(reader.readBytes(32));
    const chainId = reader.readNumber();
    return new L1Actor(ethAddr, chainId);
  }

  static random(): L1Actor {
    return new L1Actor(EthAddress.random(), Math.floor(Math.random() * 1000));
  }
}

/**
 * The recipient of an L2 message.
 */
export class L2Actor {
  constructor(
    /**
     * The recipient of the message.
     */
    public readonly recipient: AztecAddress,
    /**
     * The version of the protocol.
     */
    public readonly version: number,
  ) {}

  static empty() {
    return new L2Actor(AztecAddress.ZERO, 0);
  }

  toFieldArray(): Fr[] {
    return [this.recipient.toField(), new Fr(BigInt(this.version))];
  }

  toBuffer(): Buffer {
    return serializeToBuffer(this.recipient, this.version);
  }

  static fromBuffer(buffer: Buffer | BufferReader): L2Actor {
    const reader = BufferReader.asReader(buffer);
    const aztecAddr = AztecAddress.fromBuffer(reader);
    const version = reader.readNumber();
    return new L2Actor(aztecAddr, version);
  }

  static random(): L2Actor {
    return new L2Actor(AztecAddress.random(), Math.floor(Math.random() * 1000));
  }
}
