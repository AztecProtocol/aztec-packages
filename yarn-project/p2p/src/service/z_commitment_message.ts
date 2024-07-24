/**
 * Follows the design of the tx_messages class
 * The idea is that we have a message type for a commitment that will be sent by validators who have received the proposal messages
 */
import { BlockAttestation } from '@aztec/foundation/sequencer';

import { SemVer } from 'semver';

// TODO(md): can be combined with the other message creators
export class AztecCommitmentMessageCreator {
  private readonly topic: string;
  constructor(version: SemVer) {
    this.topic = `/aztec/commitment/${version.toString()}`;
  }

  createAttestationMessage(commitment: BlockAttestation) {
    const data = commitment.toBuffer();
    return { topic: this.topic, data };
  }

  getTopic() {
    return this.topic;
  }
}
