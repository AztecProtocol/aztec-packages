import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { sha256Trunc } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { MerkleTreeCalculator } from '@aztec/foundation/trees';

/** Computes the inHash for a block's ContentCommitment given its l1 to l2 messages. */
export async function computeInHashFromL1ToL2Messages(unpaddedL1ToL2Messages: Fr[]): Promise<Fr> {
  const l1ToL2Messages = padArrayEnd<Fr, number>(unpaddedL1ToL2Messages, Fr.ZERO, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);
  const hasher = (left: Buffer, right: Buffer) =>
    Promise.resolve(sha256Trunc(Buffer.concat([left, right])) as Buffer<ArrayBuffer>);
  const parityHeight = Math.ceil(Math.log2(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP));
  const parityCalculator = await MerkleTreeCalculator.create(parityHeight, Fr.ZERO.toBuffer(), hasher);
  return new Fr(await parityCalculator.computeTreeRoot(l1ToL2Messages.map(msg => msg.toBuffer())));
}
