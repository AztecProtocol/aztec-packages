import { type L1_TO_L2_MSG_TREE_HEIGHT } from '@aztec/circuits.js';
import { computeL1ToL2MessageNullifier } from '@aztec/circuits.js/hash';
import { type AztecAddress } from '@aztec/foundation/aztec-address';
import { sha256ToField } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex } from '@aztec/foundation/string';

import { type AztecNode } from '../interfaces/aztec-node.js';
import { MerkleTreeId } from '../merkle_tree_id.js';
import { type SiblingPath } from '../sibling_path/index.js';
import { L1Actor } from './l1_actor.js';
import { L2Actor } from './l2_actor.js';

/**
 * The format of an L1 to L2 Message.
 */
export class L1ToL2Message {
  constructor(
    /** The sender of the message on L1. */
    public readonly sender: L1Actor,
    /** The recipient of the message on L2. */
    public readonly recipient: L2Actor,
    /** The message content. */
    public readonly content: Fr,
    /** The hash of the spending secret. */
    public readonly secretHash: Fr,
    /** Global index of this message on the tree. */
    public readonly index: Fr,
  ) {}

  /**
   * Returns each element within its own field so that it can be consumed by an acvm oracle call.
   * @returns The message as an array of fields (in order).
   */
  toFields(): Fr[] {
    return [...this.sender.toFields(), ...this.recipient.toFields(), this.content, this.secretHash, this.index];
  }

  toBuffer(): Buffer {
    return serializeToBuffer(this.sender, this.recipient, this.content, this.secretHash, this.index);
  }

  hash(): Fr {
    return sha256ToField(this.toFields());
  }

  static fromBuffer(buffer: Buffer | BufferReader): L1ToL2Message {
    const reader = BufferReader.asReader(buffer);
    const sender = reader.readObject(L1Actor);
    const recipient = reader.readObject(L2Actor);
    const content = Fr.fromBuffer(reader);
    const secretHash = Fr.fromBuffer(reader);
    const index = Fr.fromBuffer(reader);
    return new L1ToL2Message(sender, recipient, content, secretHash, index);
  }

  toString(): string {
    return bufferToHex(this.toBuffer());
  }

  static fromString(data: string): L1ToL2Message {
    const buffer = Buffer.from(data, 'hex');
    return L1ToL2Message.fromBuffer(buffer);
  }

  static empty(): L1ToL2Message {
    return new L1ToL2Message(L1Actor.empty(), L2Actor.empty(), Fr.ZERO, Fr.ZERO, Fr.ZERO);
  }

  static async random(): Promise<L1ToL2Message> {
    return new L1ToL2Message(L1Actor.random(), await L2Actor.random(), Fr.random(), Fr.random(), Fr.random());
  }
}

// This functionality is not on the node because we do not want to pass the node the secret, and give the node the ability to derive a valid nullifer for an L1 to L2 message.
export async function getNonNullifiedL1ToL2MessageWitness(
  node: AztecNode,
  contractAddress: AztecAddress,
  messageHash: Fr,
  secret: Fr,
): Promise<[bigint, SiblingPath<typeof L1_TO_L2_MSG_TREE_HEIGHT>]> {
  const response = await node.getL1ToL2MessageMembershipWitness('latest', messageHash);
  if (!response) {
    throw new Error(`No L1 to L2 message found for message hash ${messageHash.toString()}`);
  }
  const [messageIndex, siblingPath] = response;

  const messageNullifier = computeL1ToL2MessageNullifier(contractAddress, messageHash, secret);

  const [nullifierIndex] = await node.findLeavesIndexes('latest', MerkleTreeId.NULLIFIER_TREE, [messageNullifier]);
  if (nullifierIndex !== undefined) {
    throw new Error(`No non-nullified L1 to L2 message found for message hash ${messageHash.toString()}`);
  }

  return [messageIndex, siblingPath];
}
