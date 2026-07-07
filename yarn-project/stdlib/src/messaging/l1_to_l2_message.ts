import { DomainSeparator, type L1_TO_L2_MSG_TREE_HEIGHT } from '@aztec/constants';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto/poseidon';
import { sha256ToField } from '@aztec/foundation/crypto/sha256';
import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex } from '@aztec/foundation/string';
import { SiblingPath } from '@aztec/foundation/trees';

import type { AztecAddress } from '../aztec-address/index.js';
import type { BlockParameter } from '../block/block_parameter.js';
import { siloNullifier } from '../hash/hash.js';
import type { AztecNode } from '../interfaces/aztec-node.js';
import { MerkleTreeId } from '../trees/merkle_tree_id.js';
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

/**
 * The unsiloed nullifier a message consumer derives, together with the contract address needed to silo it.
 */
export interface UnsiloedMessageNullifier {
  contractAddress: AztecAddress;
  nullifier: Fr;
}

/**
 * Computes the unsiloed nullifier that the fee juice contract (and any consumer following the same scheme) derives when
 * consuming an L1 to L2 message.
 *
 * This is not a general-purpose utility: other contracts may derive the secret hash and hence the nullifier
 * differently. The result is unsiloed — callers silo it (with the consuming contract's address) before looking it up
 * in the nullifier tree.
 */
export function computeFeeJuiceMessageNullifier(messageHash: Fr, secret: Fr): Promise<Fr> {
  return poseidon2HashWithSeparator([messageHash, secret], DomainSeparator.MESSAGE_NULLIFIER);
}

/**
 * Fetches the membership witness of an L1 to L2 message. When `unsiloedNullifier` is provided, the message is
 * additionally required to be un-nullified.
 */
export async function getL1ToL2MessageWitness(
  node: AztecNode,
  messageHash: Fr,
  unsiloedNullifier?: UnsiloedMessageNullifier,
  referenceBlock: BlockParameter = 'latest',
): Promise<[bigint, SiblingPath<typeof L1_TO_L2_MSG_TREE_HEIGHT>]> {
  // Both requests are dispatched before awaiting so they run concurrently.
  const l1ToL2ResponsePromise = node.getL1ToL2MessageMembershipWitness(referenceBlock, messageHash);
  const nullifierResponsePromise = unsiloedNullifier
    ? siloNullifier(unsiloedNullifier.contractAddress, unsiloedNullifier.nullifier).then(siloed =>
        node.findLeavesIndexes(referenceBlock, MerkleTreeId.NULLIFIER_TREE, [siloed]),
      )
    : undefined;

  const l1ToL2Response = await l1ToL2ResponsePromise;
  if (!l1ToL2Response) {
    throw new Error(`No L1 to L2 message found for message hash ${messageHash.toString()}`);
  }

  const nullifierResponse = await nullifierResponsePromise;
  if (nullifierResponse?.[0] !== undefined) {
    throw new Error(`No non-nullified L1 to L2 message found for message hash ${messageHash.toString()}`);
  }

  return l1ToL2Response;
}

// This functionality is not on the node because we do not want to pass the node the secret, and give the node the ability to derive a valid nullifer for an L1 to L2 message.
export async function getNonNullifiedL1ToL2MessageWitness(
  node: AztecNode,
  contractAddress: AztecAddress,
  messageHash: Fr,
  secret: Fr,
  referenceBlock: BlockParameter = 'latest',
): Promise<[bigint, SiblingPath<typeof L1_TO_L2_MSG_TREE_HEIGHT>]> {
  const nullifier = await computeFeeJuiceMessageNullifier(messageHash, secret);
  return getL1ToL2MessageWitness(node, messageHash, { contractAddress, nullifier }, referenceBlock);
}
