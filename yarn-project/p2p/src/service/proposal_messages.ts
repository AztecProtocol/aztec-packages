/**
 * Follows the design of the tx_messages class
 * The idea is that we have a message type for a proposal that will be sent around by the block proposer to collect signatures
 */
import { BlockProposal, ProposalMessage, Signature } from '@aztec/foundation/sequencer';

import { SemVer } from 'semver';
import { createMessageComponent, toObject } from './p2p_serde.js';
import { BufferReader, numToInt32BE } from '@aztec/foundation/serialize';

// TODO(md): do a similar thing to how we have setup opcodes in the vm such that
// they have a base class + interfaces that they deal with
export class AztecProposalMessageCreator {
  private readonly topic: string;
  constructor(version: SemVer) {
    this.topic = `/aztec/proposal/${version.toString()}`;
  }

  createProposalMessage(proposal: BlockProposal) {
    const data = proposal.toBuffer();
    return { topic: this.topic, data };
  }

  getTopic() {
    return this.topic;
  }
}
