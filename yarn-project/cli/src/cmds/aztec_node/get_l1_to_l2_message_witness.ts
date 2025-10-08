import { type AztecAddress, type Fr, createAztecNodeClient } from '@aztec/aztec.js';
import type { LogFn } from '@aztec/foundation/log';
import { getNonNullifiedL1ToL2MessageWitness } from '@aztec/stdlib/messaging';

export async function getL1ToL2MessageWitness(
  nodeUrl: string,
  contractAddress: AztecAddress,
  messageHash: Fr,
  secret: Fr,
  log: LogFn,
) {
  const node = createAztecNodeClient(nodeUrl);
  const messageWitness = await getNonNullifiedL1ToL2MessageWitness(node, contractAddress, messageHash, secret);

  log(
    messageWitness === undefined
      ? `
    L1 to L2 Message not found.
    `
      : `
    L1 to L2 message index: ${messageWitness[0]}
    L1 to L2 message sibling path: ${messageWitness[1]}
    `,
  );
}
