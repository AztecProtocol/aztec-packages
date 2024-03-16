import { AztecAddress } from '@aztec/foundation/aztec-address';
import { toBigIntBE, toBufferBE } from '@aztec/foundation/bigint-buffer';
import { randomInt, sha256 } from '@aztec/foundation/crypto';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

/**
 * Interface of classes allowing for the retrieval of L1 to L2 messages.
 */
export interface L1ToL2MessageSource {
  /**
   * Gets new L1 to L2 message (to be) included in a given block.
   * @param blockNumber - L2 block number to get messages for.
   * @returns The L1 to L2 messages/leaves of the messages subtree (throws if not found).
   */
  getNewL1ToL2Messages(blockNumber: bigint): Promise<Fr[]>;

  /**
   * Gets up to `limit` amount of pending L1 to L2 messages, sorted by fee
   * @param limit - The maximum number of messages to return (by default NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).
   * @returns The requested L1 to L2 messages' keys.
   */
  getPendingL1ToL2EntryKeys(limit?: number): Promise<Fr[]>;

  /**
   * Gets the confirmed L1 to L2 message with the given entry key.
   * i.e. message that has already been consumed by the sequencer and published in an L2 Block
   * @param entryKey - The entry key.
   * @returns The confirmed L1 to L2 message (throws if not found)
   */
  getConfirmedL1ToL2Message(entryKey: Fr): Promise<L1ToL2Message>;

  /**
   * Gets the number of the latest L2 block processed by the implementation.
   * @returns The number of the latest L2 block processed by the implementation.
   */
  getBlockNumber(): Promise<number>;
}

export class NewInboxLeaf {
  constructor(
    /** L2 block number in which the message will be included. */
    public readonly blockNumber: bigint,
    /** Index of the leaf in L2 block message subtree. */
    public readonly index: bigint,
    /** Leaf of the subtree. */
    public readonly leaf: Fr,
  ) {}

  toBuffer(): Buffer {
    return serializeToBuffer([this.blockNumber, this.index, this.leaf]);
  }

  fromBuffer(buffer: Buffer | BufferReader): NewInboxLeaf {
    const reader = BufferReader.asReader(buffer);
    const blockNumber = toBigIntBE(reader.readBytes(32));
    const index = toBigIntBE(reader.readBytes(32));
    const leaf = reader.readObject(Fr);
    return new NewInboxLeaf(blockNumber, index, leaf);
  }
}

/**
 * L1AndL2Message and Index (in the merkle tree) as one type
 * TODO(#4492): Nuke the following when purging the old inbox
 */
export class L1ToL2MessageAndIndex {
  constructor(
    /** the index in the L1 to L2 Message tree. */
    public readonly index: bigint,
    /** The message. */
    public readonly message: L1ToL2Message,
  ) {}

  toBuffer(): Buffer {
    return Buffer.concat([toBufferBE(this.index, 32), this.message.toBuffer()]);
  }

  toString(): string {
    return this.toBuffer().toString('hex');
  }

  static fromString(data: string): L1ToL2MessageAndIndex {
    const buffer = Buffer.from(data, 'hex');
    return L1ToL2MessageAndIndex.fromBuffer(buffer);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    const index = toBigIntBE(reader.readBytes(32));
    const message = L1ToL2Message.fromBuffer(reader);
    return new L1ToL2MessageAndIndex(index, message);
  }
}

/**
 * The format of an L1 to L2 Message.
 * TODO(#4492): Nuke the following when purging the old inbox
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
  toFields(): Fr[] {
    return [
      ...this.sender.toFields(),
      ...this.recipient.toFields(),
      this.content,
      this.secretHash,
      new Fr(BigInt(this.deadline)),
      new Fr(BigInt(this.fee)),
    ];
  }

  toBuffer(): Buffer {
    return serializeToBuffer(this.sender, this.recipient, this.content, this.secretHash, this.deadline, this.fee);
  }

  hash(): Fr {
    return Fr.fromBufferReduce(sha256(serializeToBuffer(...this.toFields())));
  }

  static fromBuffer(buffer: Buffer | BufferReader): L1ToL2Message {
    const reader = BufferReader.asReader(buffer);
    const sender = reader.readObject(L1Actor);
    const recipient = reader.readObject(L2Actor);
    const content = Fr.fromBuffer(reader);
    const secretHash = Fr.fromBuffer(reader);
    const deadline = reader.readNumber();
    const fee = reader.readNumber();
    return new L1ToL2Message(sender, recipient, content, secretHash, deadline, fee);
  }

  toString(): string {
    return this.toBuffer().toString('hex');
  }

  static fromString(data: string): L1ToL2Message {
    const buffer = Buffer.from(data, 'hex');
    return L1ToL2Message.fromBuffer(buffer);
  }

  static empty(): L1ToL2Message {
    return new L1ToL2Message(L1Actor.empty(), L2Actor.empty(), Fr.ZERO, Fr.ZERO, 0, 0);
  }

  static random(entryKey?: Fr): L1ToL2Message {
    return new L1ToL2Message(
      L1Actor.random(),
      L2Actor.random(),
      Fr.random(),
      Fr.random(),
      randomInt(1000),
      randomInt(1000),
      entryKey,
    );
  }
}

/**
 * The sender of an L1 to L2 message.
 * TODO(#4492): Move to separate file when purging the old inbox
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

  toFields(): Fr[] {
    return [this.sender.toField(), new Fr(BigInt(this.chainId))];
  }

  toBuffer(): Buffer {
    return serializeToBuffer(this.sender, this.chainId);
  }

  static fromBuffer(buffer: Buffer | BufferReader): L1Actor {
    const reader = BufferReader.asReader(buffer);
    const ethAddr = reader.readObject(EthAddress);
    const chainId = reader.readNumber();
    return new L1Actor(ethAddr, chainId);
  }

  static random(): L1Actor {
    return new L1Actor(EthAddress.random(), randomInt(1000));
  }
}

/**
 * The recipient of an L2 message.
 * TODO(#4492): Move to separate file when purging the old inbox
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

  toFields(): Fr[] {
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
    return new L2Actor(AztecAddress.random(), randomInt(1000));
  }
}
