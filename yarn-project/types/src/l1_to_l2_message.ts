import { EthAddress } from '@aztec/foundation/eth-address';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr } from '@aztec/foundation/fields';
import { serializeToBuffer } from '@aztec/circuits.js/utils';
import { sha256 } from '@aztec/foundation/crypto';
import { toBigIntBE, toBufferBE } from '@aztec/foundation/bigint-buffer';

/**
 * Interface of classes allowing to read L1 to L2 messages.
 */
export interface L1ToL2MessageReaderSource {
  /**
   * Returns the L1 to L2 message corresponding to the given message key.
   * @param messageKey - The message key.
   * @returns The L1 to L2 message (throws if not found)
   */
  getL1ToL2Message(messageKey: Fr): Promise<L1ToL2Message>;
}

/**
 * Interface of classes allowing for the consumption of L1 to L2 messages (and reinsertion if consumption failed).
 */
export interface L1ToL2MessageConsumer extends L1ToL2MessageReaderSource {
  /**
   * Consumes upto `take` amount of pending L1 to L2 messages, sorted by fee.
   * @param take - The number of messages to return (by default NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).
   * If there are not enough messages, then it reutrns all the messages.
   * @returns Array of the top L1 to L2 message keys sorted by fee (of maximum size `take` - smaller if not enough messages)
   */
  consumePendingL1ToL2Messages(take?: number): Promise<Fr[]>;

  /**
   * Typically called by implementers of this interface to reinsert messages back into the heap if publishing the L2 block fails.
   * (this is the list of keys that were first popped from the max heap, in `consumePendingL1ToL2Messages()` to be included in the block, but block publishing failed).
   * @param messageKeys - The message keys to reinsert back into the heap.
   * @returns True if the operation is successful (false otherwise).
   */
  reinsertPendingL1ToL2MessagesUponBlockFailure(messageKeys: Fr[]): Promise<boolean>;
}

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
  ) {}

  // TODO: (#646) - sha256 hash of the message packed the same as solidity
  hash(): Fr {
    const buf = this.toBuffer();
    const temp = toBigIntBE(sha256(buf));
    return Fr.fromBuffer(toBufferBE(temp % Fr.MODULUS, 32));
  }

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

  static empty(): L1ToL2Message {
    return new L1ToL2Message(L1Actor.empty(), L2Actor.empty(), Fr.ZERO, Fr.ZERO, 0, 0);
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
}
